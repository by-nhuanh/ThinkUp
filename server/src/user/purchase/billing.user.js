import { getLearningPreferences, DEFAULT_LEARNING_PREFERENCES, learningDateParts } from '../learning-settings/learning-settings.user.js';
/**
 * Module xử lý truy xuất chi tiết giao dịch, thông tin đơn hàng, thanh toán
 * và hóa đơn điện tử (Billing & Transaction Detail).
 *
 * Đáp ứng nghiệp vụ trang Chi Tiết Giao Dịch:
 * - Trạng thái & thời gian hoàn tất (thời gian ghi nhận giao dịch)
 * - Mã giao dịch, mã đơn hàng, phương thức thanh toán, thời gian tạo, thời gian hoàn thành, nội dung thanh toán
 * - Thông tin đơn hàng: số khóa học, tên khóa học, tác giả/giảng viên, giá giảm & giá gốc, hình ảnh bìa
 * - Bóc tách giá trị: giá tạm tính theo giá gốc, tổng giảm giá khóa học, mã giảm giá + số tiền giảm, tổng thanh toán thực trả
 * - Thông tin thanh toán: phương thức, tên ngân hàng lựa chọn, số tài khoản, chủ tài khoản, nội dung chuyển khoản, số tiền đã thanh toán, thời gian thanh toán (ngày, tháng, năm, giờ, phút, giây), trạng thái
 * - Hóa đơn điện tử: mã hóa đơn, mã đơn hàng, thời gian phát hành, trạng thái
 * - Thông tin người mua: họ và tên, email, số điện thoại
 */

import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';

// ─── 0. Hằng Số Nghiệp Vụ ────────────────────────────────────────────────────

export const COLLECTION_TRANSACTIONS = 'payment_transactions';
export const COLLECTION_USERS = 'users';
export const COLLECTION_COURSES = 'courses';
export const COLLECTION_INSTRUCTORS = 'instructor_profiles';

/** Tài khoản nhận thanh toán mặc định của ThinkUp */
export const DEFAULT_BANK_INFO = {
  bankName: 'Vietcombank (Ngân hàng TMCP Ngoại thương Việt Nam)',
  accountNumber: '1029384756',
  accountName: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ GIÁO DỤC THINKUP',
};

// ─── 1. Hàm Tiện Ích Định Dạng Dữ Liệu ───────────────────────────────────────

/**
 * Định dạng số tiền VND thành chuỗi có ký hiệu 'đ'.
 * Ví dụ: 499000 -> "499.000đ"
 *
 * @param {number|string} value
 * @returns {string}
 */
export function formatVND(value) {
  const num = Math.round(Number(value) || 0);
  return `${new Intl.NumberFormat('vi-VN').format(num)}đ`;
}

/**
 * Parse chuỗi ngày bất kỳ ("YYYY-MM-DD HH:MM:SS", ISO, v.v.)
 * Trả về object chứa các định dạng ngày giờ chuẩn tiếng Việt:
 * - dateOnly: "15/10/2026"
 * - timeOnly: "21:30:45"
 * - full: "15/10/2026 21:30:45" (ngày, tháng, năm, giờ, phút, giây)
 * - text: "Ngày 15 tháng 10 năm 2026, 21:30:45"
 * - iso: ISO string
 *
 * @param {string|Date|null} rawDate
 * @returns {{ dateOnly: string, timeOnly: string, full: string, text: string, iso: string }|null}
 */
export function formatDateTimeParts(rawDate, timezone = DEFAULT_LEARNING_PREFERENCES.timezone) {
  const parts = learningDateParts(rawDate, timezone);
  if (!parts) return null;
  const [d, m, y] = parts.dateOnly.split('/');
  return { dateOnly: parts.dateOnly, timeOnly: parts.timeOnly,
    full: `${parts.dateOnly} ${parts.timeOnly}`, text: `Ngày ${d} tháng ${m} năm ${y}, ${parts.timeOnly}`, iso: parts.iso };
}

