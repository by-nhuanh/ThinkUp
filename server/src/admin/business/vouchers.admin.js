import { getMongoDb } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { VOUCHERS, normalizeVoucherCode, voucherStatus } from '../../user/voucher/voucher.service.js';

const bad = (message, status = 400, code = 'VOUCHER_INVALID') => Object.assign(new Error(message), { message, status, code });
const legacy = ['platform_coupons', 'payment_vouchers', 'course_coupons'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null;
const view = (row, source = VOUCHERS) => ({ id: String(row._id), source, code: row.code, description: row.description || '', sponsor: row.sponsor || null, instructorId: row.instructor_id || null,
  scope: row.scope || (row.course_id ? 'courses' : 'all'), scopeTargetIds: row.scope_target_ids || (row.course_id ? [String(row.course_id)] : []), minRating: row.min_rating ?? null, audience: row.audience || 'all',
  discountType: row.discount_type || (row.percent_off !== undefined ? 'percent' : 'fixed'), discountValue: Number(row.discount_value ?? row.percent_off ?? 0), maxDiscount: row.max_discount == null || row.max_discount === '' ? null : Number(row.max_discount),
  minOrder: Number(row.min_order_value || 0), minCourseCount: Number(row.min_course_count || 1), used: Number(row.usage_count || 0), limit: row.usage_limit == null ? null : Number(row.usage_limit), perAccount: Number(row.usage_limit_per_user || 0),
  startsAt: row.starts_at || null, endsAt: row.expires_at || null, weeklySchedule: row.weekly_schedule || null, showOnSite: row.show_on_site ?? null,
  status: voucherStatus(row), version: row.version ?? null, createdAt: row.created_at || null, updatedAt: row.updated_at || null });

async function auditedWrite(db, actor, action, code, before, after, write) {
  if (!db.client?.startSession) throw bad('CSDL cần hỗ trợ transaction.', 503, 'VOUCHER_STORAGE_UNAVAILABLE');
  const session = db.client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await write(session);
      await db.collection('admin_audit_logs').insertOne({ admin_id: new ObjectId(actor), action, ip: 'unknown', user_agent: 'unknown',
        details: { entity: { type: 'voucher', id: code }, before, after, outcome: 'success', correlation_id: randomUUID() }, created_at: new Date() }, { session });
    });
    return result;
  } finally { await session.endSession(); }
}
async function allVouchers(db) {
  const [managed, ...old] = await Promise.all([VOUCHERS, ...legacy].map(name => db.collection(name).find({}).toArray()));
  return [...managed.filter(row => !row.deleted_at).map(row => view(row)), ...old.flatMap((rows, i) => rows.map(row => view(row, legacy[i])))];
}
function filterRows(rows, query) {
  const q = String(query.q || query.code || '').trim().toUpperCase(), sponsor = query.sponsor || '', status = query.status || '';
  if (q.length > 100 || (sponsor && !['thinkup', 'instructor'].includes(sponsor)) || (status && !['active', 'scheduled', 'locked', 'expired', 'hidden'].includes(status))) throw bad('Bộ lọc không hợp lệ.');
  const scope = query.scope || '', type = query.discountType || '';
  if (scope && !['all', 'courses', 'instructor', 'rating'].includes(scope) || type && !['percent', 'fixed'].includes(type)) throw bad('Bộ lọc không hợp lệ.');
  const ranges = [['discountMin', 'discountMax', 'discountValue'], ['minOrderMin', 'minOrderMax', 'minOrder'], ['usedMin', 'usedMax', 'used'], ['remainingMin', 'remainingMax', 'remaining']];
  const bounds = ranges.map(([minKey, maxKey, field]) => {
    const min = query[minKey] === undefined ? null : Number(query[minKey]), max = query[maxKey] === undefined ? null : Number(query[maxKey]);
    if (min !== null && (!Number.isFinite(min) || min < 0) || max !== null && (!Number.isFinite(max) || max < 0) || min !== null && max !== null && min > max) throw bad('Khoảng lọc không hợp lệ.');
    return { min, max, field };
  });
  const dates = [['startsFrom', 'startsTo', 'startsAt'], ['endsFrom', 'endsTo', 'endsAt']].map(([fromKey, toKey, field]) => {
    const from = query[fromKey] ? date(query[fromKey]) : null, to = query[toKey] ? date(query[toKey]) : null;
    if (query[fromKey] && !from || query[toKey] && !to || from && to && from > to) throw bad('Khoảng ngày không hợp lệ.');
    return { from, to, field };
  });
  return rows.filter(row => (!q || row.code.includes(q) || row.description.toUpperCase().includes(q)) && (!sponsor || row.sponsor === sponsor) && (!status || row.status === status || status === 'hidden' && ['scheduled', 'locked'].includes(row.status))
    && (!scope || row.scope === scope) && (!type || row.discountType === type)
    && bounds.every(({ min, max, field }) => { const value = field === 'remaining' ? (row.limit ?? 0) - row.used : row[field]; return (min === null || value >= min) && (max === null || value <= max); })
    && dates.every(({ from, to, field }) => { const value = date(row[field]); return (!from || value && value >= from) && (!to || value && value <= to); }));
}
export async function listVouchers(query = {}, options = {}) {
  const rows = filterRows(await allVouchers(options.db || await getMongoDb()), query);
  const page = Number(query.page || 1), pageSize = Number(query.pageSize || 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw bad('Phân trang không hợp lệ.');
  return { success: true, items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}
export async function voucherSummary(options = {}) {
  const db = options.db || await getMongoDb();
  const rows = await allVouchers(db);
  const orders = await db.collection('payment_transactions').find({ status: { $in: ['success', 'completed'] } }, { projection: { order_summary: 1 } }).toArray();
  const discounts = { thinkup: 0, instructor: 0, unattributed: 0 };
  for (const order of orders) {
    let summary = {};
    try { summary = typeof order.order_summary === 'string' ? JSON.parse(order.order_summary) : order.order_summary || {}; } catch { continue; }
    const amount = Number(summary.voucher_discount || 0);
    if (amount > 0) discounts[summary.voucher_sponsor === 'thinkup' || summary.voucher_sponsor === 'instructor' ? summary.voucher_sponsor : 'unattributed'] += amount;
  }
  return { success: true, total: rows.length, active: rows.filter(x => x.status === 'active').length, hidden: rows.filter(x => ['scheduled', 'locked'].includes(x.status)).length, expired: rows.filter(x => x.status === 'expired').length,
    actualDiscount: discounts.thinkup + discounts.instructor + discounts.unattributed, thinkupDiscount: discounts.thinkup, instructorDiscount: discounts.instructor, unattributedDiscount: discounts.unattributed };
}
export async function getVoucher(code, options = {}) {
  const normalized = normalizeVoucherCode(code);
  const rows = await allVouchers(options.db || await getMongoDb());
  const found = rows.filter(row => row.code === normalized);
  if (!found.length) throw bad('Không tìm thấy voucher.', 404, 'VOUCHER_NOT_FOUND');
  return { success: true, items: found };
}
async function validateCreate(db, body, existingId = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Nội dung voucher không hợp lệ.');
  const code = normalizeVoucherCode(body.code);
  if (!['thinkup', 'instructor'].includes(body.sponsor) || !['all', 'courses', 'instructor', 'rating'].includes(body.scope) || !['all', 'new_learner'].includes(body.audience)) throw bad('Nguồn, phạm vi hoặc nhóm học viên không hợp lệ.');
  if (body.sponsor === 'instructor' && (body.scope !== 'courses' || !body.instructorId)) throw bad('Voucher giảng viên phải chỉ định giảng viên và khóa học.');
  if (!['percent', 'fixed'].includes(body.discountType) || !Number.isFinite(body.discountValue) || body.discountValue <= 0 || body.discountType === 'percent' && (body.discountValue > 100 || !Number.isFinite(body.maxDiscount) || body.maxDiscount <= 0)) throw bad('Mức giảm không hợp lệ.');
  if (!Number.isFinite(body.minOrder) || body.minOrder <= 0 || !integer(body.minCourseCount) || body.minCourseCount < 1 || !integer(body.limit) || body.limit < 1 || !integer(body.perAccount) || body.perAccount < 1) throw bad('Điều kiện đơn hoặc giới hạn không hợp lệ.');
  const start = date(body.startsAt), end = date(body.endsAt);
  if (!start || !end || end <= start) throw bad('Thời gian voucher không hợp lệ.');
  const targets = body.scopeTargetIds || [];
  if (!Array.isArray(targets) || targets.length > 100 || (['courses', 'instructor'].includes(body.scope) && !targets.length)) throw bad('Đối tượng áp dụng không hợp lệ.');
  if (body.scope === 'rating' && (!Number.isFinite(body.minRating) || body.minRating < 1 || body.minRating > 5)) throw bad('Ngưỡng sao không hợp lệ.');
  if (body.sponsor === 'instructor' && body.scope !== 'courses') throw bad('Voucher giảng viên chỉ áp dụng cho khóa học của giảng viên.');
  if (body.weeklySchedule != null && (!Array.isArray(body.weeklySchedule) || body.weeklySchedule.length > 7 || body.weeklySchedule.some(day => !Number.isInteger(day.day) || day.day < 0 || day.day > 6 || typeof day.enabled !== 'boolean' || typeof day.allDay !== 'boolean' || !Array.isArray(day.slots) || day.slots.length > 5 || day.slots.some(slot => !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) || slot.end <= slot.start)))) throw bad('Lịch tuần không hợp lệ.');
  if (body.sponsor === 'instructor') {
    const courses = await db.collection('courses').find({ $or: [{ course_id: { $in: targets } }, { _id: { $in: targets } }] }).toArray();
    if (courses.length !== targets.length || courses.some(c => String(c.instructor_id) !== String(body.instructorId))) throw bad('Khóa học không thuộc giảng viên tài trợ.');
  }
  for (const name of [VOUCHERS, ...legacy]) { const duplicate = await db.collection(name).findOne({ code }); if (duplicate && String(duplicate._id) !== String(existingId)) throw bad('Mã voucher đã tồn tại.', 409, 'VOUCHER_DUPLICATE'); }
  return { code, description: String(body.description || '').slice(0, 300), sponsor: body.sponsor, instructor_id: body.instructorId || null, scope: body.scope, scope_target_ids: targets.map(String), min_rating: body.minRating || null, audience: body.audience,
    discount_type: body.discountType, discount_value: body.discountValue, max_discount: body.discountType === 'percent' ? body.maxDiscount : null, min_order_value: body.minOrder, min_course_count: body.minCourseCount,
    usage_limit: body.limit, usage_count: 0, usage_limit_per_user: body.perAccount, starts_at: start, expires_at: end, weekly_schedule: body.weeklySchedule || null, show_on_site: body.showOnSite !== false,
    locked_at: body.locked ? new Date() : null, deleted_at: null, version: 1, created_at: new Date(), updated_at: new Date() };
}
export async function createVoucher(body, options = {}) {
  const db = options.db || await getMongoDb();
  const doc = await validateCreate(db, body);
  await auditedWrite(db, options.adminId, 'VOUCHER_CREATED', doc.code, null, view(doc), session => db.collection(VOUCHERS).insertOne(doc, { session }));
  return { success: true, voucher: view(doc) };
}
export async function updateVoucher(code, body, options = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Nội dung cập nhật không hợp lệ.');
  const db = options.db || await getMongoDb(), normalized = normalizeVoucherCode(code);
  const current = await db.collection(VOUCHERS).findOne({ code: normalized, deleted_at: null });
  if (!current) throw bad('Không tìm thấy voucher quản trị.', 404, 'VOUCHER_NOT_FOUND');
  if (voucherStatus(current) === 'expired') throw bad('Voucher đã hết hạn.', 409, 'VOUCHER_STATE');
  const scheduled = voucherStatus(current) === 'scheduled';
  const allowed = scheduled ? ['version', 'description', 'instructorId', 'scope', 'scopeTargetIds', 'minRating', 'audience', 'discountType', 'discountValue', 'maxDiscount', 'minOrder', 'minCourseCount', 'limit', 'perAccount', 'startsAt', 'endsAt', 'weeklySchedule', 'showOnSite'] : ['version', 'description', 'maxDiscount', 'minOrder', 'limit', 'endsAt'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw bad('Có trường không được phép sửa.');
  if (!Number.isInteger(body.version)) throw bad('Cần phiên bản voucher để tránh ghi đè.');
  const set = { updated_at: new Date() };
  if (scheduled) {
    const currentView = view(current);
    const draft = { ...currentView, ...body, sponsor: current.sponsor, code: current.code };
    const validated = await validateCreate(db, draft, current._id);
    for (const field of ['description', 'instructor_id', 'scope', 'scope_target_ids', 'min_rating', 'audience', 'discount_type', 'discount_value', 'max_discount', 'min_order_value', 'min_course_count', 'usage_limit', 'usage_limit_per_user', 'starts_at', 'expires_at', 'weekly_schedule', 'show_on_site']) set[field] = validated[field];
  }
  if (!scheduled && body.description !== undefined) set.description = String(body.description).slice(0, 300);
  if (!scheduled && body.maxDiscount !== undefined) { if (current.discount_type !== 'percent' || !Number.isFinite(body.maxDiscount) || body.maxDiscount <= 0) throw bad('Trần giảm không hợp lệ.'); set.max_discount = body.maxDiscount; }
  if (!scheduled && body.minOrder !== undefined) { if (!Number.isFinite(body.minOrder) || body.minOrder <= 0) throw bad('Đơn tối thiểu không hợp lệ.'); set.min_order_value = body.minOrder; }
  if (!scheduled && body.limit !== undefined) { if (!integer(body.limit) || body.limit < Math.max(current.usage_limit, current.usage_count)) throw bad('Không thể giảm tổng lượt đã phát hành.'); set.usage_limit = body.limit; }
  if (!scheduled && body.endsAt !== undefined) { const end = date(body.endsAt); if (!end || end <= new Date(current.expires_at)) throw bad('Chỉ được gia hạn ngày kết thúc.'); set.expires_at = end; }
  if (!scheduled && body.showOnSite !== undefined) set.show_on_site = Boolean(body.showOnSite);
  await auditedWrite(db, options.adminId, 'VOUCHER_UPDATED', normalized, view(current), set, async session => {
    const result = await db.collection(VOUCHERS).updateOne({ _id: current._id, version: body.version }, { $set: set, $inc: { version: 1 } }, { session });
    if (!result.matchedCount) throw bad('Voucher vừa được thay đổi.', 409, 'VOUCHER_CHANGED');
    return result;
  });
  return { success: true };
}
export async function setVoucherLock(code, locked, options = {}) {
  const db = options.db || await getMongoDb(), normalized = normalizeVoucherCode(code);
  const current = await db.collection(VOUCHERS).findOne({ code: normalized, deleted_at: null });
  if (!current) throw bad('Không tìm thấy voucher quản trị.', 404, 'VOUCHER_NOT_FOUND');
  if (voucherStatus({ ...current, locked_at: null }) === 'expired' || locked && current.locked_at || !locked && !current.locked_at) throw bad('Không thể đổi trạng thái voucher.', 409, 'VOUCHER_STATE');
  await auditedWrite(db, options.adminId, locked ? 'VOUCHER_LOCKED' : 'VOUCHER_UNLOCKED', normalized, view(current), { locked }, async session => {
    const result = await db.collection(VOUCHERS).updateOne({ _id: current._id, version: current.version }, { $set: { locked_at: locked ? new Date() : null, updated_at: new Date() }, $inc: { version: 1 } }, { session });
    if (!result.matchedCount) throw bad('Voucher vừa được thay đổi.', 409, 'VOUCHER_CHANGED');
    return result;
  });
  return { success: true, status: locked ? 'locked' : voucherStatus({ ...current, locked_at: null }) };
}
export async function deleteVoucher(code, options = {}) {
  const db = options.db || await getMongoDb(), normalized = normalizeVoucherCode(code);
  const current = await db.collection(VOUCHERS).findOne({ code: normalized, deleted_at: null });
  if (!current) throw bad('Không tìm thấy voucher quản trị.', 404, 'VOUCHER_NOT_FOUND');
  if (current.usage_count > 0) throw bad('Voucher đã dùng không thể xóa.', 409, 'VOUCHER_IN_USE');
  await auditedWrite(db, options.adminId, 'VOUCHER_DELETED', normalized, view(current), { deleted: true }, async session => {
    const result = await db.collection(VOUCHERS).updateOne({ _id: current._id, version: current.version, usage_count: 0 }, { $set: { deleted_at: new Date(), locked_at: new Date(), updated_at: new Date() }, $inc: { version: 1 } }, { session });
    if (!result.matchedCount) throw bad('Voucher vừa được thay đổi.', 409, 'VOUCHER_CHANGED');
    return result;
  });
  return { success: true };
}
export async function bulkVoucherLock(codes, locked, options = {}) {
  if (!Array.isArray(codes) || !codes.length || codes.length > 50) throw bad('Chọn từ 1 đến 50 voucher.');
  const unique = [...new Set(codes.map(normalizeVoucherCode))];
  const results = [];
  for (const code of unique) {
    try { results.push({ code, ...(await setVoucherLock(code, locked, options)) }); }
    catch (error) { results.push({ code, success: false, codeError: error.code, message: error.message }); }
  }
  return { success: true, results, changed: results.filter(row => row.success).length };
}
export async function exportVouchers(query = {}, options = {}) {
  if (!['csv', 'excel'].includes(query.format)) throw bad('Định dạng không hợp lệ.');
  const rows = filterRows(await allVouchers(options.db || await getMongoDb()), query);
  const data = [['Mã', 'Nguồn tài trợ', 'Giảng viên', 'Phạm vi', 'Loại giảm', 'Mức giảm', 'Trần giảm', 'Đơn tối thiểu', 'Đã dùng', 'Giới hạn', 'Bắt đầu', 'Kết thúc', 'Trạng thái'],
    ...rows.map(x => [x.code, x.sponsor, x.instructorId, x.scope, x.discountType, x.discountValue, x.maxDiscount, x.minOrder, x.used, x.limit, x.startsAt, x.endsAt, x.status])];
  const safe = value => String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&");
  if (query.format === 'csv') return { filename: 'thinkup-voucher.csv', type: 'text/csv; charset=utf-8', body: '\uFEFF' + data.map(row => row.map(value => `"${safe(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') };
  const xml = value => safe(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  return { filename: 'thinkup-voucher.xls', type: 'application/vnd.ms-excel; charset=utf-8', body: `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Voucher"><Table>${data.map(row => `<Row>${row.map(value => `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>` };
}
export function createAdminVouchersRouter(express, requireAdmin, options = {}) {
  const router = express.Router(); router.use(requireAdmin, createAdminRoleMiddleware(['SA', 'FA']));
  const run = fn => async (req, res, next) => { try { res.json(await fn(req)); } catch (e) { next(e); } };
  router.get('/summary', run(() => voucherSummary(options)));
  router.get('/export', async (req, res, next) => { try { const file = await exportVouchers(req.query, options); res.type(file.type).attachment(file.filename).send(file.body); } catch (e) { next(e); } });
  router.get('/', run(req => listVouchers(req.query, options)));
  router.get('/:code', run(req => getVoucher(req.params.code, options)));
  router.post('/', run(req => createVoucher(req.body, { ...options, adminId: req.adminId })));
  router.patch('/:code', run(req => updateVoucher(req.params.code, req.body, { ...options, adminId: req.adminId })));
  router.post('/:code/lock', run(req => setVoucherLock(req.params.code, true, { ...options, adminId: req.adminId })));
  router.post('/:code/unlock', run(req => setVoucherLock(req.params.code, false, { ...options, adminId: req.adminId })));
  router.post('/bulk-lock', run(req => bulkVoucherLock(req.body?.codes, true, { ...options, adminId: req.adminId })));
  router.post('/bulk-unlock', run(req => bulkVoucherLock(req.body?.codes, false, { ...options, adminId: req.adminId })));
  router.delete('/:code', run(req => deleteVoucher(req.params.code, { ...options, adminId: req.adminId })));
  return router;
}
