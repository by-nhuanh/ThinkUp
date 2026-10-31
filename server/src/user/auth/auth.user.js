/**
 * ThinkUp Backend User - Authentication Aggregate Module
 * Kết hợp 3 mô-đun chức năng độc lập:
 * - signup.user.js: Đăng ký học viên (5 trường + Verification link 12h + JIT OAuth)
 * - signin.user.js: Đăng nhập học viên (Email/Password + Remember Me + Brute-force + Identity Linking)
 * - forgot-password.user.js: Quên mật khẩu qua OTP 6 số (5 phút, Cooldown 60s, hủy sau 5 lần sai)
 */

export * from '../db.js';
export * from './signup.user.js';
export * from './signin.user.js';
export * from './forgot-password.user.js';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getJwtSecret, verifyJwt } from '../db.js';

export function authCookieOptions() {
  const sameSite = (process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) throw new Error('Invalid AUTH_COOKIE_SAME_SITE');
  const secure = process.env.AUTH_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  if (sameSite === 'none' && !secure) throw new Error('SameSite=None requires Secure cookies');
  return { httpOnly: true, secure, sameSite, path: '/' };
}

export function authCookieName(audience = 'user') {
  return audience === 'admin' ? 'thinkup_admin_auth' : 'thinkup_user_auth';
}

export function readAuthToken(req, audience = 'user') {
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.trim()) {
    return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
  }
  const name = authCookieName(audience);
  const entries = (req.headers.cookie || '').split(';');
  const matches = entries.map(entry => entry.trim()).filter(entry => entry.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  try { return decodeURIComponent(matches[0].slice(name.length + 1)) || null; }
  catch { return null; }
}

export function verifyAccessToken(token, audience = 'user') {
  const payload = verifyJwt(token);
  if (payload.type || payload.purpose || payload.step || payload.authStep ||
      (audience === 'admin' ? !payload.adminId || payload.sub : !payload.sub || payload.adminId)) {
    const error = new Error('Token không hợp lệ cho khu vực này.');
    error.code = 'TOKEN_INVALID';
    error.status = 401;
    throw error;
  }
  return payload;
}

export function createCsrfToken(token, audience = 'user') {
  return createHmac('sha256', getJwtSecret()).update(`csrf:${audience}:${token}`).digest('hex');
}

export function setAuthCookie(res, result, audience = 'user', rememberMe = false) {
  if (!result.accessToken) return;
  const payload = verifyAccessToken(result.accessToken, audience);
  const options = authCookieOptions();
  if (rememberMe === true) options.maxAge = Math.max(0, payload.exp * 1000 - Date.now());
  res.cookie(authCookieName(audience), result.accessToken, options);
  res.set('Cache-Control', 'no-store');
  result.csrfToken = createCsrfToken(result.accessToken, audience);
}

export function clearAuthCookie(res, audience = 'user') {
  res.clearCookie(authCookieName(audience), authCookieOptions());
  res.set('Cache-Control', 'no-store');
}

export function requireCookieCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
      (typeof req.headers.authorization === 'string' && req.headers.authorization.trim())) return next();
  const audience = /^\/api\/(?:v1\/)?admin(?:\/|$)/.test(req.path) ? 'admin' : 'user';
  const token = readAuthToken(req, audience);
  if (!token) return next();
  // An invalid/expired credential cannot authenticate; do not block a fresh login or cookie cleanup.
  try { verifyAccessToken(token, audience); } catch { return next(); }
  const expected = createCsrfToken(token, audience);
  const supplied = req.headers['x-csrf-token'];
  if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ message: 'Mã CSRF không hợp lệ.', code: 'CSRF_INVALID' });
  }
  next();
}