/**
 * Phân tích order_summary JSON từ chuỗi sang object an toàn.
 *
 * @param {string|object} raw
 * @returns {{ courses: Array<any>, subtotal: number, total: number }}
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

function requireSnapshotAmount(value, fieldName) {
  const amount = Number(value);
  if (!['number', 'string'].includes(typeof value)
      || typeof value === 'string' && value.trim() === ''
      || !Number.isSafeInteger(amount) || amount < 0) {
    const error = new Error(`Snapshot đơn hàng thiếu hoặc sai dữ liệu tiền tệ: ${fieldName}.`);
    error.status = 409;
    error.code = 'BILLING_SNAPSHOT_INCOMPLETE';
    throw error;
  }
  return amount;
}

/**
 * Trích xuất tên ngân hàng từ payment_method hoặc các trường liên quan.
 *
 * @param {string} paymentMethod
 * @param {string} [customBankName]
 * @returns {string}
 */
function resolveBankName(paymentMethod, customBankName) {
  if (customBankName && customBankName.trim()) {
    return customBankName.trim();
  }

  const method = String(paymentMethod || '').toLowerCase();

  const bankKeywords = [
    { key: 'vietcombank', name: 'Vietcombank (Ngân hàng Ngoại thương Việt Nam)' },
    { key: 'mbbank', name: 'MB Bank (Ngân hàng Quân đội)' },
    { key: 'mb bank', name: 'MB Bank (Ngân hàng Quân đội)' },
    { key: 'techcombank', name: 'Techcombank (Ngân hàng Kỹ thương)' },
    { key: 'bidv', name: 'BIDV (Ngân hàng Đầu tư và Phát triển)' },
    { key: 'vietinbank', name: 'VietinBank (Ngân hàng Công thương)' },
    { key: 'acb', name: 'ACB (Ngân hàng Á Châu)' },
    { key: 'tpbank', name: 'TPBank (Ngân hàng Tiên Phong)' },
    { key: 'vpbank', name: 'VPBank (Ngân hàng Việt Nam Thịnh vượng)' },
    { key: 'agribank', name: 'Agribank (Ngân hàng Nông nghiệp)' },
    { key: 'sacombank', name: 'Sacombank (Ngân hàng Sài Gòn Thương Tín)' },
    { key: 'hdbank', name: 'HDBank (Ngân hàng Phát triển TP.HCM)' },
    { key: 'vnpay', name: 'Cổng thanh toán VNPAY' },
    { key: 'momo', name: 'Ví điện tử MoMo' },
    { key: 'zalopay', name: 'Ví điện tử ZaloPay' },
    { key: 'paypal', name: 'Cổng thanh toán quốc tế PayPal' },
  ];

  for (const b of bankKeywords) {
    if (method.includes(b.key)) {
      return b.name;
    }
  }

  if (method.includes('ngân hàng') || method.includes('chuyển khoản') || method.includes('atm') || method.includes('bank')) {
    return DEFAULT_BANK_INFO.bankName;
  }

  return paymentMethod || DEFAULT_BANK_INFO.bankName;
}

// ─── 2. Hàm Nghiệp Vụ Truy Xuất Chi Tiết Hóa Đơn & Giao Dịch ─────────────────

/**
 * Truy xuất chi tiết toàn diện của một giao dịch theo transaction_id hoặc order_id.
 *
 * Đảm bảo:
 * - Bảo mật: chỉ trả về nếu giao dịch thuộc về `userId` đã đăng nhập (hoặc nếu gọi từ module nội bộ với quyền hợp lệ).
 * - Bổ sung đầy đủ thông tin: người mua, khóa học (ảnh bìa, giá gốc, giá giảm, giảng viên), bóc tách số tiền,
 *   thông tin chuyển khoản, thời gian ghi nhận/thanh toán/phát hành hóa đơn.
 *
 * @param {string} userId - ID người dùng hiện tại (bắt buộc).
 * @param {string} id - Mã giao dịch (GD...) hoặc mã đơn hàng (DH...) hoặc MongoDB _id.
 * @returns {Promise<object>} Đối tượng chi tiết giao dịch & hóa đơn hoàn chỉnh.
 */
