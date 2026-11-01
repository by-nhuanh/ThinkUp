import { getMongoDb } from '../db.js';
import { getPurchaseHistory } from '../purchase/purchase.user.js';
import { getTransactionBillingDetail } from '../purchase/billing.user.js';

export const COLLECTION_PAYMENT_PREFERENCES = 'payment_preferences';
export const DEFAULT_PAYMENT_PREFERENCES = Object.freeze({
  savePayment: false, invoiceEmail: true, quickConfirm: false,
});
const CAPABILITIES = Object.freeze({ savePayment: false, invoiceEmail: true,
  quickConfirm: false, linkedPaymentMethods: false, invoiceDownload: false });
const database = async options => options.db || await getMongoDb();
const instant = options => new Date(options.now ?? Date.now());
function failure(message, status = 400, code = 'PAYMENT_SETTINGS_INVALID') {
  return Object.assign(new Error(message), { status, code });
}
function owner(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw failure('Yêu cầu đăng nhập.', 401, 'PAYMENT_SETTINGS_AUTH_REQUIRED');
  }
  return value;
}
function view(doc) {
  const prefs = {};
  for (const key of Object.keys(DEFAULT_PAYMENT_PREFERENCES)) {
    if (doc && Object.hasOwn(doc, key) && typeof doc[key] !== 'boolean') {
      throw failure('Dữ liệu tùy chọn thanh toán không hợp lệ.', 503, 'PAYMENT_SETTINGS_STORAGE_ERROR');
    }
    prefs[key] = doc?.[key] ?? DEFAULT_PAYMENT_PREFERENCES[key];
  }
  if (prefs.savePayment || prefs.quickConfirm) {
    throw failure('Dữ liệu đang bật tùy chọn chưa được hỗ trợ.', 503, 'PAYMENT_SETTINGS_STORAGE_ERROR');
  }
  const revision = doc?.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw failure('Phiên bản tùy chọn không hợp lệ.', 503, 'PAYMENT_SETTINGS_STORAGE_ERROR');
  }
  return { ...prefs, revision };
}

export async function getPaymentPreferences(userId, options = {}) {
  const id = owner(userId);
  const doc = await (await database(options)).collection(COLLECTION_PAYMENT_PREFERENCES).findOne({ _id: id });
  return view(doc);
}

/** Partial auto-save. A revision is required so another tab cannot overwrite newer preferences. */
export async function updatePaymentPreferences(userId, payload, options = {}) {
  const id = owner(userId);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure('Cấu hình thanh toán không hợp lệ.');
  const fields = Object.keys(payload).filter(key => key !== 'expectedRevision');
  if (!fields.length || fields.some(key => !Object.hasOwn(DEFAULT_PAYMENT_PREFERENCES, key))) {
    throw failure('Trường cấu hình thanh toán không được hỗ trợ.');
  }
  if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 ||
      payload.expectedRevision >= Number.MAX_SAFE_INTEGER) throw failure('Cần gửi phiên bản cấu hình hợp lệ.');
  for (const key of fields) {
    if (typeof payload[key] !== 'boolean') throw failure('Tùy chọn thanh toán phải là boolean.');
  }
  if (payload.savePayment === true) throw failure('Chưa hỗ trợ lưu hoặc liên kết ví/thẻ.',
    409, 'PAYMENT_METHOD_STORAGE_UNAVAILABLE');
  if (payload.quickConfirm === true) throw failure('Chưa hỗ trợ bỏ qua bước xác nhận thanh toán.',
    409, 'PAYMENT_QUICK_CONFIRM_UNAVAILABLE');
  const collection = (await database(options)).collection(COLLECTION_PAYMENT_PREFERENCES);
  const existing = await collection.findOne({ _id: id });
  const current = view(existing);
  const conflict = () => failure('Tùy chọn đã thay đổi. Vui lòng tải lại trước khi lưu.', 409, 'PAYMENT_SETTINGS_CONFLICT');
  if (current.revision !== payload.expectedRevision) throw conflict();
  const next = { _id: id, ...current, revision: current.revision + 1, updated_at: instant(options) };
  for (const key of fields) next[key] = payload[key];
  if (!existing) {
    try { await collection.insertOne(next); }
    catch (error) { if (error.code === 11000) throw conflict(); throw error; }
  } else {
    const { _id, ...update } = next;
    const result = await collection.updateOne({ _id, revision: Object.hasOwn(existing, 'revision')
      ? existing.revision : { $exists: false } }, { $set: update });
    if (!result.matchedCount) throw conflict();
  }
  return view(next);
}

