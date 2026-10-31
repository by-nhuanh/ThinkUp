import bcrypt from 'bcryptjs';
import { authenticateSocialUser, credentialVersion, authError } from './signup.user.js';
import { ObjectId } from 'mongodb';
import { getMongoDb, verifyJwt } from '../db.js';
import { issueUserSession, validateUserSession } from '../account-security/account-security.user.js';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 phút (BR-AUTH-03)

/**
 * Đăng nhập Học viên bằng Email & Mật khẩu (SPEC-AUTH-STU-01).
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {boolean} [params.rememberMe]
 * @param {object} [options]
 */
export async function loginWithCredentials({ email, password, rememberMe = false } = {}, options = {}) {
  if (typeof email !== 'string' || typeof password !== 'string' || typeof rememberMe !== 'boolean') {
    throw authError('Email, mật khẩu hoặc lựa chọn ghi nhớ không hợp lệ.');
  }
  const db = options.db || await getMongoDb();

  const normalizedEmail = (email || '').trim().toLowerCase();
  const suppliedPassword = password;

  // BR-AUTH-01: Yêu cầu điều kiện cần cơ bản
  if (!normalizedEmail || !suppliedPassword) {
    const err = new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
    err.status = 400;
    throw err;
  }

  const user = await db.collection('users').findOne({ email: normalizedEmail });

  // BR-AUTH-08: Tài khoản bị khóa chính sách (is_active = false hoặc status = 'locked')
  if (user && (user.status === 'locked' || (user.is_active === false && user.email_verified === true))) {
    const err = new Error('Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ support@thinkup.vn để được hỗ trợ');
    err.status = 403;
    err.code = 'ACCOUNT_SUSPENDED';
    throw err;
  }

  // BR-AUTH-03: Kiểm tra tài khoản bị tạm khóa do nhập sai 5 lần (Brute-force)
  if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    const err = new Error(`Bạn đã nhập sai 5 lần. Vui lòng thử lại sau 15 phút hoặc sử dụng Quên mật khẩu!`);
    err.status = 403;
    err.code = 'BRUTE_FORCE_LOCKED';
    err.lockedUntil = user.locked_until;
    err.minutesLeft = minutesLeft;
    throw err;
  }

  // Kiểm tra mật khẩu (nếu user không tồn tại hoặc không phải tài khoản mật khẩu local)
  const isPasswordMatch = user && user.password_hash ? await bcrypt.compare(suppliedPassword, user.password_hash) : false;

  if (!user || !isPasswordMatch) {
    if (user) {
      const failedCount = (user.failed_login_attempts || 0) + 1;
      if (failedCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { failed_login_attempts: failedCount, locked_until: lockedUntil } }
        );
        const err = new Error('Bạn đã nhập sai 5 lần. Vui lòng thử lại sau 15 phút hoặc sử dụng Quên mật khẩu!');
        err.status = 403;
        err.code = 'BRUTE_FORCE_LOCKED';
        err.lockedUntil = lockedUntil;
        throw err;
      } else {
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { failed_login_attempts: failedCount } }
        );
      }
    }

    // BR-AUTH-02: Thông báo lỗi an toàn trung tính duy nhất, không phân biệt email hay mật khẩu sai
    const err = new Error('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  // Kiểm tra tài khoản chưa kích hoạt email
  if (user.status === 'pending' || !user.email_verified) {
    const err = new Error('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để kích hoạt tài khoản.');
    err.status = 403;
    err.code = 'ACCOUNT_PENDING';
    err.email = user.email;
    throw err;
  }

  // Đăng nhập thành công -> Reset số lần sai và cập nhật last_login_at
  await db.collection('users').updateOne(
    { _id: user._id },
    {
      $set: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date(),
        updated_at: new Date(),
      },
    }
  );

  const { accessToken, refreshToken } = await issueUserSession(user,
    { rememberMe, ip: options.ip, userAgent: options.userAgent }, { ...options, db });

  return {
    message: 'Đăng nhập thành công!',
    accessToken,
    refreshToken,
    token: accessToken,
    user: {
      id: user._id.toString(),
      studentId: user.student_id || null,
      name: user.full_name,
      email: user.email,
      phone: user.phone || null,
      role: user.role,
      avatar: user.avatar_url,
      onboarding_completed: Boolean(user.onboarding_completed),
      email_verified: Boolean(user.email_verified),
    },
  };
}

