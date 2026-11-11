import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';

const error = (message, status = 400, code = 'ORDER_QUERY_INVALID') => Object.assign(new Error(message), { status, code });
const orderStatus = value => ({ completed: 'success', paid: 'success', success: 'success', pending: 'pending', failed: 'cancelled', cancelled: 'cancelled', expired: 'cancelled' })[value] || value;
const dateOf = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + '+07:00' : value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const summaryOf = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const money = value => { const number = Number(value); return Number.isFinite(number) ? number : null; };
const safe = value => String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&");

export function parseOrderQuery(query = {}) {
  const status = query.status || '';
  if (status && !['success', 'pending', 'cancelled'].includes(status)) throw error('Trạng thái không hợp lệ.');
  const method = query.method || '';
  if (typeof method !== 'string' || method.length > 80) throw error('Phương thức thanh toán không hợp lệ.');
  const q = query.q || '';
  if (typeof q !== 'string' || q.length > 100) throw error('Từ khóa không hợp lệ.');
  const from = query.from ? dateOf(/^\d{4}-\d\d-\d\d$/.test(query.from) ? `${query.from}T00:00:00+07:00` : query.from) : null;
  const to = query.to ? dateOf(/^\d{4}-\d\d-\d\d$/.test(query.to) ? `${query.to}T23:59:59.999+07:00` : query.to) : null;
  if ((query.from && !from) || (query.to && !to) || (from && to && from > to)) throw error('Khoảng ngày không hợp lệ.');
  const page = Number(query.page || 1), pageSize = Number(query.pageSize || 8);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw error('Phân trang không hợp lệ.');
  const sort = query.sort || 'newest';
  if (!['newest', 'oldest'].includes(sort)) throw error('Thứ tự không hợp lệ.');
  return { q: q.trim().toLocaleLowerCase('vi-VN'), status, method, from, to, page, pageSize, sort };
}

async function rowsFor(db) {
  const transactions = await db.collection('payment_transactions').find({ record_type: { $ne: 'gateway_receipt' } }).toArray();
  const ids = [...new Set(transactions.map(row => String(row.user_id || '')).filter(ObjectId.isValid))].map(id => new ObjectId(id));
  const users = ids.length ? await db.collection('users').find({ _id: { $in: ids } }, { projection: { full_name: 1, name: 1, email: 1 } }).toArray() : [];
  const byId = new Map(users.map(user => [String(user._id), user]));
  return transactions.map(row => {
    const summary = summaryOf(row.order_summary);
    const user = byId.get(String(row.user_id));
    return { id: row.order_id || row.transaction_id, transactionId: row.transaction_id || null, learnerId: String(row.user_id || ''), learner: user?.full_name || user?.name || null, email: user?.email || null,
      status: orderStatus(row.status), rawStatus: row.status, method: row.payment_method || null, amount: money(row.amount), currency: row.currency || 'VND', createdAt: dateOf(row.created_at)?.toISOString() || null, paidAt: dateOf(row.paid_at)?.toISOString() || null,
      invoiceCode: row.invoice_code || null, voucherCode: summary.voucher_code || row.voucher_code || null, voucherDiscount: money(summary.voucher_discount ?? row.voucher_discount), subtotal: money(summary.subtotal), total: money(summary.total ?? row.amount),
      courses: Array.isArray(summary.courses) ? summary.courses.map(item => ({ id: item.id || item.course_id || null, title: item.title || null, price: money(item.price), originalPrice: money(item.original_price) })) : [] };
  });
}

function filtered(rows, filters) {
  return rows.filter(row => {
    const date = dateOf(row.createdAt);
    return (!filters.status || row.status === filters.status) && (!filters.method || row.method === filters.method)
      && (!filters.from || (date && date >= filters.from)) && (!filters.to || (date && date <= filters.to))
      && (!filters.q || [row.id, row.transactionId, row.learner, row.email].some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(filters.q)));
  }).sort((a, b) => filters.sort === 'oldest' ? String(a.createdAt).localeCompare(String(b.createdAt)) : String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function listAdminOrders(query = {}, options = {}) {
  const filters = parseOrderQuery(query);
  const rows = filtered(await rowsFor(options.db || await getMongoDb()), filters);
  return { success: true, items: rows.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize), total: rows.length, page: filters.page, pageSize: filters.pageSize };
}
export async function getAdminOrder(id, options = {}) {
  if (typeof id !== 'string' || !id || id.length > 100) throw error('Mã đơn không hợp lệ.');
  const row = (await rowsFor(options.db || await getMongoDb())).find(item => item.id === id || item.transactionId === id);
  if (!row) throw error('Không tìm thấy đơn hàng.', 404, 'ORDER_NOT_FOUND');
  return { success: true, order: row };
}
export async function getAdminOrderSummary(query = {}, options = {}) {
  const filters = parseOrderQuery(query);
  const rows = filtered(await rowsFor(options.db || await getMongoDb()), { ...filters, status: '', q: '', method: '' });
  return { success: true, total: rows.length, successCount: rows.filter(row => row.status === 'success').length, pendingCount: rows.filter(row => row.status === 'pending').length, cancelledCount: rows.filter(row => row.status === 'cancelled').length };
}
export async function exportAdminOrders(query = {}, options = {}) {
  const format = query.format;
  if (!['csv', 'excel'].includes(format)) throw error('Định dạng xuất không hợp lệ.');
  const filters = parseOrderQuery(query);
  const rows = filtered(await rowsFor(options.db || await getMongoDb()), filters);
  const columns = ['Mã đơn', 'Mã giao dịch', 'Học viên', 'Email', 'Trạng thái', 'Phương thức', 'Số tiền', 'Ngày tạo', 'Ngày thanh toán', 'Mã hóa đơn'];
  const values = rows.map(row => [row.id, row.transactionId, row.learner, row.email, row.status, row.method, row.amount, row.createdAt, row.paidAt, row.invoiceCode]);
  if (format === 'csv') return { body: '\uFEFF' + [columns, ...values].map(line => line.map(value => `"${safe(value).replaceAll('"', '""')}"`).join(',')).join('\r\n'), type: 'text/csv; charset=utf-8', filename: 'thinkup-don-hang.csv' };
  const escapeXml = value => safe(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const xmlRows = [columns, ...values].map(line => `<Row>${line.map(value => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join('')}</Row>`).join('');
  return { body: `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Don hang"><Table>${xmlRows}</Table></Worksheet></Workbook>`, type: 'application/vnd.ms-excel; charset=utf-8', filename: 'thinkup-don-hang.xls' };
}
export function createAdminOrdersRouter(express, requireAdmin) {
  const router = express.Router();
  const role = createAdminRoleMiddleware(['SA', 'FA']);
  router.use(requireAdmin, role);
  router.get('/summary', async (req, res, next) => { try { res.json(await getAdminOrderSummary(req.query)); } catch (e) { next(e); } });
  router.get('/export', async (req, res, next) => { try { const file = await exportAdminOrders(req.query); res.type(file.type).attachment(file.filename).send(file.body); } catch (e) { next(e); } });
  router.get('/', async (req, res, next) => { try { res.json(await listAdminOrders(req.query)); } catch (e) { next(e); } });
  router.get('/:id', async (req, res, next) => { try { res.json(await getAdminOrder(req.params.id)); } catch (e) { next(e); } });
  return router;
}
