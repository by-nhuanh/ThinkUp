import bcrypt from 'bcryptjs';
import { getMongoDb, signJwt, verifyJwt, sendEmail } from '../db.js';
import { renderSignupVerificationEmail, renderResendVerificationEmail } from '../email/email-templates.js';

const VERIFICATION_TOKEN_EXPIRE = '12h'; // BR-AUTH-06: thời hạn tối đa 12 giờ

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
  if (trimmed.length < 8 || trimmed.length > 64) {
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
  { fullName, phone, email, password, confirmPassword, termsAccepted = true },
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
  if (confirmPassword !== undefined && confirmPassword.trim() !== pwCheck.value) {
    const err = new Error('Mật khẩu xác nhận không khớp.');
    err.status = 400;
    err.field = 'confirmPassword';
    throw err;
  }

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

  const insertResult = await db.collection('users').insertOne(newUser);
  const userId = insertResult.insertedId.toString();

  // 10. Tạo Verification Token hiệu lực 12 giờ (BR-AUTH-06)
  const verificationToken = signJwt(
    { sub: userId, email: emailCheck.value, purpose: 'verify_email' },
    VERIFICATION_TOKEN_EXPIRE
  );

  const clientUrl = process.env.CLIENT_URL || 'https://think-up-edu.vercel.app';
  const apiBase = process.env.API_URL || process.env.SERVER_URL;
  const verificationLink = apiBase
    ? `${apiBase}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`
    : `${clientUrl}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`;

  // 11. Gửi email kích hoạt
  if (!options.skipEmail) {
    await sendEmail({
      to: emailCheck.value,
      subject: '[ThinkUp] Xác thực tài khoản học viên của bạn',
      html: renderSignupVerificationEmail({
        name: nameCheck.value,
        verificationLink,
        expireHours: 12,
        clientUrl,
      }),
      text: `Xin chào ${nameCheck.value}! Vui lòng truy cập đường link sau để kích hoạt tài khoản ThinkUp: ${verificationLink}`,
    }).catch((e) => console.error('[SMTP Send Error]:', e.message));
  }

  return {
    message: 'Vui lòng bấm vào link xác thực được gửi qua email để kích hoạt tài khoản',
    email: emailCheck.value,
    studentId,
    verificationToken,
    verificationLink,
  };
}

/**
 * Xác nhận liên kết xác thực (Verification Link) để kích hoạt tài khoản.
 */
export async function verifyEmailVerificationToken({ token }, options = {}) {
  const db = options.db || await getMongoDb();
  const payload = verifyJwt(token);

  if (payload.purpose !== 'verify_email') {
    const err = new Error('Mã liên kết xác thực không hợp lệ.');
    err.status = 400;
    throw err;
  }

  const user = await db.collection('users').findOne({ email: payload.email });
  if (!user) {
    const err = new Error('Tài khoản không tồn tại.');
    err.status = 404;
    throw err;
  }

  await db.collection('users').updateOne(
    { _id: user._id },
    {
      $set: {
        status: 'active',
        is_active: true,
        email_verified: true,
        email_verified_at: new Date(),
        updated_at: new Date(),
      },
    }
  );

  return {
    message: 'Kích hoạt tài khoản thành công! Vui lòng đăng nhập để bắt đầu học tập.',
    email: user.email,
  };
}

/**
 * Gửi lại liên kết xác thực tài khoản (Verification Link 12 giờ) khi link cũ hết hạn hoặc thất lạc.
 * Có cơ chế Cooldown 60 giây chống spam.
 */
