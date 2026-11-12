import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { getMongoDb, sendEmail } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';
import {
  COLLECTION_TICKETS,
  COLLECTION_ATTACHMENTS,
  SUPPORT_TOPICS,
} from '../../user/support/support.user.js';

export const COLLECTION_CANNED_RESPONSES = 'support_canned_responses';
export const COLLECTION_COMPLAINTS = 'support_complaints';
export const COLLECTION_ADMIN_USERS = 'admins';
export const COLLECTION_AUDIT_LOGS = 'admin_audit_logs';

const bad = (message, status = 400, code = 'SUPPORT_ADMIN_INVALID', field) =>
  Object.assign(new Error(message), { message, status, code, ...(field ? { field } : {}) });

const database = async (options = {}) => options.db || await getMongoDb();

async function recordTicketAudit(db, actor, action, ticketCode, details) {
  try {
    await db.collection(COLLECTION_AUDIT_LOGS).insertOne({
      admin_id: String(actor.id || actor._id || actor.adminId),
      admin_name: actor.fullName || actor.name || 'Quản trị viên',
      role: actor.role,
      action,
      entity_type: 'ticket',
      entity_code: ticketCode,
      details,
      created_at: new Date(),
    });
  } catch {
    // Không chặn luồng chính
  }
}

export const DEFAULT_CANNED_RESPONSES = Object.freeze([
  {
    code: 'request_screenshot_code',
    title: 'Yêu cầu cung cấp ảnh chụp lỗi màn hình và đoạn code',
    topic_code: 'technical_lab',
    category: 'Lỗi kỹ thuật và Lab',
    content: 'Chào {Tên học viên}, ban vui lòng gửi ảnh chụp toàn bộ màn hình, đoạn code đang thực hiện tại {Mã bài học} và thông báo lỗi chi tiết để đội ngũ kỹ thuật kiểm tra chính xác hơn.',
    tags: ['ảnh chụp', 'syntax error', 'màn hình', 'code'],
  },
  {
    code: 'fix_python_syntax_error',
    title: 'Hướng dẫn sửa lỗi cú pháp Python SyntaxError',
    topic_code: 'technical_lab',
    category: 'Lỗi kỹ thuật và Lab',
    content: 'Chào {Tên học viên}, lỗi SyntaxError thường xuất hiện do thiếu dấu hai chấm (:) ở cuối câu lệnh if/for/def hoặc thụt lề (indentation) không đồng nhất giữa phím Tab và Space. Bạn vui lòng kiểm tra lại dòng code được cảnh báo nhé.',
    tags: ['python', 'syntax error', 'cú pháp'],
  },
  {
    code: 'reset_lab_environment',
    title: 'Hướng dẫn reset môi trường phòng Lab',
    topic_code: 'technical_lab',
    category: 'Lỗi kỹ thuật và Lab',
    content: 'Chào {Tên học viên}, bạn có thể nhấp vào biểu tượng Cài đặt ở góc trên bên phải khung Coding Lab và chọn "Khôi phục môi trường mặc định". Hệ thống sẽ tạo mới container học tập của bạn.',
    tags: ['lab', 'reset', 'môi trường'],
  },
  {
    code: 'reset_password_guide',
    title: 'Hướng dẫn đặt lại mật khẩu',
    topic_code: 'account_security',
    category: 'Tài khoản và Đăng nhập',
    content: 'Chào {Tên học viên}, bạn vui lòng truy cập trang đăng nhập, chọn "Quên mật khẩu" và nhập đúng email đã đăng ký tài khoản để nhận mã OTP thiết lập lại mật khẩu.',
    tags: ['mật khẩu', 'quên mật khẩu', 'đăng nhập'],
  },
  {
    code: 'confirm_payment_transaction',
    title: 'Xác nhận giao dịch thanh toán',
    topic_code: 'payment_refund',
    category: 'Thanh toán',
    content: 'Chào {Tên học viên}, hệ thống đã ghi nhận mã giao dịch của bạn. Đội ngũ Kế toán đang đối soát cùng cổng thanh toán và sẽ cập nhật kích hoạt khóa học trong tối đa 30 phút.',
    tags: ['thanh toán', 'chuyển khoản', 'đối soát'],
  },
]);

