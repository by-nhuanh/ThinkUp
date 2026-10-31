import { getLearningPreferences, learningDateParts, learningUtcDate, learningDateRange } from '../learning-settings/learning-settings.user.js';
import { getMongoDb } from '../db.js';
import { getTransactionBillingDetail } from './billing.user.js';

// ─── 0. Hằng Số Nghiệp Vụ ────────────────────────────────────────────────────

/**
 * Collection chính lưu giao dịch thanh toán.
 * Mỗi document chứa: transaction_id, user_id, payment_method,
 * amount, currency, status, order_summary (JSON), created_at.
 */
const COLLECTION_TRANSACTIONS = 'payment_transactions';

/**
 * Trạng thái giao dịch hợp lệ trong hệ thống.
 */
const VALID_STATUSES = ['success', 'paid', 'pending', 'failed', 'cancelled', 'expired', 'needs_review'];

/**
 * Trạng thái được coi là "thành công" theo nghiệp vụ.
 */
const STATUS_SUCCESS = 'success';

// ─── 1. Hàm Tiện Ích Nội Bộ ─────────────────────────────────────────────────

/**
 * Phân tích order_summary JSON từ chuỗi sang object.
 * Trả về { courses: [], subtotal: 0, total: 0 } nếu không hợp lệ.
 *
 * @param {string|object} raw
 * @returns {{ courses: Array<{id: string, title: string, price: number}>, subtotal: number, total: number }}
 */
function parseOrderSummary(raw) {
  if (!raw) return { courses: [], subtotal: 0, total: 0 };
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { courses: [], subtotal: 0, total: 0 };
  }
}

/**
 * Chuẩn hóa ngày MongoDB Date, timestamp hoặc chuỗi ngày sang Date object.
 * Trả về null nếu không hợp lệ.
 *
 * @param {Date|string|number} dateValue
 * @returns {Date|null}
 */
function parseTransactionDate(dateValue) { return learningUtcDate(dateValue); }

/**
 * Định dạng một document giao dịch thô thành object chuẩn trả về API.
 *
 * Phân biệt rõ hai loại mã:
 * - order_id     : Mã đơn hàng (tiền tố DH). Sinh khi người dùng nhấn thanh toán.
 *                  Lấy từ trường `order_id` trong document, hoặc fallback về `transaction_id`.
 * - transaction_id: Mã giao dịch (tiền tố GD/TXN). Điền vào ô mô tả chuyển khoản.
 *                  Lấy từ trường `transaction_id` trong document.
 *
 * Loại bỏ trường nội bộ nhạy cảm: _id, sandbox_code, payment_code,
 * callback_url, payment_url.
 *
 * @param {object} doc
 * @returns {object}
 */
function formatTransaction(doc) {
  const summary = parseOrderSummary(doc.order_summary);
  const courses = Array.isArray(summary.courses) ? summary.courses : [];

  return {
    // Mã đơn hàng: ưu tiên trường order_id (DH...) nếu có, fallback transaction_id cũ
    order_id: doc.order_id || doc.transaction_id,
    // Mã giao dịch thanh toán: được điền vào ô mô tả chuyển khoản
    transaction_id: doc.transaction_id,
    user_id: doc.user_id,
    payment_method: doc.payment_method || '',
    provider: doc.provider || '',
    amount: parseFloat(doc.amount) || 0,
    currency: doc.currency || 'VND',
    status: doc.status || 'pending',
    voucher_code: doc.voucher_code || '',
    voucher_discount: parseFloat(doc.voucher_discount) || 0,
    course_count: parseInt(doc.course_count, 10) || courses.length,
    courses,
    created_at: doc.created_at || null,
    paid_at: doc.paid_at || null,
  };
}

// ─── 2. Hàm Nghiệp Vụ Chính ──────────────────────────────────────────────────

/**
 * Lấy toàn bộ giao dịch của người dùng từ CSDL (chưa lọc).
 * Tất cả bộ lọc được thực hiện trên kết quả trả về.
 *
 * @param {string} userId - ID người dùng hiện tại (lấy từ JWT).
 * @returns {Promise<object[]>} Mảng transaction đã được định dạng.
 */
