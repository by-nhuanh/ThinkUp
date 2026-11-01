import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { signJwt, verifyJwt } from '../../db.js';
import { credentialVersion } from '../../auth/signup.user.js';
import { loginWithCredentials, verifyAuthSession } from '../../auth/signin.user.js';
import { readAuthToken, verifyAccessToken, requireCookieCsrf, setAuthCookie, createCsrfToken } from '../../auth/auth.user.js';
import {
  issueUserSession, validateUserSession, getSecuritySessions, revokeSecuritySession,
  logoutSecuritySession, changeSecurityPassword, getSecurityLogs, getAccountSecurity,
  recoverSecurityEvents, createAccountSecurityRouter,
} from '../account-security.user.js';

// Detached storage double, with atomic mutations before resolution. Never connects to the project's DB.
// Unsupported Mongo operations throw instead of silently giving tests a successful result.
function memoryDb() {
  const tables = new Map();
  const copy = value => value instanceof ObjectId ? new ObjectId(String(value))
    : value instanceof Date ? new Date(value) : Array.isArray(value) ? value.map(copy)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) : value;
  const get = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
  const eq = (a, b) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b)
    : a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : b === null ? a == null : a === b;
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return value.some(item => matches(row, item));
      const actual = get(row, key);
      if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId)) {
        return Object.entries(value).every(([op, operand]) => {
          if (op === '$gt') return actual > operand;
          if (op === '$lte') return actual <= operand;
          if (op === '$ne') return !eq(actual, operand);
          if (op === '$exists') return (actual !== undefined) === operand;
          throw new Error(`Unsupported filter: ${op}`);
        });
      }
      return eq(actual, value);
    });
  }
  function apply(row, update, inserted = false) {
    for (const op of Object.keys(update)) {
      if (!['$set', '$setOnInsert', '$push', '$pull', '$inc'].includes(op)) throw new Error(`Unsupported update: ${op}`);
    }
    if (inserted) Object.assign(row, copy(update.$setOnInsert || {}));
    Object.assign(row, copy(update.$set || {}));
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
    for (const [key, value] of Object.entries(update.$push || {})) (row[key] ??= []).push(copy(value));
    for (const [key, value] of Object.entries(update.$pull || {})) row[key] = (row[key] || []).filter(item => !matches(item, value));
  }
  const db = { tables, fail: null, collection(name) {
    if (!tables.has(name)) tables.set(name, []);
    const rows = tables.get(name);
    const check = (operation, filter) => { db.fail?.(name, operation, filter); };
    const insert = row => {
      if (rows.some(existing => eq(existing._id, row._id))) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      rows.push(row);
    };
    return {
      async insertOne(data) { check('insertOne', data); const row = copy(data); row._id ??= new ObjectId(); insert(row); return { insertedId: row._id }; },
      async findOne(filter) { check('findOne', filter); return copy(rows.find(row => matches(row, filter)) ?? null); },
      async updateOne(filter, update, options = {}) {
        check('updateOne', filter);
        let row = rows.find(item => matches(item, filter));
        if (!row && options.upsert) {
          row = Object.fromEntries(Object.entries(filter).filter(([key, value]) => !key.startsWith('$') &&
            (value == null || typeof value !== 'object' || value instanceof Date || value instanceof ObjectId)));
          apply(row, update, true); insert(row); return { matchedCount: 0, upsertedCount: 1 };
        }
        if (!row) return { matchedCount: 0, modifiedCount: 0 };
        apply(row, update); return { matchedCount: 1, modifiedCount: 1 };
      },
      async findOneAndUpdate(filter, update) {
        check('findOneAndUpdate', filter);
        const row = rows.find(item => matches(item, filter));
        if (!row) return null;
        apply(row, update); return copy(row);
      },
      async countDocuments(filter) { check('countDocuments', filter); return rows.filter(row => matches(row, filter)).length; },
      find(filter) {
        check('find', filter);
        let result = rows.filter(row => matches(row, filter));
        const cursor = {
          sort(order) { result.sort((a, b) => {
            for (const [key, direction] of Object.entries(order)) {
              if (a[key] < b[key]) return -direction;
              if (a[key] > b[key]) return direction;
            }
            return 0;
          }); return cursor; },
          skip(count) { result = result.slice(count); return cursor; },
          limit(count) { assert.ok(count > 0); result = result.slice(0, count); return cursor; },
          async toArray() { return copy(result); },
        };
        return cursor;
      },
    };
  } };
  return db;
}
const oldPassword = 'OldPassword123!';
const newPassword = 'NewPassword456@';
const params = (change = {}) => ({ currentPassword: oldPassword, newPassword,
  confirmNewPassword: newPassword, ...change });
