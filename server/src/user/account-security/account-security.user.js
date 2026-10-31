import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getMongoDb, signJwt, sendEmail } from '../db.js';
import { credentialVersion, validatePassword } from '../auth/signup.user.js';
import { createNotificationForEvent } from '../notification/notification.user.js';

const SESSIONS = 'user_sessions';
const LOGS = 'security_audit_logs';
const MAILS = 'security_email_outbox';
const WINDOW_MS = 10 * 60_000;
const LOCK_MS = 15 * 60_000;
const LEASE_MS = 60_000;
const TITLES = Object.freeze({
  LOGIN_SUCCESS: 'Đăng nhập thành công', PASSWORD_CHANGED: 'Đổi mật khẩu',
  SESSION_REVOKED: 'Đăng xuất thiết bị từ xa',
});
const instant = options => new Date(options.now ?? Date.now());
const database = async options => options.db || await getMongoDb();
function failure(code, message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { code, status, ...extra });
}
function userId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) {
    throw failure('SECURITY_AUTH_REQUIRED', 'Yêu cầu đăng nhập.', 401);
  }
  return new ObjectId(value);
}
function sessionId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) {
    throw failure('SESSION_INVALID', 'Phiên đăng nhập không hợp lệ.', 401);
  }
  return value;
}
function activeUser(user) {
  if (!user || user.status !== 'active' || user.is_active === false ||
      !user.email_verified || user.role !== 'student') {
    throw failure('SECURITY_AUTH_REQUIRED', 'Tài khoản không được phép thực hiện thao tác.', 401);
  }
}
function deviceInfo(context = {}) {
  const ua = typeof context.userAgent === 'string' ? context.userAgent.slice(0, 1024) : '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS/i.test(ua) ? 'macOS'
      : /Linux/i.test(ua) ? 'Linux' : 'Không xác định';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera'
    : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
      : /Safari/i.test(ua) ? 'Safari' : 'Không xác định';
  let ip = typeof context.ip === 'string' ? context.ip : '';
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const maskedIp = isIP(ip) === 4 ? `${ip.split('.').slice(0, 2).join('.')}.XXX.XXX`
    : isIP(ip) === 6 ? `${ip.split(':').slice(0, 2).join(':')}:XXXX:XXXX` : 'Không xác định';
  return { deviceType: /Mobile|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
    os, browser, maskedIp, location: 'Không xác định' };
}
function event(type, sid, device, timestamp, targetSessionId) {
  return { _id: randomUUID(), type, sessionId: sid, device, createdAt: timestamp,
    ...(targetSessionId ? { targetSessionId } : {}) };
}
function tokens(user, session) {
  const claims = { sub: String(user._id), email: user.email, role: user.role,
    name: user.full_name, sid: session._id, credentialVersion: credentialVersion(user) };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessSeconds = Math.floor(+session.expires_at / 1000) - nowSeconds;
  if (accessSeconds <= 0) throw failure('SESSION_REVOKED', 'Phiên đăng nhập đã hết hạn.', 401);
  const accessToken = signJwt({ ...claims, iat: nowSeconds }, accessSeconds);
  const refreshToken = signJwt({ sub: claims.sub, sid: session._id, type: 'refresh',
    credentialVersion: claims.credentialVersion, iat: nowSeconds }, Math.floor(+session.refresh_expires_at / 1000) - nowSeconds);
  return { accessToken, refreshToken, token: accessToken };
}

/** Called by every successful local/social login. No raw IP, User-Agent or token is stored. */
export async function issueUserSession(user, context = {}, options = {}) {
  activeUser(user);
  if (context.rememberMe !== undefined && typeof context.rememberMe !== 'boolean') {
    throw failure('SESSION_INVALID_INPUT', 'Lựa chọn ghi nhớ đăng nhập không hợp lệ.');
  }
  const db = await database(options);
  const timestamp = instant(options);
  const session = { _id: randomUUID(), user_id: String(user._id),
    device: deviceInfo(context), credential_version: credentialVersion(user),
    created_at: timestamp, last_seen_at: timestamp, revoked_at: null,
    expires_at: new Date(+timestamp + (context.rememberMe ? 30 : 1) * 86400_000),
    refresh_expires_at: new Date(+timestamp + (context.rememberMe ? 30 : 7) * 86400_000),
    remember_me: context.rememberMe === true };
  session.pending_event = event('LOGIN_SUCCESS', session._id, session.device, timestamp);
  await db.collection(SESSIONS).insertOne(session);
  // An unlogged login is never returned as a successful login; recovery can finish its event.
  await persistEvent(db, session.user_id, session.pending_event);
  await db.collection(SESSIONS).updateOne({ _id: session._id }, { $set: { pending_event: null } });
  return tokens(user, session);
}