export async function ensureSupportAdminIndexes(db) {
  try {
    const tickets = db.collection(COLLECTION_TICKETS);
    await Promise.all([
      tickets.createIndex({ status: 1, created_at: -1 }),
      tickets.createIndex({ topic: 1, priority: 1 }),
      tickets.createIndex({ assignee_id: 1, status: 1 }),
      tickets.createIndex({ response_due_at: 1 }),
      tickets.createIndex({ ticket_code: 1 }),
    ]);
    const canned = db.collection(COLLECTION_CANNED_RESPONSES);
    await canned.createIndex({ code: 1 }, { unique: true });
    await canned.createIndex({ topic_code: 1 });
  } catch (err) {
    // Không chặn ứng dụng nếu index đã tồn tại
  }
}

export async function seedDefaultCannedResponses(db) {
  const collection = db.collection(COLLECTION_CANNED_RESPONSES);
  for (const item of DEFAULT_CANNED_RESPONSES) {
    await collection.updateOne(
      { code: item.code },
      { $setOnInsert: { ...item, created_at: new Date(), updated_at: new Date() } },
      { upsert: true }
    );
  }
}

/**
 * 1. Khối 1: Lấy số liệu KPI thời gian thực
 */
export async function getTicketSummary(options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  // Ngày hiện tại theo múi giờ VN (UTC+7)
  const vnNow = new Date(+now + 7 * 3600000);
  const startOfDayUtc = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate(), -7, 0, 0, 0));
  const endOfDayUtc = new Date(+startOfDayUtc + 24 * 3600000);

  const [
    unassignedCount,
    processingCount,
    overdueCount,
    resolvedTodayCount,
    totalClosed,
    onTimeClosed,
  ] = await Promise.all([
    // Thẻ 1: Chờ tiếp nhận (chưa có nhân viên nhận xử lý)
    tickets.countDocuments({
      status: 'unassigned',
      $or: [{ assignee_id: null }, { assignee_id: { $exists: false } }],
    }),
    // Thẻ 2: Đang xử lý
    tickets.countDocuments({
      status: { $in: ['processing', 'waiting', 'reopened'] },
    }),
    // Thẻ 3: Quá hạn SLA (thời gian chờ thực tế vượt quá 24h từ lúc tạo mà chưa đóng)
    tickets.countDocuments({
      status: { $ne: 'closed' },
      response_due_at: { $lt: now },
    }),
    // Thẻ 4: Đã giải quyết hôm nay
    tickets.countDocuments({
      status: 'closed',
      resolved_at: { $gte: startOfDayUtc, $lt: endOfDayUtc },
    }),
    // Tổng số đã giải quyết để tính tỷ lệ
    tickets.countDocuments({ status: 'closed' }),
    // Số yêu cầu giải quyết đúng hạn (resolved_at <= response_due_at)
    tickets.countDocuments({
      status: 'closed',
      $expr: { $lte: ['$resolved_at', '$response_due_at'] },
    }),
  ]);

  const slaComplianceRate = totalClosed > 0
    ? Math.round((onTimeClosed / totalClosed) * 1000) / 10
    : 100;

  return {
    unassignedCount,
    processingCount,
    overdueCount,
    resolvedTodayCount,
    slaComplianceRate,
  };
}

/**
 * 2. Khối 2 & 3: Danh sách ticket hỗ trợ có bộ lọc đa diện
 */
