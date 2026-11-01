import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAdminAuthRouter } from '../../../admin/auth/auth.admin.js';
import { signJwt } from '../../db.js';
import {
  readAuthToken, verifyAccessToken, setAuthCookie, clearAuthCookie,
  createCsrfToken, requireCookieCsrf, authCookieOptions,
} from '../auth.user.js';

const userToken = signJwt({ sub: '507f1f77bcf86cd799439011', role: 'student' }, '24h');
const adminToken = signJwt({ adminId: '507f1f77bcf86cd799439012', role: 'ADMIN' }, '1d');
const userCookie = `thinkup_user_auth=${userToken}`;
const adminCookie = `thinkup_admin_auth=${adminToken}`;

test('Cookie parsing and explicit Bearer precedence', () => {
  assert.equal(readAuthToken({ headers: { cookie: `other=1; ${userCookie}` } }), userToken);
  assert.equal(readAuthToken({ headers: { cookie: adminCookie } }), null);
  assert.equal(readAuthToken({ headers: { cookie: `${userCookie}; ${userCookie}` } }), null);
  assert.equal(readAuthToken({ headers: { cookie: 'thinkup_user_auth=%ZZ' } }), null);
  assert.equal(readAuthToken({ headers: { cookie: userCookie, authorization: 'Bearer explicit' } }), 'explicit');
});

test('Access tokens reject cross-audience, expired, refresh and intermediate tokens', () => {
  assert.equal(verifyAccessToken(userToken).sub, '507f1f77bcf86cd799439011');
  assert.equal(verifyAccessToken(adminToken, 'admin').role, 'ADMIN');
  for (const token of [adminToken, signJwt({ sub: 'user', type: 'refresh' }),
    signJwt({ sub: 'user', purpose: 'verify_email' }), signJwt({ sub: 'user' }, '-1s'), 'invalid']) {
    assert.throws(() => verifyAccessToken(token));
  }
  for (const extra of [{ authStep: '2FA_PENDING' }, { step: '2FA_SETUP' }]) {
    assert.throws(() => verifyAccessToken(signJwt({ adminId: 'admin', ...extra }), 'admin'));
  }
  assert.throws(() => verifyAccessToken(userToken, 'admin'));
});

test('Cookie flags, persistence, expiry and clearing', () => {
  const previous = { node: process.env.NODE_ENV, secure: process.env.AUTH_COOKIE_SECURE, same: process.env.AUTH_COOKIE_SAME_SITE };
  try {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    const res = { cookie(name, token, options) { this.saved = { name, token, options }; }, set() {},
      clearCookie(name, options) { this.cleared = { name, options }; } };
    const result = { accessToken: userToken };
    setAuthCookie(res, result);
    assert.equal(res.saved.options.httpOnly, true);
    assert.equal(res.saved.options.path, '/');
    assert.equal(res.saved.options.sameSite, 'lax');
    assert.equal(res.saved.options.maxAge, undefined);
    assert.equal(result.csrfToken, createCsrfToken(userToken));
    setAuthCookie(res, { accessToken: userToken }, 'user', true);
    assert.ok(res.saved.options.maxAge > 0 && res.saved.options.maxAge <= 86400000);
    clearAuthCookie(res);
    assert.equal(res.cleared.name, res.saved.name);
    assert.equal(res.cleared.options.path, res.saved.options.path);
    process.env.AUTH_COOKIE_SAME_SITE = 'none';
    assert.throws(authCookieOptions);
    process.env.AUTH_COOKIE_SECURE = 'true';
    assert.equal(authCookieOptions().secure, true);
    process.env.AUTH_COOKIE_SAME_SITE = 'invalid';
    assert.throws(authCookieOptions);
    const untouched = {};
    setAuthCookie(untouched, { requires2FA: true });
    assert.deepEqual(untouched, {});
  } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: previous.node, AUTH_COOKIE_SECURE: previous.secure, AUTH_COOKIE_SAME_SITE: previous.same })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('CSRF binds token and audience; malformed Unicode cannot crash middleware', () => {
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  for (const supplied of [undefined, 'é'.repeat(64), createCsrfToken(adminToken, 'admin')]) {
    requireCookieCsrf({ method: 'POST', path: '/api/user/cart', headers: { cookie: userCookie, 'x-csrf-token': supplied } }, res,
      () => assert.fail('Must reject CSRF'));
    assert.equal(res.code, 403);
  }
  let called = 0;
  requireCookieCsrf({ method: 'POST', path: '/api/user/cart', headers: { cookie: userCookie, authorization: '   ' } }, res,
    () => assert.fail('Whitespace authorization must not bypass CSRF'));
  assert.equal(res.code, 403);
  requireCookieCsrf({ method: 'POST', path: '/api/user/cart', headers: { cookie: userCookie, 'x-csrf-token': createCsrfToken(userToken) } }, res, () => called++);
  requireCookieCsrf({ method: 'POST', path: '/api/v1/admin/auth/logout', headers: { cookie: adminCookie, 'x-csrf-token': createCsrfToken(adminToken, 'admin') } }, res, () => called++);
  requireCookieCsrf({ method: 'GET', headers: {} }, res, () => called++);
  assert.equal(called, 3);
});