export async function resendVerificationLink({ email }, options = {}) {
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

  if (user.status === 'active' || user.email_verified === true) {
    const err = new Error('Tài khoản này đã được kích hoạt trước đó. Vui lòng đăng nhập.');
    err.status = 400;
    throw err;
  }

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

  // Cấp verificationToken mới hiệu lực 12 giờ
  const verificationToken = signJwt(
    { sub: user._id.toString(), email: user.email, purpose: 'verify_email' },
    VERIFICATION_TOKEN_EXPIRE
  );
  const clientUrl = process.env.CLIENT_URL || 'https://think-up-edu.vercel.app';
  const apiBase = process.env.API_URL || process.env.SERVER_URL;
  const verificationLink = apiBase
    ? `${apiBase}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`
    : `${clientUrl}/api/auth/verify?token=${encodeURIComponent(verificationToken)}`;

  await db.collection('users').updateOne(
    { _id: user._id },
    { $set: { last_verification_sent_at: new Date(), updated_at: new Date() } }
  );

  if (!options.skipEmail) {
    await sendEmail({
      to: user.email,
      subject: '[ThinkUp] Gửi lại liên kết kích hoạt tài khoản',
      html: renderResendVerificationEmail({
        name: user.full_name,
        verificationLink,
        expireHours: 12,
        clientUrl,
      }),
      text: `Xin chào ${user.full_name}! Truy cập liên kết sau để kích hoạt tài khoản ThinkUp: ${verificationLink}`,
    }).catch((e) => console.error('[SMTP Send Error]:', e.message));
  }

  return {
    message: 'Liên kết kích hoạt mới đã được gửi về email của bạn. Vui lòng kiểm tra hộp thư (hiệu lực 12 giờ).',
    email: user.email,
    verificationToken,
    verificationLink,
  };
}

// ─── Đăng ký nhanh qua Mạng xã hội (Google / Facebook OAuth) ───────────────────

/**
 * Đăng ký nhanh Google - Just-In-Time Provisioning (vai trò STUDENT, email_verified = true, onboarding_completed = false)
 */
export async function registerWithGoogle({ email, name, avatar, providerId }, options = {}) {
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

  if (!user) {
    const studentId = await generateStudentId(db); // BR-REG-09
    const initialChar = encodeURIComponent((name || email || 'G').trim().charAt(0).toUpperCase());
    const defaultGoogleAvatar = avatar || `https://ui-avatars.com/api/?name=${initialChar}&background=EA4335&color=fff&size=200&bold=true`;

    const newUser = {
      student_id: studentId,
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
      onboarding_completed: false, // BR-REG-08
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const insertResult = await db.collection('users').insertOne(newUser);
    user = { ...newUser, _id: insertResult.insertedId };
  }

  const token = signJwt(
    { sub: user._id.toString(), email: user.email, role: user.role, name: user.full_name },
    '24h'
  );

  return {
    message: 'Đăng ký Google thành công!',
    accessToken: token,
    token,
    user: {
      id: user._id.toString(),
      studentId: user.student_id || null,
      name: user.full_name,
      email: user.email,
      role: user.role,
      avatar: user.avatar_url,
      onboarding_completed: Boolean(user.onboarding_completed),
      email_verified: true,
    },
  };
}

/**
 * Đăng ký nhanh Facebook - EX-REG-04: Xử lý tài khoản Facebook không trả email
 */
export async function registerWithFacebook({ providerId, email, name, avatar }, options = {}) {
  const db = options.db || await getMongoDb();

  if (!providerId) {
    const err = new Error('Thiếu ID định danh Facebook.');
    err.status = 400;
    throw err;
  }

  // EX-REG-04: Facebook không có email -> Yêu cầu bổ sung email
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

  if (!user) {
    const studentId = await generateStudentId(db); // BR-REG-09
    const initialChar = encodeURIComponent((name || email || 'F').trim().charAt(0).toUpperCase());
    const defaultFbAvatar = avatar || `https://ui-avatars.com/api/?name=${initialChar}&background=1877F2&color=fff&size=200&bold=true`;

    const newUser = {
      student_id: studentId,
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
      onboarding_completed: false, // BR-REG-08
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const insertResult = await db.collection('users').insertOne(newUser);
    user = { ...newUser, _id: insertResult.insertedId };
  }

  const token = signJwt(
    { sub: user._id.toString(), email: user.email, role: user.role, name: user.full_name },
    '24h'
  );

  return {
    message: 'Đăng ký Facebook thành công!',
    accessToken: token,
    token,
    user: {
      id: user._id.toString(),
      studentId: user.student_id || null,
      name: user.full_name,
      email: user.email,
      role: user.role,
      avatar: user.avatar_url,
      onboarding_completed: Boolean(user.onboarding_completed),
      email_verified: true,
    },
  };
}