/** Credential version/account checks are performed by the existing auth verifier first. */
export async function validateUserSession(payload, options = {}) {
  if (typeof payload.sid !== 'string' || !/^[a-f0-9-]{36}$/i.test(payload.sid)) return false;
  const db = await database(options);
  const timestamp = instant(options);
  const session = await db.collection(SESSIONS).findOne({ _id: payload.sid,
    user_id: payload.sub, revoked_at: null, expires_at: { $gt: timestamp } });
  if (!session) return false;
  // Do not write on every request; validation always reads revocation without a cache.
  if (+timestamp - +session.last_seen_at >= 60_000) {
    await db.collection(SESSIONS).updateOne({ _id: session._id, revoked_at: null },
      { $set: { last_seen_at: timestamp } });
  }
  return true;
}

async function ownedSession(db, uid, sid, timestamp) {
  const session = await db.collection(SESSIONS).findOne({ _id: sessionId(sid),
    user_id: uid, revoked_at: null, expires_at: { $gt: timestamp } });
  if (!session) throw failure('SESSION_REVOKED', 'Phiên đã hết hạn hoặc bị thu hồi.', 401);
  return session;
}
async function currentContext(uid, sid, options) {
  const db = await database(options);
  const user = await db.collection('users').findOne({ _id: userId(uid) });
  activeUser(user);
  const session = await ownedSession(db, uid, sid, instant(options));
  return { db, user, session };
}
function pagination(query = {}) {
  const number = (value, fallback, maximum) => {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
      throw failure('SECURITY_INVALID_PAGE', 'Tham số phân trang không hợp lệ.');
    }
    return Number(value);
  };
  return { page: number(query.page, 1, 10000), limit: number(query.limit, 20, 100) };
}
function sessionView(row, sid) {
  return { id: row._id, ...row.device, isCurrent: row._id === sid,
    createdAt: row.created_at.toISOString(), lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at.toISOString() };
}

