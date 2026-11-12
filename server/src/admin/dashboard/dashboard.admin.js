import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';
import { recordAuditLog } from '../auth/auth.admin.js';

const FAIL = (message, status = 400, code = 'DASHBOARD_INVALID') => Object.assign(new Error(message), { status, code });
const MAX_RANGE_DAYS = 366;
const DAY = 86400000;

function dateInput(value, field) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw FAIL(`Ngày ${field} không hợp lệ.`);
  return date;
}

function range(query = {}, now = new Date()) {
  const end = query.endDate === undefined ? now : dateInput(query.endDate, 'kết thúc');
  let start;
  if (query.startDate !== undefined) start = dateInput(query.startDate, 'bắt đầu');
  else {
    const period = query.period || 'month';
    if (period === 'today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (period === '7d') start = new Date(now.getTime() - 7 * DAY);
    else if (period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === 'quarter') start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    else if (period === 'year') start = new Date(now.getFullYear(), 0, 1);
    else throw FAIL('Kỳ dashboard không hợp lệ.');
  }
  if (start > end) throw FAIL('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  if (end - start > MAX_RANGE_DAYS * DAY) throw FAIL('Khoảng thời gian vượt quá 366 ngày.');
  const duration = Math.max(DAY, end.getTime() - start.getTime());
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: new Date(start.getTime() - 1) };
}

function pct(current, previous) { return previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : null; }
function validRole(role) {
  if (role === undefined || role === 'all') return null;
  if (!['SA', 'CA', 'FA', 'CS'].includes(role)) throw FAIL('Bộ lọc role không hợp lệ.');
  return role;
}
function logView(doc) {
  const details = doc.details && typeof doc.details === 'object' ? doc.details : {};
  return {
    id: String(doc._id), actorId: doc.admin_id ? String(doc.admin_id) : null,
    actorName: doc.actor_name || doc.email || null, role: doc.role || null,
    action: doc.action, ip: doc.ip || 'unknown', userAgent: doc.user_agent || 'unknown',
    at: doc.created_at instanceof Date ? doc.created_at.toISOString() : new Date(doc.created_at).toISOString(),
    entity: details.entity || null, before: details.before ?? null, after: details.after ?? null,
    metadata: details.metadata || {},
  };
}

export async function getAdminDashboardOverview(query = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const current = range(query, options.now || new Date());
  const role = options.role || 'SA';
  if (!['SA', 'CA', 'FA', 'CS'].includes(role)) throw FAIL('Vai trò không hợp lệ.', 403, 'ADMIN_FORBIDDEN');
  const users = db.collection('users');
  const courses = db.collection('courses');
  const transactions = db.collection('payment_transactions');
  const [usersCurrent, usersPrevious, courseTotal, courseNew, courseStates, revenue, revenuePrevious] = await Promise.all([
    users.countDocuments({ email_verified: true, created_at: { $lte: current.end } }),
    users.countDocuments({ email_verified: true, created_at: { $lte: current.previousEnd } }),
    courses.countDocuments({}),
    courses.countDocuments({ $or: [{ created_at: { $gte: current.start, $lte: current.end } }, { createdAt: { $gte: current.start, $lte: current.end } }] }),
    Promise.all(['published', 'pending_review', 'hidden', 'draft'].map(async status => [status, await courses.countDocuments({ status })])),
    transactions.aggregate([{ $match: { status: 'success', paid_at: { $gte: current.start, $lte: current.end } } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$actual_paid_amount', '$amount'] } } } }]).toArray(),
    transactions.aggregate([{ $match: { status: 'success', paid_at: { $gte: current.previousStart, $lte: current.previousEnd } } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$actual_paid_amount', '$amount'] } } } }]).toArray(),
  ]);
  const roomDocs = await db.collection('study_rooms').find({ status: { $in: ['active', 'ongoing', 'live', 'focus', 'break'] } }, { projection: { capacity: 1, maxUsers: 1, currentUsers: 1, participants: 1 } }).toArray();
  const online = roomDocs.reduce((sum, room) => sum + Math.max(room.currentUsers || 0, new Set((room.participants || []).map(p => String(p.userId))).size), 0);
  const capacity = roomDocs.reduce((sum, room) => sum + (room.capacity || room.maxUsers || 0), 0);
  const revenueNow = revenue[0]?.total || 0, revenueBefore = revenuePrevious[0]?.total || 0;
  const kpis = {
    users: { total: usersCurrent, changePercent: pct(usersCurrent, usersPrevious) },
    courses: { total: courseTotal, newInPeriod: courseNew, statuses: Object.fromEntries(courseStates) },
    revenue: { total: revenueNow, changePercent: pct(revenueNow, revenueBefore), currency: 'VND' },
    rooms: { active: roomDocs.length, onlineUsers: online, capacity, loadPercent: capacity ? Number((online / capacity * 100).toFixed(1)) : 0,
      loadStatus: capacity && online / capacity > .8 ? 'overloaded' : capacity && online / capacity > .5 ? 'high' : 'normal' },
  };
  const visibleKpis = role === 'SA' ? kpis : role === 'CA' ? { courses: kpis.courses } : role === 'FA' ? { revenue: kpis.revenue } : { tickets: { available: false } };
  return {
    success: true, period: { start: current.start.toISOString(), end: current.end.toISOString(), previousStart: current.previousStart.toISOString(), previousEnd: current.previousEnd.toISOString() },
    kpis: visibleKpis,
  };
}

export async function getAdminDashboardAnalytics(query = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const current = range(query, options.now || new Date());
  const grain = query.grain || 'month';
  if (!['day', 'week', 'month', 'quarter', 'year'].includes(grain)) throw FAIL('Độ chia biểu đồ không hợp lệ.');
  const payouts = [];
  const [transactions, enrollments, progress, courses, reviews] = await Promise.all([
    db.collection('payment_transactions').find({ status: 'success', paid_at: { $gte: current.start, $lte: current.end } }).toArray(),
    db.collection('user_enrollments').find({ status: { $ne: 'revoked' } }).toArray(),
    db.collection('user_course_progress').find({}).toArray(),
    db.collection('courses').find({}).toArray(),
    db.collection('course_reviews').find({}).toArray(),
  ]);
  const courseById = new Map();
  for (const course of courses) for (const id of [course._id, course.course_id, course.id].filter(Boolean)) courseById.set(String(id), course);
  const keyFor = date => {
    const d = new Date(date); if (!Number.isFinite(d.getTime())) return null;
    if (grain === 'year') return String(d.getUTCFullYear());
    if (grain === 'quarter') return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    if (grain === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (grain === 'week') { const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); }
    return d.toISOString().slice(0, 10);
  };
  const buckets = new Map();
  for (const tx of transactions) {
    const key = keyFor(tx.paid_at || tx.created_at); if (!key) continue;
    const bucket = buckets.get(key) || { period: key, original: 0, marketplace: 0, payout: 0 };
    const summary = typeof tx.order_summary === 'string' ? (() => { try { return JSON.parse(tx.order_summary); } catch { return {}; } })() : tx.order_summary || {};
    const items = summary.courses || tx.courses || [];
    const amount = tx.actual_paid_amount ?? tx.amount ?? summary.total ?? 0;
    const totalItems = items.reduce((sum, item) => sum + Number(item.price || item.original_price || 0), 0);
    for (const item of items) {
      const course = courseById.get(String(item.id || item.course_id || ''));
      const itemGross = Number(item.price || item.original_price || 0);
      const itemAmount = totalItems ? amount * itemGross / totalItems : 0;
      if (course?.instructor_id) bucket.marketplace += itemAmount;
      else bucket.original += itemAmount;
    }
    buckets.set(key, bucket);
  }
  for (const payout of payouts) { const key = keyFor(payout.paid_at); if (!key) continue; const bucket = buckets.get(key) || { period: key, original: 0, marketplace: 0, payout: 0 }; bucket.payout += payout.amount || payout.paid_amount || 0; buckets.set(key, bucket); }
  const progressByEnrollment = new Map();
  for (const row of progress) progressByEnrollment.set(`${row.user_id}:${row.course_id}`, Number(row.progress_percentage ?? row.progress ?? 0));
  const distribution = { inProgress: 0, completed: 0, inactive: 0 };
  for (const enrollment of enrollments) { const value = progressByEnrollment.get(`${enrollment.user_id}:${enrollment.course_id}`) || 0; if (value >= 100) distribution.completed++; else if (value > 0) distribution.inProgress++; else distribution.inactive++; }
  const totalEnrollments = distribution.inProgress + distribution.completed + distribution.inactive;
  const reviewTotals = new Map(); for (const review of reviews) { const id = String(review.course_id); const x = reviewTotals.get(id) || { sum: 0, count: 0 }; x.sum += Number(review.rating || 0); x.count++; reviewTotals.set(id, x); }
  const purchaseTotals = new Map();
  for (const tx of transactions) { const summary = typeof tx.order_summary === 'string' ? (() => { try { return JSON.parse(tx.order_summary); } catch { return {}; } })() : tx.order_summary || {}; for (const item of summary.courses || tx.courses || []) { const id = String(item.id || item.course_id || ''); if (id) purchaseTotals.set(id, (purchaseTotals.get(id) || 0) + 1); } }
  const topCourses = [...purchaseTotals].map(([id, purchases]) => { const course = courseById.get(id); const rating = reviewTotals.get(id); return { courseId: id, title: course?.title || 'Khóa học', purchases, rating: rating?.count ? Number((rating.sum / rating.count).toFixed(1)) : null }; }).sort((a, b) => b.purchases - a.purchases).slice(0, 5);
  const revenueRows = [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  const totalRevenue = revenueRows.reduce((sum, item) => sum + item.original + item.marketplace, 0);
  return { success: true, revenue: { rows: revenueRows, total: totalRevenue, payoutAvailable: false }, learning: { totalEnrollments, inProgress: distribution.inProgress, completed: distribution.completed, inactive: distribution.inactive, percentages: Object.fromEntries(Object.entries(distribution).map(([key, count]) => [key, totalEnrollments ? Number((count / totalEnrollments * 100).toFixed(1)) : 0])) }, topCourses };
}

export async function listAdminAuditLogs(query = {}, options = {}) {
  const db = options.db || await getMongoDb(); const role = validRole(query.role);
  const limit = query.limit === undefined ? 5 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw FAIL('Giới hạn bản ghi phải từ 1 đến 100.');
  const filter = {};
  if (role) {
    const adminDocs = await db.collection('admins').find({}, { projection: { _id: 1, role: 1 } }).toArray();
    const ids = adminDocs.filter(admin => options.normalizeRole(admin.role) === role).map(admin => admin._id);
    filter.admin_id = { $in: ids };
  }
  const rows = await db.collection('admin_audit_logs').find(filter).sort({ created_at: -1, _id: -1 }).limit(options.dashboard ? 5 : limit).toArray();
  if (!rows.length) return { success: true, items: [], total: await db.collection('admin_audit_logs').countDocuments(filter) };
  const ids = [...new Set(rows.map(row => String(row.admin_id)).filter(Boolean))].filter(ObjectId.isValid).map(id => new ObjectId(id));
  const admins = await db.collection('admins').find({ _id: { $in: ids } }, { projection: { full_name: 1, email: 1, role: 1 } }).toArray();
  const byId = new Map(admins.map(admin => [String(admin._id), admin]));
  return { success: true, items: rows.map(row => { const admin = byId.get(String(row.admin_id)); return { ...logView({ ...row, actor_name: admin?.full_name, email: admin?.email, role: admin?.role && options.normalizeRole(admin.role) }) }; }), total: await db.collection('admin_audit_logs').countDocuments(filter) };
}

export async function getAdminAuditLog(id, options = {}) {
  if (typeof id !== 'string' || !ObjectId.isValid(id)) throw FAIL('ID log không hợp lệ.');
  const db = options.db || await getMongoDb(); const row = await db.collection('admin_audit_logs').findOne(options.asStringId ? { _id: id } : { _id: new ObjectId(id) });
  if (!row) throw FAIL('Không tìm thấy log.', 404, 'AUDIT_LOG_NOT_FOUND');
  const admin = row.admin_id ? await db.collection('admins').findOne({ _id: row.admin_id }, { projection: { full_name: 1, email: 1, role: 1 } }) : null;
  return { success: true, log: logView({ ...row, actor_name: admin?.full_name, email: admin?.email, role: admin?.role && options.normalizeRole(admin.role) }) };
}

export async function exportAdminAuditLogs(query = {}, options = {}) {
  const db = options.db || await getMongoDb(); const role = validRole(query.role); const filter = {};
  if (role) { const admins = await db.collection('admins').find({}, { projection: { _id: 1, role: 1 } }).toArray(); filter.admin_id = { $in: admins.filter(admin => options.normalizeRole(admin.role) === role).map(admin => admin._id) }; }
  const rows = await db.collection('admin_audit_logs').find(filter).sort({ created_at: -1, _id: -1 }).toArray();
  const adminIds = [...new Set(rows.map(row => String(row.admin_id)).filter(ObjectId.isValid))].map(id => new ObjectId(id));
  const admins = await db.collection('admins').find({ _id: { $in: adminIds } }, { projection: { full_name: 1, email: 1, role: 1 } }).toArray(); const byId = new Map(admins.map(admin => [String(admin._id), admin]));
  const items = rows.map(row => logView({ ...row, actor_name: byId.get(String(row.admin_id))?.full_name, email: byId.get(String(row.admin_id))?.email, role: options.normalizeRole(byId.get(String(row.admin_id))?.role) }));
  await recordAuditLog(db, { adminId: options.adminId, action: 'ADMIN_AUDIT_LOG_EXPORT', ip: options.ip, userAgent: options.userAgent, role: 'SA', details: { entity: { type: 'admin_audit_logs' }, before: null, after: null, metadata: { format: query.format || 'json', role: role || 'all', records: items.length } } });
  return { success: true, items, total: items.length };
}

export function createAdminDashboardRouter(express, requireAdmin, normalizeRole) {
  if (!express?.Router || !requireAdmin || !normalizeRole) throw new Error('createAdminDashboardRouter requires Express, Admin auth, and role normalization');
  const router = express.Router(); const requireSA = createAdminRoleMiddleware(['SA']);
  const guard = (req, res, next) => requireAdmin(req, res, error => error ? next(error) : requireSA(req, res, next));
  const options = () => ({ normalizeRole, db: undefined });
  const requireDashboardRole = createAdminRoleMiddleware(['SA', 'CA', 'FA', 'CS']);
  const dashboardGuard = (req,res,next) => requireAdmin(req,res,error => error ? next(error) : requireDashboardRole(req,res,next));
  router.get('/overview', dashboardGuard, async (req, res, next) => { try { res.json(await getAdminDashboardOverview(req.query, { ...options(), role: req.adminRole })); } catch (error) { next(error); } });
  router.get('/analytics', dashboardGuard, async (req, res, next) => { try { if (req.adminRole === 'CS') throw FAIL('Không có quyền xem analytics.', 403, 'ADMIN_FORBIDDEN'); const result = await getAdminDashboardAnalytics(req.query, options()); res.json(req.adminRole === 'CA' ? { success: true, learning: result.learning, topCourses: result.topCourses } : req.adminRole === 'FA' ? { success: true, revenue: result.revenue } : result); } catch (error) { next(error); } });
  router.get('/audit-logs', guard, async (req, res, next) => { try { res.json(await listAdminAuditLogs({ ...req.query, limit: 5 }, { ...options(), dashboard: true })); } catch (error) { next(error); } });
  router.get('/audit-logs/export', guard, async (req, res, next) => { try { const result = await exportAdminAuditLogs(req.query, { ...options(), adminId: req.adminId, ip: req.ip, userAgent: req.headers['user-agent'] }); res.json(result); } catch (error) { next(error); } });
  router.get('/audit-logs/:id', guard, async (req, res, next) => { try { res.json(await getAdminAuditLog(req.params.id, { ...options(), asStringId: true })); } catch (error) { next(error); } });
  return router;
}