test('HTTP integration: isolated User fixture and actual Admin router, without database access', async () => {
  const app = express();
  app.use(requireCookieCsrf);
  app.get('/api/auth/csrf', (req, res) => {
    try {
      const token = readAuthToken(req);
      verifyAccessToken(token);
      res.set('Cache-Control', 'no-store').json({ csrfToken: createCsrfToken(token) });
    } catch { res.sendStatus(401); }
  });
  app.post('/api/auth/logout', (req, res) => { clearAuthCookie(res); res.json({}); });
  app.use('/api/admin/auth', createAdminAuthRouter(express));
  app.use('/api/v1/admin/auth', createAdminAuthRouter(express));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, cookie, token, audience] of [
      ['/api/auth', userCookie, userToken, 'user'],
      ['/api/admin/auth', adminCookie, adminToken, 'admin'],
      ['/api/v1/admin/auth', adminCookie, adminToken, 'admin'],
    ]) {
      const csrfRes = await fetch(`${base}${path}/csrf`, { headers: { cookie } });
      assert.equal(csrfRes.status, 200);
      assert.equal(csrfRes.headers.get('cache-control'), 'no-store');
      const { csrfToken } = await csrfRes.json();
      assert.equal(csrfToken, createCsrfToken(token, audience));
      assert.equal((await fetch(`${base}${path}/logout`, { method: 'POST', headers: { cookie } })).status, 403);
      const logout = await fetch(`${base}${path}/logout`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrfToken } });
      assert.equal(logout.status, 200);
      assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
      assert.match(logout.headers.get('set-cookie'), /HttpOnly/);
      assert.equal((await fetch(`${base}${path}/csrf`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
    }
    assert.equal((await fetch(`${base}/api/auth/csrf`)).status, 401);
    assert.equal((await fetch(`${base}/api/auth/csrf`, { headers: { cookie: adminCookie } })).status, 401);
    const pending = signJwt({ adminId: 'admin', authStep: '2FA_PENDING' });
    assert.equal((await fetch(`${base}/api/admin/auth/csrf`, { headers: { authorization: `Bearer ${pending}` } })).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('HTTP issuance serializes session and persistent cookies', async () => {
  const fixture = express();
  fixture.get('/issue', (req, res) => {
    const result = { accessToken: userToken };
    setAuthCookie(res, result, 'user', req.query.remember === 'true');
    res.json(result);
  });
  const server = fixture.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const session = await fetch(`${base}/issue`);
    assert.match(session.headers.get('set-cookie'), /HttpOnly/);
    assert.doesNotMatch(session.headers.get('set-cookie'), /Max-Age/);
    const persistent = await fetch(`${base}/issue?remember=true`);
    assert.match(persistent.headers.get('set-cookie'), /Max-Age=/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
