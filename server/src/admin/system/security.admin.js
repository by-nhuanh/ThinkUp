import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { generateTOTP } from '../auth/auth.admin.js';
import { createAuditRecord } from './audit.admin.js';

export const ADMINS_COLLECTION = 'admins';
export const USERS_COLLECTION = 'users';

const ALLOWED_ADMIN_ROLES = ['CA', 'FA', 'CS'];

function badRequest(message, code = 'SECURITY_INVALID', status = 400) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Xác thực mã TOTP của SA đang thao tác
 */
export async function verifySuperAdminOtp(db, saAdminId, inputOtp) {
  if (!inputOtp || !/^\d{6}$/.test(String(inputOtp).trim())) {
    throw badRequest('Mã xác thực phải gồm đúng 6 chữ số.', 'OTP_FORMAT_INVALID');
  }

  const saDoc = await db.collection(ADMINS_COLLECTION).findOne({ _id: new ObjectId(saAdminId) });
  if (!saDoc) {
    throw badRequest('Không tìm thấy thông tin Super Admin xác thực.', 'SA_NOT_FOUND', 404);
  }

  // Kiểm tra khóa tạm 15 phút nếu sai quá 3 lần
  if (saDoc.sa_action_locked_until && new Date() < new Date(saDoc.sa_action_locked_until)) {
    const remainingMins = Math.ceil((new Date(saDoc.sa_action_locked_until).getTime() - Date.now()) / 60000);
    throw badRequest(`Chức năng bảo mật đang tạm khóa trong ${remainingMins} phút do nhập sai mã quá 3 lần.`, 'SA_ACTION_LOCKED', 429);
  }

  // Kiểm tra mã OTP đối chiếu với two_factor_secret
  let isValid = false;
  const secret = saDoc.two_factor_secret;
  if (secret) {
    for (const offset of [-1, 0, 1]) {
      if (generateTOTP(secret, offset) === String(inputOtp).trim()) {
        isValid = true;
        break;
      }
    }
  }

  // Hỗ trợ trường hợp tài khoản SA demo/seed dùng mã 123456 trong dev
  if (!isValid && process.env.NODE_ENV !== 'production' && String(inputOtp).trim() === '123456') {
    isValid = true;
  }

  if (!isValid) {
    const attempts = (saDoc.failed_sa_action_attempts || 0) + 1;
    const update = { $set: { failed_sa_action_attempts: attempts } };
    if (attempts >= 3) {
      update.$set.sa_action_locked_until = new Date(Date.now() + 15 * 60 * 1000);
      update.$set.failed_sa_action_attempts = 0;
    }
    await db.collection(ADMINS_COLLECTION).updateOne({ _id: saDoc._id }, update);

    if (attempts >= 3) {
      throw badRequest('Nhập sai mã xác thực quá 3 lần. Chức năng đã bị khóa trong 15 phút.', 'SA_ACTION_LOCKED', 429);
    }
    throw badRequest(`Mã xác thực không chính xác (còn ${3 - attempts} lần thử).`, 'OTP_INVALID');
  }

  // Reset bộ đếm khi thành công
  if (saDoc.failed_sa_action_attempts) {
    await db.collection(ADMINS_COLLECTION).updateOne(
      { _id: saDoc._id },
      { $set: { failed_sa_action_attempts: 0, sa_action_locked_until: null } }
    );
  }

  return true;
}

/**
 * 4 thẻ tổng quan Dashboard Security
 */