const code = expected => error => error.code === expected;
async function fixture() {
  const db = memoryDb();
  const user = { _id: new ObjectId(), full_name: 'Test Student', email: 'security@example.test',
    password_hash: await bcrypt.hash(oldPassword, 4), status: 'active', role: 'student',
    is_active: true, email_verified: true };
  await db.collection('users').insertOne(user);
  const mails = [];
  const options = { db, now: Date.now(), sendEmail: async message => { mails.push(message); return { accepted: [message.to] }; } };
  const credentials = await issueUserSession(user, { ip: '118.69.12.34', userAgent: 'Windows Chrome/130' }, options);
  return { db, user, uid: String(user._id), sid: verifyJwt(credentials.accessToken).sid,
    credentials, options, mails };
}

test('login creates unique durable sessions, keeps Remember Me lifetime and masks device IP', async () => {
  const f = await fixture();
  const login = await loginWithCredentials({ email: f.user.email, password: oldPassword, rememberMe: true },
    { ...f.options, ip: '::ffff:123.30.4.5', userAgent: 'iPhone Mobile Safari/18' });
  const a = verifyJwt(f.credentials.accessToken), b = verifyJwt(login.accessToken);
  assert.notEqual(a.sid, b.sid);
  assert.equal(b.exp - b.iat, 30 * 86400);
  assert.equal(verifyJwt(login.refreshToken).sid, b.sid);
  assert.equal((await verifyAuthSession(login.accessToken, f.options)).isAuthenticated, true);
  const listed = await getSecuritySessions(f.uid, f.sid, { limit: 1 }, f.options);
  assert.equal(listed.items[0].id, f.sid);
  assert.equal(listed.pagination.total, 2);
  const nextPage = await getSecuritySessions(f.uid, f.sid, { limit: 1, page: 2 }, f.options);
  assert.equal(nextPage.items[0].maskedIp, '123.30.XXX.XXX');
  assert.equal(nextPage.items[0].os, 'iOS');
  assert.equal(JSON.stringify(listed).includes('118.69.12.34'), false);
  assert.equal((await getSecurityLogs(f.uid, f.sid, {}, f.options)).pagination.total, 2);
});

test('legacy and invalid/expired/foreign sessions are rejected by the actual auth verifier', async () => {
  const f = await fixture();
  const legacy = signJwt({ sub: f.uid, credentialVersion: credentialVersion(f.user) });
  assert.equal((await verifyAuthSession(legacy, f.options)).reason, 'SESSION_UPGRADE_REQUIRED');
  assert.equal(await validateUserSession({ sub: 'other', sid: f.sid }, f.options), false);
  assert.equal(await validateUserSession({ sub: f.uid, sid: {} }, f.options), false);
  f.options.now += 86400_000;
  assert.equal((await verifyAuthSession(f.credentials.accessToken, f.options)).reason, 'SESSION_REVOKED');
});

test('remote logout is owned, protects the current session, is idempotent and revokes next API authentication', async () => {
  const f = await fixture();
  const other = await issueUserSession(f.user, {}, f.options);
  const target = verifyJwt(other.accessToken).sid;
  await assert.rejects(revokeSecuritySession(f.uid, f.sid, f.sid, f.options), code('CURRENT_SESSION_PROTECTED'));
  await assert.rejects(revokeSecuritySession(f.uid, f.sid, 'bad-id', f.options), code('SESSION_NOT_FOUND'));
  const stranger = await fixture();
  await assert.rejects(revokeSecuritySession(stranger.uid, stranger.sid, target, stranger.options), code('SESSION_NOT_FOUND'));
  await revokeSecuritySession(f.uid, f.sid, target, f.options);
  await revokeSecuritySession(f.uid, f.sid, target, f.options);
  assert.equal((await verifyAuthSession(other.accessToken, f.options)).reason, 'SESSION_REVOKED');
  assert.equal((await verifyAuthSession(f.credentials.accessToken, f.options)).isAuthenticated, true);
  const logs = await getSecurityLogs(f.uid, f.sid, {}, f.options);
  assert.equal(logs.items.filter(item => item.type === 'SESSION_REVOKED').length, 1);
  assert.equal((await getSecuritySessions(f.uid, f.sid, {}, f.options)).pagination.total, 1);
});