export async function listAdminTickets(actor, query = {}, options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  const page = Number(query.page || 1);
  const limit = Math.min(Math.max(Number(query.limit || query.pageSize || 10), 1), 100);
  if (!Number.isInteger(page) || page < 1) throw bad('Trang không hợp lệ.');

  const filter = {};

  // Tìm kiếm từ khóa theo mã ticket, tên người gửi, email hoặc nội dung yêu cầu
  if (query.q && typeof query.q === 'string' && query.q.trim()) {
    const qStr = query.q.trim();
    const regex = new RegExp(qStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { ticket_code: regex },
      { full_name: regex },
      { contact_email: regex },
      { message: regex },
    ];
  }

  // Bộ lọc 6 chủ đề
  if (query.topic && typeof query.topic === 'string' && query.topic.trim()) {
    filter.topic = query.topic.trim();
  }

  // Bộ lọc độ ưu tiên (Cao, Trung bình, Thấp)
  if (query.priority && typeof query.priority === 'string' && query.priority.trim()) {
    filter.priority = query.priority.trim();
  }

  // Bộ lọc trạng thái (Chờ tiếp nhận, Đang xử lý, Quá hạn, Đã đóng)
  if (query.status && typeof query.status === 'string' && query.status.trim()) {
    const st = query.status.trim();
    if (st === 'overdue') {
      filter.status = { $ne: 'closed' };
      filter.response_due_at = { $lt: now };
    } else {
      filter.status = st;
    }
  }

  // Lọc theo thẻ KPI Quá hạn SLA (AC-05)
  if (query.overdueOnly === 'true' || query.quick === 'overdue') {
    filter.status = { $ne: 'closed' };
    filter.response_due_at = { $lt: now };
  }

  // Bộ lọc nhân viên phụ trách (Chưa gán, Gán cho tôi, hoặc ID nhân viên)
  if (query.assignee && typeof query.assignee === 'string' && query.assignee.trim()) {
    const ass = query.assignee.trim();
    if (ass === 'unassigned') {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ assignee_id: null }, { assignee_id: { $exists: false } }] });
    } else if (ass === 'me') {
      filter.assignee_id = String(actor.id || actor._id || actor.adminId);
    } else {
      filter.assignee_id = ass;
    }
  }

  // Bộ lọc khoảng thời gian tạo ticket (Hôm nay, 7 ngày qua, Tháng này hoặc Khoảng ngày tùy chọn)
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

  // Phân quyền RBAC cho FA / CA:
  // CA: Chỉ xem các ticket về chuyên môn học tập, kỹ thuật hoặc góp ý
  // FA: Chỉ xem các ticket về thanh toán và hoàn tiền
  if (actor.role === 'FA') {
    filter.topic = 'payment_refund';
  }

  const [docs, total] = await Promise.all([
    tickets
      .find(filter)
      .sort({
        // Đưa các ticket quá hạn lên đầu nếu lọc theo overdue
        ...(query.overdueOnly === 'true' || query.quick === 'overdue' ? { response_due_at: 1 } : { updated_at: -1, created_at: -1 }),
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    tickets.countDocuments(filter),
  ]);

  const items = docs.map((doc) => {
    const end = doc.status === 'closed' && doc.resolved_at ? new Date(doc.resolved_at).getTime() : now.getTime();
    const dueTime = new Date(doc.response_due_at).getTime();
    const diffMs = dueTime - end;
    const isOverdue = diffMs < 0 && doc.status !== 'closed';
    const hours = Math.ceil(Math.abs(diffMs) / 3600000);

    let slaRemainingText;
    if (doc.status === 'closed') {
      slaRemainingText = diffMs >= 0 ? `Đúng hạn (${hours} giờ)` : `Trễ ${hours} giờ`;
    } else {
      slaRemainingText = isOverdue ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`;
    }

    return {
      id: doc._id,
      ticketCode: doc.ticket_code,
      learner: {
        id: doc.user_id || null,
        fullName: doc.full_name,
        email: doc.contact_email,
        phone: doc.contact_phone || 'Chưa cập nhật',
      },
      topic: doc.topic,
      topicLabel: SUPPORT_TOPICS.find((t) => t.code === doc.topic)?.label || doc.topic,
      summary: doc.message,
      priority: doc.priority,
      status: doc.status,
      evidence: {
        count: Array.isArray(doc.attachments) ? doc.attachments.length : 0,
        files: (doc.attachments || []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      },
      sla: {
        dueAt: doc.response_due_at,
        isOverdue,
        remainingHours: hours,
        isWarning: !isOverdue && diffMs < 4 * 3600000 && doc.status !== 'closed',
        text: slaRemainingText,
      },
      assignee: {
        id: doc.assignee_id || null,
        name: doc.assignee_name || (doc.assignee_id ? 'Đang phân công' : 'Chưa gán'),
        department: doc.assigned_department || null,
      },
      createdAt: doc.created_at,
      resolvedAt: doc.resolved_at || null,
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
 * 3. Khối 4: Lấy chi tiết ticket và luồng trao đổi (Thread)
 */
export async function getAdminTicketDetail(actor, ticketId, options = {}) {
  const db = await database(options);
  const doc = await db.collection(COLLECTION_TICKETS).findOne({
    $or: [{ _id: ticketId }, { ticket_code: ticketId }],
  });
  if (!doc) throw bad('Không tìm thấy ticket yêu cầu.', 404, 'TICKET_NOT_FOUND');

  if (actor.role === 'FA' && doc.topic !== 'payment_refund') {
    throw bad('Bạn không có quyền truy cập ticket này.', 403, 'ADMIN_FORBIDDEN');
  }

  const now = new Date(options.now ?? Date.now());
  const dueTime = new Date(doc.response_due_at).getTime();
  const diffMs = dueTime - now.getTime();

  return {
    id: doc._id,
    ticketCode: doc.ticket_code,
    learner: {
      id: doc.user_id,
      fullName: doc.full_name,
      email: doc.contact_email,
      phone: doc.contact_phone || 'Chưa cập nhật',
    },
    topic: doc.topic,
    topicLabel: SUPPORT_TOPICS.find((t) => t.code === doc.topic)?.label || doc.topic,
    priority: doc.priority,
    status: doc.status,
    message: doc.message,
    attachments: doc.attachments || [],
    assignee: {
      id: doc.assignee_id || null,
      name: doc.assignee_name || (doc.assignee_id ? 'Đang phân công' : 'Chưa gán'),
      department: doc.assigned_department || null,
    },
    createdAt: doc.created_at,
    responseDueAt: doc.response_due_at,
    resolvedAt: doc.resolved_at || null,
    sla: {
      isOverdue: diffMs < 0 && doc.status !== 'closed',
      remainingHours: Math.ceil(Math.abs(diffMs) / 3600000),
      isWarning: diffMs > 0 && diffMs < 4 * 3600000 && doc.status !== 'closed',
    },
    thread: (doc.thread || []).map((m) => ({
      id: m.id || randomUUID(),
      senderName: m.sender_name || (m.role === 'agent' ? 'Nhân viên CSKH' : 'Học viên'),
      role: m.role, // 'learner' | 'agent' | 'system'
      body: m.body,
      internalOnly: Boolean(m.internal_only),
      attachments: m.attachments || [],
      createdAt: m.created_at,
      source: m.source || 'web',
    })),
    resolution: doc.resolution || null,
    escalatedToComplaintId: doc.escalated_to_complaint_id || null,
  };
}

/**
 * 4. Tự động nhận / gán ticket khi bấm Tiếp nhận (AC-32)
 */
export async function claimTicket(actor, ticketId, options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  const doc = await tickets.findOne({ $or: [{ _id: ticketId }, { ticket_code: ticketId }] });
  if (!doc) throw bad('Không tìm thấy ticket.', 404, 'TICKET_NOT_FOUND');

  // Nếu ticket đã có người nhận rồi thì giữ nguyên người đó
  if (doc.assignee_id) {
    return { assigned: false, assigneeId: doc.assignee_id, assigneeName: doc.assignee_name };
  }

  const adminName = actor.fullName || actor.name || 'Quản trị viên';
  await tickets.updateOne(
    { _id: doc._id },
    {
      $set: {
        assignee_id: String(actor.id || actor._id || actor.adminId),
        assignee_name: adminName,
        status: doc.status === 'unassigned' ? 'processing' : doc.status,
        updated_at: now,
      },
    }
  );

  await recordTicketAudit(db, actor, 'CLAIM_TICKET', doc.ticket_code, {
    previous_assignee: doc.assignee_id || null,
    new_assignee: String(actor.id || actor._id || actor.adminId),
    new_assignee_name: adminName,
  });

  return {
    assigned: true,
    assigneeId: String(actor.id || actor._id || actor.adminId),
    assigneeName: adminName,
    status: doc.status === 'unassigned' ? 'processing' : doc.status,
  };
}

/**
 * 5. Gửi phản hồi và giữ mở ticket (AC-41, AC-42)
 */
export async function replyAndKeepOpen(actor, ticketId, payload = {}, options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  const doc = await tickets.findOne({ $or: [{ _id: ticketId }, { ticket_code: ticketId }] });
  if (!doc) throw bad('Không tìm thấy ticket.', 404, 'TICKET_NOT_FOUND');
  if (doc.status === 'closed') throw bad('Ticket đã đóng, không thể gửi phản hồi trực tiếp.', 400, 'TICKET_CLOSED');

  const body = String(payload.body || '').trim();
  if (!body) throw bad('Nội dung phản hồi không được để trống.', 400, 'CONTENT_REQUIRED', 'body');

  const adminName = actor.fullName || actor.name || 'Nhân viên hỗ trợ';
  const messageCard = {
    id: `msg_${randomUUID()}`,
    sender_name: adminName,
    role: 'agent',
    body,
    internal_only: false,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    created_at: now,
    source: 'web',
  };

  await tickets.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: 'waiting', // Chờ học viên phản hồi
        updated_at: now,
        first_responded_at: doc.first_responded_at || now,
      },
      $push: { thread: messageCard },
    }
  );

  // Gửi email thông báo cho học viên
  if (doc.contact_email) {
    try {
      const emailSender = options.sendEmail || sendEmail;
      await emailSender({
        to: doc.contact_email,
        subject: `[ThinkUp] Phản hồi yêu cầu hỗ trợ #${doc.ticket_code}`,
        text: `Chào ${doc.full_name},\n\nNhân viên hỗ trợ vừa gửi phản hồi về yêu cầu của bạn:\n"${body}"\n\nBạn có thể trả lời trực tiếp email này hoặc truy cập trang hỗ trợ của ThinkUp để tiếp tục trao đổi.`,
      });
    } catch {
      // Gửi email thất bại không rollback giao dịch
    }
  }

  return { success: true, message: messageCard, status: 'waiting' };
}

