import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'node:crypto';
import { getMongoDb, signJwt, verifyJwt, maskEmail } from '../db.js';
import { renderForgotPasswordOtpEmail } from '../email/email-templates.js';
import { authError, authDigest, credentialVersion, validateEmail, validatePassword,
  limitAuthRequests, deliverAuthEmail } from './signup.user.js';

const OTP_EXPIRE_DURATION_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_FAILED_ATTEMPTS = 5;

export function generateOtp() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

function checkedEmail(email) {
  const result = validateEmail(email);
  if (!result.valid) throw authError(result.message, 400, 'INVALID_INPUT', 'email');
  return result.value;
}

function otpId(email) { return `reset-otp:${authDigest(email)}`; }
function otpHash(email, otp, createdAt) { return authDigest(`reset-otp:${email}:${otp}:${new Date(createdAt).getTime()}`); }

export async function sendForgotPasswordOtp({ email } = {}, options = {}) {
  const normalizedEmail = checkedEmail(email);
  const db = options.db || await getMongoDb();
  await limitAuthRequests(db, 'forgot-email', normalizedEmail, 5);
  if (options.ip) await limitAuthRequests(db, 'forgot-ip', options.ip, 20);
  const now = new Date();
  const otpCode = generateOtp();
  const record = {
    _id: otpId(normalizedEmail), email: normalizedEmail, otp: otpHash(normalizedEmail, otpCode, now),
    purpose: 'reset_password', expires_at: new Date(now.getTime() + OTP_EXPIRE_DURATION_MS),
    attempts: 0, used: false, created_at: now,
  };
  const { _id, ...fields } = record;
  const replaced = await db.collection('otps').findOneAndUpdate(
    { _id, created_at: { $lte: new Date(now.getTime() - RESEND_COOLDOWN_MS) } },
    { $set: fields }, { returnDocument: 'after' }
  );
  if (!replaced) {
    try { await db.collection('otps').insertOne(record); }
    catch (error) {
      if (error.code !== 11000) throw error;
      throw Object.assign(authError('Vui lòng chờ 60 giây trước khi yêu cầu gửi lại mã.', 429, 'OTP_COOLDOWN'), { retryAfter: 60 });
    }
  }
  // A decoy challenge gives unknown and existing emails the same cooldown and quotas.
  const user = await db.collection('users').findOne({ email: normalizedEmail });
  if (user) {
    await deliverAuthEmail({
      to: normalizedEmail, subject: '[ThinkUp] Mã xác thực đặt lại mật khẩu',
      html: renderForgotPasswordOtpEmail({ otpCode, expireMinutes: 5 }),
      text: `Mã xác thực đặt lại mật khẩu ThinkUp của bạn là: ${otpCode}. Mã có hiệu lực trong vòng 5 phút. Vui lòng không chia sẻ mã này cho người khác.`,
    }, options);
  }
  return {
    message: 'Nếu email tồn tại trên hệ thống, bạn sẽ nhận được mã xác thực.',
    email: normalizedEmail, maskedEmail: maskEmail(normalizedEmail),
  };
}

export async function verifyForgotPasswordOtp({ email, otp } = {}, options = {}) {
  const normalizedEmail = checkedEmail(email);
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    throw authError('Mã OTP phải gồm đúng 6 chữ số.', 400, 'INVALID_INPUT', 'otp');
  }
  const db = options.db || await getMongoDb();
  await limitAuthRequests(db, 'verify-otp-email', normalizedEmail, 30);
  if (options.ip) await limitAuthRequests(db, 'verify-otp-ip', options.ip, 100);
  const records = db.collection('otps');
  const record = await records.findOne({ _id: otpId(normalizedEmail), purpose: 'reset_password' });
  if (!record || record.used || record.attempts >= MAX_OTP_FAILED_ATTEMPTS || new Date(record.expires_at) <= new Date()) {
    throw authError('Mã xác thực không hợp lệ hoặc đã hết hạn.', 400, 'OTP_INVALID');
  }
  const filter = { _id: record._id, purpose: 'reset_password', used: false,
    attempts: { $lt: MAX_OTP_FAILED_ATTEMPTS }, expires_at: { $gt: new Date() }, otp: record.otp };
  if (record.otp !== otpHash(normalizedEmail, otp, record.created_at)) {
    const failed = await records.findOneAndUpdate(filter, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
    if (failed?.attempts >= MAX_OTP_FAILED_ATTEMPTS) {
      throw authError('Đã nhập sai OTP 5 lần. Vui lòng yêu cầu mã mới.', 403, 'OTP_MAX_ATTEMPTS_EXCEEDED');
    }
    throw authError('Mã xác thực không chính xác.', 400, 'OTP_INVALID');
  }
  const user = await db.collection('users').findOne({ email: normalizedEmail });
  if (!user || user.status !== 'active' || user.is_active === false || !user.email_verified || user.role !== 'student') {
    throw authError('Không thể đặt lại mật khẩu cho tài khoản này.', 403, 'ACCOUNT_UNAVAILABLE');
  }
  const jti = randomUUID();
  const resetToken = signJwt({ sub: String(user._id), email: normalizedEmail,
    purpose: 'reset_password_step', jti, challenge: record.otp, credentialVersion: credentialVersion(user) }, '10m');
  // Transition the same document atomically. A resend overwrites this grant, including during a reset race.
  const consumed = await records.findOneAndUpdate(filter, { $set: {
    purpose: 'reset_authorization', otp: authDigest(resetToken), used: false,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
  } }, { returnDocument: 'after' });
  if (!consumed) throw authError('Mã xác thực không còn hiệu lực.', 400, 'OTP_INVALID');
  return { message: 'Xác thực OTP thành công.', resetToken };
}