test('ordinary logout invalidates a copied access token and repeated logout is safe', async () => {
  const f = await fixture();
  await logoutSecuritySession(verifyJwt(f.credentials.accessToken), f.options);
  await logoutSecuritySession(verifyJwt(f.credentials.accessToken), f.options);
  assert.equal((await verifyAuthSession(f.credentials.accessToken, f.options)).reason, 'SESSION_REVOKED');
});

test('password validation enforces all five criteria, 8-32 bounds, confirmation and exact untrimmed input', async () => {
  const f = await fixture();
  for (const value of [null, {}, { currentPassword: [] }, params({ currentPassword: '' })]) {
    await assert.rejects(changeSecurityPassword(f.uid, f.sid, value, f.options), error => error.status === 400);
  }
  for (const value of ['Aa1!aaa', 'A1!' + 'A'.repeat(5), 'a1!' + 'a'.repeat(5),
    'Aa!' + 'a'.repeat(5), 'Aa1' + 'a'.repeat(5), 'Aa1!' + 'a'.repeat(29), ' Aa1!aaa']) {
    await assert.rejects(changeSecurityPassword(f.uid, f.sid,
      params({ newPassword: value, confirmNewPassword: value }), f.options), code('PASSWORD_TOO_WEAK'));
  }
  await assert.rejects(changeSecurityPassword(f.uid, f.sid, params({ confirmNewPassword: 'different' }), f.options), code('PASSWORD_CONFIRM_MISMATCH'));
  await assert.rejects(changeSecurityPassword(f.uid, f.sid,
    params({ newPassword: oldPassword, confirmNewPassword: oldPassword }), f.options), code('PASSWORD_UNCHANGED'));
  for (const size of [8, 32]) {
    const fresh = await fixture();
    const password = 'Aa1!' + 'a'.repeat(size - 4);
    const result = await changeSecurityPassword(fresh.uid, fresh.sid,
      params({ newPassword: password, confirmNewPassword: password }), fresh.options);
    assert.equal((await verifyAuthSession(result.accessToken, fresh.options)).isAuthenticated, true);
  }
});

test('fifth wrong current password locks only this operation for 15 minutes; boundaries use server time', async () => {
  const f = await fixture();
  const wrong = params({ currentPassword: 'Incorrect1!' });
  for (let i = 0; i < 4; i++) {
    await assert.rejects(changeSecurityPassword(f.uid, f.sid, wrong, f.options), code('CURRENT_PASSWORD_INVALID'));
  }
  await assert.rejects(changeSecurityPassword(f.uid, f.sid, wrong, f.options),
    error => error.code === 'PASSWORD_CHANGE_LOCKED' && error.status === 429 && error.retryAfter === 900);
  await assert.rejects(changeSecurityPassword(f.uid, f.sid, params(), f.options), code('PASSWORD_CHANGE_LOCKED'));
  assert.equal((await verifyAuthSession(f.credentials.accessToken, f.options)).isAuthenticated, true);
  const stored = f.db.tables.get('users')[0];
  assert.equal(stored.failed_login_attempts, undefined);
  f.options.now += 15 * 60_000;
  const result = await changeSecurityPassword(f.uid, f.sid, params(), f.options);
  assert.equal(stored.security_password_attempts, 0);
  assert.equal((await verifyAuthSession(result.accessToken, f.options)).isAuthenticated, true);
});