async function fetchUserTransactions(userId, options = {}) {
  const db = options.db || await getMongoDb();
  const col = db.collection(COLLECTION_TRANSACTIONS);

  // Lấy các định danh khả dĩ của user (hỗ trợ cả ObjectId và integer id dạng chuỗi)
  const userIds = [String(userId)];
  try {
    const { ObjectId } = await import('mongodb');
    const userConditions = [{ id: String(userId) }];
    if (ObjectId.isValid(String(userId))) {
      userConditions.push({ _id: new ObjectId(String(userId)) });
    }
    const userDoc = await db.collection('users').findOne({ $or: userConditions });
    if (userDoc) {
      if (userDoc._id) userIds.push(userDoc._id.toString());
      if (userDoc.id) userIds.push(String(userDoc.id));
    }
  } catch {
    // Dự phòng nếu lỗi tra cứu user
  }

  const uniqueUserIds = [...new Set(userIds)];

  // Chỉ lấy giao dịch thuộc về user này, sắp xếp mới nhất trước
  const docs = await col
    .find({ user_id: { $in: uniqueUserIds } })
    .sort({ created_at: -1 })
    .toArray();

  return docs.map(formatTransaction);
}

/**
 * Tính thống kê tổng hợp cho lịch sử mua hàng của người dùng.
 * Chỉ tính trên giao dịch của chính user đó (không tính toàn hệ thống).
 *
 * Kết quả:
 * - totalTransactions: tổng số giao dịch (tất cả trạng thái)
 * - totalSpent: tổng tiền đã chi tiêu (chỉ giao dịch SUCCESS)
 * - totalCoursesPurchased: tổng số khóa học đã mua (chỉ giao dịch SUCCESS)
 *
 * @param {string} userId
 * @returns {Promise<{ totalTransactions: number, totalSpent: number, totalCoursesPurchased: number }>}
 */
export async function getPurchaseSummary(userId) {
  if (!userId) {
    const err = new Error('Yêu cầu đăng nhập để xem lịch sử mua hàng.');
    err.status = 401;
    throw err;
  }

  const transactions = await fetchUserTransactions(userId);

  const totalTransactions = transactions.length;

  // Chỉ tính tiền và số khóa học từ giao dịch thành công
  const successTxns = transactions.filter(t => t.status === STATUS_SUCCESS);
  const totalSpent = successTxns.reduce((sum, t) => sum + t.amount, 0);
  const totalCoursesPurchased = successTxns.reduce((sum, t) => sum + (t.course_count || 0), 0);

  return {
    totalTransactions,
    totalSpent,
    totalCoursesPurchased,
  };
}

/**
 * Lấy danh sách giao dịch của người dùng với hỗ trợ:
 * - Lọc theo trạng thái (status)
 * - Tìm kiếm theo **mã đơn hàng (order_id)** hoặc **mã giao dịch (transaction_id)** hoặc **tên khóa học** (khớp một phần, không phân biệt hoa thường)
 * - Lọc theo khoảng thời gian (preset hoặc from/to tùy chọn)
 *
 * @param {string} userId
 * @param {object} filters
 * @param {string} [filters.status] - 'success' | 'paid' | 'pending' | 'failed' | 'cancelled' | 'expired' | 'needs_review' | '' (tất cả)
 * @param {string} [filters.keyword] - Từ khóa tìm kiếm: khớp **mã đơn hàng (DH...)**, **mã giao dịch (GD/TXN...)** hoặc **tên khóa học**
 * @param {string} [filters.datePreset] - 'today'|'yesterday'|'last7days'|'last30days'|'thismonth'|'lastmonth'
 * @param {string} [filters.dateFrom] - Ngày bắt đầu tùy chọn (ISO string hoặc 'YYYY-MM-DD')
 * @param {string} [filters.dateTo] - Ngày kết thúc tùy chọn (ISO string hoặc 'YYYY-MM-DD')
 * @returns {Promise<{ transactions: object[], total: number }>}
 */