export async function getSecuritySessions(uid, sid, query = {}, options = {}) {
  const { db, user, session } = await currentContext(uid, sid, options);
  const { page, limit } = pagination(query);
  // Password changes invalidate older tokens. Keep only the explicitly preserved current session.
  const version = credentialVersion(user);
  const keptId = user.security_kept_credential_version === version ? user.security_kept_session_id : sid;
  const filter = { user_id: uid, _id: { $ne: sid }, revoked_at: null, expires_at: { $gt: instant(options) },
    $or: [{ credential_version: version }, { _id: keptId }] };
  const collection = db.collection(SESSIONS);
  const [rows, total] = await Promise.all([
    page === 1 && limit === 1 ? Promise.resolve([]) : collection.find(filter)
      .sort({ last_seen_at: -1, _id: -1 }).skip(Math.max(0, (page - 1) * limit - 1))
      .limit(page === 1 ? limit - 1 : limit).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items: (page === 1 ? [session, ...rows] : rows).map(row => sessionView(row, sid)),
    pagination: { page, limit, total: total + 1, hasMore: page * limit < total + 1 } };
}

export async function revokeSecuritySession(uid, sid, targetId, options = {}) {
  const { db, session } = await currentContext(uid, sid, options);
  if (targetId === sid) throw failure('CURRENT_SESSION_PROTECTED', 'Không thể đăng xuất phiên hiện tại tại đây.', 409);
  if (typeof targetId !== 'string' || !/^[a-f0-9-]{36}$/i.test(targetId)) {
    throw failure('SESSION_NOT_FOUND', 'Không tìm thấy phiên đăng nhập.', 404);
  }
  const timestamp = instant(options);
  const collection = db.collection(SESSIONS);
  const target = await collection.findOne({ _id: targetId, user_id: uid });
  if (!target) throw failure('SESSION_NOT_FOUND', 'Không tìm thấy phiên đăng nhập.', 404);
  const nextEvent = event('SESSION_REVOKED', sid, session.device, timestamp, targetId);
  await collection.updateOne({ _id: targetId, user_id: uid, revoked_at: null },
    { $set: { revoked_at: timestamp, pending_event: nextEvent } });
  const saved = await collection.findOne({ _id: targetId, user_id: uid });
  if (saved.pending_event) {
    await persistEvent(db, uid, saved.pending_event);
    await collection.updateOne({ _id: targetId, 'pending_event._id': saved.pending_event._id },
      { $set: { pending_event: null } });
  }
  return { id: targetId, revoked: true };
}

/** Ordinary logout is idempotent, including already-expired/legacy sessions. */
export async function logoutSecuritySession(payload, options = {}) {
  if (!payload?.sid || !payload?.sub) return;
  const db = await database(options);
  await db.collection(SESSIONS).updateOne({ _id: payload.sid, user_id: payload.sub, revoked_at: null },
    { $set: { revoked_at: instant(options) } });
}

function lockedError(until, timestamp) {
  return failure('PASSWORD_CHANGE_LOCKED', 'Chức năng đổi mật khẩu tạm khóa. Vui lòng thử lại sau.', 429,
    { lockedUntil: until.toISOString(), retryAfter: Math.max(1, Math.ceil((+until - +timestamp) / 1000)) });
}

export async function changeSecurityPassword(uid, sid, payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw failure('SECURITY_INVALID_INPUT', 'Dữ liệu đổi mật khẩu không hợp lệ.');
  }
  for (const key of ['currentPassword', 'newPassword', 'confirmNewPassword']) {
    if (typeof payload[key] !== 'string' || !payload[key] || payload[key].length > 1024) {
      throw failure('PASSWORD_REQUIRED', 'Vui lòng nhập đầy đủ mật khẩu.', 400, { field: key });
    }
  }
  const policy = validatePassword(payload.newPassword);
  if (!policy.valid || payload.newPassword.length > 32) {
    throw failure('PASSWORD_TOO_WEAK', payload.newPassword.length > 32
      ? 'Mật khẩu mới phải từ 8 đến 32 ký tự.' : policy.message, 400, { field: 'newPassword' });
  }
  if (payload.newPassword !== payload.confirmNewPassword) {
    throw failure('PASSWORD_CONFIRM_MISMATCH', 'Mật khẩu xác nhận không khớp.', 400, { field: 'confirmNewPassword' });
  }
  const { db, user, session } = await currentContext(uid, sid, options);
  if (!user.password_hash) throw failure('PASSWORD_CHANGE_NOT_AVAILABLE',
    'Tài khoản chưa thiết lập mật khẩu. Vui lòng dùng phương thức đăng nhập đã liên kết.', 409);
  const timestamp = instant(options);
  const users = db.collection('users');
  const lease = randomUUID();
  const acquired = await users.findOneAndUpdate({ _id: user._id,
    password_hash: user.password_hash, $or: [
      { security_change_lease_until: null }, { security_change_lease_until: { $lte: timestamp } },
    ] }, { $set: { security_change_lease_id: lease, security_change_lease_until: new Date(+timestamp + LEASE_MS) } },
  { returnDocument: 'after' });
  if (!acquired) throw failure('PASSWORD_CHANGE_BUSY', 'Một yêu cầu khác đang được xử lý. Vui lòng thử lại.', 409);
  const leaseFilter = { _id: user._id, security_change_lease_id: lease, password_hash: user.password_hash };
  try {
    if (acquired.security_password_locked_until && +acquired.security_password_locked_until > +timestamp) {
      throw lockedError(acquired.security_password_locked_until, timestamp);
    }
    if (!await bcrypt.compare(payload.currentPassword, user.password_hash)) {
      const inWindow = acquired.security_password_window_at &&
        +timestamp - +acquired.security_password_window_at < WINDOW_MS;
      const attempts = (inWindow ? acquired.security_password_attempts || 0 : 0) + 1;
      const until = attempts >= 5 ? new Date(+timestamp + LOCK_MS) : null;
      const result = await users.updateOne(leaseFilter, { $set: {
        security_password_attempts: attempts,
        security_password_window_at: inWindow ? acquired.security_password_window_at : timestamp,
        security_password_locked_until: until,
      } });
      if (!result.matchedCount) throw failure('CREDENTIALS_CHANGED', 'Thông tin bảo mật đã thay đổi. Vui lòng đăng nhập lại.', 409);
      if (until) throw lockedError(until, timestamp);
      throw failure('CURRENT_PASSWORD_INVALID', 'Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.',
        400, { field: 'currentPassword' });
    }
    if (await bcrypt.compare(payload.newPassword, user.password_hash)) {
      throw failure('PASSWORD_UNCHANGED', 'Mật khẩu mới không được trùng với mật khẩu hiện tại.', 400, { field: 'newPassword' });
    }
    const passwordHash = await bcrypt.hash(payload.newPassword, 12);
    const renewedTokens = tokens({ ...user, password_hash: passwordHash }, session);
    // Check lease expiry after expensive work; a timed-out operation cannot overwrite a newer request.
    if (+instant(options) >= +acquired.security_change_lease_until) {
      throw failure('PASSWORD_CHANGE_BUSY', 'Yêu cầu đã quá thời gian xử lý. Vui lòng thử lại.', 409);
    }
    const securityEvent = event('PASSWORD_CHANGED', sid, session.device, timestamp);
    const result = await users.updateOne({ ...leaseFilter, status: 'active', is_active: { $ne: false },
      email_verified: true }, { $set: { password_hash: passwordHash, security_kept_session_id: sid,
      security_kept_credential_version: credentialVersion({ ...user, password_hash: passwordHash }),
      security_password_attempts: 0, security_password_window_at: null, security_password_locked_until: null,
      updated_at: timestamp }, $push: { security_events_pending: securityEvent } });
    if (!result.matchedCount) throw failure('CREDENTIALS_CHANGED', 'Thông tin bảo mật đã thay đổi. Vui lòng đăng nhập lại.', 409);
    // Password + durable event are committed in one MongoDB document, without requiring a replica-set transaction.
    // Failure flushing audit/email is recoverable and must not turn an already committed password change into a failure.
    let auditPending = false;
    try { await flushUserEvents(db, uid); } catch { auditPending = true; }
    return { ...renewedTokens,
      rememberMe: session.remember_me, notificationPending: true, auditPending };
  } finally {
    // Do not let a lease-release outage hide a successful committed credential change.
    try {
      await users.updateOne({ _id: user._id, security_change_lease_id: lease },
        { $set: { security_change_lease_id: null, security_change_lease_until: null } });
    } catch {
      console.warn('[Account security] Chưa giải phóng được khóa xử lý; khóa sẽ hết hạn sau tối đa 60 giây.');
    }
  }
}