/**
 * 6. Khối 5: Điều chuyển nhân viên / phòng ban phụ trách (AC-47 -> AC-62)
 */
export async function transferTicket(actor, ticketId, payload = {}, options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  const doc = await tickets.findOne({ $or: [{ _id: ticketId }, { ticket_code: ticketId }] });
  if (!doc) throw bad('Không tìm thấy ticket.', 404, 'TICKET_NOT_FOUND');

  const internalNote = String(payload.internalNote || '').trim();
  if (internalNote.length < 10) {
    throw bad('Ghi chú bàn giao nội bộ phải có tối thiểu 10 ký tự.', 400, 'NOTE_TOO_SHORT', 'internalNote');
  }

  const department = String(payload.department || '').trim();
  let targetAssigneeId = payload.newAssigneeId ? String(payload.newAssigneeId) : null;
  let targetAssigneeName = payload.newAssigneeName ? String(payload.newAssigneeName) : '';

  // Nếu chọn thuật toán [Tự động gán cho người ít việc nhất] (AC-54)
  if (payload.autoAssign || !targetAssigneeId) {
    const candidate = await getLeastLoadedStaff(db, department);
    if (candidate) {
      targetAssigneeId = String(candidate._id);
      targetAssigneeName = candidate.full_name || candidate.name;
    }
  }

  if (!targetAssigneeId) {
    throw bad('Vui lòng chọn nhân viên tiếp nhận hợp lệ.', 400, 'ASSIGNEE_REQUIRED', 'newAssigneeId');
  }

  const oldAssigneeName = doc.assignee_name || 'Chưa gán';
  const adminActorName = actor.fullName || actor.name || 'Quản trị viên';

  // System Note màu vàng ghi nhận lịch sử bàn giao (AC-61)
  const systemNote = {
    id: `note_${randomUUID()}`,
    sender_name: 'Hệ thống',
    role: 'system',
    body: `Admin [${adminActorName}] đã bàn giao ticket cho [${targetAssigneeName}]. Ghi chú: ${internalNote}`,
    internal_only: true,
    attachments: [],
    created_at: now,
    source: 'internal',
  };

  await tickets.updateOne(
    { _id: doc._id },
    {
      $set: {
        assignee_id: targetAssigneeId,
        assignee_name: targetAssigneeName,
        assigned_department: department || doc.assigned_department,
        status: doc.status === 'unassigned' ? 'processing' : doc.status,
        updated_at: now,
        // Giữ nguyên SLA gốc (AC-60)
      },
      $push: { thread: systemNote },
    }
  );

  await recordTicketAudit(db, actor, 'TRANSFER_TICKET', doc.ticket_code, {
    from_assignee: doc.assignee_id || null,
    from_assignee_name: oldAssigneeName,
    to_assignee: targetAssigneeId,
    to_assignee_name: targetAssigneeName,
    department,
    internal_note: internalNote,
  });

  return {
    success: true,
    newAssigneeId: targetAssigneeId,
    newAssigneeName: targetAssigneeName,
    department,
    systemNote,
  };
}

