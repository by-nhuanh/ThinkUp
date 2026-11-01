import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, createPublicKey } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getMongoDb, getJwtSecret, signJwt, verifyJwt, sendEmail } from '../db.js';
import { renderSignupVerificationEmail, renderResendVerificationEmail } from '../email/email-templates.js';
import { issueUserSession } from '../account-security/account-security.user.js';

const VERIFICATION_TOKEN_EXPIRE = '12h'; // BR-AUTH-06: thời hạn tối đa 12 giờ

export function authError(message, status = 400, code = 'INVALID_INPUT', field) {
  return Object.assign(new Error(message), { status, code, ...(field ? { field } : {}) });
}

export function credentialVersion(user) {
  return createHmac('sha256', getJwtSecret())
    .update(`credential:${user._id}:${user.password_hash || ''}`).digest('hex');
}

export function authDigest(value) {
  return createHmac('sha256', getJwtSecret()).update(value).digest('hex');
}

// Reuse the existing otps collection; deterministic IDs make increments atomic across server instances.
export async function limitAuthRequests(db, purpose, key, limit, windowMs = 3600000) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const _id = `rate:${authDigest(`${purpose}:${key}:${bucket}`)}`;
  const update = { $inc: { attempts: 1 }, $setOnInsert: {
    purpose: 'auth_rate_limit', created_at: new Date(now),
    expires_at: new Date((bucket + 1) * windowMs), used: false,
  } };
  let record;
  try {
    record = await db.collection('otps').findOneAndUpdate({ _id }, update, { upsert: true, returnDocument: 'after' });
  } catch (error) {
    if (error.code !== 11000) throw error;
    record = await db.collection('otps').findOneAndUpdate({ _id }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
  }
  if (!record || record.attempts > limit) {
    throw Object.assign(authError('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429, 'RATE_LIMITED'),
      { retryAfter: Math.ceil(((bucket + 1) * windowMs - now) / 1000) });
  }
}

export async function deliverAuthEmail(message, options = {}) {
  if (options.skipEmail) return;
  try {
    const result = await (options.sendEmail || sendEmail)(message);
    if (result?.sent === false || !result?.accepted?.length) throw new Error('Email delivery unavailable');
  } catch {
    throw authError('Chưa gửi được email. Vui lòng thử lại sau.', 503, 'EMAIL_DELIVERY_FAILED');
  }
}

let googleKeys;
let googleKeysExpireAt = 0;
async function providerJson(url, init, options) {
  let response;
  try { response = await (options.fetch || fetch)(url, { ...init, signal: AbortSignal.timeout(8000) }); }
  catch { throw authError('Dịch vụ xác thực tạm thời không khả dụng.', 503, 'OAUTH_UNAVAILABLE'); }
  if (!response.ok) {
    throw authError('Không xác minh được tài khoản mạng xã hội.', response.status >= 500 ? 503 : 401,
      response.status >= 500 ? 'OAUTH_UNAVAILABLE' : 'OAUTH_TOKEN_INVALID');
  }
  try { return await response.json(); }
  catch { throw authError('Phản hồi xác thực không hợp lệ.', 503, 'OAUTH_UNAVAILABLE'); }
}

export async function verifyGoogleIdentity(params = {}, options = {}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw authError('Google chưa được cấu hình.', 503, 'OAUTH_NOT_CONFIGURED');
  const token = params.idToken || params.credential;
  if (typeof token !== 'string' || !token || token.length > 16384) {
    throw authError('Vui lòng cung cấp Google ID token.', 400, 'OAUTH_TOKEN_REQUIRED');
  }
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || decoded.header.alg !== 'RS256' || typeof decoded.header.kid !== 'string') {
    throw authError('Google ID token không hợp lệ.', 401, 'OAUTH_TOKEN_INVALID');
  }
  let keys = !options.fetch && Date.now() < googleKeysExpireAt ? googleKeys : null;
  if (!keys) {
    const result = await providerJson('https://www.googleapis.com/oauth2/v3/certs', {}, options);
    if (!Array.isArray(result.keys)) throw authError('Không tải được khóa Google.', 503, 'OAUTH_UNAVAILABLE');
    keys = result.keys;
    if (!options.fetch) { googleKeys = keys; googleKeysExpireAt = Date.now() + 300000; }
  }
  let payload;
  try {
    const key = keys.find(key => key.kid === decoded.header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig'));
    if (!key) throw new Error('Unknown key');
    payload = jwt.verify(token, createPublicKey({ key, format: 'jwk' }), {
      algorithms: ['RS256'], audience: clientId, issuer: ['accounts.google.com', 'https://accounts.google.com'],
    });
    if (!Number.isFinite(payload.exp) || typeof payload.sub !== 'string' || !payload.sub ||
        payload.email_verified !== true || (payload.azp && payload.azp !== clientId) || !validateEmail(payload.email).valid) {
      throw new Error('Invalid identity');
    }
  } catch { throw authError('Google ID token không hợp lệ hoặc đã hết hạn.', 401, 'OAUTH_TOKEN_INVALID'); }
  return { providerId: payload.sub, email: payload.email.trim().toLowerCase(), name: payload.name, avatar: payload.picture };
}

export async function verifyFacebookIdentity(params = {}, options = {}) {
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  const version = process.env.FACEBOOK_GRAPH_VERSION;
  if (!appId || !secret || !/^v\d+\.\d+$/.test(version || '')) {
    throw authError('Facebook chưa được cấu hình.', 503, 'OAUTH_NOT_CONFIGURED');
  }
  const token = params.accessToken;
  if (typeof token !== 'string' || !token || token.length > 16384) {
    throw authError('Vui lòng cung cấp Facebook access token.', 400, 'OAUTH_TOKEN_REQUIRED');
  }
  const base = `https://graph.facebook.com/${version}`;
  const debug = await providerJson(`${base}/debug_token?input_token=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${appId}|${secret}` },
  }, options);
  const data = debug.data;
  const now = Date.now() / 1000;
  if (data?.is_valid !== true || data.type !== 'USER' || String(data.app_id) !== appId || !data.user_id ||
      !Number.isFinite(data.expires_at) || data.expires_at <= now ||
      (data.data_access_expires_at && data.data_access_expires_at <= now)) {
    throw authError('Facebook access token không hợp lệ.', 401, 'OAUTH_TOKEN_INVALID');
  }
  const proof = createHmac('sha256', secret).update(token).digest('hex');
  const profile = await providerJson(`${base}/me?fields=id,name,email,picture&appsecret_proof=${proof}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, options);
  if (String(profile.id) !== String(data.user_id)) throw authError('Sai định danh Facebook.', 401, 'OAUTH_TOKEN_INVALID');
  if (!validateEmail(profile.email).valid) throw authError('Facebook chưa cung cấp email hợp lệ.', 400, 'MISSING_EMAIL');
  return { providerId: String(profile.id), email: profile.email.trim().toLowerCase(), name: profile.name, avatar: profile.picture?.data?.url };
}

// ─── Sinh mã học viên tự động (Atomic Counter) ───────────────────────────────

/**
 * Sinh mã học viên duy nhất theo chuẩn: HV + YY + 5 chữ số thứ tự.
 *
 * Ví dụ: HV2600001, HV2600002, ..., HV2699999 (năm 2026)
 *         HV2700001, HV2700002, ...           (năm 2027, reset từ 1)
 *
 * Cơ chế:
 * - Dùng collection 'counters' với _id = 'student_HV{YY}' (riêng theo năm).
 * - findOneAndUpdate + $inc là thao tác ATOMIC → không bao giờ trùng dù đăng ký đồng thời.
 * - Nếu vượt 99999 học viên/năm → vẫn hoạt động, chỉ tăng số chữ số (HV261000001...).
 *
 * @param {object} db - MongoDB db instance
 * @returns {Promise<string>} Mã học viên, ví dụ "HV2600001"
 */
async function generateStudentId(db) {
  const yy = new Date().getFullYear().toString().slice(-2); // "26"
  const counterId = `student_HV${yy}`;

  const result = await db.collection('counters').findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  const seq = result.seq ?? result.value?.seq ?? 1;
  const padded = String(seq).padStart(5, '0'); // 5 chữ số: 00001–99999
  return `HV${yy}${padded}`; // HV2600001
}


export function validateFullName(name) {
  if (!name || typeof name !== 'string') return { valid: false, message: 'Vui lòng nhập họ và tên.' };
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 50) {
    return { valid: false, message: 'Họ và tên phải từ 2 đến 50 ký tự.' };
  }
  // Chỉ cho phép chữ cái tiếng Việt/tiếng Anh và khoảng trắng. Cấm chữ số và ký tự đặc biệt (@, #, $, %...).
  const regex = /^[a-zA-ZÀ-ỹ\s]+$/;
  if (!regex.test(trimmed)) {
    return { valid: false, message: 'Tên không được chứa số hoặc ký tự đặc biệt.' };
  }
  return { valid: true, value: trimmed };
}

export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return { valid: false, message: 'Vui lòng nhập số điện thoại.' };
  const trimmed = phone.trim().replace(/\s/g, '');
  if (!/^[0-9]{10}$/.test(trimmed)) {
    return { valid: false, message: 'Số điện thoại không hợp lệ (phải gồm 10 số).' };
  }
  // Bắt đầu bằng đầu số di động hợp lệ tại Việt Nam (03, 05, 07, 08, 09)
  if (!/^(03|05|07|08|09)/.test(trimmed)) {
    return { valid: false, message: 'Đầu số di động không hợp lệ (phải bắt đầu bằng 03, 05, 07, 08, 09).' };
  }
  return { valid: true, value: trimmed };
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return { valid: false, message: 'Vui lòng nhập địa chỉ email.' };
  const trimmed = email.trim();
  if (/\s/.test(trimmed)) return { valid: false, message: 'Email không được chứa khoảng trắng.' };
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(trimmed)) {
    return { valid: false, message: 'Email không đúng định dạng (vd: example@gmail.com).' };
  }
  return { valid: true, value: trimmed.toLowerCase() };
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return { valid: false, message: 'Vui lòng nhập mật khẩu.' };
  const trimmed = password.trim();
  if (trimmed !== password) return { valid: false, message: 'Mật khẩu không được có khoảng trắng ở đầu hoặc cuối.' };
  if (trimmed.length < 8 || trimmed.length > 64 || Buffer.byteLength(trimmed, 'utf8') > 72) {
    return { valid: false, message: 'Độ dài mật khẩu phải từ 8 đến 64 ký tự.' };
  }
  if (!/[A-Z]/.test(trimmed)) return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ hoa (A-Z).' };
  if (!/[a-z]/.test(trimmed)) return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ thường (a-z).' };
  if (!/[0-9]/.test(trimmed)) return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ số (0-9).' };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$%...).' };
  }
  return { valid: true, value: trimmed };
}

// ─── Xử lý Đăng Ký Tài Khoản Học Viên (Luồng Chính) ───────────────────────────

/**
 * Đăng ký tài khoản học viên qua form 5 trường thông tin + Điều khoản.
 */
export async function registerUser(
  { fullName, phone, email, password, confirmPassword, termsAccepted } = {},
  options = {}
) {
  const db = options.db || await getMongoDb();

  // 1. Checkbox Điều khoản (BR-REG-07)
  if (termsAccepted !== true) {
    const err = new Error('Bạn cần đồng ý với Điều khoản và Chính sách để tiếp tục.');
    err.status = 400;
    err.field = 'terms';
    throw err;
  }

  // 2. Họ và tên (BR-REG-02)
  const nameCheck = validateFullName(fullName);
  if (!nameCheck.valid) {
    const err = new Error(nameCheck.message);
    err.status = 400;
    err.field = 'fullName';
    throw err;
  }

  // 3. Số điện thoại (BR-REG-03)
  const phoneCheck = validatePhone(phone);
  if (!phoneCheck.valid) {
    const err = new Error(phoneCheck.message);
    err.status = 400;
    err.field = 'phone';
    throw err;
  }

  // 4. Email (BR-REG-04)
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    const err = new Error(emailCheck.message);
    err.status = 400;
    err.field = 'email';
    throw err;
  }

  // 5. Mật khẩu (BR-REG-05)
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    const err = new Error(pwCheck.message);
    err.status = 400;
    err.field = 'password';
    throw err;
  }

  // 6. So khớp chéo Xác nhận mật khẩu (BR-REG-06)
  if (typeof confirmPassword !== 'string' || confirmPassword !== pwCheck.value) {
    const err = new Error('Mật khẩu xác nhận không khớp.');
    err.status = 400;
    err.field = 'confirmPassword';
    throw err;
  }

  await limitAuthRequests(db, 'register-email', emailCheck.value, 5);
  if (options.ip) await limitAuthRequests(db, 'register-ip', options.ip, 20);

  // 7. Kiểm tra trùng lặp Email (EX-REG-01, HTTP 409)
  const existingEmail = await db.collection('users').findOne({ email: emailCheck.value });
  if (existingEmail) {
    const err = new Error('Email này đã được sử dụng. Vui lòng đăng nhập hoặc sử dụng email khác để đăng ký!');
    err.status = 409;
    err.code = 'EMAIL_EXISTS';
    err.field = 'email';
    throw err;
  }

  // 8. Kiểm tra trùng lặp Số điện thoại (EX-REG-01, HTTP 409)
  const existingPhone = await db.collection('users').findOne({ phone: phoneCheck.value });
  if (existingPhone) {
    const err = new Error('Số điện thoại này đã được đăng ký!');
    err.status = 409;
    err.code = 'PHONE_EXISTS';
    err.field = 'phone';
    throw err;
  }

  // 9. Băm mật khẩu (bcrypt) và tạo bản ghi Học viên (Vai trò STUDENT, onboarding_completed = false)
  const passwordHash = await bcrypt.hash(pwCheck.value, 12);
  const studentId = await generateStudentId(db); // BR-REG-09: Sinh mã học viên HVyyXXXXX
  const initialChar = encodeURIComponent((nameCheck.value || emailCheck.value || 'U').trim().charAt(0).toUpperCase());
  const defaultGoogleStyleAvatar = `https://ui-avatars.com/api/?name=${initialChar}&background=0D8ABC&color=fff&size=200&bold=true`;

  const newUser = {
    student_id: studentId,              // BR-REG-09: Mã học viên duy nhất (HV2600001...)
    full_name: nameCheck.value,
    phone: phoneCheck.value,
    email: emailCheck.value,
    password_hash: passwordHash,
    provider: 'local',
    provider_id: null,
    avatar_url: defaultGoogleStyleAvatar,
    is_custom_avatar: false,
    role: 'student',                    // Vai trò STUDENT
    status: 'pending',                  // Chờ kích hoạt
    is_active: false,
    email_verified: false,
    email_verified_at: null,
    onboarding_completed: false,        // BR-REG-08: onboarding_completed = false
    failed_login_attempts: 0,
    locked_until: null,
    last_verification_sent_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  let insertResult;
  try { insertResult = await db.collection('users').insertOne(newUser); }
  catch (error) {
    if (error.code !== 11000) throw error;
    throw authError('Email hoặc số điện thoại đã được đăng ký.', 409, 'ACCOUNT_EXISTS');
  }
  const userId = insertResult.insertedId.toString();

  // 10. Tạo Verification Token hiệu lực 12 giờ (BR-AUTH-06)
  const verificationToken = signJwt(
    { sub: userId, email: emailCheck.value, purpose: 'verify_email', sentAt: newUser.last_verification_sent_at.getTime() },
    VERIFICATION_TOKEN_EXPIRE
  );

  const clientUrl = process.env.CLIENT_URL || 'https://think-up-edu.vercel.app';
  const apiBase = process.env.API_URL || process.env.SERVER_URL;
  const verificationLink = apiBase
    ? `${apiBase}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`
    : `${clientUrl}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`;

  // 11. Gửi email kích hoạt
  if (!options.skipEmail) {
    await deliverAuthEmail({
      to: emailCheck.value,
      subject: '[ThinkUp] Xác thực tài khoản học viên của bạn',
      html: renderSignupVerificationEmail({
        name: nameCheck.value,
        verificationLink,
        expireHours: 12,
        clientUrl,
      }),
      text: `Xin chào ${nameCheck.value}! Vui lòng truy cập đường link sau để kích hoạt tài khoản ThinkUp: ${verificationLink}`,
    }, options);
  }

  return {
    message: 'Vui lòng bấm vào link xác thực được gửi qua email để kích hoạt tài khoản',
    email: emailCheck.value,
    studentId,
  };
}

/**
 * Xác nhận liên kết xác thực (Verification Link) để kích hoạt tài khoản.
 */
export async function verifyEmailVerificationToken({ token } = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const payload = verifyJwt(token);

  if (payload.purpose !== 'verify_email' || !Number.isSafeInteger(payload.sentAt) || !ObjectId.isValid(payload.sub)) {
    const err = new Error('Mã liên kết xác thực không hợp lệ.');
    err.status = 400;
    throw err;
  }

  const user = await db.collection('users').findOne({ _id: new ObjectId(payload.sub), email: payload.email });
  if (!user) {
    const err = new Error('Tài khoản không tồn tại.');
    err.status = 404;
    throw err;
  }

  if (user.status !== 'pending' || user.email_verified ||
      new Date(user.last_verification_sent_at).getTime() !== payload.sentAt) {
    throw authError('Liên kết đã dùng, bị thay thế hoặc tài khoản không được phép kích hoạt.', 400, 'VERIFICATION_INVALID');
  }
  const activated = await db.collection('users').findOneAndUpdate(
    { _id: user._id, status: 'pending', email_verified: false, last_verification_sent_at: new Date(payload.sentAt) },
    {
      $set: {
        status: 'active',
        is_active: true,
        email_verified: true,
        email_verified_at: new Date(),
        updated_at: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  if (!activated) throw authError('Liên kết không còn hiệu lực.', 400, 'VERIFICATION_INVALID');

  return {
    message: 'Kích hoạt tài khoản thành công! Vui lòng đăng nhập để bắt đầu học tập.',
    email: user.email,
  };
}

/**
 * Gửi lại liên kết xác thực tài khoản (Verification Link 12 giờ) khi link cũ hết hạn hoặc thất lạc.
 * Có cơ chế Cooldown 60 giây chống spam.
 */
export async function resendVerificationLink({ email } = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    const err = new Error(emailCheck.message);
    err.status = 400;
    throw err;
  }

  const user = await db.collection('users').findOne({ email: emailCheck.value });
  if (!user) {
    const err = new Error('Email chưa được đăng ký trong hệ thống.');
    err.status = 404;
    throw err;
  }

  if (user.status !== 'pending' || user.email_verified === true) {
    const err = new Error('Tài khoản này đã được kích hoạt trước đó. Vui lòng đăng nhập.');
    err.status = 400;
    throw err;
  }

  await limitAuthRequests(db, 'verification-email', emailCheck.value, 5);
  if (options.ip) await limitAuthRequests(db, 'verification-ip', options.ip, 20);
  // Cooldown chống spam 60 giây
  const COOLDOWN_MS = 60 * 1000;
  if (user.last_verification_sent_at) {
    const timePassed = Date.now() - new Date(user.last_verification_sent_at).getTime();
    if (timePassed < COOLDOWN_MS) {
      const secondsLeft = Math.ceil((COOLDOWN_MS - timePassed) / 1000);
      const err = new Error(`Vui lòng chờ ${secondsLeft > 0 ? secondsLeft : 1} giây trước khi yêu cầu gửi lại email kích hoạt.`);
      err.status = 429;
      throw err;
    }
  }

  const sentAt = new Date(Math.max(Date.now(), new Date(user.last_verification_sent_at || 0).getTime() + 1));
  const reserved = await db.collection('users').findOneAndUpdate(
    { _id: user._id, status: 'pending', email_verified: false,
      last_verification_sent_at: user.last_verification_sent_at || { $exists: false } },
    { $set: { last_verification_sent_at: sentAt, updated_at: sentAt } }, { returnDocument: 'after' }
  );
  if (!reserved) throw authError('Yêu cầu khác đã được xử lý. Vui lòng thử lại sau.', 429, 'RATE_LIMITED');
  // Cấp verificationToken mới hiệu lực 12 giờ
  const verificationToken = signJwt(
    { sub: user._id.toString(), email: user.email, purpose: 'verify_email', sentAt: sentAt.getTime() },
    VERIFICATION_TOKEN_EXPIRE
  );
  const clientUrl = process.env.CLIENT_URL || 'https://think-up-edu.vercel.app';
  const apiBase = process.env.API_URL || process.env.SERVER_URL;
  const verificationLink = apiBase
    ? `${apiBase}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`
    : `${clientUrl}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`;

  if (!options.skipEmail) {
    await deliverAuthEmail({
      to: user.email,
      subject: '[ThinkUp] Gửi lại liên kết kích hoạt tài khoản',
      html: renderResendVerificationEmail({
        name: user.full_name,
        verificationLink,
        expireHours: 12,
        clientUrl,
      }),
      text: `Xin chào ${user.full_name}! Truy cập liên kết sau để kích hoạt tài khoản ThinkUp: ${verificationLink}`,
    }, options);
  }

  return {
    message: 'Liên kết kích hoạt mới đã được gửi về email của bạn. Vui lòng kiểm tra hộp thư (hiệu lực 12 giờ).',
    email: user.email,
  };
}

// ─── Đăng ký nhanh qua Mạng xã hội (Google / Facebook OAuth) ───────────────────

/**
 * Đăng ký nhanh Google - Just-In-Time Provisioning (vai trò STUDENT, email_verified = true, onboarding_completed = false)
 */
export async function registerWithGoogle(params = {}, options = {}) {
  return authenticateSocialUser('google', params, options);
}

export async function registerWithFacebook(params = {}, options = {}) {
  return authenticateSocialUser('facebook', params, options);
}

export async function authenticateSocialUser(provider, params, options = {}) {
  if (params.rememberMe !== undefined && typeof params.rememberMe !== 'boolean') {
    throw authError('Lựa chọn ghi nhớ đăng nhập không hợp lệ.');
  }
  // Validate provider proof before any identity lookup. Request profile fields are never trusted.
  const identity = provider === 'google'
    ? await verifyGoogleIdentity(params, options) : await verifyFacebookIdentity(params, options);
  const db = options.db || await getMongoDb();
  if (options.ip) await limitAuthRequests(db, 'social-ip', options.ip, 30);
  const field = provider === 'google' ? 'google_id' : 'facebook_id';
  let user = await db.collection('users').findOne({ $or: [
    { [field]: identity.providerId }, { provider, provider_id: identity.providerId },
  ] });
  if (!user) {
    const existing = await db.collection('users').findOne({ email: identity.email });
    if (existing) throw authError('Email đã có tài khoản. Vui lòng dùng phương thức đăng nhập hiện có.', 409, 'ACCOUNT_LINK_REQUIRED');
    const now = new Date();
    const initial = encodeURIComponent((identity.name || identity.email).charAt(0));
    const newUser = {
      student_id: await generateStudentId(db), full_name: identity.name || 'Học viên',
      email: identity.email, password_hash: null, provider, provider_id: identity.providerId,
      [field]: identity.providerId,
      avatar_url: identity.avatar || `https://ui-avatars.com/api/?name=${initial}`,
      is_custom_avatar: false, role: 'student', status: 'active', is_active: true,
      email_verified: true, email_verified_at: now, onboarding_completed: false,
      failed_login_attempts: 0, locked_until: null, created_at: now, updated_at: now,
    };
    try {
      const inserted = await db.collection('users').insertOne(newUser);
      user = { ...newUser, _id: inserted.insertedId };
    } catch (error) {
      if (error.code !== 11000) throw error;
      throw authError('Tài khoản đã tồn tại. Vui lòng đăng nhập lại.', 409, 'ACCOUNT_EXISTS');
    }
  } else {
    if (user.status !== 'active' || user.is_active === false || !user.email_verified || user.role !== 'student') {
      throw authError('Tài khoản không được phép đăng nhập.', 403, 'ACCOUNT_SUSPENDED');
    }
    const avatar = user.is_custom_avatar ? user.avatar_url : identity.avatar || user.avatar_url;
    const updated = await db.collection('users').findOneAndUpdate(
      { _id: user._id, status: 'active', is_active: { $ne: false }, role: 'student', email_verified: true },
      { $set: { [field]: identity.providerId, avatar_url: avatar, last_login_at: new Date(), updated_at: new Date() } },
      { returnDocument: 'after' }
    );
    if (!updated) throw authError('Tài khoản không được phép đăng nhập.', 403, 'ACCOUNT_SUSPENDED');
    user = updated;
  }
  const { accessToken, refreshToken } = await issueUserSession(user,
    { ip: options.ip, userAgent: options.userAgent, rememberMe: params.rememberMe }, { ...options, db });
  return {
    message: 'Xác thực tài khoản thành công!', accessToken, refreshToken, token: accessToken,
    user: { id: user._id.toString(), studentId: user.student_id || null, name: user.full_name,
      email: user.email, phone: user.phone || null, role: user.role, avatar: user.avatar_url,
      onboarding_completed: Boolean(user.onboarding_completed), email_verified: Boolean(user.email_verified) },
  };
}