test('ten-minute failure window resets exactly at boundary and concurrent wrong attempts cannot lose counters', async () => {
  const f = await fixture();
  const wrong = params({ currentPassword: 'Incorrect1!' });
  await assert.rejects(changeSecurityPassword(f.uid, f.sid, wrong, f.options), code('CURRENT_PASSWORD_INVALID'));
  f.options.now += 10 * 60_000;
  await assert.rejects(changeSecurityPassword(f.uid, f.sid, wrong, f.options), code('CURRENT_PASSWORD_INVALID'));
  assert.equal(f.db.tables.get('users')[0].security_password_attempts, 1);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => changeSecurityPassword(f.uid, f.sid, wrong, f.options)));
  const rejectedCodes = results.map(result => result.reason.code);
  assert.equal(rejectedCodes.filter(value => value === 'CURRENT_PASSWORD_INVALID').length, 1);
  assert.equal(rejectedCodes.filter(value => value === 'PASSWORD_CHANGE_BUSY').length, 9);
  assert.equal(f.db.tables.get('users')[0].security_password_attempts, 2);
});

test('password change renews only current credentials without extending expiry and invalidates every old token', async () => {
  const f = await fixture();
  const other = await issueUserSession(f.user, {}, f.options);
  const previous = verifyJwt(f.credentials.accessToken);
  const result = await changeSecurityPassword(f.uid, f.sid, params(), f.options);
  const next = verifyJwt(result.accessToken);
  assert.equal(next.sid, previous.sid);
  assert.equal(next.exp, previous.exp);
  assert.notEqual(next.credentialVersion, previous.credentialVersion);
  assert.equal((await verifyAuthSession(f.credentials.accessToken, f.options)).reason, 'SESSION_REVOKED');
  assert.equal((await verifyAuthSession(other.accessToken, f.options)).reason, 'SESSION_REVOKED');
  assert.equal((await verifyAuthSession(result.accessToken, f.options)).isAuthenticated, true);
  assert.equal((await getSecuritySessions(f.uid, f.sid, {}, f.options)).pagination.total, 1);
  const stored = f.db.tables.get('users')[0];
  assert.equal(await bcrypt.compare(newPassword, stored.password_hash), true);
  const overview = await getAccountSecurity(f.uid, f.sid, f.options);
  assert.equal(overview.canChangePassword, true);
  assert.equal(overview.logs.items.filter(item => item.type === 'PASSWORD_CHANGED').length, 1);
  assert.equal(JSON.stringify(overview).includes(stored.password_hash), false);
  await recoverSecurityEvents(f.options);
  await recoverSecurityEvents(f.options);
  assert.equal(f.mails.length, 1);
  assert.equal(f.mails[0].text.includes(newPassword), false);
});

test('concurrent password changes commit exactly once and an expired processing lease cannot write', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    changeSecurityPassword(f.uid, f.sid, params(), f.options),
    changeSecurityPassword(f.uid, f.sid, params({ newPassword: 'AnotherPass789!', confirmNewPassword: 'AnotherPass789!' }), f.options),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'PASSWORD_CHANGE_BUSY');
  const g = await fixture();
  g.db.fail = (name, op, filter) => {
    if (name === 'users' && op === 'findOneAndUpdate' && filter.password_hash) g.options.now += 60_001;
  };
  await assert.rejects(changeSecurityPassword(g.uid, g.sid, params(), g.options), code('PASSWORD_CHANGE_BUSY'));
  assert.equal(g.db.tables.get('users')[0].password_hash, g.user.password_hash);
});

test('concurrent password reset or account suspension cannot be overwritten by an in-flight password change', async () => {
  for (const action of ['reset', 'suspend']) {
    const f = await fixture();
    const resetHash = await bcrypt.hash('ResetPassword789!', 4);
    f.db.fail = (name, operation, filter) => {
      if (name === 'users' && operation === 'updateOne' && filter.status === 'active') {
        const user = f.db.tables.get('users')[0];
        if (action === 'reset') user.password_hash = resetHash;
        else user.status = 'locked';
      }
    };
    await assert.rejects(changeSecurityPassword(f.uid, f.sid, params(), f.options), code('CREDENTIALS_CHANGED'));
    assert.equal(f.db.tables.get('users')[0].password_hash, action === 'reset' ? resetHash : f.user.password_hash);
  }
});

test('a later forgot-password reset does not resurrect the previously preserved session in the active list', async () => {
  const f = await fixture();
  await changeSecurityPassword(f.uid, f.sid, params(), f.options);
  const user = f.db.tables.get('users')[0];
  user.password_hash = await bcrypt.hash('ResetPassword789!', 4);
  const login = await loginWithCredentials({ email: user.email, password: 'ResetPassword789!' }, f.options);
  const current = verifyJwt(login.accessToken).sid;
  const list = await getSecuritySessions(f.uid, current, {}, f.options);
  assert.equal(list.pagination.total, 1);
  assert.equal(list.items[0].id, current);
});