/**
 * Đăng nhập qua Google (BR-AUTH-06, BR-AUTH-07: Identity Linking & Just-In-Time Provisioning).
 */
export async function loginWithGoogle(params = {}, options = {}) {
  return authenticateSocialUser('google', params, options);
}

export async function loginWithFacebook(params = {}, options = {}) {
  return authenticateSocialUser('facebook', params, options);
}

/**
 * Lấy thông tin tài khoản hiện tại (Current User Profile).
 */
export async function getCurrentUser(userId, options = {}) {
  const db = options.db || await getMongoDb();

  if (!userId) {
    const err = new Error('Không có thông tin đăng nhập.');
    err.status = 401;
    throw err;
  }

  let objId;
  try {
    objId = new ObjectId(userId);
  } catch {
    const err = new Error('ID người dùng không hợp lệ.');
    err.status = 400;
    throw err;
  }

  const user = await db.collection('users').findOne({ _id: objId });
  if (!user) {
    const err = new Error('Không tìm thấy tài khoản.');
    err.status = 404;
    throw err;
  }

  return {
    user: {
      id: user._id.toString(),
      studentId: user.student_id || null,
      name: user.full_name,
      email: user.email,
      phone: user.phone || null,
      role: user.role,
      avatar: user.avatar_url,
      onboarding_completed: Boolean(user.onboarding_completed),
      email_verified: Boolean(user.email_verified),
      status: user.status,
    },
  };
}

/**
 * Xác nhận trạng thái đăng nhập của người dùng qua Token (Session Check).
 * Phục vụ trực tiếp cho Header / Navbar / Route Guard để:
 * - Ẩn nút "Đăng nhập / Đăng ký" và hiển thị Tên, Avatar, Dropdown menu khi đã đăng nhập.
 * - Hiển thị lại nút "Đăng nhập / Đăng ký" khi chưa đăng nhập hoặc phiên đã hết hạn.
 * 
 * @param {string} token - Chuỗi Bearer Access Token lấy từ localStorage hoặc Header
 * @param {object} [options]
 * @returns {Promise<{ isAuthenticated: boolean, user: object | null, reason?: string }>}
 */
export async function verifyAuthSession(token, options = {}) {
  if (!token || typeof token !== 'string') {
    return { isAuthenticated: false, user: null, reason: 'TOKEN_MISSING' };
  }

  // Loại bỏ tiền tố 'Bearer ' nếu có
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();

  let payload;
  try {
    payload = verifyJwt(cleanToken);
    if (payload.type || payload.purpose || payload.adminId || payload.step || payload.authStep) throw new Error('Invalid access token');
  } catch (err) {
    return { isAuthenticated: false, user: null, reason: err.code || 'TOKEN_INVALID' };
  }

  const db = options.db || await getMongoDb();
  let objId;
  try {
    objId = new ObjectId(payload.sub);
  } catch {
    return { isAuthenticated: false, user: null, reason: 'USER_ID_INVALID' };
  }

  const user = await db.collection('users').findOne({ _id: objId });

  // Kiểm tra tài khoản không tồn tại hoặc bị khóa chính sách
  if (!user || user.status !== 'active' || user.is_active === false || !user.email_verified || user.role !== 'student') {
    return { isAuthenticated: false, user: null, reason: 'ACCOUNT_SUSPENDED' };
  }

  if (!payload.credentialVersion || payload.credentialVersion !== credentialVersion(user)) {
    return { isAuthenticated: false, user: null, reason: 'SESSION_REVOKED' };
  }

  if (!payload.sid) return { isAuthenticated: false, user: null, reason: 'SESSION_UPGRADE_REQUIRED' };
  if (!await validateUserSession(payload, { ...options, db })) {
    return { isAuthenticated: false, user: null, reason: 'SESSION_REVOKED' };
  }

  return {
    isAuthenticated: true,
    user: {
      id: user._id.toString(),
      studentId: user.student_id || null,
      name: user.full_name,
      email: user.email,
      phone: user.phone || null,
      role: user.role,
      avatar: user.avatar_url,
      onboarding_completed: Boolean(user.onboarding_completed),
      email_verified: Boolean(user.email_verified),
    },
  };
}