/**
 * 7. Khối 6: Thăng cấp thành Khiếu nại khẩn cấp (AC-63 -> AC-70)
 */
export async function escalateToComplaint(actor, ticketId, payload = {}, options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  const doc = await tickets.findOne({ $or: [{ _id: ticketId }, { ticket_code: ticketId }] });
  if (!doc) throw bad('Không tìm thấy ticket.', 404, 'TICKET_NOT_FOUND');

  const reason = String(payload.reason || '').trim();
  if (reason.length < 20) {
    throw bad('Căn cứ thăng cấp phải có tối thiểu 20 ký tự.', 400, 'REASON_TOO_SHORT', 'reason');
  }

  const allowedDisputeGroups = [
    'quality_complaint',
    'payment_refund',
    'system_incident',
  ];
  const disputeGroup = String(payload.disputeGroup || 'system_incident').trim();
  if (!allowedDisputeGroups.includes(disputeGroup)) {
    throw bad('Nhóm tranh chấp thăng cấp không hợp lệ.', 400, 'INVALID_DISPUTE_GROUP', 'disputeGroup');
  }

  // Sinh mã thụ lý khiếu nại mới CP-YYYY-XXXX (AC-66)
  const year = now.getFullYear();
  const randomSeq = String(Math.floor(1000 + Math.random() * 9000));
  const complaintCode = `CP-${year}-${randomSeq}`;

  // Thiết lập hạn chót mới SLA = thời điểm thăng cấp + 4 giờ làm việc (AC-68)
  const newDueAt = new Date(now.getTime() + 4 * 3600000);

  const complaintRecord = {
    _id: `cmp_${randomUUID()}`,
    complaint_code: complaintCode,
    source_ticket_id: doc._id,
    source_ticket_code: doc.ticket_code,
    claimant: {
      id: doc.user_id,
      fullName: doc.full_name,
      email: doc.contact_email,
      phone: doc.contact_phone || '',
    },
    dispute_group: disputeGroup,
    escalation_reason: reason,
    priority: 'critical',
    status: 'reviewing',
    created_at: now,
    due_at: newDueAt,
    escalated_by: {
      id: String(actor.id || actor._id || actor.adminId),
      name: actor.fullName || actor.name || 'Quản trị viên',
    },
    // Bảo tồn toàn bộ lịch sử luồng trò chuyện Thread cũ (AC-67)
    thread: doc.thread || [],
  };

  await db.collection(COLLECTION_COMPLAINTS).insertOne(complaintRecord);

  // Cập nhật ticket gốc liên kết với complaint
  const systemNote = {
    id: `note_${randomUUID()}`,
    sender_name: 'Hệ thống',
    role: 'system',
    body: `Sự vụ đã được thăng cấp sang Khiếu nại khẩn (${complaintCode}). SLA rút ngắn xuống còn 4 giờ làm việc. Căn cứ: ${reason}`,
    internal_only: true,
    attachments: [],
    created_at: now,
    source: 'internal',
  };

  await tickets.updateOne(
    { _id: doc._id },
    {
      $set: {
        escalated_to_complaint_id: complaintCode,
        response_due_at: newDueAt,
        priority: 'critical',
        updated_at: now,
      },
      $push: { thread: systemNote },
    }
  );

  await recordTicketAudit(db, actor, 'ESCALATE_TICKET', doc.ticket_code, {
    complaint_code: complaintCode,
    dispute_group: disputeGroup,
    reason,
    new_due_at: newDueAt,
  });

  return {
    success: true,
    complaintCode,
    complaintId: complaintRecord._id,
    newDueAt,
  };
}