export async function getTransactionBillingDetail(userId, id, options = {}) {
  if (!userId) {
    const err = new Error('Yêu cầu đăng nhập để xem chi tiết giao dịch.');
    err.status = 401;
    throw err;
  }

  if (!id || !String(id).trim()) {
    const err = new Error('Mã giao dịch hoặc mã đơn hàng không được để trống.');
    err.status = 400;
    throw err;
  }

  const queryId = String(id).trim();
  const db = options.db || await getMongoDb();
  const txCol = db.collection(COLLECTION_TRANSACTIONS);
  const usersCol = db.collection(COLLECTION_USERS);
  const coursesCol = db.collection(COLLECTION_COURSES);
  const instructorCol = db.collection(COLLECTION_INSTRUCTORS);

  // 1. Tìm bản ghi giao dịch theo mã
  const orConditions = [
    { transaction_id: queryId },
    { order_id: queryId },
    { id: queryId },
  ];
  if (ObjectId.isValid(queryId)) {
    orConditions.push({ _id: new ObjectId(queryId) });
  }

  const txDoc = await txCol.findOne({
    $or: orConditions,
  });

  if (!txDoc) {
    const err = new Error(`Không tìm thấy giao dịch với mã: ${queryId}`);
    err.status = 404;
    throw err;
  }

  // Kiểm tra quyền sở hữu giao dịch (so khớp user_id linh hoạt cả id số và ObjectId)
  let isOwner = String(txDoc.user_id) === String(userId);
  if (!isOwner) {
    try {
      const requesterUser = await usersCol.findOne({
        $or: [
          { id: String(userId) },
          ...(ObjectId.isValid(String(userId)) ? [{ _id: new ObjectId(String(userId)) }] : []),
        ],
      });
      if (requesterUser) {
        const validIds = [String(requesterUser._id), String(requesterUser.id || '')].filter(Boolean);
        isOwner = validIds.includes(String(txDoc.user_id));
      }
    } catch {
      // Bỏ qua nếu lỗi
    }
  }

  if (!isOwner) {
    const err = new Error('Bạn không có quyền truy cập thông tin giao dịch này.');
    err.status = 403;
    throw err;
  }

  const { timezone } = await getLearningPreferences(String(userId), { db });

  // 2. Truy xuất thông tin người mua (User)
  const buyerUserConditions = [
    { id: String(txDoc.user_id) },
  ];
  if (ObjectId.isValid(String(txDoc.user_id))) {
    buyerUserConditions.push({ _id: new ObjectId(String(txDoc.user_id)) });
  }
  const buyerDoc = await usersCol.findOne({ $or: buyerUserConditions });

  const buyer = {
    name: buyerDoc?.full_name || buyerDoc?.name || 'Khách hàng ThinkUp',
    email: buyerDoc?.email || '',
    phone: buyerDoc?.phone || buyerDoc?.phone_number || '',
  };

  // 3. Phân tích danh sách khóa học và bổ sung thông tin từ collection courses
  const summary = parseOrderSummary(txDoc.order_summary);
  const rawCourses = Array.isArray(summary.courses) ? summary.courses : [];
  if (rawCourses.length === 0) {
    const error = new Error('Snapshot đơn hàng không có danh sách khóa học và giá tại thời điểm mua.');
    error.status = 409;
    error.code = 'BILLING_SNAPSHOT_INCOMPLETE';
    throw error;
  }

  const snapshotSubtotalOriginal = requireSnapshotAmount(summary.subtotal, 'subtotal');
  const snapshotSubtotalSale = requireSnapshotAmount(summary.sale_subtotal, 'sale_subtotal');
  const voucherCode = typeof summary.voucher_code === 'string' ? summary.voucher_code : '';
  const voucherDiscount = requireSnapshotAmount(summary.voucher_discount, 'voucher_discount');
  const snapshotTotal = requireSnapshotAmount(summary.total, 'total');
  if (voucherDiscount > 0 && !voucherCode) {
    const error = new Error('Snapshot có giảm giá nhưng thiếu mã giảm giá đã áp dụng.');
    error.status = 409;
    error.code = 'BILLING_SNAPSHOT_INCOMPLETE';
    throw error;
  }

  const enrichedCourses = [];
  let coursesSubtotalOriginal = 0;
  let coursesSubtotalSale = 0;

  for (const c of rawCourses) {
    const salePrice = requireSnapshotAmount(c.price, `courses.${c.id || 'unknown'}.price`);
    const originalPrice = requireSnapshotAmount(c.original_price, `courses.${c.id || 'unknown'}.original_price`);
    const rawCourseId = String(c.id || '');
    const cleanId = rawCourseId.replace(/^course-/, '');

    const courseQuery = [
      { course_id: cleanId },
      { course_id: rawCourseId },
      { slug: rawCourseId },
    ];
    if (ObjectId.isValid(rawCourseId)) {
      courseQuery.push({ _id: new ObjectId(rawCourseId) });
    }

    const courseDoc = await coursesCol.findOne({ $or: courseQuery });

    // Tác giả/giảng viên
    let instructorName = c.instructor || '';
    if (!instructorName && courseDoc?.instructor_id) {
      const instrDoc = await instructorCol.findOne({ user_id: String(courseDoc.instructor_id) });
      if (instrDoc?.full_name) {
        instructorName = instrDoc.full_name;
      } else {
        const instrUser = await usersCol.findOne({
          $or: [
            { id: String(courseDoc.instructor_id) },
            ...(ObjectId.isValid(String(courseDoc.instructor_id)) ? [{ _id: new ObjectId(String(courseDoc.instructor_id)) }] : []),
          ],
        });
        instructorName = instrUser?.full_name || 'Giảng viên ThinkUp';
      }
    }
    if (!instructorName) {
      instructorName = 'Giảng viên ThinkUp';
    }

    coursesSubtotalOriginal += originalPrice;
    coursesSubtotalSale += salePrice;

    // Ảnh bìa ưu tiên từ order_summary hoặc courseDoc
    const thumbUrl = c.thumbnail_url || c.thumbnail || courseDoc?.thumbnail_url || '';

    enrichedCourses.push({
      id: rawCourseId || (courseDoc ? `course-${courseDoc.course_id}` : ''),
      course_id: courseDoc?.course_id || cleanId,
      title: c.title || courseDoc?.title || 'Khóa học ThinkUp',
      instructor: instructorName,
      price: formatVND(salePrice),
      price_number: salePrice,
      original_price: formatVND(originalPrice),
      original_price_number: originalPrice,
      thumbnail_url: thumbUrl,
      thumbnail: thumbUrl,
      badge: courseDoc?.badge || courseDoc?.icon || 'Course',
      tone: 'blue',
    });
  }

  const subtotalOriginal = snapshotSubtotalOriginal;
  const subtotalSale = snapshotSubtotalSale;
  const actualAmount = requireSnapshotAmount(txDoc.amount, 'transaction.amount');
  if (coursesSubtotalOriginal !== subtotalOriginal || coursesSubtotalSale !== subtotalSale
      || Math.max(0, subtotalSale - voucherDiscount) !== snapshotTotal || actualAmount !== snapshotTotal) {
    const error = new Error('Các khoản tiền trong snapshot không khớp với chi tiết khóa học và giao dịch.');
    error.status = 409;
    error.code = 'BILLING_SNAPSHOT_INCONSISTENT';
    throw error;
  }

  // 4. Tính toán các khoản tiền theo yêu cầu bóc tách
  // Tổng giảm giá khóa học = (giá gốc - giá bán)
  const courseDiscount = Math.max(0, subtotalOriginal - subtotalSale);

  // Mã giảm giá và số tiền giảm giá
  const totalPayment = snapshotTotal;

  // 5. Xử lý thời gian và trạng thái
  const isSuccess = txDoc.status === 'success';
  const createdDateParts = formatDateTimeParts(txDoc.created_at, timezone);
  const paidDateParts = formatDateTimeParts(txDoc.paid_at || (isSuccess ? txDoc.updated_at : null), timezone);
  const completedDateParts = formatDateTimeParts(txDoc.paid_at || (isSuccess ? txDoc.updated_at : txDoc.created_at), timezone);

  // Mã định danh
  const orderId = txDoc.order_id || txDoc.transaction_id;
  const transactionId = txDoc.transaction_id;
  const invoiceCode = isSuccess ? (txDoc.invoice_code || `HD-${orderId}`) : 'Chưa phát hành';
  const invoiceIssuedAt = isSuccess
    ? (paidDateParts ? paidDateParts.full : (createdDateParts ? createdDateParts.full : '—'))
    : 'Chưa phát hành';

  // Thông tin ngân hàng & phương thức thanh toán
  const paymentMethod = txDoc.payment_method || 'Chuyển khoản trực tiếp';
  const bankName = resolveBankName(paymentMethod, txDoc.bank_name || txDoc.bank);
  const bankAccountNumber = txDoc.account_number || DEFAULT_BANK_INFO.accountNumber;
  const bankAccountName = txDoc.account_name || DEFAULT_BANK_INFO.accountName;
  const transferContent = txDoc.transfer_content || txDoc.payment_content || `THINKUP ${orderId}`;
  const bankTransactionCode = isSuccess
    ? (txDoc.sandbox_code || txDoc.payment_code || `FT-${transactionId.replace(/^GD/, '')}`)
    : '—';

  // Nội dung thanh toán
  const paymentContent = txDoc.payment_content || `Thanh toán đơn hàng ${orderId}`;

  // 6. Đóng gói kết quả: Hỗ trợ cả chuẩn camelCase (cho UI Frontend) và cấu trúc đầy đủ
  const detail = {
    // Mã & Trạng thái chung
    id: orderId,
    order_id: orderId,
    transaction_id: transactionId,
    transactionCode: transactionId,
    status: txDoc.status || 'pending',
    status_label: isSuccess ? 'Thành công' : (txDoc.status === 'failed' ? 'Thất bại' : 'Đang xử lý'),

    // Phương thức & Nội dung
    payment_method: paymentMethod,
    paymentMethod,
    payment_content: paymentContent,
    paymentContent,

    // Thời gian chi tiết
    created_at: createdDateParts ? createdDateParts.full : (txDoc.created_at || ''),
    createdAt: createdDateParts ? createdDateParts.full : (txDoc.created_at || ''),
    created_at_iso: createdDateParts ? createdDateParts.iso : '',

    paid_at: isSuccess && paidDateParts ? paidDateParts.full : 'Chưa thanh toán',
    paidAt: isSuccess && paidDateParts ? paidDateParts.full : 'Chưa thanh toán',
    paid_at_parts: isSuccess && paidDateParts ? paidDateParts : null,

    completed_at: isSuccess && completedDateParts ? completedDateParts.full : 'Chưa hoàn tất',
    completedAt: isSuccess && completedDateParts ? completedDateParts.full : 'Chưa hoàn tất',
    completed_at_parts: isSuccess && completedDateParts ? completedDateParts : null,

    // Thông tin đơn hàng (Order)
    order: {
      count: enrichedCourses.length,
      countLabel: `${enrichedCourses.length} khóa học`,
      courses: enrichedCourses.map(c => ({
        id: c.id,
        course_id: c.course_id,
        title: c.title,
        instructor: c.instructor,
        price: c.price,
        price_number: c.price_number,
        originalPrice: c.original_price,
        original_price: c.original_price,
        original_price_number: c.original_price_number,
        thumbnail_url: c.thumbnail_url,
        badge: c.badge,
        tone: c.tone,
      })),
      // Giá tạm tính tổng đơn hàng theo giá gốc (chưa trừ giảm giá)
      subtotal: formatVND(subtotalOriginal),
      subtotal_number: subtotalOriginal,
      // Tổng tiền giảm giá khóa học
      courseDiscount: formatVND(courseDiscount),
      course_discount: formatVND(courseDiscount),
      course_discount_number: courseDiscount,
      // Tổng tiền mã giảm giá
      voucherDiscount: voucherDiscount > 0 ? `-${formatVND(voucherDiscount)}` : formatVND(0),
      voucher_discount: formatVND(voucherDiscount),
      voucher_discount_number: voucherDiscount,
      voucherCode,
      voucher_code: voucherCode,
      // Tổng thanh toán đơn hàng thực sự trả
      total: formatVND(totalPayment),
      total_number: totalPayment,
      currency: txDoc.currency || 'VND',
    },

    // Thông tin thanh toán (Payment)
    payment: {
      method: paymentMethod,
      bank: bankName,
      bank_name: bankName,
      accountNumber: bankAccountNumber,
      account_number: bankAccountNumber,
      accountName: bankAccountName,
      account_name: bankAccountName,
      transferContent,
      transfer_content: transferContent,
      paidAmount: isSuccess ? formatVND(totalPayment) : formatVND(0),
      paid_amount: isSuccess ? totalPayment : 0,
      bankTransactionCode,
      bank_transaction_code: bankTransactionCode,
      paidAt: isSuccess && paidDateParts ? paidDateParts.full : 'Chưa thanh toán',
      paid_at: isSuccess && paidDateParts ? paidDateParts.full : 'Chưa thanh toán',
      paid_at_date_only: paidDateParts ? paidDateParts.dateOnly : '',
      paid_at_time_only: paidDateParts ? paidDateParts.timeOnly : '',
      paid_at_text: paidDateParts ? paidDateParts.text : '',
      status: txDoc.status || 'pending',
    },

    // Hóa đơn điện tử (Invoice)
    invoice: {
      code: invoiceCode,
      order_id: orderId,
      issuedAt: invoiceIssuedAt,
      issued_at: invoiceIssuedAt,
      status: isSuccess ? 'Đã phát hành' : 'Chưa phát hành',
      buyer: {
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
      },
    },

    // Thông tin người mua riêng biệt ở tầng gốc
    buyer: {
      name: buyer.name,
      full_name: buyer.name,
      email: buyer.email,
      phone: buyer.phone,
    },
  };

  return { ...detail, timezone };
}

// ─── 3. Router Express Cho Module Billing ────────────────────────────────────

/**
 * Khởi tạo Router Express cho phần hóa đơn và chi tiết giao dịch.
 *
 * Endpoints hỗ trợ:
 *   GET /:id          → Truy xuất chi tiết hóa đơn & giao dịch theo mã (order_id hoặc transaction_id)
 *   GET /detail/:id   → Alias chi tiết
 *   GET /invoice/:id  → Alias hóa đơn
 *
 * @param {import('express')} express
 * @param {Function} requireAuth - Middleware xác thực JWT
 * @returns {import('express').Router}
 */
export function createBillingRouter(express, requireAuth) {
  const router = express.Router();

  const handleGetDetail = async (req, res, next) => {
    try {
      const transactionId = req.params.id;
      const detail = await getTransactionBillingDetail(req.userId, transactionId);
      res.json(detail);
    } catch (err) {
      next(err);
    }
  };

  router.get('/:id', requireAuth, handleGetDetail);
  router.get('/detail/:id', requireAuth, handleGetDetail);
  router.get('/invoice/:id', requireAuth, handleGetDetail);

  return router;
}
