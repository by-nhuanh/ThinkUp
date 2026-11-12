import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { getMongoDb, sendEmail } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';

export const COLLECTION_COMPLAINTS = 'support_complaints';
export const COLLECTION_ORDERS = 'orders';
export const COLLECTION_ENROLLMENTS = 'user_enrollments';
export const COLLECTION_CERTIFICATES = 'certificates';
export const COLLECTION_INSTRUCTOR_WALLETS = 'instructor_wallets';
export const COLLECTION_AUDIT_LOGS = 'admin_audit_logs';

const bad = (message, status = 400, code = 'COMPLAINT_INVALID', field) =>
  Object.assign(new Error(message), { message, status, code, ...(field ? { field } : {}) });

const database = async (options = {}) => options.db || await getMongoDb();

export async function ensureComplaintIndexes(db) {
  try {
    const col = db.collection(COLLECTION_COMPLAINTS);
    await Promise.all([
      col.createIndex({ complaint_code: 1 }, { unique: true }),
      col.createIndex({ status: 1, due_at: 1 }),
      col.createIndex({ amount: -1 }),
      col.createIndex({ is_high_risk: 1 }),
      col.createIndex({ 'claimant.email': 1 }),
      col.createIndex({ 'respondent.email': 1 }),
      col.createIndex({ created_at: -1 }),
    ]);
  } catch {
    // Không chặn nếu index đã tồn tại
  }
}

/**
 * 1. Khối 1: Lấy 4 thẻ KPI Điểm nóng Khiếu nại (AC-01 -> AC-04)
 */
