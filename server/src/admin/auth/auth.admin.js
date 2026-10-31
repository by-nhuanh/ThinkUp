import crypto from 'crypto';
import { readAuthToken, verifyAccessToken, setAuthCookie, clearAuthCookie, createCsrfToken } from '../../user/auth/auth.user.js';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getMongoDb, signJwt, verifyJwt, sendEmail } from '../../user/db.js';

// ==========================================
// CẤU HÌNH HỆ THỐNG THEO SPEC & WRITING-BLOCK
// ==========================================
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 phút (Khóa cứng & đếm ngược FE)
const TWO_FACTOR_TEMP_EXPIRY = '5m'; // TTL màn hình 2FA là 5 phút
const PASSWORD_ROTATION_DAYS = 90; // Vòng đời mật khẩu 90 ngày
const GRACE_PERIOD_DAYS = 7; // Cảnh báo sớm 7 ngày trước khi hết hạn
const PASSWORD_HISTORY_LIMIT = 5; // Chặn trùng 5 mật khẩu gần nhất

// ==========================================
// CÁC HÀM TIỆN ÍCH BẢO MẬT (CRYPTO, TOTP, BASE32)
// ==========================================

export function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = (base32 || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Sinh mã TOTP 6 số dựa trên RFC 6238
 */
export function generateTOTP(secret, timeStepOffset = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + timeStepOffset;
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

/**
 * Xác thực mã OTP 6 số với secret key (hỗ trợ độ trễ +/- 1 bước 30s)
 */
export function verifyTOTP(token, secret) {
  if (!token || !secret) return false;
  const cleanToken = String(token).trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;

  for (let offset = -1; offset <= 1; offset++) {
    if (generateTOTP(secret, offset) === cleanToken) {
      return true;
    }
  }
  return false;
}

/**
 * Tạo URL QR Code theo chuẩn otpauth:// (FE có thể dùng lib hiển thị QR hoặc tải qua DataURL)
 */
export function getTotpUri({ secret, email, issuer = 'ThinkUp Admin' }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Sinh 10 mã dự phòng chuẩn XXXX-XXXX-XXXX-XXXX (16 ký tự theo thiết kế Figma)
 */
export function generateBackupCodes(count = 10) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Loại bỏ ký tự dễ nhầm 0,O,1,I
  const codes = [];
  for (let i = 0; i < count; i++) {
    const parts = [];
    for (let p = 0; p < 4; p++) {
      let part = '';
      const bytes = crypto.randomBytes(4);
      for (let j = 0; j < 4; j++) part += chars[bytes[j] % chars.length];
      parts.push(part);
    }
    codes.push(parts.join('-'));
  }
  return codes;
}

/**
 * Kiểm tra độ mạnh mật khẩu chuẩn Enterprise (12-16 ký tự, có hoa, thường, số, ký tự đặc biệt)
 */
export function validateAdminPassword(password) {
  if (!password || typeof password !== 'string') {
    const err = new Error('Mật khẩu không được để trống.');
    err.status = 400;
    err.code = 'PASSWORD_REQUIRED';
    throw err;
  }
  const pwd = password.trim();
  if (pwd.length < 12 || pwd.length > 32) {
    const err = new Error('Mật khẩu quản trị viên bắt buộc từ 12 đến 32 ký tự.');
    err.status = 400;
    err.code = 'PASSWORD_LENGTH_INVALID';
    throw err;
  }
  // Chặn mật khẩu phổ biến
  const forbidden = ['admin123456@', 'password123@', 'thinkup2026@', 'administrator@', '123456789012@', 'admin@123456A', 'Password@123456'];
  if (forbidden.some((f) => pwd.toLowerCase() === f.toLowerCase())) {
    const err = new Error('Mật khẩu quá phổ biến hoặc dễ đoán. Vui lòng chọn mật khẩu phức tạp hơn.');
    err.status = 400;
    err.code = 'PASSWORD_TOO_COMMON';
    throw err;
  }

  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    const err = new Error('Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 chữ số và 1 ký tự đặc biệt.');
    err.status = 400;
    err.code = 'PASSWORD_WEAK';
    throw err;
  }

  return true;
}

/**
 * Ghi Audit Log chuẩn Enterprise
 */
export async function recordAuditLog(db, { adminId, action, ip, userAgent, details = {} }) {
  try {
    await db.collection('admin_audit_logs').insertOne({
      admin_id: adminId ? new ObjectId(adminId) : null,
      action,
      ip: ip || 'unknown',
      user_agent: userAgent || 'unknown',
      details,
      created_at: new Date(),
    });
  } catch (err) {
    console.error('[Admin Audit Log Error]:', err.message);
  }
}

// ==========================================
// CÁC HÀM XỬ LÝ NGHIỆP VỤ (CORE ADMIN AUTH)
// ==========================================

/**
 * LUỒNG 1 - BƯỚC 1: Xác thực Invite Token và Thiết lập Mật khẩu Mới
 */
export async function setupAdminPassword({ inviteToken, newPassword, confirmPassword }, options = {}) {
  const db = options.db || (await getMongoDb());

  if (!inviteToken) {
    const err = new Error('Mã liên kết kích hoạt không hợp lệ.');
    err.status = 400;
    err.code = 'INVITE_TOKEN_REQUIRED';
    throw err;
  }

  if (newPassword !== confirmPassword) {
    const err = new Error('Mật khẩu nhập lại không khớp.');
    err.status = 400;
    err.code = 'PASSWORD_MISMATCH';
    throw err;
  }

  validateAdminPassword(newPassword);

  const admin = await db.collection('admins').findOne({
    invite_token: inviteToken,
  });

  if (!admin) {
    const err = new Error('Mã liên kết không tồn tại hoặc đã hết hạn. Vui lòng liên hệ IT/SA cấp lại.');
    err.status = 400;
    err.code = 'INVALID_INVITE_TOKEN';
    throw err;
  }

  if (admin.invite_expires_at && new Date(admin.invite_expires_at) < new Date()) {
    const err = new Error('Mã liên kết kích hoạt đã hết hạn. Vui lòng liên hệ bộ phận IT/SA cấp lại.');
    err.status = 400;
    err.code = 'INVITE_TOKEN_EXPIRED';
    throw err;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Sinh Secret Key 2FA tạm thời (Pending)
  const rawSecret = crypto.randomBytes(20);
  const base32Secret = base32Encode(rawSecret);
  const qrUri = getTotpUri({ secret: base32Secret, email: admin.email });

  await db.collection('admins').updateOne(
    { _id: admin._id },
    {
      $set: {
        password_hash: passwordHash,
        pending_2fa_secret: base32Secret,
        onboarding_step: '2FA_SETUP',
        updated_at: new Date(),
      },
    }
  );

  await recordAuditLog(db, {
    adminId: admin._id,
    action: 'ADMIN_PASSWORD_INITIALIZED',
    ip: options.ip,
    userAgent: options.userAgent,
    details: { email: admin.email },
  });

  // Sinh token phiên Onboarding để FE chuyển sang Màn 2
  const onboardingSessionToken = signJwt(
    {
      adminId: admin._id.toString(),
      email: admin.email,
      role: admin.role || 'ADMIN',
      step: '2FA_SETUP',
    },
    '15m'
  );

  return {
    success: true,
    message: 'Thiết lập mật khẩu thành công. Vui lòng tiến hành cài đặt 2FA.',
    onboardingToken: onboardingSessionToken,
    step: '2FA_SETUP',
    secretKey: base32Secret,
    qrUri,
  };
}

/**
 * LUỒNG 1 - BƯỚC 2: Xác nhận OTP và Bật 2FA
 */
export async function confirmAdmin2FASetup({ onboardingToken, otp }, options = {}) {
  const db = options.db || (await getMongoDb());

  if (!onboardingToken) {
    const err = new Error('Phiên thiết lập không hợp lệ.');
    err.status = 401;
    err.code = 'ONBOARDING_TOKEN_REQUIRED';
    throw err;
  }

  const payload = verifyJwt(onboardingToken);
  if (!payload || !payload.adminId) {
    const err = new Error('Phiên thiết lập không hợp lệ hoặc đã hết hạn.');
    err.status = 401;
    err.code = 'INVALID_ONBOARDING_TOKEN';
    throw err;
  }

  const admin = await db.collection('admins').findOne({ _id: new ObjectId(payload.adminId) });
  if (!admin || !admin.pending_2fa_secret) {
    const err = new Error('Không tìm thấy thông tin cài đặt 2FA.');
    err.status = 400;
    err.code = '2FA_NOT_INITIALIZED';
    throw err;
  }

  const isValidOtp = verifyTOTP(otp, admin.pending_2fa_secret);
  if (!isValidOtp) {
    const err = new Error('Mã xác thực không đúng hoặc đã hết hạn. Vui lòng thử lại.');
    err.status = 400;
    err.code = 'INVALID_OTP';
    throw err;
  }

  // Khởi tạo 10 mã dự phòng chuẩn 16 ký tự (Figma)
  const plainBackupCodes = generateBackupCodes(10);
  const salt = await bcrypt.genSalt(10);
  const hashedBackupCodes = await Promise.all(
    plainBackupCodes.map(async (code) => {
      const compact = code.replace(/[^A-Z0-9]/g, '');
      return {
        code_hash: await bcrypt.hash(code, salt),
        compact_hash: await bcrypt.hash(compact, salt),
        is_used: false,
        used_at: null,
      };
    })
  );

  // Cập nhật kích hoạt 2FA và lưu mã dự phòng đã hash
  await db.collection('admins').updateOne(
    { _id: admin._id },
    {
      $set: {
        two_factor_secret: admin.pending_2fa_secret,
        pending_2fa_secret: null,
        is_2fa_enabled: true,
        backup_codes: hashedBackupCodes,
        onboarding_step: 'BACKUP_CODES',
        updated_at: new Date(),
      },
    }
  );

  await recordAuditLog(db, {
    adminId: admin._id,
    action: 'ADMIN_2FA_ENABLED',
    ip: options.ip,
    userAgent: options.userAgent,
    details: { email: admin.email },
  });

  const nextOnboardingToken = signJwt(
    {
      adminId: admin._id.toString(),
      email: admin.email,
      role: admin.role || 'ADMIN',
      step: 'BACKUP_CODES',
    },
    '15m'
  );

  return {
    success: true,
    message: 'Kích hoạt 2FA thành công. Vui lòng lưu trữ các mã dự phòng an toàn.',
    onboardingToken: nextOnboardingToken,
    step: 'BACKUP_CODES',
    backupCodes: plainBackupCodes, // Chỉ trả về bản rõ duy nhất lần này
  };
}

/**
 * LUỒNG 1 - BƯỚC 3: Hoàn tất Onboarding Admin
 */
export async function completeAdminOnboarding({ onboardingToken, confirmedSaved }, options = {}) {
  const db = options.db || (await getMongoDb());

  if (!confirmedSaved) {
    const err = new Error('Bạn bắt buộc phải xác nhận đã lưu các mã dự phòng ở nơi an toàn.');
    err.status = 400;
    err.code = 'BACKUP_CODES_NOT_CONFIRMED';
    throw err;
  }

  const payload = verifyJwt(onboardingToken);
  if (!payload || !payload.adminId) {
    const err = new Error('Phiên thiết lập không hợp lệ.');
    err.status = 401;
    err.code = 'INVALID_ONBOARDING_TOKEN';
    throw err;
  }

  const admin = await db.collection('admins').findOne({ _id: new ObjectId(payload.adminId) });
  if (!admin) {
    const err = new Error('Không tìm thấy tài khoản quản trị viên.');
    err.status = 404;
    err.code = 'ADMIN_NOT_FOUND';
    throw err;
  }

  const now = new Date();
  await db.collection('admins').updateOne(
    { _id: admin._id },
    {
      $set: {
        status: 'ACTIVE',
        is_active: true,
        invite_token: null, // Hủy token mời
        invite_expires_at: null,
        onboarding_step: 'COMPLETED',
        password_changed_at: now,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: now,
      },
      $push: {
        password_history: {
          $each: [{ password_hash: admin.password_hash, changed_at: now }],
          $slice: -PASSWORD_HISTORY_LIMIT,
        },
      },
    }
  );

  await recordAuditLog(db, {
    adminId: admin._id,
    action: 'ONBOARDING_COMPLETED',
    ip: options.ip,
    userAgent: options.userAgent,
    details: { email: admin.email },
  });

  // Cấp Access Token chính thức vào Dashboard
  const accessToken = signJwt(
    {
      adminId: admin._id.toString(),
      email: admin.email,
      role: admin.role || 'ADMIN',
      full_name: admin.full_name || 'Administrator',
    },
    '1d'
  );

  return {
    success: true,
    message: 'Hoàn tất kích hoạt tài khoản quản trị viên. Đang chuyển hướng vào Dashboard.',
    accessToken,
    admin: {
      id: admin._id.toString(),
      email: admin.email,
      full_name: admin.full_name || 'Administrator',
      role: admin.role || 'ADMIN',
    },
  };
}

/**
 * LUỒNG 2 - BƯỚC 1: Đăng nhập hàng ngày (Email + Password)
 */
export async function loginAdminCredentials({ email, password }, options = {}) {
  const db = options.db || (await getMongoDb());

  const normalizedEmail = (email || '').trim().toLowerCase();
  const trimmedPassword = (password || '').trim();

  if (!normalizedEmail || !trimmedPassword) {
    const err = new Error('Vui lòng nhập email công vụ và mật khẩu.');
    err.status = 400;
    err.code = 'CREDENTIALS_REQUIRED';
    throw err;
  }

  const admin = await db.collection('admins').findOne({ email: normalizedEmail });

  // 1. Kiểm tra tài khoản bị khóa cứng do nhập sai quá 5 lần (15 phút)
  if (admin && admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const remainingMs = new Date(admin.locked_until).getTime() - Date.now();
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutesLeft = Math.ceil(remainingSeconds / 60);

    const err = new Error(`Tài khoản tạm thời bị khóa do nhập sai nhiều lần. Vui lòng thử lại sau ${minutesLeft} phút.`);
    err.status = 403;
    err.code = 'ACCOUNT_LOCKED';
    err.lockedUntil = admin.locked_until;
    err.remainingSeconds = remainingSeconds;
    throw err;
  }

  // 2. Kiểm tra mật khẩu
  const isMatch = admin && admin.password_hash ? await bcrypt.compare(trimmedPassword, admin.password_hash) : false;

  if (!admin || !isMatch) {
    if (admin) {
      const attempts = (admin.failed_login_attempts || 0) + 1;
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await db.collection('admins').updateOne(
          { _id: admin._id },
          {
            $set: {
              failed_login_attempts: attempts,
              locked_until: lockedUntil,
              updated_at: new Date(),
            },
          }
        );

        // Ghi Audit Log cảnh báo đỏ
        await recordAuditLog(db, {
          adminId: admin._id,
          action: 'ADMIN_ACCOUNT_LOCKED_BRUTEFORCE',
          ip: options.ip,
          userAgent: options.userAgent,
          details: { email: admin.email, attempts },
        });

        // Gửi email cảnh báo khẩn cấp tới Admin
        try {
          await sendEmail({
            to: admin.email,
            subject: '🚨 [CẢNH BÁO AN NINH] Tài khoản Quản trị viên của bạn tạm thời bị khóa',
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #d9534f;">Cảnh báo đăng nhập thất bại liên tiếp</h2>
                <p>Xin chào <b>${admin.full_name || 'Admin'}</b>,</p>
                <p>Hệ thống ThinkUp Security phát hiện tài khoản quản trị của bạn vừa bị khóa 15 phút do nhập sai mật khẩu quá 5 lần liên tiếp.</p>
                <p><b>Địa chỉ IP yêu cầu:</b> ${options.ip || 'Không rõ'}</p>
                <p><b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}</p>
                <p>Nếu không phải bạn thực hiện, vui lòng liên hệ ngay bộ phận SA Helpdesk để được hỗ trợ khẩn cấp.</p>
              </div>
            `,
          });
        } catch (mailErr) {
          console.warn('[Admin Security Mail Warning]:', mailErr.message);
        }

        const err = new Error('Bạn đã nhập sai 5 lần. Tài khoản bị tạm khóa 15 phút để bảo vệ hệ thống.');
        err.status = 403;
        err.code = 'ACCOUNT_LOCKED';
        err.lockedUntil = lockedUntil;
        err.remainingSeconds = 15 * 60;
        throw err;
      } else {
        await db.collection('admins').updateOne(
          { _id: admin._id },
          {
            $set: { failed_login_attempts: attempts },
          }
        );
      }
    }

    const err = new Error('Email công vụ hoặc mật khẩu không chính xác. Vui lòng thử lại.');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  // 3. Kiểm tra trạng thái tài khoản
  if (admin.status === 'INVITED' || admin.status === 'PENDING_ONBOARDING' || !admin.is_2fa_enabled) {
    const err = new Error('Tài khoản chưa hoàn tất kích hoạt Onboarding. Vui lòng kiểm tra email kích hoạt.');
    err.status = 403;
    err.code = 'ONBOARDING_INCOMPLETE';
    throw err;
  }

  if (admin.status === 'LOCKED' || admin.is_active === false) {
    const err = new Error('Tài khoản đã bị quản trị viên cấp cao vô hiệu hóa. Vui lòng liên hệ SA Helpdesk.');
    err.status = 403;
    err.code = 'ACCOUNT_SUSPENDED';
    throw err;
  }

  // Đăng nhập Bước 1 thành công: Cấp 2FA Session Token có TTL đúng 5 phút (theo đặc tả)
  const twoFactorToken = signJwt(
    {
      adminId: admin._id.toString(),
      email: admin.email,
      role: admin.role || 'ADMIN',
      authStep: '2FA_PENDING',
    },
    TWO_FACTOR_TEMP_EXPIRY
  );

  return {
    success: true,
    message: 'Xác thực thông tin ban đầu thành công. Vui lòng nhập mã xác thực 2FA.',
    requires2FA: true,
    twoFactorToken,
    expiresInSeconds: 300, // 5 phút TTL
  };
}

/**
 * LUỒNG 2 - BƯỚC 2: Xác thực 2FA (Bằng TOTP 6 số hoặc Backup Code)
 */
async function rejectAdmin2FAAttempt(db, admin, code, message) {
  await db.collection('admins').updateOne(
    { _id: admin._id },
    { $inc: { failed_login_attempts: 1 }, $set: { updated_at: new Date() } },
  );
  const current = await db.collection('admins').findOne({ _id: admin._id });
  const locked = (current?.failed_login_attempts || 0) >= MAX_LOGIN_ATTEMPTS;
  if (locked) {
    await db.collection('admins').updateOne(
      { _id: admin._id },
      { $set: { locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS), updated_at: new Date() } },
    );
  }
  const err = new Error(locked ? 'Bạn đã xác thực sai 5 lần. Tài khoản bị tạm khóa 15 phút.' : message);
  err.status = locked ? 423 : 400;
  err.code = locked ? 'ACCOUNT_TEMPORARILY_LOCKED' : code;
  throw err;
}

export async function verifyAdmin2FA({ twoFactorToken, otp, backupCode }, options = {}) {
  const db = options.db || (await getMongoDb());

  if (!twoFactorToken) {
    const err = new Error('Phiên xác thực 2FA không hợp lệ.');
    err.status = 401;
    err.code = '2FA_TOKEN_REQUIRED';
    throw err;
  }

  let payload;
  try {
    payload = verifyJwt(twoFactorToken);
  } catch (err) {
    const customErr = new Error('Phiên xác thực 2FA đã hết hạn (quá 5 phút). Vui lòng quay lại bước 1.');
    customErr.status = 401;
    customErr.code = '2FA_SESSION_EXPIRED';
    throw customErr;
  }

  if (!payload || !payload.adminId || payload.authStep !== '2FA_PENDING') {
    const err = new Error('Phiên xác thực 2FA không hợp lệ.');
    err.status = 401;
    err.code = 'INVALID_2FA_SESSION';
    throw err;
  }

  const admin = await db.collection('admins').findOne({ _id: new ObjectId(payload.adminId) });
  if (!admin) {
    const err = new Error('Không tìm thấy tài khoản quản trị.');
    err.status = 404;
    err.code = 'ADMIN_NOT_FOUND';
    throw err;
  }
  if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) {
    const err = new Error('Tài khoản tạm thời bị khóa do xác thực sai nhiều lần.');
    err.status = 423;
    err.code = 'ACCOUNT_TEMPORARILY_LOCKED';
    throw err;
  }

  let isVerified = false;
  let verificationMethod = 'TOTP';

  // 1. Trường hợp sử dụng Backup Code
  if (backupCode) {
    const rawBackupCode = String(backupCode).trim().toUpperCase();
    const compactInput = rawBackupCode.replace(/[^A-Z0-9]/g, '');
    const backupList = admin.backup_codes || [];
    let matchedCode = null;
    let matchedHashField = null;

    for (let i = 0; i < backupList.length; i++) {
      if (backupList[i].is_used) continue;
      // Thử compare chuỗi gốc hoặc chuỗi compact
      if (await bcrypt.compare(rawBackupCode, backupList[i].code_hash)) {
        matchedCode = backupList[i];
        matchedHashField = 'code_hash';
        break;
      }
      if (backupList[i].compact_hash && await bcrypt.compare(compactInput, backupList[i].compact_hash)) {
        matchedCode = backupList[i];
        matchedHashField = 'compact_hash';
        break;
      }
      if (await bcrypt.compare(compactInput, backupList[i].code_hash)) {
        matchedCode = backupList[i];
        matchedHashField = 'code_hash';
        break;
      }
    }

    if (!matchedCode) {
      await rejectAdmin2FAAttempt(db, admin, 'INVALID_BACKUP_CODE', 'Mã dự phòng không chính xác hoặc đã được sử dụng.');
    }

    // Conditional positional update makes each backup code single-use under concurrent requests.
    const backupCodeFilter = matchedHashField === 'compact_hash'
      ? {
          _id: admin._id,
          backup_codes: {
            $elemMatch: {
              compact_hash: matchedCode.compact_hash,
              is_used: { $ne: true },
            },
          },
        }
      : {
          _id: admin._id,
          backup_codes: {
            $elemMatch: {
              code_hash: matchedCode.code_hash,
              is_used: { $ne: true },
            },
          },
        };
    const consumed = await db.collection('admins').updateOne(
      backupCodeFilter,
      {
        $set: {
          'backup_codes.$.is_used': true,
          'backup_codes.$.used_at': new Date(),
          updated_at: new Date(),
        },
      }
    );
    if (!consumed.modifiedCount) {
      await rejectAdmin2FAAttempt(db, admin, 'INVALID_BACKUP_CODE', 'Mã dự phòng không chính xác hoặc đã được sử dụng.');
    }

    isVerified = true;
    verificationMethod = 'BACKUP_CODE';
  } else if (otp) {
    // 2. Trường hợp sử dụng OTP 6 số
    isVerified = verifyTOTP(otp, admin.two_factor_secret);
    if (!isVerified) {
      await rejectAdmin2FAAttempt(db, admin, 'INVALID_OTP', 'Mã xác thực không đúng hoặc đã hết hạn. Vui lòng thử lại.');
    }
  } else {
    const err = new Error('Vui lòng cung cấp mã OTP 6 số hoặc mã dự phòng.');
    err.status = 400;
    err.code = 'OTP_OR_BACKUP_CODE_REQUIRED';
    throw err;
  }

  // Reset số lần đăng nhập sai và cập nhật lần đăng nhập gần nhất
  await db.collection('admins').updateOne(
    { _id: admin._id },
    {
      $set: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date(),
        updated_at: new Date(),
      },
    }
  );

  await recordAuditLog(db, {
    adminId: admin._id,
    action: 'ADMIN_LOGIN_SUCCESS',
    ip: options.ip,
    userAgent: options.userAgent,
    details: { email: admin.email, method: verificationMethod },
  });

  // Kiểm tra vòng đời mật khẩu (Password Rotation 90 ngày)
  const passwordStatus = checkPasswordExpiry(admin.password_changed_at);

  const accessToken = signJwt(
    {
      adminId: admin._id.toString(),
      email: admin.email,
      role: admin.role || 'ADMIN',
      full_name: admin.full_name || 'Administrator',
      passwordStatus,
    },
    '1d'
  );

  return {
    success: true,
    message: 'Đăng nhập thành công!',
    accessToken,
    admin: {
      id: admin._id.toString(),
      email: admin.email,
      full_name: admin.full_name || 'Administrator',
      role: admin.role || 'ADMIN',
    },
    passwordStatus,
  };
}

/**
 * Kiểm tra trạng thái hết hạn mật khẩu (Grace Period 7 ngày & Hard Block 90 ngày)
 */
export function checkPasswordExpiry(lastChangedAt) {
  if (!lastChangedAt) {
    return { isExpired: false, isWarning: false, daysLeft: PASSWORD_ROTATION_DAYS };
  }

  const changeDate = new Date(lastChangedAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, PASSWORD_ROTATION_DAYS - diffDays);

  if (diffDays >= PASSWORD_ROTATION_DAYS) {
    return {
      isExpired: true,
      isWarning: true,
      daysLeft: 0,
      message: 'Mật khẩu của bạn đã quá hạn 90 ngày. Bắt buộc phải đổi mật khẩu mới để tiếp tục.',
    };
  }

  if (daysLeft <= GRACE_PERIOD_DAYS) {
    return {
      isExpired: false,
      isWarning: true,
      daysLeft,
      message: `Mật khẩu của bạn sẽ hết hạn sau ${daysLeft} ngày. Vui lòng thay đổi ngay.`,
    };
  }

  return {
    isExpired: false,
    isWarning: false,
    daysLeft,
  };
}

/**
 * LUỒNG 3: Đổi Mật Khẩu Định Kỳ (Password Rotation)
 * Bắt buộc: Mật khẩu cũ + Mật khẩu mới + OTP 2FA.
 * Kiểm tra: Không trùng 5 mật khẩu gần nhất.
 */
export async function rotateAdminPassword(
  { adminId, currentPassword, newPassword, confirmPassword, otp },
  options = {}
) {
  const db = options.db || (await getMongoDb());

  if (!adminId) {
    const err = new Error('Yêu cầu định danh quản trị viên.');
    err.status = 401;
    err.code = 'ADMIN_UNAUTHORIZED';
    throw err;
  }

  if (!currentPassword || !newPassword || !otp) {
    const err = new Error('Vui lòng nhập đầy đủ mật khẩu hiện tại, mật khẩu mới và mã OTP 2FA.');
    err.status = 400;
    err.code = 'FIELDS_REQUIRED';
    throw err;
  }

  if (newPassword !== confirmPassword) {
    const err = new Error('Mật khẩu nhập lại không khớp.');
    err.status = 400;
    err.code = 'PASSWORD_MISMATCH';
    throw err;
  }

  if (currentPassword === newPassword) {
    const err = new Error('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
    err.status = 400;
    err.code = 'PASSWORD_SAME_AS_CURRENT';
    throw err;
  }

  validateAdminPassword(newPassword);

  const admin = await db.collection('admins').findOne({ _id: new ObjectId(adminId) });
  if (!admin) {
    const err = new Error('Không tìm thấy tài khoản quản trị.');
    err.status = 404;
    err.code = 'ADMIN_NOT_FOUND';
    throw err;
  }

  // 1. Kiểm tra mật khẩu hiện tại
  const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!isMatch) {
    const err = new Error('Mật khẩu hiện tại không chính xác.');
    err.status = 400;
    err.code = 'CURRENT_PASSWORD_INCORRECT';
    throw err;
  }

  // 2. Xác thực OTP 2FA bắt buộc
  const isValidOtp = verifyTOTP(otp, admin.two_factor_secret);
  if (!isValidOtp) {
    const err = new Error('Mã OTP 2FA không chính xác hoặc đã hết hạn.');
    err.status = 400;
    err.code = 'INVALID_OTP';
    throw err;
  }

  // 3. Kiểm tra lịch sử 5 mật khẩu gần nhất (Password History)
  const history = admin.password_history || [];
  for (const hist of history) {
    if (hist.password_hash && (await bcrypt.compare(newPassword, hist.password_hash))) {
      const err = new Error('Không được sử dụng lại mật khẩu đã dùng trong 5 lần gần nhất.');
      err.status = 400;
      err.code = 'PASSWORD_IN_HISTORY';
      throw err;
    }
  }

  // Hash mật khẩu mới
  const salt = await bcrypt.genSalt(10);
  const newHash = await bcrypt.hash(newPassword, salt);
  const now = new Date();

  await db.collection('admins').updateOne(
    { _id: admin._id },
    {
      $set: {
        password_hash: newHash,
        password_changed_at: now,
        updated_at: now,
      },
      $push: {
        password_history: {
          $each: [{ password_hash: newHash, changed_at: now }],
          $slice: -PASSWORD_HISTORY_LIMIT,
        },
      },
    }
  );

  await recordAuditLog(db, {
    adminId: admin._id,
    action: 'ADMIN_PASSWORD_ROTATED',
    ip: options.ip,
    userAgent: options.userAgent,
    details: { email: admin.email },
  });

  // Thu hồi session cũ, cấp phiên mới tinh vào Dashboard
  const newAccessToken = signJwt(
    {
      adminId: admin._id.toString(),
      email: admin.email,
      role: admin.role || 'ADMIN',
      full_name: admin.full_name || 'Administrator',
      passwordStatus: { isExpired: false, isWarning: false, daysLeft: PASSWORD_ROTATION_DAYS },
    },
    '1d'
  );

  return {
    success: true,
    message: 'Đổi mật khẩu thành công. Toàn bộ phiên cũ đã được làm mới.',
    accessToken: newAccessToken,
  };
}

/**
 * Lấy thông tin tài khoản Admin hiện tại & kiểm tra hiệu lực phiên
 */
export async function getAdminProfile(adminId, options = {}) {
  const db = options.db || (await getMongoDb());

  const admin = await db.collection('admins').findOne(
    { _id: new ObjectId(adminId) },
    {
      projection: {
        password_hash: 0,
        two_factor_secret: 0,
        pending_2fa_secret: 0,
        backup_codes: 0,
        password_history: 0,
      },
    }
  );

  if (!admin) {
    const err = new Error('Không tìm thấy tài khoản quản trị.');
    err.status = 404;
    err.code = 'ADMIN_NOT_FOUND';
    throw err;
  }

  const passwordStatus = checkPasswordExpiry(admin.password_changed_at);

  return {
    success: true,
    admin: {
      id: admin._id.toString(),
      email: admin.email,
      full_name: admin.full_name || 'Administrator',
      role: admin.role || 'ADMIN',
      status: admin.status,
      is_2fa_enabled: Boolean(admin.is_2fa_enabled),
      passwordStatus,
    },
  };
}

/**
 * Khởi tạo Router Express cho Admin Auth
 */
export function createAdminAuthMiddleware() {
  return async (req, res, next) => {
    const token = readAuthToken(req, 'admin');
    if (!token) {
      return res.status(401).json({ message: 'Yêu cầu đăng nhập quản trị viên.', code: 'UNAUTHORIZED' });
    }
    try {
      const payload = verifyAccessToken(token, 'admin');
      if (!payload || !payload.adminId) {
        return res.status(401).json({ message: 'Token không hợp lệ.', code: 'TOKEN_INVALID' });
      }
      const db = await getMongoDb();
      const admin = await db.collection('admins').findOne({
        _id: new ObjectId(payload.adminId),
        status: 'ACTIVE',
        is_active: { $ne: false },
      }, { projection: { _id: 1 } });
      if (!admin) {
        return res.status(403).json({ message: 'Tài khoản quản trị đã bị vô hiệu hóa.', code: 'ADMIN_ACCOUNT_INACTIVE' });
      }
      req.adminId = payload.adminId;
      req.adminPayload = payload;
      next();
    } catch (err) {
      if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Phiên quản trị viên đã hết hạn.', code: 'TOKEN_EXPIRED' });
      }
      next(err);
    }
  };
}

export function createAdminAuthRouter(express) {
  const router = express.Router();

  // Helper lấy Client IP
  const getClientIp = (req) =>
    req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';

  const requireAdminAuth = createAdminAuthMiddleware();

  // Middleware kiểm tra Hard Block mật khẩu hết hạn 90 ngày (BR-SPEC-03)
  const checkPasswordHardBlock = (req, res, next) => {
    if (req.adminPayload?.passwordStatus?.isExpired) {
      return res.status(403).json({
        message: 'Mật khẩu của bạn đã quá hạn 90 ngày. Vui lòng đổi mật khẩu để tiếp tục.',
        code: 'ERR_PASSWORD_EXPIRED',
      });
    }
    next();
  };

  // --- LUỒNG 1: ONBOARDING ---
  router.post('/onboarding/setup-password', async (req, res, next) => {
    try {
      const result = await setupAdminPassword(req.body, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/onboarding/confirm-2fa', async (req, res, next) => {
    try {
      const result = await confirmAdmin2FASetup(req.body, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/onboarding/complete', async (req, res, next) => {
    try {
      const result = await completeAdminOnboarding(req.body, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      setAuthCookie(res, result, 'admin', req.body.rememberMe);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // --- LUỒNG 2: ĐĂNG NHẬP & 2FA ---
  router.post('/login', async (req, res, next) => {
    try {
      const result = await loginAdminCredentials(req.body, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      setAuthCookie(res, result, 'admin', req.body.rememberMe);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/verify-2fa', async (req, res, next) => {
    try {
      const result = await verifyAdmin2FA(req.body, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      setAuthCookie(res, result, 'admin', req.body.rememberMe);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Modal Text "Quên mật khẩu"
  router.get('/forgot-password-guide', (req, res) => {
    res.json({
      success: true,
      message: 'Vui lòng liên hệ SA Helpdesk hoặc quản trị viên hệ thống để được cấp lại tài khoản.',
      contactEmail: 'sa-helpdesk@thinkup.vn',
      hotline: '1900-THINKUP',
    });
  });

  // --- LUỒNG 3: ROTATION & QUẢN TRỊ ---
  router.post('/rotate-password', requireAdminAuth, async (req, res, next) => {
    try {
      const result = await rotateAdminPassword(
        {
          adminId: req.adminId,
          ...req.body,
        },
        {
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'],
        }
      );
      setAuthCookie(res, result, 'admin', req.body.rememberMe);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAdminAuth, checkPasswordHardBlock, async (req, res, next) => {
    try {
      const result = await getAdminProfile(req.adminId);
      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/csrf', requireAdminAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ csrfToken: createCsrfToken(readAuthToken(req, 'admin'), 'admin') });
  });

  router.post('/logout', (req, res) => {
    clearAuthCookie(res, 'admin');
    res.json({ success: true, message: 'Đăng xuất thành công' });
  });

  return router;
}