export async function resendForgotPasswordOtp(params = {}, options = {}) {
  return sendForgotPasswordOtp(params, options);
}

export async function resetPasswordWithToken({ resetToken, newPassword, confirmPassword } = {}, options = {}) {
  if (typeof resetToken !== 'string' || !resetToken) throw authError('Thiếu phiên đặt lại mật khẩu.', 400, 'RESET_TOKEN_INVALID');
  const payload = verifyJwt(resetToken);
  if (payload.purpose !== 'reset_password_step' || typeof payload.jti !== 'string' || !payload.sub || !payload.challenge) {
    throw authError('Phiên đặt lại mật khẩu không hợp lệ.', 400, 'RESET_TOKEN_INVALID');
  }
  const email = checkedEmail(payload.email);
  const password = validatePassword(newPassword);
  if (!password.valid) throw authError(password.message, 400, 'INVALID_INPUT', 'newPassword');
  if (typeof confirmPassword !== 'string' || confirmPassword !== newPassword) {
    throw authError('Mật khẩu xác nhận không khớp.', 400, 'INVALID_INPUT', 'confirmPassword');
  }
  const db = options.db || await getMongoDb();
  await limitAuthRequests(db, 'reset-email', email, 10);
  if (options.ip) await limitAuthRequests(db, 'reset-ip', options.ip, 30);
  const user = await db.collection('users').findOne({ email });
  if (!user || String(user._id) !== payload.sub || user.status !== 'active' || user.is_active === false || !user.email_verified || user.role !== 'student') {
    throw authError('Tài khoản không được phép đặt lại mật khẩu.', 403, 'ACCOUNT_UNAVAILABLE');
  }
  if (payload.credentialVersion !== credentialVersion(user)) {
    throw authError('Phiên đặt lại mật khẩu đã hết hiệu lực.', 400, 'RESET_TOKEN_INVALID');
  }
  const filter = { _id: otpId(email), email, purpose: 'reset_authorization', otp: authDigest(resetToken),
    used: false, expires_at: { $gt: new Date() } };
  const challenge = await db.collection('otps').findOne(filter);
  if (!challenge) throw authError('Phiên đặt lại mật khẩu đã bị thay thế, đã dùng hoặc hết hạn.', 400, 'RESET_TOKEN_INVALID');
  const hash = await bcrypt.hash(password.value, 12);
  const grant = await db.collection('otps').findOneAndUpdate({ ...filter, expires_at: { $gt: new Date() } },
    { $set: { used: true } }, { returnDocument: 'after' });
  if (!grant) throw authError('Phiên đặt lại mật khẩu đã dùng hoặc hết hạn.', 400, 'RESET_TOKEN_INVALID');
  const result = await db.collection('users').updateOne({
    _id: user._id, password_hash: user.password_hash, status: 'active', is_active: { $ne: false }, email_verified: true,
  }, { $set: { password_hash: hash, failed_login_attempts: 0, locked_until: null, updated_at: new Date() } });
  if (result.matchedCount !== 1) throw authError('Tài khoản đã thay đổi. Vui lòng thực hiện lại.', 409, 'ACCOUNT_CHANGED');
  return { message: 'Thay đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
}
