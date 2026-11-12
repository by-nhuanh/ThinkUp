import { Binary, ObjectId } from 'mongodb';
import { randomBytes, randomUUID } from 'node:crypto';
import { getMongoDb } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';

export const PAYOUT_COLLECTION = 'payout_requests';
export const PAYOUT_WALLETS = 'instructor_wallets';
export const PAYOUT_LEDGER = 'instructor_wallet_ledger';
export const PAYOUT_EVIDENCE = 'admin_payout_evidence';
export const LARGE_PAYOUT_THRESHOLD = 20_000_000;
export const TAX_THRESHOLD = 2_000_000;
export const TAX_RATE = 0.10;

export async function ensureAdminPayoutIndexes(db) {
  await db.collection(PAYOUT_COLLECTION).createIndex({ request_id: 1 }, { unique: true, sparse: true });
  await db.collection(PAYOUT_COLLECTION).createIndex({ status: 1, submitted_at: -1 });
  await db.collection(PAYOUT_COLLECTION).createIndex({ instructor_id: 1, submitted_at: -1 });
  await db.collection(PAYOUT_COLLECTION).createIndex({ amount: 1 });
  await db.collection(PAYOUT_WALLETS).createIndex({ instructor_id: 1 }, { unique: true });
  await db.collection(PAYOUT_LEDGER).createIndex({ request_id: 1, action: 1 }, { unique: true });
}

const bad = (message, status = 400, code = 'PAYOUT_INVALID') =>
  Object.assign(new Error(message), { message, status, code });

async function payoutTransaction(db, work) {
  if (!db.client?.startSession) throw bad('CSDL cần hỗ trợ transaction để xử lý payout.', 503, 'PAYOUT_STORAGE_UNAVAILABLE');
  const session = db.client.startSession();
  try { return await session.withTransaction(() => work(session)); }
  finally { await session.endSession(); }
}

function writablePayout(doc) {
  if (doc.is_demo === true) throw bad('Yêu cầu minh họa không được xử lý tài chính.', 409, 'PAYOUT_DEMO_RECORD');
  if (!Number.isSafeInteger(doc.amount) || doc.amount <= 0) throw bad('Số tiền yêu cầu không hợp lệ.', 422, 'PAYOUT_INVALID_AMOUNT');
  if (!doc.instructor_id || !doc.hold_ledger_id) throw bad('Yêu cầu chưa có khoản giữ tiền được xác minh.', 409, 'PAYOUT_HOLD_UNVERIFIED');
}


async function requirePayoutHold(db, doc, session) {
  const hold = await db.collection(PAYOUT_LEDGER).findOne({ _id: doc.hold_ledger_id, request_id: doc.request_id, instructor_id: String(doc.instructor_id), action: 'hold', amount: doc.amount }, { session });
  if (!hold) throw bad('Không tìm thấy bút toán giữ tiền của yêu cầu.', 409, 'PAYOUT_HOLD_UNVERIFIED');
}