export async function getSecuritySummary(db) {
  const collection = db.collection(ADMINS_COLLECTION);
  const [totalActive, total2FA, activeSessionsCount] = await Promise.all([
    collection.countDocuments({ status: 'active' }),
    collection.countDocuments({ status: 'active', two_factor_enabled: true }),
    collection.countDocuments({ status: 'active', last_login_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
  ]);

  const twoFactorPercentage = totalActive > 0 ? Math.round((total2FA / totalActive) * 100) : 0;

  return {
    activeAdmins: totalActive,
    openSessions: Math.max(1, activeSessionsCount),
    twoFactorRate: `${twoFactorPercentage}%`,
    blacklistedIps: 0, // Danh sách đen IP
  };
}

/**
 * Danh sách tài khoản Admin & Bộ lọc
 */
export async function listAdminUsers(db, {
  search = '',
  role = '',
  status = '',
  twoFactor = '',
  currentAdminId,
}) {
  const collection = db.collection(ADMINS_COLLECTION);
  const query = {};

  if (search && search.trim()) {
    const term = search.trim();
    query.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { admin_code: { $regex: term, $options: 'i' } },
    ];
  }

  if (role && role !== 'all') {
    query.role = role.toUpperCase();
  }
  if (status && status !== 'all') {
    query.status = status;
  }
  if (twoFactor && twoFactor !== 'all') {
    query.two_factor_enabled = twoFactor === 'active';
  }

  const admins = await collection.find(query).sort({ created_at: -1 }).toArray();

  return admins.map(a => ({
    id: a._id.toString(),
    code: a.admin_code || `AD-${a._id.toString().slice(-4)}`,
    name: a.name || 'Admin',
    email: a.email,
    role: a.role || 'CS',
    twoFactor: a.two_factor_enabled ? 'active' : 'inactive',
    lastLoginAt: a.last_login_at ? a.last_login_at.toISOString() : 'Chưa đăng nhập',
    lastLoginDevice: a.last_login_device || 'N/A',
    status: a.status || 'active',
    isSelf: currentAdminId ? a._id.toString() === currentAdminId.toString() : false,
  }));
}

/**
 * Tìm kiếm nhân sự nội bộ (@thinkup.vn) chưa có vai trò quản trị
 */
export async function listEligibleInternalStaff(db, search = '') {
  const usersCollection = db.collection(USERS_COLLECTION);
  const adminsCollection = db.collection(ADMINS_COLLECTION);

  // Lấy tất cả email admin hiện có
  const existingAdminEmails = (await adminsCollection.distinct('email')).map(e => e.toLowerCase());

  const query = {
    email: {
      $regex: '@thinkup\\.vn$',
      $options: 'i',
      $nin: existingAdminEmails,
    },
  };

  if (search && search.trim()) {
    query.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { email: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const staff = await usersCollection.find(query).limit(20).toArray();

  return staff.map(s => ({
    id: s._id.toString(),
    name: s.name || s.fullName || 'Nhân viên ThinkUp',
    email: s.email,
    status: s.status || 'active',
  }));
}

/**
 * Cấp quyền Admin (Assign Role) cho nhân sự
 */
export async function assignAdminRole(db, {
  saActor,
  targetEmail,
  targetName,
  role,
  reason,
  saOtp,
  client_context,
}) {
  const cleanEmail = String(targetEmail || '').trim().toLowerCase();
  const cleanReason = String(reason || '').trim();

  if (!cleanEmail.endsWith('@thinkup.vn')) {
    throw badRequest('Chỉ nhân sự có email tên miền @thinkup.vn mới được cấp quyền.', 'EMAIL_DOMAIN_INVALID');
  }
  if (!ALLOWED_ADMIN_ROLES.includes(role)) {
    throw badRequest('Vai trò chỉ có thể là CA, FA hoặc CS. Không được cấp quyền Super Admin.', 'ROLE_FORBIDDEN');
  }
  if (cleanReason.length < 10) {
    throw badRequest('Lý do phân quyền phải có độ dài tối thiểu 10 ký tự.', 'REASON_TOO_SHORT');
  }

  // 1. Xác thực OTP của SA
  await verifySuperAdminOtp(db, saActor.admin_id, saOtp);

  // 2. Kiểm tra tài khoản đã tồn tại trong admins chưa
  const existingAdmin = await db.collection(ADMINS_COLLECTION).findOne({ email: cleanEmail });
  if (existingAdmin) {
    throw badRequest('Nhân sự này đã được cấp quyền quản trị trong hệ thống.', 'ADMIN_ALREADY_EXISTS', 409);
  }

  // 3. Khởi tạo tài khoản Admin
  const tempPassword = crypto.randomBytes(8).toString('hex') + '@A1';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(tempPassword, salt);
  const admin_code = `AD-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

  const newAdminDoc = {
    admin_code,
    name: targetName || 'Quản trị viên',
    email: cleanEmail,
    password_hash: passwordHash,
    role,
    status: 'active',
    two_factor_enabled: false,
    two_factor_reset_required: true, // Bắt buộc cài 2FA ở lần đăng nhập đầu
    token_version: 1,
    created_by: new ObjectId(saActor.admin_id),
    created_at: new Date(),
    updated_at: new Date(),
  };

  const insertResult = await db.collection(ADMINS_COLLECTION).insertOne(newAdminDoc);

  // 4. Ghi Audit Log
  await createAuditRecord(db, {
    actor: saActor,
    module: 'rbac',
    module_label: 'Phân quyền Admin',
    action: 'assign_role',
    action_label: 'Cấp quyền Admin',
    outcome: 'success',
    risk_level: 'high',
    target: {
      id: admin_code,
      entity_type: 'admin_user',
      name: newAdminDoc.name,
      meta: `Email: ${cleanEmail} | Vai trò: ${role}`,
    },
    client_context,
    basis: { reason: cleanReason },
    diff: {
      before: {},
      after: { role, status: 'active', email: cleanEmail },
    },
  });

  return {
    success: true,
    adminId: insertResult.insertedId.toString(),
    adminCode: admin_code,
    role,
    message: 'Cấp quyền quản trị viên thành công.',
  };
}

/**
 * Thay đổi / Điều chuyển vai trò Admin (Change Role)
 */
export async function changeAdminRole(db, {
  saActor,
  targetAdminId,
  newRole,
  reason,
  saOtp,
  client_context,
}) {
  const cleanReason = String(reason || '').trim();

  if (!ALLOWED_ADMIN_ROLES.includes(newRole)) {
    throw badRequest('Vai trò mới chỉ có thể là CA, FA hoặc CS.', 'ROLE_FORBIDDEN');
  }
  if (cleanReason.length < 10) {
    throw badRequest('Lý do điều chuyển vai trò phải từ 10 ký tự trở lên.', 'REASON_TOO_SHORT');
  }

  // 1. Xác thực OTP của SA
  await verifySuperAdminOtp(db, saActor.admin_id, saOtp);

  // 2. Tìm admin đích
  const target = await db.collection(ADMINS_COLLECTION).findOne({ _id: new ObjectId(targetAdminId) });
  if (!target) {
    throw badRequest('Không tìm thấy tài khoản quản trị cần điều chuyển.', 'ADMIN_NOT_FOUND', 404);
  }

  if (target.role === 'SA') {
    // Chặn thay đổi Super Admin nếu là SA duy nhất
    const saCount = await db.collection(ADMINS_COLLECTION).countDocuments({ role: 'SA', status: 'active' });
    if (saCount <= 1) {
      throw badRequest('Không thể thay đổi vai trò của Super Admin hoạt động duy nhất còn lại trên sàn.', 'CANNOT_DEMOTE_LAST_SA', 409);
    }
  }

  if (target.role === newRole) {
    throw badRequest('Vai trò mới không được trùng với vai trò hiện tại.', 'ROLE_UNCHANGED');
  }

  const oldRole = target.role;

  // 3. Cập nhật vai trò & Tăng token_version để hủy phiên ngay lập tức
  await db.collection(ADMINS_COLLECTION).updateOne(
    { _id: target._id },
    {
      $set: { role: newRole, updated_at: new Date() },
      $inc: { token_version: 1 },
    }
  );

  // 4. Ghi Audit Log
  await createAuditRecord(db, {
    actor: saActor,
    module: 'rbac',
    module_label: 'Phân quyền Admin',
    action: 'change_role',
    action_label: 'Điều chuyển vai trò',
    outcome: 'success',
    risk_level: 'high',
    target: {
      id: target.admin_code || target._id.toString(),
      entity_type: 'admin_user',
      name: target.name,
      meta: `Email: ${target.email} | ${oldRole} -> ${newRole}`,
    },
    client_context,
    basis: { reason: cleanReason },
    diff: {
      before: { role: oldRole },
      after: { role: newRole },
    },
  });

  return {
    success: true,
    message: `Đã điều chuyển vai trò sang ${newRole} và thu hồi phiên làm việc thành công.`,
  };
}

/**
 * Khóa hoặc Mở khóa tài khoản Admin
 */
export async function toggleAdminLock(db, {
  saActor,
  targetAdminId,
  lock,
  reason,
  saOtp,
  client_context,
}) {
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 10) {
    throw badRequest('Lý do phải có độ dài từ 10 ký tự trở lên.', 'REASON_TOO_SHORT');
  }

  await verifySuperAdminOtp(db, saActor.admin_id, saOtp);

  const target = await db.collection(ADMINS_COLLECTION).findOne({ _id: new ObjectId(targetAdminId) });
  if (!target) throw badRequest('Không tìm thấy tài khoản quản trị.', 'ADMIN_NOT_FOUND', 404);

  if (lock && target.role === 'SA') {
    const saCount = await db.collection(ADMINS_COLLECTION).countDocuments({ role: 'SA', status: 'active' });
    if (saCount <= 1) {
      throw badRequest('Không thể khóa Super Admin hoạt động duy nhất còn lại trên sàn.', 'CANNOT_LOCK_LAST_SA', 409);
    }
  }

  const newStatus = lock ? 'locked' : 'active';
  const oldStatus = target.status;

  await db.collection(ADMINS_COLLECTION).updateOne(
    { _id: target._id },
    {
      $set: { status: newStatus, updated_at: new Date() },
      $inc: { token_version: 1 }, // Hủy phiên nếu khóa
    }
  );

  await createAuditRecord(db, {
    actor: saActor,
    module: 'rbac',
    module_label: 'Phân quyền Admin',
    action: lock ? 'lock_admin' : 'unlock_admin',
    action_label: lock ? 'Khóa tài khoản Quản trị' : 'Mở khóa tài khoản Quản trị',
    outcome: 'success',
    risk_level: lock ? 'high' : 'attention',
    target: {
      id: target.admin_code || target._id.toString(),
      entity_type: 'admin_user',
      name: target.name,
      meta: `Email: ${target.email}`,
    },
    client_context,
    basis: { reason: cleanReason },
    diff: {
      before: { status: oldStatus },
      after: { status: newStatus },
    },
  });

  return {
    success: true,
    status: newStatus,
    message: lock ? 'Đã khóa tài khoản và ngắt toàn bộ phiên làm việc.' : 'Đã mở khóa tài khoản thành công.',
  };
}

/**
 * Đặt lại xác thực 2 lớp (Reset 2FA)
 */
export async function resetAdminTwoFactor(db, {
  saActor,
  targetAdminId,
  reason,
  saOtp,
  client_context,
}) {
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 10) {
    throw badRequest('Lý do đặt lại 2FA phải từ 10 ký tự trở lên.', 'REASON_TOO_SHORT');
  }

  await verifySuperAdminOtp(db, saActor.admin_id, saOtp);

  const target = await db.collection(ADMINS_COLLECTION).findOne({ _id: new ObjectId(targetAdminId) });
  if (!target) throw badRequest('Không tìm thấy tài khoản quản trị.', 'ADMIN_NOT_FOUND', 404);

  await db.collection(ADMINS_COLLECTION).updateOne(
    { _id: target._id },
    {
      $set: {
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_reset_required: true,
        backup_codes: [],
        updated_at: new Date(),
      },
      $inc: { token_version: 1 },
    }
  );

  await createAuditRecord(db, {
    actor: saActor,
    module: 'rbac',
    module_label: 'Phân quyền Admin',
    action: 'reset_2fa',
    action_label: 'Đặt lại xác thực 2 lớp (Reset 2FA)',
    outcome: 'success',
    risk_level: 'high',
    target: {
      id: target.admin_code || target._id.toString(),
      entity_type: 'admin_user',
      name: target.name,
      meta: `Email: ${target.email}`,
    },
    client_context,
    basis: { reason: cleanReason },
    diff: {
      before: { two_factor_enabled: target.two_factor_enabled },
      after: { two_factor_enabled: false, two_factor_reset_required: true },
    },
  });

  return {
    success: true,
    message: 'Đã xóa cấu hình 2FA cũ. Nhân viên bắt buộc quét lại mã QR ở lần đăng nhập tiếp theo.',
  };
}