async function persistEvent(db, uid, entry) {
  await db.collection(LOGS).updateOne({ _id: entry._id },
    { $setOnInsert: { ...entry, user_id: uid } }, { upsert: true });
  await createNotificationForEvent(uid, {
    eventKey: `security:${entry._id}`, category: 'security',
    kind: entry.type === 'LOGIN_SUCCESS' ? 'login' : entry.type === 'PASSWORD_CHANGED' ? 'password' : 'alert',
    title: TITLES[entry.type], message: `${TITLES[entry.type]} trên ThinkUp. Kiểm tra hoạt động tài khoản nếu không phải bạn thực hiện.`,
    sourceType: 'security_event', sourceId: entry._id, href: '/main/settings/account-security',
  }, { db, now: entry.createdAt });
  if (entry.type === 'PASSWORD_CHANGED') {
    await db.collection(MAILS).updateOne({ _id: entry._id }, { $setOnInsert: {
      user_id: uid, created_at: entry.createdAt, status: 'pending', attempts: 0,
      next_attempt_at: entry.createdAt, lease_until: null,
    } }, { upsert: true });
  }
}
async function flushUserEvents(db, uid) {
  const user = await db.collection('users').findOne({ _id: userId(uid) });
  for (const entry of user?.security_events_pending || []) {
    await persistEvent(db, uid, entry);
    await db.collection('users').updateOne({ _id: user._id },
      { $pull: { security_events_pending: { _id: entry._id } } });
  }
}

export async function getSecurityLogs(uid, sid, query = {}, options = {}) {
  const { db } = await currentContext(uid, sid, options);
  await flushUserEvents(db, uid);
  const { page, limit } = pagination(query);
  const collection = db.collection(LOGS);
  const [rows, total] = await Promise.all([
    collection.find({ user_id: uid }).sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).toArray(),
    collection.countDocuments({ user_id: uid }),
  ]);
  return { items: rows.map(row => ({ id: row._id, type: row.type, title: TITLES[row.type],
    device: row.device, createdAt: row.createdAt.toISOString() })),
  pagination: { page, limit, total, hasMore: page * limit < total } };
}

export async function getAccountSecurity(uid, sid, options = {}) {
  const { user } = await currentContext(uid, sid, options);
  const [sessions, logs] = await Promise.all([
    getSecuritySessions(uid, sid, { limit: 3 }, options), getSecurityLogs(uid, sid, { limit: 5 }, options),
  ]);
  const until = user.security_password_locked_until;
  return { canChangePassword: Boolean(user.password_hash), serverTime: instant(options).toISOString(),
    passwordLockedUntil: until && +until > +instant(options) ? until.toISOString() : null, sessions, logs };
}

