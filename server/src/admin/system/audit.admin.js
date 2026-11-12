import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';

export const AUDIT_COLLECTION = 'admin_audit_logs';

/**
 * Tính mã băm Checksum toàn vẹn SHA-256 cho bản ghi Audit Log.
 * Công thức: sha256(log_code + actor_id + target_id + timestamp + diff)
 */
export function calculateAuditChecksum({ log_code, actor_id, target_id, timestamp, diff }) {
  const content = [
    String(log_code || ''),
    String(actor_id || ''),
    String(target_id || ''),
    timestamp instanceof Date ? timestamp.toISOString() : String(timestamp || ''),
    JSON.stringify(diff || {}),
  ].join('|');
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Xác thực tính toàn vẹn của một bản ghi audit log
 */
export function verifyAuditChecksum(doc) {
  if (!doc || !doc.checksum) return false;
  const expected = calculateAuditChecksum({
    log_code: doc.log_code,
    actor_id: doc.actor?.admin_id,
    target_id: doc.target?.id,
    timestamp: doc.timestamp,
    diff: doc.diff,
  });
  return expected === doc.checksum;
}

/**
 * Phân loại mức độ rủi ro (Risk Matrix) theo quy tắc BA:
 * - high: duyệt rút >= 20tr, khóa vĩnh viễn, đổi cấu hình sàn, đổi vai trò admin
 * - attention: duyệt rút < 20tr, khóa tạm thời, sửa bài học
 * - normal: xem báo cáo, tìm kiếm, đăng nhập thông thường
 */
export function determineRiskLevel({ module, action, amount, isPermanentLock }) {
  if (module === 'payout' && (Number(amount) >= 20_000_000 || action === 'approve_large_payout')) {
    return 'high';
  }
  if (module === 'rbac' || action === 'change_role' || action === 'assign_role') {
    return 'high';
  }
  if (module === 'system_settings' || action === 'update_settings' || action === 'toggle_maintenance') {
    return 'high';
  }
  if (action === 'lock_account' && isPermanentLock) {
    return 'high';
  }
  if (module === 'payout' || action === 'lock_account' || action === 'edit_lesson') {
    return 'attention';
  }
  return 'normal';
}

/**
 * Ghi 1 bản ghi Audit Log mới (Append-only).
 */
export async function createAuditRecord(db, {
  actor,
  module,
  module_label,
  action,
  action_label,
  outcome = 'success',
  risk_level,
  target,
  client_context,
  basis,
  diff,
}) {
  const collection = db.collection(AUDIT_COLLECTION);
  const now = new Date();

  // Tạo mã log duy nhất tự tăng / timestamp: LOG-YYYY-XXXXXX
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const log_code = `LOG-${now.getFullYear()}-${randomSuffix}`;

  const resolvedRisk = risk_level || determineRiskLevel({
    module,
    action,
    amount: target?.amount,
    isPermanentLock: target?.isPermanentLock,
  });

  const actorId = actor?.admin_id ? (typeof actor.admin_id === 'string' ? new ObjectId(actor.admin_id) : actor.admin_id) : null;

  const checksum = calculateAuditChecksum({
    log_code,
    actor_id: actorId,
    target_id: target?.id,
    timestamp: now,
    diff,
  });

  const doc = {
    log_code,
    timestamp: now,
    actor: {
      admin_id: actorId,
      admin_code: actor?.admin_code || 'SA-001',
      name: actor?.name || 'Administrator',
      email: actor?.email || 'admin@thinkup.vn',
      role: actor?.role || 'SA',
    },
    module: module || 'system',
    module_label: module_label || module || 'Hệ thống',
    action: action || 'unknown',
    action_label: action_label || action || 'Thao tác',
    outcome: outcome === 'failed' ? 'failed' : 'success',
    risk_level: resolvedRisk,
    target: {
      id: target?.id || 'N/A',
      entity_type: target?.entity_type || 'system',
      name: target?.name || '',
      meta: target?.meta || '',
    },
    client_context: {
      ip: client_context?.ip || '127.0.0.1',
      location: client_context?.location || 'Việt Nam',
      device: client_context?.device || 'Chrome / Browser',
      session_id: client_context?.session_id || 'sess_default',
    },
    basis: {
      reason: basis?.reason ? String(basis.reason).trim() : '',
      evidence_url: basis?.evidence_url || null,
      evidence_name: basis?.evidence_name || null,
    },
    diff: {
      before: diff?.before || {},
      after: diff?.after || {},
    },
    checksum,
    created_at: now,
  };

  await collection.insertOne(doc);
  return doc;
}

/**
 * Lấy 4 thẻ thống kê KPI kiểm toán
 */
export async function getAuditSummary(db) {
  const collection = db.collection(AUDIT_COLLECTION);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

  const [totalToday, totalYesterday, highRiskCount, activeAdminsCount] = await Promise.all([
    collection.countDocuments({ timestamp: { $gte: startOfToday } }),
    collection.countDocuments({ timestamp: { $gte: startOfYesterday, $lt: startOfToday } }),
    collection.countDocuments({ timestamp: { $gte: startOfToday }, risk_level: 'high' }),
    collection.distinct('actor.admin_id', { timestamp: { $gte: startOfToday } }),
  ]);

  let deltaPct = 0;
  if (totalYesterday > 0) {
    deltaPct = Math.round(((totalToday - totalYesterday) / totalYesterday) * 100);
  } else if (totalToday > 0) {
    deltaPct = 100;
  }

  // Kiểm tra 20 bản ghi gần nhất để đánh giá toàn vẹn
  const recentLogs = await collection.find({}).sort({ timestamp: -1 }).limit(20).toArray();
  const hasTampered = recentLogs.some(log => !verifyAuditChecksum(log));

  return {
    totalToday,
    totalDelta: `${deltaPct >= 0 ? '+' : ''}${deltaPct}% so với hôm qua`,
    highRisk: highRiskCount,
    activeAdmins: activeAdminsCount.length,
    onlineAdmins: Math.max(1, activeAdminsCount.length),
    integrity: hasTampered ? 'broken' : 'verified',
  };
}

/**
 * Truy vấn danh sách Audit Logs có bộ lọc và tìm kiếm
 */
export async function listAuditLogs(db, {
  page = 1,
  limit = 15,
  search = '',
  module = '',
  risk = '',
  action = '',
  from = '',
  to = '',
}) {
  const collection = db.collection(AUDIT_COLLECTION);
  const query = {};

  if (search && search.trim()) {
    const term = search.trim();
    query.$or = [
      { log_code: { $regex: term, $options: 'i' } },
      { 'target.id': { $regex: term, $options: 'i' } },
      { 'actor.name': { $regex: term, $options: 'i' } },
      { 'actor.email': { $regex: term, $options: 'i' } },
      { 'actor.admin_code': { $regex: term, $options: 'i' } },
    ];
  }

  if (module && module !== 'all') {
    query.module = module;
  }
  if (risk && risk !== 'all') {
    query.risk_level = risk;
  }
  if (action && action !== 'all') {
    query.action = action;
  }

  if (from || to) {
    query.timestamp = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) query.timestamp.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        query.timestamp.$lte = toDate;
      }
    }
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const skip = (safePage - 1) * safeLimit;

  const [total, items] = await Promise.all([
    collection.countDocuments(query),
    collection.find(query).sort({ timestamp: -1 }).skip(skip).limit(safeLimit).toArray(),
  ]);

  return {
    items: items.map(doc => ({
      ...doc,
      is_checksum_valid: verifyAuditChecksum(doc),
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

/**
 * Lấy chi tiết 1 bản ghi
 */
export async function getAuditLogDetail(db, idOrCode) {
  const collection = db.collection(AUDIT_COLLECTION);
  const query = ObjectId.isValid(idOrCode)
    ? { $or: [{ _id: new ObjectId(idOrCode) }, { log_code: idOrCode }] }
    : { log_code: idOrCode };

  const log = await collection.findOne(query);
  if (!log) return null;

  return {
    ...log,
    is_checksum_valid: verifyAuditChecksum(log),
  };
}

/**
 * Tạo dữ liệu xuất báo cáo (CSV/Excel data)
 */
export async function exportAuditReport(db, {
  actor,
  reason,
  format = 'xlsx',
  filters = {},
  client_context = {},
}) {
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 10) {
    const err = new Error('Lý do xuất báo cáo phải từ 10 ký tự trở lên.');
    err.status = 400;
    err.code = 'EXPORT_REASON_TOO_SHORT';
    throw err;
  }

  // Ghi nhật ký hành vi trích xuất báo cáo nhạy cảm (theo đúng BA Plan)
  await createAuditRecord(db, {
    actor,
    module: 'audit',
    module_label: 'Nhật ký kiểm toán',
    action: 'export_audit_report',
    action_label: 'Xuất file Báo cáo Kiểm toán',
    outcome: 'success',
    risk_level: 'attention',
    target: {
      id: `EXPORT-${Date.now()}`,
      entity_type: 'report',
      name: `Báo cáo kiểm toán (${format.toUpperCase()})`,
    },
    client_context,
    basis: { reason: cleanReason },
    diff: {
      before: {},
      after: { format, filters },
    },
  });

  const query = {};
  if (filters.module && filters.module !== 'all') query.module = filters.module;
  if (filters.risk && filters.risk !== 'all') query.risk_level = filters.risk;

  const records = await db.collection(AUDIT_COLLECTION).find(query).sort({ timestamp: -1 }).limit(50000).toArray();

  // Tạo chữ ký bảo mật ở dòng cuối tệp tin
  const exportTimestamp = new Date().toISOString();
  const exportSignature = crypto.createHash('sha256')
    .update(`THINKUP_EXPORT|${exportTimestamp}|${records.length}|${actor?.email || ''}`)
    .digest('hex');

  const rows = records.map(r => ({
    log_code: r.log_code,
    timestamp: r.timestamp?.toISOString ? r.timestamp.toISOString() : String(r.timestamp),
    admin_code: r.actor?.admin_code || '',
    admin_name: r.actor?.name || '',
    module: r.module_label || r.module,
    action: r.action_label || r.action,
    target_id: r.target?.id || '',
    ip: r.client_context?.ip || '',
    device: r.client_context?.device || '',
    reason: r.basis?.reason || '',
    risk_level: r.risk_level,
  }));

  return {
    format,
    totalRecords: records.length,
    exportedAt: exportTimestamp,
    securityChecksum: exportSignature,
    rows,
  };
}