/**
 * 8. Khối 7: Thư viện Câu trả lời mẫu (Canned Responses) (AC-71 -> AC-79)
 */
export async function listCannedResponses(query = {}, options = {}) {
  const db = await database(options);
  const collection = db.collection(COLLECTION_CANNED_RESPONSES);

  // Đảm bảo có dữ liệu mặc định ban đầu nếu collection trống
  const count = await collection.countDocuments();
  if (count === 0) {
    await seedDefaultCannedResponses(db);
  }

  const filter = {};
  if (query.topic && query.topic !== 'all') {
    filter.topic_code = query.topic;
  }
  if (query.q && typeof query.q === 'string' && query.q.trim()) {
    const qRegex = new RegExp(query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { title: qRegex },
      { content: qRegex },
      { tags: qRegex },
    ];
  }

  const items = await collection.find(filter).sort({ title: 1 }).toArray();
  return items.map((item) => ({
    id: item._id,
    code: item.code,
    title: item.title,
    topicCode: item.topic_code,
    category: item.category,
    content: item.content,
    tags: item.tags || [],
  }));
}

/**
 * 9. Khối 8: Xác nhận giải quyết và đóng Ticket (AC-80 -> AC-90)
 */
export async function resolveAndCloseTicket(actor, ticketId, payload = {}, options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  const doc = await tickets.findOne({ $or: [{ _id: ticketId }, { ticket_code: ticketId }] });
  if (!doc) throw bad('Không tìm thấy ticket.', 404, 'TICKET_NOT_FOUND');

  const allowedCategories = [
    'code_guidance', // Đã hướng dẫn sửa lỗi code
    'lab_fixed', // Đã sửa lỗi môi trường Lab trên máy chủ
    'information_restored', // Đã cấp lại thông tin
    'no_response', // Học viên không phản hồi sau 48h
    'other',
  ];

  const resolutionCategory = String(payload.resolutionCategory || '').trim();
  if (!allowedCategories.includes(resolutionCategory)) {
    throw bad('Vui lòng chọn phân loại kết quả giải quyết hợp lệ.', 400, 'CATEGORY_REQUIRED', 'resolutionCategory');
  }

  const adminName = actor.fullName || actor.name || 'Nhân viên CSKH';
  const finalReply = String(payload.finalReplyBody || '').trim();

  const updates = {
    status: 'closed',
    resolved_at: now,
    updated_at: now,
    resolution: {
      category: resolutionCategory,
      internalSolutionNote: String(payload.internalSolutionNote || '').trim(),
      sendCsatSurvey: Boolean(payload.sendCsatSurvey),
      resolvedBy: String(actor.id || actor._id || actor.adminId),
      resolvedByName: adminName,
      resolvedAt: now,
    },
  };

  const pushItems = [];
  if (finalReply) {
    pushItems.push({
      id: `msg_${randomUUID()}`,
      sender_name: adminName,
      role: 'agent',
      body: finalReply,
      internal_only: false,
      attachments: [],
      created_at: now,
      source: 'web',
    });
  }

  const systemCloseNote = {
    id: `note_${randomUUID()}`,
    sender_name: 'Hệ thống',
    role: 'system',
    body: `Ticket đã được đóng bởi ${adminName}. Phân loại: ${resolutionCategory}`,
    internal_only: true,
    attachments: [],
    created_at: now,
    source: 'internal',
  };
  pushItems.push(systemCloseNote);

  await tickets.updateOne(
    { _id: doc._id },
    {
      $set: updates,
      $push: { thread: { $each: pushItems } },
    }
  );

  await recordTicketAudit(db, actor, 'RESOLVE_TICKET', doc.ticket_code, {
    category: resolutionCategory,
    internal_solution_note: updates.resolution.internalSolutionNote,
    csat_sent: updates.resolution.sendCsatSurvey,
  });

  // Gửi email giải quyết thành công và khảo sát CSAT (AC-89)
  if (payload.sendCsatSurvey && doc.contact_email) {
    try {
      const emailSender = options.sendEmail || sendEmail;
      await emailSender({
        to: doc.contact_email,
        subject: `[ThinkUp] Yêu cầu #${doc.ticket_code} đã được giải quyết - Khảo sát mức độ hài lòng`,
        text: `Chào ${doc.full_name},\n\nYêu cầu hỗ trợ #${doc.ticket_code} của bạn đã được hoàn tất xử lý.\nVui lòng dành 1 phút đánh giá độ hài lòng của bạn từ 1 đến 5 sao theo liên kết sau: https://thinkup.vn/support/csat?ticket=${doc.ticket_code}\n\nTrân trọng,\nĐội ngũ ThinkUp Support`,
      });
    } catch {
      // Bỏ qua lỗi gửi mail
    }
  }

  return {
    success: true,
    status: 'closed',
    resolvedAt: now,
    resolution: updates.resolution,
  };
}