export const dateOf = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + '+07:00' : value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const money = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const safe = value => String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&");
const safeHtml = value => safe(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const vietnamMonth = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(date);

export function computeTax(amount) {
  const num = money(amount);
  if (num >= TAX_THRESHOLD) {
    return Math.round(num * TAX_RATE);
  }
  return 0;
}

export function parsePayoutQuery(query = {}) {
  const status = query.status || '';
  if (status && !['pending', 'approved', 'paid', 'rejected'].includes(status)) {
    throw bad('Trạng thái không hợp lệ.');
  }

  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q.length > 100) throw bad('Từ khóa không hợp lệ.');

  const from = query.from ? dateOf(/^\d{4}-\d\d-\d\d$/.test(query.from) ? `${query.from}T00:00:00+07:00` : query.from) : null;
  const to = query.to ? dateOf(/^\d{4}-\d\d-\d\d$/.test(query.to) ? `${query.to}T23:59:59.999+07:00` : query.to) : null;
  if ((query.from && !from) || (query.to && !to) || (from && to && from > to)) {
    throw bad('Khoảng ngày không hợp lệ.');
  }

  const limitMin = query.limitMin !== undefined && query.limitMin !== '' ? Number(query.limitMin) : null;
  const limitMax = query.limitMax !== undefined && query.limitMax !== '' ? Number(query.limitMax) : null;
  if (limitMin !== null && (!Number.isFinite(limitMin) || limitMin < 0)) throw bad('Hạn mức dưới không hợp lệ.');
  if (limitMax !== null && (!Number.isFinite(limitMax) || limitMax < 0)) throw bad('Hạn mức trên không hợp lệ.');
  if (limitMin !== null && limitMax !== null && limitMin > limitMax) throw bad('Khoảng hạn mức không hợp lệ.');

  const page = Number(query.page || 1);
  const pageSize = Number(query.pageSize || 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw bad('Phân trang không hợp lệ.');
  }

  const sort = query.sort || 'newest';
  if (!['newest', 'oldest'].includes(sort)) throw bad('Thứ tự không hợp lệ.');

  const taxOnly = query.taxOnly === 'true' || query.taxOnly === true;
  const paidMonthOnly = query.paidMonthOnly === 'true' || query.paidMonthOnly === true;

  return {
    q: q.toLocaleLowerCase('vi-VN'),
    status,
    limitMin,
    limitMax,
    from,
    to,
    page,
    pageSize,
    sort,
    taxOnly,
    paidMonthOnly,
  };
}

export function payoutView(doc) {
  const amount = money(doc.amount);
  const taxAmount = doc.tax_amount != null ? money(doc.tax_amount) : doc.is_demo === true ? computeTax(amount) : null;
  const netAmount = doc.net_amount != null ? money(doc.net_amount) : taxAmount === null ? null : amount - taxAmount;

  return {
    id: String(doc.request_id || doc._id),
    instructorId: String(doc.instructor_id || ''),
    instructor: doc.instructor_name || '',
    email: doc.email || '',
    amount,
    taxAmount,
    netAmount,
    bank: doc.bank || doc.bank_info?.bank_name || '',
    accountNumber: doc.account_number || doc.bank_info?.account_number || '',
    accountName: doc.account_name || doc.bank_info?.account_name || '',
    availableBalance: money(doc.available_balance),
    verified: Boolean(doc.verified ?? true),
    contractValid: Boolean(doc.contract_valid ?? true),
    disputed: Boolean(doc.disputed ?? false),
    status: doc.status || 'pending',
    submittedAt: dateOf(doc.submitted_at || doc.created_at)?.toISOString() || null,
    approvedAt: dateOf(doc.approved_at)?.toISOString() || null,
    approvedBy: doc.approved_by || null,
    paidAt: dateOf(doc.paid_at)?.toISOString() || null,
    bankReference: doc.bank_reference || null,
    isDemo: doc.is_demo === true,
    rejectionReason: doc.rejection_reason || (doc.rejection?.reason ? `${doc.rejection.reason}: ${doc.rejection.details || ''}`.trim() : null),
    evidenceId: doc.rejection?.evidence_url || null,
  };
}

function filterPayoutRows(rows, filters) {
  const now = new Date();
  const currentMonthKey = vietnamMonth(now);

  return rows.filter(row => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.limitMin !== null && row.amount < filters.limitMin) return false;
    if (filters.limitMax !== null && row.amount > filters.limitMax) return false;
    if (filters.taxOnly && row.taxAmount <= 0) return false;

    if (filters.paidMonthOnly) {
      if (!row.paidAt || vietnamMonth(new Date(row.paidAt)) !== currentMonthKey) return false;
    }

    const checkDate = dateOf(filters.paidMonthOnly && row.paidAt ? row.paidAt : row.submittedAt);
    if (filters.from && (!checkDate || checkDate < filters.from)) return false;
    if (filters.to && (!checkDate || checkDate > filters.to)) return false;

    if (filters.q) {
      const haystack = [row.id, row.instructor, row.email, row.accountNumber].map(val => String(val || '').toLocaleLowerCase('vi-VN'));
      if (!haystack.some(val => val.includes(filters.q))) return false;
    }

    return true;
  }).sort((a, b) => {
    const timeA = a.submittedAt || '';
    const timeB = b.submittedAt || '';
    return filters.sort === 'oldest' ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
  });
}