test('OAuth-only accounts expose capability and cannot silently create a local password', async () => {
  const f = await fixture();
  f.db.tables.get('users')[0].password_hash = null;
  const overview = await getAccountSecurity(f.uid, f.sid, f.options);
  assert.equal(overview.canChangePassword, false);
  await assert.rejects(changeSecurityPassword(f.uid, f.sid, params(), f.options), code('PASSWORD_CHANGE_NOT_AVAILABLE'));
});

test('audit outages after password commit preserve recoverable events and do not report a failed password update', async () => {
  const f = await fixture();
  f.db.fail = name => { if (name === 'security_audit_logs') throw new Error('private database endpoint'); };
  const result = await changeSecurityPassword(f.uid, f.sid, params(), f.options);
  assert.equal(result.notificationPending, true);
  assert.equal(result.auditPending, true);
  assert.equal(f.db.tables.get('users')[0].security_events_pending.length, 1);
  assert.equal((await verifyAuthSession(result.accessToken, f.options)).isAuthenticated, true);
  f.db.fail = null;
  await recoverSecurityEvents(f.options);
  assert.equal(f.db.tables.get('users')[0].security_events_pending.length, 0);
  assert.equal(f.mails.length, 1);
});

test('failed email delivery is retried with backoff; concurrent workers do not claim one job twice', async () => {
  const f = await fixture();
  await changeSecurityPassword(f.uid, f.sid, params(), f.options);
  const unavailable = { ...f.options, sendEmail: async () => { throw new Error('smtp credential must not leak'); } };
  const result = await recoverSecurityEvents(unavailable);
  assert.equal(result.failed, 1);
  assert.equal(f.db.tables.get('security_email_outbox')[0].status, 'pending');
  await recoverSecurityEvents(f.options);
  assert.equal(f.mails.length, 0);
  f.options.now += 120_000;
  await Promise.all([recoverSecurityEvents(f.options), recoverSecurityEvents(f.options)]);
  assert.equal(f.mails.length, 1);
});

test('audit queries are owned, bounded and recover login/revoke events after storage outages', async () => {
  const f = await fixture();
  for (const query of [{ limit: 101 }, { page: 0 }, { limit: {} }]) {
    await assert.rejects(getSecurityLogs(f.uid, f.sid, query, f.options), code('SECURITY_INVALID_PAGE'));
  }
  f.db.fail = name => { if (name === 'security_audit_logs') throw new Error('storage unavailable'); };
  await assert.rejects(issueUserSession(f.user, {}, f.options));
  f.db.fail = null;
  await recoverSecurityEvents(f.options);
  const logs = await getSecurityLogs(f.uid, f.sid, {}, f.options);
  assert.equal(logs.pagination.total, 2);
});

test('Notification integration: security events reach inbox despite DND/opt-out, and recovery never duplicates them', async () => {
  const f = await fixture();
  await f.db.collection('notification_preferences').insertOne({ _id: f.uid, email: false, web: false,
    security: false, dnd: { mode: 'indefinite', startedAt: new Date() } });
  const second = await issueUserSession(f.user, {}, f.options);
  await revokeSecuritySession(f.uid, f.sid, verifyJwt(second.accessToken).sid, f.options);
  await changeSecurityPassword(f.uid, f.sid, params(), f.options);
  await recoverSecurityEvents(f.options);await recoverSecurityEvents(f.options);
  const notices = f.db.tables.get('notifications');
  assert.equal(notices.length, 4);
  assert.equal(notices.filter(row => row.kind === 'login').length, 2);
  assert.equal(notices.filter(row => row.kind === 'password').length, 1);
  assert.equal(notices.filter(row => row.kind === 'alert').length, 1);
  assert.equal(notices.every(row => row.category === 'security' && row.user_id === f.uid), true);
  assert.equal(f.mails.length, 1);
  assert.equal(JSON.stringify(notices).includes(newPassword), false);
});