/**
 * 10. Tiếp nhận Webhook phản hồi từ Inbound Email (AC-43, AC-44)
 */
export async function processInboundEmailReply(payload = {}, options = {}) {
  const db = await database(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const now = new Date(options.now ?? Date.now());

  const ticketCode = String(payload.ticketCode || '').trim();
  const fromEmail = String(payload.fromEmail || '').trim().toLowerCase();
  const rawBody = String(payload.body || '').trim();

  if (!ticketCode || !rawBody) {
    throw bad('Thiếu thông tin bóc tách email phản hồi.', 400, 'INBOUND_DATA_MISSING');
  }

  const doc = await tickets.findOne({ ticket_code: ticketCode });
  if (!doc) throw bad('Không tìm thấy ticket tương ứng.', 404, 'TICKET_NOT_FOUND');

  // Bóc tách nội dung mới, loại bỏ phần trích dẫn thư cũ (AC-43)
  const cleanBody = rawBody
    .split(/-----Original Message-----|Vào lúc.*?viết:|On.*?wrote:/i)[0]
    .trim();

  const newCard = {
    id: `msg_${randomUUID()}`,
    sender_name: doc.full_name,
    role: 'learner',
    body: cleanBody || rawBody,
    internal_only: false,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    created_at: now,
    source: 'email',
  };

  // Mở lại ticket sang trạng thái reopened (AC-44) và đẩy lên đầu danh sách
  await tickets.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: 'reopened',
        updated_at: now,
      },
      $push: { thread: newCard },
    }
  );

  return { success: true, ticketCode, status: 'reopened', message: newCard };
}