export async function getPurchaseHistory(userId, filters = {}, options = {}) {
  if (!userId) {
    const err = new Error('Yêu cầu đăng nhập để xem lịch sử mua hàng.');
    err.status = 401;
    throw err;
  }

  // Validate status filter nếu có
  const { status, keyword, datePreset, dateFrom, dateTo } = filters;
  if (status && !VALID_STATUSES.includes(status)) {
    const err = new Error(`Trạng thái lọc không hợp lệ. Giá trị hợp lệ: ${VALID_STATUSES.join(', ')}.`);
    err.status = 400;
    throw err;
  }

  // Lấy toàn bộ giao dịch của user
  const db = options.db || await getMongoDb();
  const { timezone } = await getLearningPreferences(String(userId), { db });
  let transactions = await fetchUserTransactions(userId, { db });

  // ── Bộ lọc 1: Trạng thái ──────────────────────────────────────────────────
  if (status) {
    transactions = transactions.filter(t => t.status === status);
  }

  // ── Bộ lọc 2: Từ khóa tìm kiếm ───────────────────────────────────────────
  // Khớp từng ký tự người dùng nhập: tìm trong mã đơn hàng (order_id),
  // mã giao dịch (transaction_id) hoặc tên khóa học
  if (keyword && keyword.trim()) {
    const needle = keyword.trim().toLowerCase();
    transactions = transactions.filter(t => {
      const matchOrderId = (t.order_id || '').toLowerCase().includes(needle);
      const matchTxnId = (t.transaction_id || '').toLowerCase().includes(needle);
      const matchCourse = t.courses.some(c =>
        (c.title || '').toLowerCase().includes(needle)
      );
      return matchOrderId || matchTxnId || matchCourse;
    });
  }

  // ── Bộ lọc 3: Khoảng thời gian ───────────────────────────────────────────
  const { from: rangeFrom, to: rangeTo } = learningDateRange({ datePreset, dateFrom, dateTo }, timezone, options.now || new Date());

  if (rangeFrom || rangeTo) {
    transactions = transactions.filter(t => {
      const txDate = parseTransactionDate(t.created_at);
      if (!txDate) return false;
      if (rangeFrom && txDate < rangeFrom) return false;
      if (rangeTo && txDate > rangeTo) return false;
      return true;
    });
  }

  return {
    timezone,
    transactions: transactions.map(tx => ({ ...tx, created_at_local: learningDateParts(tx.created_at, timezone), paid_at_local: learningDateParts(tx.paid_at, timezone) })),
    total: transactions.length,
  };
}

// ─── 3. Router Express ────────────────────────────────────────────────────────

/**
 * Tạo router Express cho chức năng Lịch sử mua hàng (User).
 * Cần được gắn với middleware requireAuth trước khi sử dụng.
 *
 * Endpoints:
 *   GET /summary   → Thống kê tổng hợp (tổng GD, tổng tiền, số KH)
 *   GET /          → Danh sách giao dịch có lọc, tìm kiếm, phân trang
 *
 * @param {import('express')} express
 * @param {Function} requireAuth - Middleware xác thực JWT từ server.js
 * @returns {import('express').Router}
 */
export function createPurchaseRouter(express, requireAuth) {
  const router = express.Router();

  /**
   * GET /api/user/purchase/summary
   * Trả về: { totalTransactions, totalSpent, totalCoursesPurchased }
   */
  router.get('/summary', requireAuth, async (req, res, next) => {
    try {
      const result = await getPurchaseSummary(req.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/user/purchase/
   * Query params:
   *   status       - Lọc trạng thái: success | pending | failed | cancelled
   *   keyword      - Tìm kiếm mã GD hoặc tên khóa học
   *   datePreset   - today | yesterday | last7days | last30days | thismonth | lastmonth
   *   dateFrom     - Ngày bắt đầu tùy chọn (YYYY-MM-DD)
   *   dateTo       - Ngày kết thúc tùy chọn (YYYY-MM-DD)
   *
   * Trả về: { transactions: [...], total: number }
   */
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || '',
        keyword: req.query.keyword || '',
        datePreset: req.query.datePreset || '',
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
      };
      const result = await getPurchaseHistory(req.userId, filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/user/purchase/:id hoặc /api/user/purchase/detail/:id hoặc /api/user/purchase/billing/:id
   * Chi tiết giao dịch, thông tin đơn hàng, thông tin thanh toán và hóa đơn điện tử
   */
  const handleBillingDetail = async (req, res, next) => {
    try {
      const result = await getTransactionBillingDetail(req.userId, req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  router.get('/detail/:id', requireAuth, handleBillingDetail);
  router.get('/billing/:id', requireAuth, handleBillingDetail);
  router.get('/:id', requireAuth, handleBillingDetail);

  return router;
}

export { getTransactionBillingDetail };