async function getRawPayouts(db) {
  return await db.collection(PAYOUT_COLLECTION).find({ deleted_at: { $exists: false } }).toArray();
}

export async function listAdminPayouts(query = {}, options = {}) {
  const filters = parsePayoutQuery(query);
  const db = options.db || await getMongoDb();
  const raw = await getRawPayouts(db);
  const rows = filterPayoutRows(raw.map(payoutView), filters);

  const start = (filters.page - 1) * filters.pageSize;
  return {
    success: true,
    items: rows.slice(start, start + filters.pageSize),
    total: rows.length,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export async function getAdminPayoutSummary(query = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const raw = await getRawPayouts(db);
  const now = new Date();
  const currentMonthKey = vietnamMonth(now);
  const summarize = rows => {
    const all = rows.map(payoutView);
    const pending = all.filter(item => item.status === 'pending');
    const largePending = pending.filter(item => item.amount >= LARGE_PAYOUT_THRESHOLD);
    const approved = all.filter(item => item.status === 'approved');
    const paidThisMonth = all.filter(item => item.status === 'paid' && item.paidAt && vietnamMonth(new Date(item.paidAt)) === currentMonthKey);
    return {
      pendingCount: pending.length,
      largePendingCount: largePending.length,
      awaitingDisbursementAmount: approved.reduce((sum, item) => sum + (item.netAmount || 0), 0),
      paidThisMonthAmount: paidThisMonth.reduce((sum, item) => sum + (item.netAmount || 0), 0),
      paidThisMonthCount: paidThisMonth.length,
      taxDeductedThisMonthAmount: paidThisMonth.reduce((sum, item) => sum + (item.taxAmount || 0), 0),
    };
  };
  return { success: true, kpi: summarize(raw), realKpi: summarize(raw.filter(row => row.is_demo !== true)), demoKpi: summarize(raw.filter(row => row.is_demo === true)), containsDemo: raw.some(row => row.is_demo === true) };
}

export async function getAdminPayoutDetail(id, options = {}) {
  if (!id || typeof id !== 'string') throw bad('Mã yêu cầu không hợp lệ.');
  const db = options.db || await getMongoDb();

  const query = ObjectId.isValid(id) && id.length === 24
    ? { $or: [{ request_id: id }, { _id: new ObjectId(id) }] }
    : { request_id: id };

  const doc = await db.collection(PAYOUT_COLLECTION).findOne(query);
  if (!doc) throw bad('Không tìm thấy yêu cầu rút tiền.', 404, 'PAYOUT_NOT_FOUND');

  return {
    success: true,
    payout: payoutView(doc),
  };
}

export async function approveAdminPayout(id, { note = '', adminId, adminRole }, options = {}) {
  if (!id || typeof id !== 'string') throw bad('Mã yêu cầu không hợp lệ.');
  const db = options.db || await getMongoDb();

  const query = ObjectId.isValid(id) && id.length === 24
    ? { $or: [{ request_id: id }, { _id: new ObjectId(id) }] }
    : { request_id: id };

  const doc = await db.collection(PAYOUT_COLLECTION).findOne(query);
  if (!doc) throw bad('Không tìm thấy yêu cầu rút tiền.', 404, 'PAYOUT_NOT_FOUND');

  if (doc.status !== 'pending') {
    throw bad(`Không thể duyệt yêu cầu đang ở trạng thái "${doc.status}".`, 409, 'PAYOUT_STATE_CONFLICT');
  }

  if (doc.is_demo !== true) writablePayout(doc);

  const amount = money(doc.amount);
  if (amount >= LARGE_PAYOUT_THRESHOLD && adminRole !== 'SA') {
    throw bad('Yêu cầu từ 20.000.000 VNĐ trở lên bắt buộc Super Admin phê duyệt.', 403, 'PAYOUT_SUPER_ADMIN_REQUIRED');
  }

  // Thẩm định hồ sơ
  if (doc.verified !== true) throw bad('Hồ sơ định danh của giảng viên chưa được xác minh.', 422, 'PAYOUT_UNVERIFIED_INSTRUCTOR');
  if (doc.contract_valid !== true) throw bad('Hợp đồng đối tác chưa hợp lệ hoặc cần kiểm tra lại.', 422, 'PAYOUT_INVALID_CONTRACT');
  if (doc.disputed !== false) throw bad('Yêu cầu đang có tranh chấp cần xử lý trước.', 422, 'PAYOUT_DISPUTED');
  if (!doc.account_number || !doc.bank || !doc.account_name) throw bad('Thông tin tài khoản nhận tiền chưa đầy đủ.', 422, 'PAYOUT_INCOMPLETE_BANK_INFO');

  const now = new Date();
  const policy = doc.tax_policy_snapshot;
  if (doc.is_demo !== true && (!policy?.contract_id || !dateOf(policy.approved_at) || !Number.isSafeInteger(policy.threshold) || policy.threshold < 0 ||
      !Number.isFinite(policy.rate) || policy.rate < 0 || policy.rate > 1 || !policy.version)) {
    throw bad('Chưa có chính sách thuế được phê duyệt trong hợp đồng.', 409, 'PAYOUT_TAX_POLICY_UNVERIFIED');
  }
  const taxAmount = doc.is_demo === true ? computeTax(amount) : amount >= policy.threshold ? Math.round(amount * policy.rate) : 0;
  const netAmount = amount - taxAmount;

  const updateFields = {
    status: 'approved',
    tax_amount: taxAmount,
    net_amount: netAmount,
    approved_at: now,
    approved_by: String(adminId || 'admin'),
    approval_note: note ? String(note).trim() : null,
    updated_at: now,
  };

  await payoutTransaction(db, async session => {
    if (doc.is_demo !== true) {
      await requirePayoutHold(db, doc, session);
      const wallet = await db.collection(PAYOUT_WALLETS).findOne({ instructor_id: String(doc.instructor_id), frozen_balance: { $gte: amount } }, { session });
      if (!wallet) throw bad('Không xác nhận được số dư đã giữ của giảng viên.', 409, 'PAYOUT_BALANCE_UNAVAILABLE');
    }
    const changed = await db.collection(PAYOUT_COLLECTION).updateOne({ _id: doc._id, status: 'pending', is_demo: doc.is_demo === true ? true : { $ne: true } }, { $set: updateFields }, { session });
    if (changed.matchedCount !== 1) throw bad('Yêu cầu vừa được xử lý.', 409, 'PAYOUT_STATE_CONFLICT');
    await db.collection('admin_audit_logs').insertOne({
    admin_id: ObjectId.isValid(adminId) ? new ObjectId(adminId) : String(adminId || 'admin'),
    action: 'APPROVE_PAYOUT',
    ip: 'unknown',
    user_agent: 'unknown',
    details: {
      entity: { type: 'payout_request', id: doc.request_id || String(doc._id) },
      amount,
      net_amount: netAmount,
      tax_amount: taxAmount,
      previous_status: doc.status,
      new_status: 'approved',
      note,
      correlation_id: randomUUID(),
      is_demo: doc.is_demo === true,
    },
    created_at: now,
    }, { session });
  });

  return {
    success: true,
    message: doc.is_demo === true ? 'Đã duyệt yêu cầu minh họa; không phát sinh giao dịch tài chính.' : 'Đã duyệt yêu cầu rút tiền thành công. Chờ kế toán giải ngân.',
    payout: payoutView({ ...doc, ...updateFields }),
  };
}

export async function rejectAdminPayout(id, { reason, details = '', evidence = '', adminId, adminRole }, options = {}) {
  if (!id || typeof id !== 'string') throw bad('Mã yêu cầu không hợp lệ.');
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw bad('Vui lòng chọn hoặc cung cấp lý do từ chối.', 400, 'PAYOUT_REASON_REQUIRED');
  }
  if (!details || typeof details !== 'string' || !details.trim()) {
    throw bad('Vui lòng nhập giải thích chi tiết khi từ chối.', 400, 'PAYOUT_DETAILS_REQUIRED');
  }

  const db = options.db || await getMongoDb();
  const query = ObjectId.isValid(id) && id.length === 24
    ? { $or: [{ request_id: id }, { _id: new ObjectId(id) }] }
    : { request_id: id };

  const doc = await db.collection(PAYOUT_COLLECTION).findOne(query);
  if (!doc) throw bad('Không tìm thấy yêu cầu rút tiền.', 404, 'PAYOUT_NOT_FOUND');

  if (doc.status !== 'pending') {
    throw bad(`Không thể từ chối yêu cầu đang ở trạng thái "${doc.status}".`, 409, 'PAYOUT_STATE_CONFLICT');
  }
  if (doc.is_demo !== true) writablePayout(doc);
  if (evidence && (!/^pev_[a-f0-9]{32}$/.test(evidence) || !await db.collection(PAYOUT_EVIDENCE).findOne({ _id: evidence, request_id: doc.request_id || String(doc._id), linked_at: null }))) {
    throw bad('Minh chứng không thuộc yêu cầu này hoặc đã được sử dụng.', 400, 'PAYOUT_EVIDENCE_INVALID');
  }

  const now = new Date();
  const fullRejectionReason = `${reason.trim()}: ${details.trim()}`;

  const updateFields = {
    status: 'rejected',
    rejection_reason: fullRejectionReason,
    rejection: {
      reason: reason.trim(),
      details: details.trim(),
      evidence_url: evidence || null,
      rejected_by: String(adminId || 'admin'),
      rejected_at: now,
    },
    updated_at: now,
  };

  const amountToRefund = money(doc.amount);
  await payoutTransaction(db, async session => {
    if (evidence) {
      const linked = await db.collection(PAYOUT_EVIDENCE).updateOne({ _id: evidence, request_id: doc.request_id || String(doc._id), linked_at: null }, { $set: { linked_at: now } }, { session });
      if (linked.matchedCount !== 1) throw bad('Minh chứng vừa được sử dụng.', 409, 'PAYOUT_EVIDENCE_CONFLICT');
    }
    if (doc.is_demo !== true) await requirePayoutHold(db, doc, session);
    const changed = await db.collection(PAYOUT_COLLECTION).updateOne({ _id: doc._id, status: 'pending', is_demo: doc.is_demo === true ? true : { $ne: true } }, { $set: updateFields }, { session });
    if (changed.matchedCount !== 1) throw bad('Yêu cầu vừa được xử lý.', 409, 'PAYOUT_STATE_CONFLICT');
    if (doc.is_demo !== true) {
      const balance = await db.collection(PAYOUT_WALLETS).updateOne(
      { instructor_id: String(doc.instructor_id), frozen_balance: { $gte: amountToRefund }, available_balance: { $gte: 0 } },
      { $inc: { available_balance: amountToRefund, frozen_balance: -amountToRefund } },
      { session }
    );
    if (balance.matchedCount !== 1) throw bad('Không xác nhận được số dư đã giữ của giảng viên.', 409, 'PAYOUT_BALANCE_UNAVAILABLE');
      await db.collection(PAYOUT_LEDGER).insertOne({ request_id: doc.request_id, instructor_id: String(doc.instructor_id), action: 'release', amount: amountToRefund, admin_id: String(adminId), created_at: now }, { session });
    }
    await db.collection('admin_audit_logs').insertOne({
    admin_id: ObjectId.isValid(adminId) ? new ObjectId(adminId) : String(adminId || 'admin'),
    action: 'REJECT_PAYOUT',
    ip: 'unknown',
    user_agent: 'unknown',
    details: {
      entity: { type: 'payout_request', id: doc.request_id || String(doc._id) },
      amount: amountToRefund,
      previous_status: doc.status,
      new_status: 'rejected',
      reason: fullRejectionReason,
      correlation_id: randomUUID(),
      is_demo: doc.is_demo === true,
    },
    created_at: now,
    }, { session });

  // Ghi outbox email thông báo giảng viên (AC-09)
  if (doc.email && doc.is_demo !== true) {
    await db.collection('admin_user_email_outbox').insertOne({
      _id: `payout-rejected:${doc.request_id || String(doc._id)}`,
      to: doc.email,
      subject: `[ThinkUp] Thông báo từ chối yêu cầu rút tiền ${doc.request_id || ''}`,
      text: `Yêu cầu rút tiền ${doc.request_id || String(doc._id)} đã bị từ chối. Lý do: ${fullRejectionReason}. Số tiền ${amountToRefund} VNĐ đã được hoàn về số dư khả dụng. Vui lòng kiểm tra lại thông tin ngân hàng trước khi gửi yêu cầu mới.`,
      status: 'pending',
      attempts: 0,
      next_attempt_at: now,
      created_at: now,
    }, { session });
  }
  });

  return {
    success: true,
    message: doc.is_demo === true ? 'Đã từ chối yêu cầu minh họa; không thay đổi số dư ví.' : 'Đã từ chối yêu cầu rút tiền và hoàn trả số dư đóng băng cho giảng viên.',
    payout: payoutView({ ...doc, ...updateFields }),
  };
}

export async function exportAdminPayouts(query = {}, options = {}) {
  const format = query.format || 'csv';
  if (!['csv', 'excel'].includes(format)) throw bad('Định dạng xuất không hợp lệ.');

  const filters = parsePayoutQuery(query);
  const db = options.db || await getMongoDb();
  const raw = await getRawPayouts(db);
  const rows = filterPayoutRows(raw.map(payoutView), filters);

  const columns = [
    'Mã yêu cầu',
    'Giảng viên',
    'Email',
    'Số tiền yêu cầu',
    'Thuế TNCN',
    'Thực chi',
    'Ngân hàng',
    'Số tài khoản',
    'Tên tài khoản',
    'Ngày gửi',
    'Trạng thái',
    'Dữ liệu minh họa',
  ];

  const statusLabel = s => ({ pending: 'Chờ duyệt', approved: 'Chờ giải ngân', paid: 'Đã giải ngân', rejected: 'Bị từ chối' }[s] || s);

  const values = rows.map(r => [
    r.id,
    r.instructor,
    r.email,
    r.amount,
    r.taxAmount,
    r.netAmount,
    r.bank,
    r.accountNumber,
    r.accountName,
    r.submittedAt || '',
    statusLabel(r.status),
    r.isDemo ? 'Có' : 'Không',
  ]);

  if (format === 'csv') {
    const csvContent = '\uFEFF' + [columns, ...values]
      .map(line => line.map(val => `"${safe(val).replaceAll('"', '""')}"`).join(','))
      .join('\r\n');

    return {
      body: csvContent,
      type: 'text/csv; charset=utf-8',
      filename: `thinkup-rut-tien-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  // Xuất html table giả lập Excel mở trực tiếp
  const htmlRows = [columns, ...values]
    .map(line => `<tr>${line.map(cell => `<td>${safeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  const excelContent = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table>${htmlRows}</table></body></html>`;

  return {
    body: excelContent,
    type: 'application/vnd.ms-excel; charset=utf-8',
    filename: `thinkup-rut-tien-${new Date().toISOString().slice(0, 10)}.xls`,
  };
}

export function createAdminPayoutsRouter(express, adminApiAuth) {
  const router = express.Router();
  const requireAdmin = adminApiAuth;
  const allowFAandSA = createAdminRoleMiddleware(['SA', 'FA']);

  router.use(requireAdmin);

  router.post('/:id/evidence', allowFAandSA, express.raw({ type: ['image/png', 'image/jpeg', 'application/pdf'], limit: '10mb' }), async (req, res, next) => {
    try {
      const db = await getMongoDb();
      const payout = await getAdminPayoutDetail(req.params.id, { db });
      if (payout.payout.status !== 'pending') throw bad('Chỉ tải minh chứng cho yêu cầu chờ duyệt.', 409, 'PAYOUT_STATE_CONFLICT');
      const bytes = req.body;
      const mime = req.headers['content-type'];
      const valid = Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 10 * 1024 * 1024 && (
        (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
        (mime === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
        (mime === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-')
      );
      if (!valid) throw bad('Tệp minh chứng phải là PNG, JPG hoặc PDF hợp lệ, tối đa 10 MB.', 400, 'PAYOUT_EVIDENCE_INVALID');
      const id = `pev_${randomBytes(16).toString('hex')}`;
      let filename;
      try { filename = decodeURIComponent(String(req.headers['x-file-name'] || 'minh-chung')); }
      catch { throw bad('Tên tệp không hợp lệ.', 400, 'PAYOUT_EVIDENCE_INVALID'); }
      filename = filename.slice(0, 150).replace(/[\\/\r\n\0]/g, '');
      await db.collection(PAYOUT_EVIDENCE).insertOne({ _id: id, request_id: payout.payout.id, filename, mime_type: mime, bytes: new Binary(bytes), uploaded_by: String(req.adminId), uploaded_at: new Date(), linked_at: null });
      res.status(201).json({ success: true, evidence: { id, filename } });
    } catch (err) { next(err); }
  });

  router.get('/evidence/:id', allowFAandSA, async (req, res, next) => {
    try {
      const db = await getMongoDb();
      const file = await db.collection(PAYOUT_EVIDENCE).findOne({ _id: req.params.id });
      if (!file) throw bad('Không tìm thấy minh chứng.', 404, 'PAYOUT_EVIDENCE_NOT_FOUND');
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Disposition', `attachment; filename="${file.filename.replace(/["\r\n]/g, '_')}"`);
      res.send(Buffer.from(file.bytes.buffer).subarray(0, file.bytes.position));
    } catch (err) { next(err); }
  });

  // Thống kê 4 thẻ KPI
  router.get('/summary', allowFAandSA, async (req, res, next) => {
    try {
      const summary = await getAdminPayoutSummary(req.query);
      res.json(summary);
    } catch (err) { next(err); }
  });

  // Xuất file
  router.get('/export', allowFAandSA, async (req, res, next) => {
    try {
      const result = await exportAdminPayouts(req.query);
      res.setHeader('Content-Type', result.type);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.body);
    } catch (err) { next(err); }
  });

  // Danh sách
  router.get('/', allowFAandSA, async (req, res, next) => {
    try {
      const list = await listAdminPayouts(req.query);
      res.json(list);
    } catch (err) { next(err); }
  });

  // Chi tiết 1 yêu cầu
  router.get('/:id', allowFAandSA, async (req, res, next) => {
    try {
      const detail = await getAdminPayoutDetail(req.params.id);
      res.json(detail);
    } catch (err) { next(err); }
  });

  // Duyệt (Phân quyền: FA chỉ duyệt < 20M, SA duyệt tất cả)
  router.post('/:id/approve', allowFAandSA, async (req, res, next) => {
    try {
      const result = await approveAdminPayout(req.params.id, {
        note: req.body?.note,
        adminId: req.adminId || req.adminUser?._id,
        adminRole: req.adminRole,
      });
      res.json(result);
    } catch (err) { next(err); }
  });

  // Từ chối (Bắt buộc reason, details)
  router.post('/:id/reject', allowFAandSA, async (req, res, next) => {
    try {
      const result = await rejectAdminPayout(req.params.id, {
        reason: req.body?.reason,
        details: req.body?.details,
        evidence: req.body?.evidence,
        adminId: req.adminId || req.adminUser?._id,
        adminRole: req.adminRole,
      });
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