/**
 * Helper: Tìm nhân viên hỗ trợ có ít ticket đang xử lý nhất
 */
async function getLeastLoadedStaff(db, department) {
  try {
    const adminCollection = db.collection(COLLECTION_ADMIN_USERS);
    const filter = { is_active: true };
    if (department) {
      filter.department = department;
    }

    const staffList = await adminCollection.find(filter).toArray();
    if (!staffList.length) return null;

    const tickets = db.collection(COLLECTION_TICKETS);
    const workloads = await Promise.all(
      staffList.map(async (staff) => {
        const count = await tickets.countDocuments({
          assignee_id: String(staff._id),
          status: { $in: ['processing', 'waiting', 'reopened'] },
        });
        return { staff, count };
      })
    );

    workloads.sort((a, b) => a.count - b.count);
    return workloads[0]?.staff || null;
  } catch {
    return null;
  }
}

/**
 * Router Express cho Phân hệ Quản lý Ticket Hỗ trợ Admin
 */
export function createAdminTicketsRouter(express, adminAuthMiddleware) {
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

  // Khối 1: Thống kê KPI
  router.get('/summary', handle(() => getTicketSummary()));

  // Khối 7: Danh mục câu trả lời mẫu
  router.get('/canned-responses', handle((req) => listCannedResponses(req.query)));

  // Khối 2 & 3: Danh sách ticket
  router.get('/', handle((req) => listAdminTickets(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.query)));

  // Khối 4: Chi tiết ticket và thread
  router.get('/:id', handle((req) => getAdminTicketDetail(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id)));

  // Khối 3: Tiếp nhận tự động gán
  router.post('/:id/claim', handle((req) => claimTicket(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id)));

  // Khối 4: Gửi phản hồi và giữ mở
  router.post('/:id/reply', handle((req) => replyAndKeepOpen(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  // Khối 5: Điều chuyển nhân viên / ban ngành
  router.post('/:id/transfer', handle((req) => transferTicket(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  // Khối 6: Thăng cấp lên Khiếu nại khẩn
  router.post('/:id/escalate', handle((req) => escalateToComplaint(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  // Khối 8: Xác nhận giải quyết và đóng ticket
  router.post('/:id/resolve', handle((req) => resolveAndCloseTicket(req.adminUser || req.user || { role: req.adminRole, id: req.adminId }, req.params.id, req.body)));

  // Webhook bóc tách email phản hồi
  router.post('/inbound-email', handle((req) => processInboundEmailReply(req.body)));

  return router;
}