function pagination(query = {}) {
  const positive = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
        !Number.isSafeInteger(Number(value)) || Number(value) > max) throw failure('Tham số phân trang không hợp lệ.');
    return Number(value);
  };
  return { page: positive(query.page, 1, 10000), limit: positive(query.limit, 5, 100) };
}
async function purchasePage(userId, query, options, invoicesOnly = false) {
  const id = owner(userId);
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw failure('Bộ lọc giao dịch không hợp lệ.');
  const { page, limit } = pagination(query);
  const supported = ['success', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'needs_review'];
  if (query.status !== undefined && !supported.includes(query.status)) throw failure('Trạng thái giao dịch không hợp lệ.');
  if (invoicesOnly && query.status !== undefined && query.status !== 'success') throw failure('Chứng từ chỉ lấy từ giao dịch hoàn tất.');
  const response = await (options.purchaseHistory || getPurchaseHistory)(id,
    { status: invoicesOnly ? 'success' : query.status || '' });
  if (!response || !Array.isArray(response.transactions) || !Number.isSafeInteger(response.total) ||
      response.total !== response.transactions.length) {
    throw failure('Chưa đọc được lịch sử giao dịch hợp lệ.', 503, 'PAYMENT_SETTINGS_STORAGE_ERROR');
  }
  const items = response.transactions.slice((page - 1) * limit, page * limit);
  return { items, pagination: { page, limit, total: response.total, hasMore: page * limit < response.total } };
}

/** Delegates purchase formatting and ownership filtering to the existing purchase module. */
export async function getPaymentTransactions(userId, query = {}, options = {}) {
  return purchasePage(userId, query, options);
}
export async function getPaymentInvoice(userId, invoiceId, options = {}) {
  const id = owner(userId);
  if (typeof invoiceId !== 'string' || !/^[\p{L}\p{N}_-]{1,128}$/u.test(invoiceId)) throw failure('Mã chứng từ không hợp lệ.');
  // The billing module validates ownership and the immutable monetary snapshot.
  const detail = await (options.billingDetail || getTransactionBillingDetail)(id, invoiceId);
  if (!detail || detail.status !== 'success') {
    throw failure('Giao dịch chưa hoàn tất để xem chứng từ.', 409, 'PAYMENT_INVOICE_UNAVAILABLE');
  }
  if (typeof detail.invoice?.code !== 'string' || !detail.invoice.code ||
      !Number.isSafeInteger(detail.order?.total_number) || detail.order.total_number < 0) {
    throw failure('Dữ liệu chứng từ chưa đầy đủ.', 409, 'PAYMENT_INVOICE_INCOMPLETE');
  }
  return detail;
}
export async function getPaymentInvoices(userId, query = {}, options = {}) {
  const page = await purchasePage(userId, query, options, true);
  const items = await Promise.all(page.items.map(async row => {
    const id = row.transaction_id || row.order_id;
    const detail = await getPaymentInvoice(userId, id, options);
    return { id, orderId: detail.order_id, code: detail.invoice.code, issuedAt: detail.invoice.issuedAt,
      amount: detail.order.total_number, currency: detail.order.currency,
      detailHref: `/main/profile/billing/${encodeURIComponent(row.order_id || id)}` };
  }));
  return { items, pagination: page.pagination };
}

/** No provider-linking integration exists yet; expose that capability instead of demo wallets. */
export function getPaymentMethods(userId) {
  owner(userId);
  return { items: [], supported: false };
}
export async function getPaymentSettings(userId, options = {}) {
  const id = owner(userId);
  const [preferences, transactions, invoices] = await Promise.all([
    getPaymentPreferences(id, options), getPaymentTransactions(id, { limit: 5 }, options),
    getPaymentInvoices(id, { limit: 5 }, options),
  ]);
  return { preferences, capabilities: { ...CAPABILITIES }, methods: getPaymentMethods(id),
    transactions, invoices, links: { transactions: '/main/profile/billing' } };
}

export function createPaymentSettingsRouter(express, requireAuth, options = {}) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handle = operation => async (req, res) => {
    try { res.json({ success: true, data: await operation(req) }); }
    catch (error) {
      const local = error.code?.startsWith?.('PAYMENT_') && error.status >= 400 && error.status < 500;
      const billing = [400, 403, 404, 409].includes(error.status) && !local;
      res.status(local || billing ? error.status : 503).json({ success: false,
        code: local ? error.code : billing ? `PAYMENT_BILLING_${error.status}` : 'PAYMENT_SETTINGS_UNAVAILABLE',
        message: local ? error.message : billing ? 'Không thể truy cập chứng từ theo yêu cầu.'
          : 'Không thể xử lý cài đặt thanh toán lúc này. Vui lòng thử lại.' });
    }
  };
  router.get('/', handle(req => getPaymentSettings(req.userId, options)));
  router.get('/preferences', handle(req => getPaymentPreferences(req.userId, options)));
  router.patch('/preferences', handle(req => updatePaymentPreferences(req.userId, req.body, options)));
  router.get('/methods', handle(req => getPaymentMethods(req.userId)));
  router.get('/transactions', handle(req => getPaymentTransactions(req.userId, req.query, options)));
  router.get('/invoices', handle(req => getPaymentInvoices(req.userId, req.query, options)));
  router.get('/invoices/:id', handle(req => getPaymentInvoice(req.userId, req.params.id, options)));
  return router;
}