test('Notification integration: password event survives inbox failure and recovery completes the missing inbox entry', async () => {
  const f = await fixture();
  f.db.fail = name => { if (name === 'notifications') throw new Error('Inbox unavailable'); };
  const result = await changeSecurityPassword(f.uid, f.sid, params(), f.options);
  assert.equal(result.auditPending, true);
  assert.equal((await verifyAuthSession(result.accessToken, f.options)).isAuthenticated, true);
  f.db.fail = null;
  await recoverSecurityEvents(f.options);
  assert.equal(f.db.tables.get('notifications').filter(row => row.kind === 'password').length, 1);
  assert.equal(f.mails.length, 1);
});

test('registered HTTP router requires auth/CSRF, returns field errors, masks DB errors and renews cookie credentials', async t => {
  const f = await fixture();
  const app = express();
  app.use(express.json());
  app.use(requireCookieCsrf);
  const requireAuth = async (req, res, next) => {
    const session = await verifyAuthSession(readAuthToken(req), f.options);
    if (!session.isAuthenticated) return res.status(401).json({ code: session.reason });
    req.userId = session.user.id;
    next();
  };
  app.use('/api/user/settings', createAccountSecurityRouter(express, requireAuth, {
    ...f.options, readAccessPayload: req => verifyAccessToken(readAuthToken(req)), setAuthCookie,
  }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/user/settings`;
  const authorization = { Authorization: `Bearer ${f.credentials.accessToken}` };
  assert.equal((await fetch(`${base}/account-security`)).status, 401);
  assert.equal((await fetch(`${base}/account-security`, { headers: authorization })).status, 200);
  const other = await issueUserSession(f.user, {}, f.options);
  const target = verifyJwt(other.accessToken).sid;
  const revoke = await fetch(`${base}/sessions/${target}`, { method: 'DELETE', headers: authorization });
  assert.equal(revoke.status, 200);
  assert.equal((await fetch(`${base}/account-security`, {
    headers: { Authorization: `Bearer ${other.accessToken}` },
  })).status, 401);
  let response = await fetch(`${base}/change-password`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `thinkup_user_auth=${f.credentials.accessToken}` }, body: JSON.stringify(params()) });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/change-password`, { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(params({ currentPassword: 'WrongPass123!' })) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).field, 'currentPassword');
  f.db.fail = name => { if (name === 'security_audit_logs') throw new Error('private-db-url'); };
  response = await fetch(`${base}/security-logs`, { headers: authorization });
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private-db-url'), false);
  f.db.fail = null;
  response = await fetch(`${base}/change-password`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Cookie: `thinkup_user_auth=${f.credentials.accessToken}`,
    'X-CSRF-Token': createCsrfToken(f.credentials.accessToken),
  }, body: JSON.stringify(params()) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /thinkup_user_auth=.*HttpOnly/i);
  const { data } = await response.json();
  assert.equal(data.csrfToken, createCsrfToken(data.accessToken));
  assert.notEqual(data.csrfToken, createCsrfToken(f.credentials.accessToken));
  assert.equal((await fetch(`${base}/account-security`, { headers: authorization })).status, 401);
  assert.equal((await fetch(`${base}/account-security`, { headers: { Authorization: `Bearer ${data.accessToken}` } })).status, 200);
});

test('actual server registers every security route behind authentication', {
  skip: 'Import server hiện khởi tạo kết nối MongoDB từ Blog router. Chỉ chạy sau khi có môi trường DB kiểm thử riêng.',
}, async t => {
  // The existing profile module registers a 24h maintenance interval at import time.
  // Unref import-time timers in this test process only; do not alter unrelated production code.
  const originalInterval = globalThis.setInterval;
  const previousNodeEnv = process.env.NODE_ENV;
  let app;
  try {
    process.env.NODE_ENV = 'test';
    globalThis.setInterval = (...args) => originalInterval(...args).unref();
    ({ default: app } = await import('../../../server.js'));
  } finally {
    globalThis.setInterval = originalInterval;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [method, path] of [
    ['GET', 'account-security'], ['GET', 'sessions'], ['GET', 'security-logs'],
    ['POST', 'change-password'], ['DELETE', 'sessions/00000000-0000-4000-8000-000000000000'],
  ]) {
    const response = await fetch(`${base}/api/user/settings/${path}`, { method });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.equal((await response.json()).code, 'AUTH_REQUIRED');
  }
  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /thinkup_user_auth=/);
});