/** Recover committed events and send password alerts. Bounded, leased work is safe across instances. */
export async function recoverSecurityEvents(options = {}) {
  const db = await database(options);
  const pendingUsers = await db.collection('users').find({ 'security_events_pending.0': { $exists: true } })
    .limit(50).toArray();
  for (const user of pendingUsers) await flushUserEvents(db, String(user._id));
  const sessions = await db.collection(SESSIONS).find({ 'pending_event._id': { $exists: true } }).limit(100).toArray();
  for (const session of sessions) {
    await persistEvent(db, session.user_id, session.pending_event);
    await db.collection(SESSIONS).updateOne({ _id: session._id, 'pending_event._id': session.pending_event._id },
      { $set: { pending_event: null } });
  }
  const timestamp = instant(options);
  const jobs = await db.collection(MAILS).find({ status: 'pending', next_attempt_at: { $lte: timestamp } }).limit(50).toArray();
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const lease = randomUUID();
    const claimed = await db.collection(MAILS).findOneAndUpdate({ _id: job._id, status: 'pending',
      next_attempt_at: { $lte: timestamp }, $or: [{ lease_until: null }, { lease_until: { $lte: timestamp } }] },
    { $set: { lease_id: lease, lease_until: new Date(+timestamp + LEASE_MS) }, $inc: { attempts: 1 } },
    { returnDocument: 'after' });
    if (!claimed) continue;
    try {
      const user = await db.collection('users').findOne({ _id: userId(job.user_id) });
      if (!user?.email) throw new Error('Recipient unavailable');
      const result = await (options.sendEmail || sendEmail)({ to: user.email,
        subject: 'ThinkUp - Mật khẩu của bạn đã được thay đổi',
        text: `Mật khẩu ThinkUp của bạn đã được thay đổi lúc ${job.created_at.toISOString()}. Nếu không phải bạn thực hiện, hãy đặt lại mật khẩu và liên hệ bộ phận hỗ trợ.` });
      if (!result?.accepted?.length || result.sent === false) throw new Error('Delivery unavailable');
      await db.collection(MAILS).updateOne({ _id: job._id, lease_id: lease },
        { $set: { status: 'sent', sent_at: timestamp, lease_until: null } });
      sent++;
    } catch {
      await db.collection(MAILS).updateOne({ _id: job._id, lease_id: lease }, { $set: {
        status: claimed.attempts >= 8 ? 'failed' : 'pending', lease_until: null,
        next_attempt_at: new Date(+timestamp + Math.min(3600_000, 60_000 * 2 ** claimed.attempts)),
      } });
      failed++;
    }
  }
  return { sent, failed };
}

/** Uses the application's auth/cookie helpers, supplied by server.js to avoid a second auth system. */
export function createAccountSecurityRouter(express, requireAuth, options = {}) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handle = operation => async (req, res) => {
    try {
      const payload = options.readAccessPayload(req);
      if (payload.sub !== req.userId) throw failure('SECURITY_AUTH_REQUIRED', 'Yêu cầu đăng nhập.', 401);
      res.json({ success: true, data: await operation(req, res, payload.sid) });
    } catch (error) {
      const known = typeof error.code === 'string' && error.status && error.status < 500;
      if (known && error.retryAfter) res.set('Retry-After', String(error.retryAfter));
      res.status(known ? error.status : 503).json({ success: false,
        code: known ? error.code : 'SECURITY_UNAVAILABLE',
        message: known ? error.message : 'Không thể xử lý dữ liệu bảo mật lúc này. Vui lòng thử lại.',
        ...(known && error.field ? { field: error.field } : {}),
        ...(known && error.retryAfter ? { retryAfter: error.retryAfter, lockedUntil: error.lockedUntil } : {}) });
    }
  };
  router.get('/account-security', handle((req, res, sid) => getAccountSecurity(req.userId, sid, options)));
  router.get('/sessions', handle((req, res, sid) => getSecuritySessions(req.userId, sid, req.query, options)));
  router.delete('/sessions/:id', handle((req, res, sid) => revokeSecuritySession(req.userId, sid, req.params.id, options)));
  router.get('/security-logs', handle((req, res, sid) => getSecurityLogs(req.userId, sid, req.query, options)));
  router.post('/change-password', handle(async (req, res, sid) => {
    const data = await changeSecurityPassword(req.userId, sid, req.body, options);
    options.setAuthCookie(res, data, 'user', data.rememberMe);
    return data;
  }));
  return router;
}