export async function getComplaintSummary(options = {}) {
  const db = await database(options);
  const col = db.collection(COLLECTION_COMPLAINTS);
  const now = new Date(options.now ?? Date.now());

  const [pendingCount, highRiskCount, totalRefundRes, slaBreachedCount] = await Promise.all([
    // Khiếu nại tồn đọng: status chưa phải resolved hoặc dismissed (AC-01)
    col.countDocuments({ status: { $in: ['pending', 'reviewing', 'waiting_instructor'] } }),
    // Nguy cơ cao: amount > 5.000.000 hoặc gắn cờ is_high_risk (AC-02)
    col.countDocuments({
      status: { $in: ['pending', 'reviewing', 'waiting_instructor'] },
      $or: [{ is_high_risk: true }, { amount: { $gt: 5000000 } }],
    }),
    // Tổng số tiền yêu cầu hoàn từ các hồ sơ đang thụ lý (AC-03)
    col.aggregate([
      { $match: { status: { $in: ['pending', 'reviewing', 'waiting_instructor'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray(),
    // Vi phạm SLA: hồ sơ chưa đóng và thời gian due_at < now (AC-04)
    col.countDocuments({
      status: { $in: ['pending', 'reviewing', 'waiting_instructor'] },
      due_at: { $lt: now },
    }),
  ]);

  return {
    pendingCount,
    highRiskCount,
    totalRefundRequestedAmount: totalRefundRes[0]?.total || 0,
    slaBreachedCount,
  };
}

/**
 * 2. Khối 2 & 3: Lấy danh sách án khiếu nại và sự cố với bộ lọc đa diện (AC-05 -> AC-15)
 */
export async function listComplaints(actor, query = {}, options = {}) {
  const db = await database(options);
  const col = db.collection(COLLECTION_COMPLAINTS);
  const now = new Date(options.now ?? Date.now());

  const page = Number(query.page || 1);
  const limit = Math.min(Math.max(Number(query.limit || query.pageSize || 10), 1), 100);
  if (!Number.isInteger(page) || page < 1) throw bad('Trang không hợp lệ.');

  const filter = {};

  // Tìm kiếm theo Mã thụ lý (CP-...), Tên học viên, Tên giảng viên (AC-05)
  if (query.q && typeof query.q === 'string' && query.q.trim()) {
    const qStr = query.q.trim();
    const regex = new RegExp(qStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { complaint_code: regex },
      { 'claimant.fullName': regex },
      { 'claimant.email': regex },
      { 'respondent.fullName': regex },
      { 'respondent.email': regex },
    ];
  }

  // Lọc Loại khiếu nại (AC-06)
  if (query.disputeType && query.disputeType !== 'all') {
    filter.dispute_type = query.disputeType.trim();
  }

  // Lọc Tình trạng (AC-07)
  if (query.status && query.status !== 'all') {
    filter.status = query.status.trim();
  }

  // Lọc Hạn mức tiền (AC-08)
  // Dưới 1 triệu: < 1.000.000 đ
  // Từ 1-5 triệu: 1.000.000 đ <= số tiền <= 5.000.000 đ
  // Trên 5 triệu: > 5.000.000 đ
  if (query.amountRange && query.amountRange !== 'all') {
    if (query.amountRange === 'under_1m') {
      filter.amount = { $lt: 1000000 };
    } else if (query.amountRange === '1m_to_5m') {
      filter.amount = { $gte: 1000000, $lte: 5000000 };
    } else if (query.amountRange === 'above_5m') {
      filter.amount = { $gt: 5000000 };
    }
  }

  // Lọc theo thời gian (AC-10)
  if (query.from || query.to) {
    filter.created_at = {};
    if (query.from) {
      const fromDate = new Date(query.from);
      if (!Number.isNaN(fromDate.getTime())) filter.created_at.$gte = fromDate;
    }
    if (query.to) {
      const toDate = new Date(query.to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        filter.created_at.$lte = toDate;
      }
    }
    if (Object.keys(filter.created_at).length === 0) delete filter.created_at;
  }

  // RBAC: Finance Admin chỉ xem các khiếu nại thanh toán/hoàn tiền
  if (actor.role === 'FA') {
    filter.dispute_type = { $in: ['refund', 'transaction_error'] };
  }

  // Sắp xếp ưu tiên: Hồ sơ số tiền lớn và thời gian SLA còn lại ít nhất lên đầu (AC-14)
  const sort = {
    amount: -1,
    due_at: 1,
    created_at: -1,
  };

  const [docs, total] = await Promise.all([
    col.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  const items = docs.map((doc) => {
    const dueTime = new Date(doc.due_at).getTime();
    const diffMs = dueTime - now.getTime();
    const isOverdue = diffMs < 0 && !['resolved', 'dismissed'].includes(doc.status);
    const hours = Math.floor(Math.abs(diffMs) / 3600000);
    const minutes = Math.floor((Math.abs(diffMs) % 3600000) / 60000);

    let slaText;
    if (['resolved', 'dismissed'].includes(doc.status)) {
      slaText = 'Đã giải quyết';
    } else if (isOverdue) {
      slaText = `Trễ ${hours}h ${minutes}m`;
    } else {
      slaText = `Còn ${hours}h ${minutes}m`;
    }

    return {
      id: doc._id,
      complaintCode: doc.complaint_code,
      claimant: doc.claimant,
      respondent: doc.respondent,
      disputeType: doc.dispute_type,
      disputeTypeLabel: getDisputeTypeLabel(doc.dispute_type),
      amount: doc.amount,
      status: doc.status,
      statusLabel: getStatusLabel(doc.status),
      evidence: {
        count: Array.isArray(doc.evidence) ? doc.evidence.length : 0,
        files: doc.evidence || [],
      },
      sla: {
        dueAt: doc.due_at,
        isOverdue,
        isWarning: !isOverdue && diffMs <= 3600000 && !['resolved', 'dismissed'].includes(doc.status), // Còn <= 1h cảnh báo đỏ
        text: slaText,
      },
      createdAt: doc.created_at,
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * 3. Khối 4: Xem hồ sơ đối soát 3 bên toàn màn hình (AC-16, AC-17)
 */
export async function getComplaintDetail(actor, complaintId, options = {}) {
  const db = await database(options);
  const col = db.collection(COLLECTION_COMPLAINTS);
  const doc = await col.findOne({
    $or: [{ _id: complaintId }, { complaint_code: complaintId }],
  });
  if (!doc) throw bad('Không tìm thấy hồ sơ khiếu nại.', 404, 'COMPLAINT_NOT_FOUND');

  if (actor.role === 'FA' && !['refund', 'transaction_error'].includes(doc.dispute_type)) {
    throw bad('Bạn không có quyền truy cập hồ sơ khiếu nại này.', 403, 'ADMIN_FORBIDDEN');
  }

  // Tải thông tin đơn hàng và đối chiếu tự động nếu có order_id
  let systemCheck = doc.system_check || {
    progressPercent: 0,
    orderDate: doc.created_at,
    isRefundWindowExpired7d: false,
  };

  if (doc.order_id) {
    const orderDoc = await db.collection(COLLECTION_ORDERS).findOne({
      $or: [{ order_id: doc.order_id }, { _id: doc.order_id }],
    });
    if (orderDoc) {
      const orderDate = new Date(orderDoc.paid_at || orderDoc.created_at);
      const isExpired = Date.now() - orderDate.getTime() > 7 * 24 * 3600000;
      systemCheck = {
        ...systemCheck,
        orderDate,
        isRefundWindowExpired7d: isExpired,
        totalPaid: orderDoc.amount || orderDoc.actual_paid_amount || doc.amount,
      };
    }
  }

  return {
    id: doc._id,
    complaintCode: doc.complaint_code,
    sourceTicketId: doc.source_ticket_id || null,
    claimant: doc.claimant,
    respondent: doc.respondent,
    course: doc.course || { id: doc.course_id, name: 'Khóa học liên quan' },
    orderId: doc.order_id || null,
    disputeType: doc.dispute_type,
    amount: doc.amount,
    status: doc.status,
    evidence: doc.evidence || [],
    learnerStatement: doc.learner_statement,
    instructorStatement: doc.instructor_statement || null,
    instructorDeadline: doc.instructor_deadline || null,
    instructorObligationBreached: Boolean(doc.instructor_obligation_breached),
    walletFrozen: Boolean(doc.wallet_frozen),
    systemCheck,
    resolution: doc.resolution || null,
    createdAt: doc.created_at,
    dueAt: doc.due_at,
  };
}

/**
 * 4. Khối 5: Lệnh yêu cầu giảng viên giải trình (AC-23 -> AC-27)
 */
export async function requestInstructorExplanation(actor, complaintId, payload = {}, options = {}) {
  const db = await database(options);
  const col = db.collection(COLLECTION_COMPLAINTS);
  const now = new Date(options.now ?? Date.now());

  const doc = await col.findOne({ $or: [{ _id: complaintId }, { complaint_code: complaintId }] });
  if (!doc) throw bad('Không tìm thấy hồ sơ khiếu nại.', 404, 'COMPLAINT_NOT_FOUND');

  const deadlineHours = Number(payload.deadlineHours) === 12 ? 12 : 24;
  const deadline = new Date(now.getTime() + deadlineHours * 3600000);
  const freezeWallet = Boolean(payload.freezeInstructorWallet);

  const updates = {
    status: 'waiting_instructor',
    instructor_deadline: deadline,
    wallet_frozen: freezeWallet,
    explanation_requested_at: now,
    admin_instruction_note: String(payload.adminInstructionNote || '').trim(),
    updated_at: now,
  };

  // Đóng băng tiền ví giảng viên nếu chọn (AC-25)
  if (freezeWallet && doc.respondent?.id) {
    await db.collection(COLLECTION_INSTRUCTOR_WALLETS).updateOne(
      { instructor_id: String(doc.respondent.id) },
      {
        $inc: { frozen_amount: doc.amount * 0.7 },
        $set: { updated_at: now },
      },
      { upsert: true }
    );
  }

  await col.updateOne({ _id: doc._id }, { $set: updates });

  // Gửi email hỏa tốc và thông báo cho giảng viên (AC-26)
  if (doc.respondent?.email) {
    try {
      const emailSender = options.sendEmail || sendEmail;
      await emailSender({
        to: doc.respondent.email,
        subject: `[ThinkUp - Khẩn cấp] Yêu cầu giải trình khiếu nại #${doc.complaint_code}`,
        text: `Kính gửi Giảng viên ${doc.respondent.fullName},\n\nBan Quản Trị yêu cầu bạn gửi văn bản giải trình đối với khiếu nại của học viên trong vòng ${deadlineHours} giờ làm việc (Hạn chót: ${deadline.toISOString()}).\nNội dung khiếu nại: "${doc.learner_statement}"\nChỉ đạo từ BQT: "${payload.adminInstructionNote || 'Vui lòng phản hồi sớm.'}"\n\nTrân trọng,\nBan Quản Trị ThinkUp`,
      });
    } catch {
      // Bỏ qua lỗi gửi mail
    }
  }

  return { success: true, status: 'waiting_instructor', deadline, walletFrozen: freezeWallet };
}

/**
 * 5. Khối 6: Phê duyệt hoàn tiền và thu hồi khóa học (AC-28 -> AC-33)
 */
export async function resolveRefund(actor, complaintId, payload = {}, options = {}) {
  const db = await database(options);
  const col = db.collection(COLLECTION_COMPLAINTS);
  const now = new Date(options.now ?? Date.now());

  const doc = await col.findOne({ $or: [{ _id: complaintId }, { complaint_code: complaintId }] });
  if (!doc) throw bad('Không tìm thấy hồ sơ khiếu nại.', 404, 'COMPLAINT_NOT_FOUND');

  // Điều kiện kiểm tra kết luận tối thiểu 30 ký tự (AC-19)
  const conclusionNote = String(payload.conclusionNote || '').trim();
  if (conclusionNote.length < 30) {
    throw bad('Nội dung kết luận phân xử phải có tối thiểu 30 ký tự.', 400, 'NOTE_TOO_SHORT', 'conclusionNote');
  }

  // Điều kiện ý kiến giảng viên (AC-18)
  if (!doc.instructor_statement && !doc.instructor_obligation_breached) {
    // Nếu quá hạn mà giảng viên không phản hồi -> gắn cờ vi phạm nghĩa vụ và cho phép xử thắng (AC-27)
    if (doc.instructor_deadline && new Date(doc.instructor_deadline).getTime() < now.getTime()) {
      doc.instructor_obligation_breached = true;
    } else {
      throw bad('Giảng viên chưa gửi văn bản giải trình. Không thể ban hành phán quyết.', 400, 'INSTRUCTOR_STATEMENT_REQUIRED');
    }
  }

  const isFullRefund = payload.refundType !== 'partial';
  const refundAmount = isFullRefund ? doc.amount : Number(payload.refundAmount || doc.amount);
  if (!refundAmount || refundAmount <= 0) throw bad('Số tiền hoàn trả không hợp lệ.', 400, 'AMOUNT_INVALID');

  // Tính toán thu hồi dòng tiền: 70% ví GV, 30% sàn (AC-29)
  const instructorDeduction = Math.round(refundAmount * 0.7);
  const platformDeduction = refundAmount - instructorDeduction;

  const resolution = {
    type: 'refund',
    refundMode: isFullRefund ? 'full' : 'partial',
    refundAmount,
    instructorDeduction,
    platformDeduction,
    revokeAccess: Boolean(payload.revokeAccess),
    revokeCertificate: Boolean(payload.revokeCertificate),
    conclusionNote,
    decidedBy: {
      id: String(actor.id || actor._id || actor.adminId),
      name: actor.fullName || actor.name || 'Ban Quản Trị',
      role: actor.role,
    },
    decidedAt: now,
  };

  // Thu hồi quyền truy cập khóa học (AC-30)
  if (payload.revokeAccess && doc.claimant?.id && doc.course_id) {
    await db.collection(COLLECTION_ENROLLMENTS).deleteOne({
      user_id: String(doc.claimant.id),
      course_id: String(doc.course_id),
    });
  }

  // Hủy chứng chỉ nếu đã cấp (AC-31)
  if (payload.revokeCertificate && doc.claimant?.id && doc.course_id) {
    await db.collection(COLLECTION_CERTIFICATES).updateOne(
      { user_id: String(doc.claimant.id), course_id: String(doc.course_id) },
      { $set: { status: 'revoked', revoked_at: now, revocation_reason: 'Hoàn tiền khiếu nại' } }
    );
  }

  // Khấu trừ trực tiếp ví giảng viên (AC-29)
  if (doc.respondent?.id) {
    await db.collection(COLLECTION_INSTRUCTOR_WALLETS).updateOne(
      { instructor_id: String(doc.respondent.id) },
      {
        $inc: { balance: -instructorDeduction },
        $set: { updated_at: now },
      },
      { upsert: true }
    );
  }

  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: 'resolved',
        resolved_at: now,
        resolution,
        updated_at: now,
      },
    }
  );

  // Gửi email kết luận phân xử chính thức có chữ ký số (AC-21)
  try {
    const emailSender = options.sendEmail || sendEmail;
    const emailBody = `Ban Quản Trị ThinkUp thông báo kết luận phân xử khiếu nại #${doc.complaint_code}:\nPhương án: Chấp thuận hoàn tiền (${refundAmount.toLocaleString('vi-VN')} đ)\nKết luận: "${conclusionNote}"\n\nChữ ký điện tử: ThinkUp Dispute Resolution Board`;
    if (doc.claimant?.email) await emailSender({ to: doc.claimant.email, subject: `[ThinkUp] Phán quyết khiếu nại #${doc.complaint_code}`, text: emailBody });
    if (doc.respondent?.email) await emailSender({ to: doc.respondent.email, subject: `[ThinkUp] Phán quyết khiếu nại #${doc.complaint_code}`, text: emailBody });
  } catch {
    // Bỏ qua lỗi gửi mail
  }

  // Ghi nhận audit log (AC-21)
  await recordDisputeAudit(db, actor, 'RESOLVE_REFUND', doc.complaint_code, resolution);

  return { success: true, status: 'resolved', resolution };
}

/**
 * 6. Khối 7: Bác bỏ khiếu nại kèm căn cứ điều khoản (AC-34 -> AC-38)
 */
export async function dismissComplaint(actor, complaintId, payload = {}, options = {}) {
  const db = await database(options);
  const col = db.collection(COLLECTION_COMPLAINTS);
  const now = new Date(options.now ?? Date.now());

  const doc = await col.findOne({ $or: [{ _id: complaintId }, { complaint_code: complaintId }] });
  if (!doc) throw bad('Không tìm thấy hồ sơ khiếu nại.', 404, 'COMPLAINT_NOT_FOUND');

  const rejectionBasis = String(payload.rejectionBasis || '').trim();
  if (!rejectionBasis) {
    throw bad('Vui lòng chọn căn cứ bác bỏ theo điều khoản.', 400, 'BASIS_REQUIRED', 'rejectionBasis');
  }

  const explanationNote = String(payload.explanationNote || '').trim();
  if (explanationNote.length < 30) {
    throw bad('Văn bản giải thích chính thức phải có tối thiểu 30 ký tự.', 400, 'NOTE_TOO_SHORT', 'explanationNote');
  }

  // Giải phóng số tiền đang bị đóng băng trong ví giảng viên (AC-37)
  if (doc.wallet_frozen && doc.respondent?.id) {
    await db.collection(COLLECTION_INSTRUCTOR_WALLETS).updateOne(
      { instructor_id: String(doc.respondent.id) },
      {
        $inc: { frozen_amount: -(doc.amount * 0.7) },
        $set: { updated_at: now },
      }
    );
  }

  // Tặng voucher 20% thiện chí nếu chọn (AC-36)
  let grantedVoucherCode = null;
  if (payload.grantVoucher && doc.claimant?.email) {
    grantedVoucherCode = `TU-CARE-${randomUUID().slice(0, 8).toUpperCase()}`;
    await db.collection('vouchers').insertOne({
      code: grantedVoucherCode,
      description: `Voucher hỗ trợ chăm sóc khách hàng vụ việc ${doc.complaint_code}`,
      discount_type: 'percent',
      discount_value: 20,
      max_discount: 200000,
      assigned_to_email: doc.claimant.email,
      status: 'active',
      created_at: now,
      expires_at: new Date(now.getTime() + 30 * 24 * 3600000),
    });
  }

  const resolution = {
    type: 'dismiss',
    rejectionBasis,
    explanationNote,
    grantedVoucherCode,
    decidedBy: {
      id: String(actor.id || actor._id || actor.adminId),
      name: actor.fullName || actor.name || 'Ban Quản Trị',
      role: actor.role,
    },
    decidedAt: now,
  };

  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: 'dismissed',
        wallet_frozen: false,
        resolution,
        updated_at: now,
      },
    }
  );

  // Gửi email giải thích chính thức kèm căn cứ điều khoản (AC-38)
  try {
    const emailSender = options.sendEmail || sendEmail;
    await emailSender({
      to: doc.claimant.email,
      subject: `[ThinkUp] Thông báo kết quả xem xét khiếu nại #${doc.complaint_code}`,
      text: `Kính gửi ${doc.claimant.fullName},\n\nBan Quản Trị đã xem xét kỹ lưỡng hồ sơ và đối chiếu quy chế sàn. Yêu cầu bồi hoàn của bạn không đủ điều kiện chấp thuận theo căn cứ: ${rejectionBasis}.\nChi tiết: "${explanationNote}"\n${grantedVoucherCode ? `Để hỗ trợ bạn học tập tốt hơn, ThinkUp gửi tặng bạn mã voucher giảm 20%: ${grantedVoucherCode}\n` : ''}\nTrân trọng,\nBan Quản Trị ThinkUp`,
    });
  } catch {
    // Bỏ qua lỗi gửi mail
  }

  // Ghi nhận audit log
  await recordDisputeAudit(db, actor, 'DISMISS_COMPLAINT', doc.complaint_code, resolution);

  return { success: true, status: 'dismissed', resolution };
}

/**
 * 7. Khối 8: Thi hành chế tài kỷ luật giảng viên (AC-39 -> AC-45)
 */
export async function disciplineInstructor(actor, complaintId, payload = {}, options = {}) {
  const db = await database(options);
  const col = db.collection(COLLECTION_COMPLAINTS);
  const now = new Date(options.now ?? Date.now());

  const doc = await col.findOne({ $or: [{ _id: complaintId }, { complaint_code: complaintId }] });
  if (!doc) throw bad('Không tìm thấy hồ sơ khiếu nại.', 404, 'COMPLAINT_NOT_FOUND');

  // Chỉ Super Admin có quyền kỷ luật giảng viên
  if (actor.role !== 'SA') {
    throw bad('Chỉ Super Admin mới có quyền ban hành chế tài kỷ luật đối tác.', 403, 'SUPER_ADMIN_REQUIRED');
  }

  const decisionText = String(payload.decisionText || '').trim();
  if (decisionText.length < 30) {
    throw bad('Văn bản quyết định kỷ luật phải có tối thiểu 30 ký tự.', 400, 'NOTE_TOO_SHORT', 'decisionText');
  }

  const sanctions = Array.isArray(payload.sanctions) ? payload.sanctions : [];
  if (sanctions.length === 0) {
    throw bad('Vui lòng chọn ít nhất một hình thức chế tài xử phạt.', 400, 'SANCTION_REQUIRED');
  }

  // 1. Ghi nhận 1 điểm vi phạm vào hồ sơ giảng viên (AC-41)
  if (sanctions.includes('strike') && doc.respondent?.id) {
    const instFilter = ObjectId.isValid(doc.respondent.id)
      ? { $or: [{ _id: new ObjectId(doc.respondent.id) }, { _id: String(doc.respondent.id) }] }
      : { _id: String(doc.respondent.id) };
    await db.collection('instructors').updateOne(
      instFilter,
      { $inc: { strike_count: 1 }, $set: { updated_at: now } }
    );
  }

  // 2. Tạm ẩn khóa học khỏi sàn trong 14 ngày (AC-42)
  if (sanctions.includes('archive_course_14d') && doc.course_id) {
    const courseFilter = ObjectId.isValid(doc.course_id)
      ? { $or: [{ _id: new ObjectId(doc.course_id) }, { _id: String(doc.course_id) }] }
      : { _id: String(doc.course_id) };
    await db.collection('courses').updateOne(
      courseFilter,
      { $set: { status: 'archived', archived_until: new Date(now.getTime() + 14 * 24 * 3600000) } }
    );
  }

  // 3. Đóng băng quyền rút tiền ví trong 30 ngày (AC-43)
  if (sanctions.includes('freeze_payout_30d') && doc.respondent?.id) {
    await db.collection(COLLECTION_INSTRUCTOR_WALLETS).updateOne(
      { instructor_id: String(doc.respondent.id) },
      { $set: { payout_locked_until: new Date(now.getTime() + 30 * 24 * 3600000) } },
      { upsert: true }
    );
  }

  // 4. Tước quyền giảng viên và chấm dứt hợp đồng (AC-44)
  if (sanctions.includes('terminate_contract') && doc.respondent?.id) {
    const instFilter = ObjectId.isValid(doc.respondent.id)
      ? { $or: [{ _id: new ObjectId(doc.respondent.id) }, { _id: String(doc.respondent.id) }] }
      : { _id: String(doc.respondent.id) };
    await db.collection('instructors').updateOne(
      instFilter,
      { $set: { status: 'terminated', terminated_at: now } }
    );
  }

  const disciplineRecord = {
    sanctions,
    decisionText,
    disciplinedBy: { id: String(actor.id || actor._id || actor.adminId), name: actor.fullName || 'Super Admin' },
    disciplinedAt: now,
  };

  await col.updateOne({ _id: doc._id }, { $set: { discipline: disciplineRecord, updated_at: now } });

  // Gửi email thông báo kỷ luật chính thức (AC-45)
  if (doc.respondent?.email) {
    try {
      const emailSender = options.sendEmail || sendEmail;
      await emailSender({
        to: doc.respondent.email,
        subject: `[ThinkUp - Kỷ luật] Quyết định chế tài vi phạm quy chế giảng viên`,
        text: `Kính gửi Giảng viên ${doc.respondent.fullName},\n\nBan Quản Trị ban hành quyết định thi hành chế tài đối với bạn liên quan đến hồ sơ #${doc.complaint_code}:\nCác biện pháp: ${sanctions.join(', ')}\nCăn cứ: "${decisionText}"\n\nTrân trọng,\nSuper Admin ThinkUp`,
      });
    } catch {
      // Bỏ qua lỗi gửi mail
    }
  }

  // Lưu vào nhật ký kiểm toán hệ thống (AC-45)
  await recordDisputeAudit(db, actor, 'DISCIPLINE_INSTRUCTOR', doc.complaint_code, disciplineRecord);

  return { success: true, complaintCode: doc.complaint_code, discipline: disciplineRecord };
}

/**
 * Ghi vết audit log bất biến
 */
async function recordDisputeAudit(db, actor, action, code, details) {
  try {
    await db.collection(COLLECTION_AUDIT_LOGS).insertOne({
      admin_id: String(actor.id || actor._id || actor.adminId),
      admin_name: actor.fullName || actor.name || 'Quản trị viên',
      role: actor.role,
      action,
      entity_type: 'complaint',
      entity_code: code,
      details,
      created_at: new Date(),
    });
  } catch {
    // Không chặn nghiệp vụ
  }
}

function getDisputeTypeLabel(type) {
  return (
    {
      refund: 'Đòi hoàn tiền',
      transaction_error: 'Lỗi giao dịch',
      technical_issue: 'Sự cố kỹ thuật',
      insult: 'Xúc phạm',
      other: 'Khác',
    }[type] || type
  );
}

function getStatusLabel(status) {
  return (
    {
      pending: 'Chờ xử lý',
      reviewing: 'Đang đối soát',
      waiting_instructor: 'Chờ giải trình',
      resolved: 'Đã giải quyết',
      dismissed: 'Bác bỏ',
    }[status] || status
  );
}

/**
 * Router Express cho Phân hệ Xử lý Khiếu nại và Báo cáo sự cố Admin
 */
export function createAdminComplaintsRouter(express, adminAuthMiddleware) {
  const router = express.Router();
  router.use(adminAuthMiddleware);

  const requireSupportRole = createAdminRoleMiddleware(['SA', 'CS', 'CA', 'FA']);
  router.use(requireSupportRole);

  const handle = (fn, statusCode = 200) => async (req, res, next) => {
    try {
      const data = await fn(req);
      res.status(statusCode).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  // Khối 1: Thống kê KPI Điểm nóng
  router.get('/summary', handle(() => getComplaintSummary()));

  // Khối 2 & 3: Danh sách khiếu nại
  router.get('/', handle((req) => listComplaints(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.query)));

  // Khối 4: Xem hồ sơ đối soát 3 bên
  router.get('/:id', handle((req) => getComplaintDetail(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id)));

  // Khối 5: Lệnh yêu cầu giảng viên giải trình
  router.post('/:id/request-explanation', handle((req) => requestInstructorExplanation(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  // Khối 6: Phê duyệt hoàn tiền và thu hồi
  router.post('/:id/resolve-refund', handle((req) => resolveRefund(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  // Khối 7: Bác bỏ khiếu nại kèm căn cứ điều khoản
  router.post('/:id/dismiss', handle((req) => dismissComplaint(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  // Khối 8: Thi hành chế tài kỷ luật giảng viên
  router.post('/:id/discipline-instructor', handle((req) => disciplineInstructor(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  return router;
}
