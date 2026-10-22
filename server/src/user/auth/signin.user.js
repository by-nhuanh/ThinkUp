import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getMongoDb, signJwt, verifyJwt } from '../db.js';

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
export async function loginWithCredentials({ email, password, rememberMe = false }, options = {}) {
  const db = options.db || await getMongoDb();

  const normalizedEmail = (email || '').trim().toLowerCase();
  const trimmedPassword = (password || '').trim();

  // BR-AUTH-01: Yêu cầu điều kiện cần cơ bản
  if (!normalizedEmail || !trimmedPassword) {
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
  const isPasswordMatch = user && user.password_hash ? await bcrypt.compare(trimmedPassword, user.password_hash) : false;

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

  // BR-AUTH-04: Thời hạn phiên đăng nhập theo Remember Me (24h vs 30 ngày)
  const tokenDuration = rememberMe ? '30d' : '24h';
  const accessToken = signJwt(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.full_name,
    },
    tokenDuration
  );

  const refreshToken = signJwt(
    { sub: user._id.toString(), type: 'refresh' },
    rememberMe ? '30d' : '7d'
  );

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
export async function loginWithGoogle({ email, name, avatar, providerId }, options = {}) {
  const db = options.db || await getMongoDb();

  if (!email?.trim() || !providerId) {
    const err = new Error('Thông tin xác thực Google không đầy đủ.');
    err.status = 400;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();
  let user = await db.collection('users').findOne({
    $or: [{ provider: 'google', provider_id: providerId }, { email: normalizedEmail }],
  });

  if (user) {
    // BR-AUTH-08: Kiểm tra nếu bị admin khóa
    if (user.status === 'locked' || (user.is_active === false && user.email_verified === true)) {
      const err = new Error('Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ support@thinkup.vn để được hỗ trợ');
      err.status = 403;
      throw err;
    }

    // BR-AUTH-07: Đồng bộ định danh (Identity Linking) - gộp tài khoản gốc
    // Nếu người dùng đã tự upload ảnh đại diện (is_custom_avatar = true), giữ nguyên avatar đó.
    // Nếu chưa từng upload ảnh đại diện riêng, cập nhật avatar từ Google OAuth.
    const resolvedAvatar = user.is_custom_avatar ? user.avatar_url : (avatar || user.avatar_url);

    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          google_id: providerId,
          avatar_url: resolvedAvatar,
          email_verified: true,
          status: 'active',
          is_active: true,
          last_login_at: new Date(),
          updated_at: new Date(),
        },
      }
    );
  } else {
    // BR-AUTH-06: Tự động cấp tài khoản học viên mới (Just-In-Time Provisioning)
    const initialChar = encodeURIComponent((name || email || 'G').trim().charAt(0).toUpperCase());
    const defaultGoogleAvatar = avatar || `https://ui-avatars.com/api/?name=${initialChar}&background=EA4335&color=fff&size=200&bold=true`;

    const newUser = {
      full_name: name || 'Học viên Google',
      phone: null,
      email: normalizedEmail,
      password_hash: null,
      provider: 'google',
      provider_id: providerId,
      google_id: providerId,
      avatar_url: defaultGoogleAvatar,
      is_custom_avatar: false,
      role: 'student',
      status: 'active',
      is_active: true,
      email_verified: true,
      email_verified_at: new Date(),
      onboarding_completed: false,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const insertResult = await db.collection('users').insertOne(newUser);
    user = { ...newUser, _id: insertResult.insertedId };
  }

  const accessToken = signJwt(
    { sub: user._id.toString(), email: user.email, role: user.role, name: user.full_name },
    '24h'
  );

  return {
    message: 'Đăng nhập Google thành công!',
    accessToken,
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
      email_verified: true,
    },
  };
}

/**
 * Đăng nhập qua Facebook (BR-AUTH-06, BR-AUTH-07, EX-AUTH-04).
 */
export async function loginWithFacebook({ providerId, email, name, avatar }, options = {}) {
  const db = options.db || await getMongoDb();

  if (!providerId) {
    const err = new Error('Thiếu ID định danh Facebook.');
    err.status = 400;
    throw err;
  }

  // EX-AUTH-04: Facebook không trả email
  if (!email?.trim()) {
    const err = new Error('Vui lòng nhập Email của bạn để hoàn tất đăng ký tài khoản ThinkUp');
    err.status = 400;
    err.code = 'MISSING_EMAIL';
    err.providerId = providerId;
    throw err;
  }

  const normalizedEmail = email.trim().toLowerCase();
  let user = await db.collection('users').findOne({
    $or: [{ provider: 'facebook', provider_id: providerId }, { email: normalizedEmail }],
  });

  if (user) {
    if (user.status === 'locked' || (user.is_active === false && user.email_verified === true)) {
      const err = new Error('Tài khoản của bạn đang bị tạm khóa. Vui lòng liên hệ support@thinkup.vn để được hỗ trợ');
      err.status = 403;
      throw err;
    }

    // BR-AUTH-07: Identity Linking
    const resolvedAvatar = user.is_custom_avatar ? user.avatar_url : (avatar || user.avatar_url);

    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          facebook_id: providerId,
          avatar_url: resolvedAvatar,
          email_verified: true,
          status: 'active',
          is_active: true,
          last_login_at: new Date(),
          updated_at: new Date(),
        },
      }
    );
  } else {
    const initialChar = encodeURIComponent((name || email || 'F').trim().charAt(0).toUpperCase());
    const defaultFbAvatar = avatar || `https://ui-avatars.com/api/?name=${initialChar}&background=1877F2&color=fff&size=200&bold=true`;

    const newUser = {
      full_name: name || 'Học viên Facebook',
      phone: null,
      email: normalizedEmail,
      password_hash: null,
      provider: 'facebook',
      provider_id: providerId,
      facebook_id: providerId,
      avatar_url: defaultFbAvatar,
      is_custom_avatar: false,
      role: 'student',
      status: 'active',
      is_active: true,
      email_verified: true,
      email_verified_at: new Date(),
      onboarding_completed: false,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const insertResult = await db.collection('users').insertOne(newUser);
    user = { ...newUser, _id: insertResult.insertedId };
  }

  const accessToken = signJwt(
    { sub: user._id.toString(), email: user.email, role: user.role, name: user.full_name },
    '24h'
  );

  return {
    message: 'Đăng nhập Facebook thành công!',
    accessToken,
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
      email_verified: true,
    },
  };
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
  if (!user || user.status === 'locked' || (user.is_active === false && user.email_verified === true)) {
    return { isAuthenticated: false, user: null, reason: 'ACCOUNT_SUSPENDED' };
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

