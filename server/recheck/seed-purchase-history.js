/**
 * Script tạo tài khoản demo có lịch sử mua hàng đầy đủ.
 *
 * Chạy: node recheck/seed-purchase-history.js
 *
 * Tài khoản được tạo:
 *   Email   : demo.buyer@thinkup.vn
 *   Mật khẩu: ThinkUp@2026
 *   Vai trò : student
 *
 * Dữ liệu khóa học và giá truy vấn THẬT từ collection `courses` trong CSDL.
 * Mã đơn hàng (DH...) và mã giao dịch (GD...) sinh bằng module order-id.user.js.
 *
 * LƯU Ý: Script chỉ chạy nếu tài khoản demo chưa tồn tại (idempotent).
 */

import { getMongoDb } from '../src/user/db.js';
import bcrypt from 'bcryptjs';
import { generateOrderId, generateTransactionId } from '../src/user/order/order-id.user.js';

// ─── Thông tin tài khoản demo ─────────────────────────────────────────────────
const DEMO_EMAIL = 'demo.buyer@thinkup.vn';
const DEMO_PASSWORD = 'ThinkUp@2026';
const DEMO_FULL_NAME = 'Trần Thị Demo Buyer';
const DEMO_PHONE = '0987654321';

/**
 * Format tiền VND thành chuỗi số không dấu để lưu DB (khớp với định dạng hiện tại).
 * @param {number} amount
 * @returns {string} VD: 499000 → "499000.00"
 */
function fmtAmount(amount) {
  return amount.toFixed(2);
}

/**
 * Format ngày thành chuỗi "YYYY-MM-DD HH:MM:SS" theo múi giờ VN (UTC+7).
 * @param {Date} d
 * @returns {string}
 */
function fmtDate(d) {
  const vnOffset = 7 * 60 * 60 * 1000;
  const vn = new Date(d.getTime() + vnOffset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())} `
    + `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:${pad(vn.getUTCSeconds())}`;
}

/**
 * Tạo ngày trong quá khứ tính từ hôm nay.
 * @param {number} daysAgo - Số ngày trước
 * @param {number} hour - Giờ (0-23)
 * @param {number} [minute=0]
 * @returns {Date}
 */
function daysAgo(daysAgo, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('🚀 Bắt đầu seed dữ liệu lịch sử mua hàng...\n');
  const db = await getMongoDb();

  // ─── 1. Kiểm tra và tạo tài khoản demo ─────────────────────────────────────
  console.log(`📋 Kiểm tra tài khoản: ${DEMO_EMAIL}`);
  const existingUser = await db.collection('users').findOne({ email: DEMO_EMAIL });

  let userId;
  if (existingUser) {
    userId = existingUser.id || String(existingUser._id);
    console.log(`   ✅ Tài khoản đã tồn tại (id=${userId}). Bỏ qua bước tạo.\n`);
  } else {
    // Lấy ID lớn nhất hiện tại để tạo ID mới không trùng
    const lastUser = await db.collection('users')
      .find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastUser.length > 0
      ? String(parseInt(lastUser[0].id || '0', 10) + 1)
      : '100';

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    await db.collection('users').insertOne({
      id: nextId,
      full_name: DEMO_FULL_NAME,
      email: DEMO_EMAIL,
      phone: DEMO_PHONE,
      password_hash: passwordHash,
      role: 'student',
      status: 'active',
      email_verified: true,
      onboarding_completed: true,
      created_at: fmtDate(new Date()),
      updated_at: fmtDate(new Date()),
      last_login_at: fmtDate(new Date()),
    });
    userId = nextId;
    console.log(`   ✅ Đã tạo tài khoản mới (id=${userId})\n`);
  }

  // ─── 2. Kiểm tra xem đã có transaction chưa ────────────────────────────────
  const existingTxCount = await db.collection('payment_transactions')
    .countDocuments({ user_id: String(userId) });

  if (existingTxCount > 0) {
    console.log(`ℹ️  Tài khoản đã có ${existingTxCount} giao dịch. Không tạo thêm để tránh trùng lặp.`);
    console.log('\n✅ Seed hoàn tất (không có gì thay đổi).');
    process.exit(0);
  }

  // ─── 3. Truy vấn khóa học thật từ CSDL ─────────────────────────────────────
  console.log('📚 Truy vấn khóa học thật từ CSDL...');
  const rawCourses = await db.collection('courses')
    .find({ status: 'published' })
    .project({ course_id: 1, title: 1, price: 1, original_price: 1, instructor_id: 1 })
    .toArray();

  if (rawCourses.length < 6) {
    console.error('❌ Không đủ khóa học published trong CSDL để tạo dữ liệu mẫu (cần ít nhất 6).');
    process.exit(1);
  }

  // Truy vấn tên giảng viên
  const instructorIds = [...new Set(rawCourses.map(c => c.instructor_id).filter(Boolean))];
  const instructors = await db.collection('instructor_profiles')
    .find({ user_id: { $in: instructorIds } })
    .project({ user_id: 1, full_name: 1 })
    .toArray();
  const instrMap = Object.fromEntries(instructors.map(i => [i.user_id, i.full_name]));

  /**
   * Helper: lấy khóa học theo index và map thành course object cho order_summary.
   */
  function getCourse(idx) {
    const c = rawCourses[idx];
    return {
      id: `course-${c.course_id}`,
      title: c.title,
      price: parseFloat(c.price),
      instructor: instrMap[c.instructor_id] || 'Giảng viên ThinkUp',
    };
  }

  console.log(`   ✅ Đã tải ${rawCourses.length} khóa học\n`);

  // ─── 4. Sinh mã đơn hàng và mã giao dịch ───────────────────────────────────
  console.log('🔑 Sinh mã đơn hàng (DH...) và mã giao dịch (GD...) ...');

  // Đơn hàng 1: Mua 1 khóa - THÀNH CÔNG (30 ngày trước)
  const order1 = { orderId: await generateOrderId(), transactionId: await generateTransactionId() };
  // Đơn hàng 2: Mua 2 khóa - THÀNH CÔNG (22 ngày trước)
  const order2 = { orderId: await generateOrderId(), transactionId: await generateTransactionId() };
  // Đơn hàng 3: Mua 1 khóa - THẤT BẠI (20 ngày trước, thử thanh toán lần 1)
  const order3 = { orderId: await generateOrderId(), transactionId: await generateTransactionId() };
  // Đơn hàng 3 retry: cùng đơn hàng - THÀNH CÔNG (19 ngày trước, thử lại lần 2)
  const order3Retry = { orderId: order3.orderId, transactionId: await generateTransactionId() };
  // Đơn hàng 4: Mua 3 khóa - THÀNH CÔNG (14 ngày trước)
  const order4 = { orderId: await generateOrderId(), transactionId: await generateTransactionId() };
  // Đơn hàng 5: Mua 2 khóa - ĐANG CHỜ (7 ngày trước)
  const order5 = { orderId: await generateOrderId(), transactionId: await generateTransactionId() };
  // Đơn hàng 6: Mua 1 khóa - ĐANG CHỜ (hôm nay)
  const order6 = { orderId: await generateOrderId(), transactionId: await generateTransactionId() };

  console.log(`   ✅ Đã sinh ${7} mã (5 orderId, 7 transactionId)\n`);

  // ─── 5. Tạo dữ liệu giao dịch ───────────────────────────────────────────────
  console.log('💳 Tạo các giao dịch...');

  const c0 = getCourse(0); // Fullstack Web với React & Node.js - 499k
  const c1 = getCourse(1); // React Native cho TMDT - 1099k
  const c2 = getCourse(2); // Business Analysis - 1299k
  const c3 = getCourse(3); // Quản Lý Dự Án Agile - 499k
  const c4 = getCourse(4); // Infrastructure as Code - 1099k
  const c5 = getCourse(5); // Azure Cloud - 799k
  const c6 = getCourse(6); // Machine Learning - 499k

  const transactions = [
    // ── GD1: 1 khóa, thành công, VNPAY, 30 ngày trước ──────────────────────
    {
      order_id: order1.orderId,
      transaction_id: order1.transactionId,
      user_id: String(userId),
      provider: 'vnpay',
      payment_method: 'QR Code (VNPAY-QR)',
      amount: fmtAmount(c0.price),
      currency: 'VND',
      status: 'success',
      voucher_code: '',
      voucher_discount: '0.00',
      course_count: '1',
      order_summary: JSON.stringify({
        courses: [{ id: c0.id, title: c0.title, price: c0.price }],
        subtotal: c0.price,
        total: c0.price,
      }),
      sandbox_code: 'VNPAYDEMO123',
      payment_code: `VNPAYDEMO123-${order1.transactionId}`,
      payment_url: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?amount=${c0.price}&txnRef=${order1.transactionId}`,
      callback_url: `/api/payments/callback?transaction=${order1.transactionId}`,
      created_at: fmtDate(daysAgo(30, 9, 15)),
      updated_at: fmtDate(daysAgo(30, 9, 17)),
      paid_at: fmtDate(daysAgo(30, 9, 17)),
    },

    // ── GD2: 2 khóa, thành công, MoMo, 22 ngày trước ───────────────────────
    {
      order_id: order2.orderId,
      transaction_id: order2.transactionId,
      user_id: String(userId),
      provider: 'momo',
      payment_method: 'MoMo',
      amount: fmtAmount(c1.price + c2.price),
      currency: 'VND',
      status: 'success',
      voucher_code: '',
      voucher_discount: '0.00',
      course_count: '2',
      order_summary: JSON.stringify({
        courses: [
          { id: c1.id, title: c1.title, price: c1.price },
          { id: c2.id, title: c2.title, price: c2.price },
        ],
        subtotal: c1.price + c2.price,
        total: c1.price + c2.price,
      }),
      sandbox_code: 'MOMODEMO123',
      payment_code: `MOMODEMO123-${order2.transactionId}`,
      payment_url: `https://test-payment.momo.vn/v2/gateway/pay?amount=${c1.price + c2.price}&orderId=${order2.orderId}`,
      callback_url: `/api/payments/callback?transaction=${order2.transactionId}`,
      created_at: fmtDate(daysAgo(22, 14, 30)),
      updated_at: fmtDate(daysAgo(22, 14, 32)),
      paid_at: fmtDate(daysAgo(22, 14, 32)),
    },

    // ── GD3: 1 khóa, THẤT BẠI (lần 1), 20 ngày trước ──────────────────────
    {
      order_id: order3.orderId,
      transaction_id: order3.transactionId,
      user_id: String(userId),
      provider: 'vnpay',
      payment_method: 'Thẻ ATM / Tài khoản ngân hàng',
      amount: fmtAmount(c3.price),
      currency: 'VND',
      status: 'failed',
      voucher_code: '',
      voucher_discount: '0.00',
      course_count: '1',
      order_summary: JSON.stringify({
        courses: [{ id: c3.id, title: c3.title, price: c3.price }],
        subtotal: c3.price,
        total: c3.price,
      }),
      sandbox_code: 'VNPAYDEMO123',
      payment_code: `VNPAYDEMO123-${order3.transactionId}`,
      payment_url: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?amount=${c3.price}&txnRef=${order3.transactionId}`,
      callback_url: `/api/payments/callback?transaction=${order3.transactionId}`,
      created_at: fmtDate(daysAgo(20, 11, 0)),
      updated_at: fmtDate(daysAgo(20, 11, 5)),
      paid_at: '',
    },

    // ── GD4: cùng đơn hàng GD3 nhưng thử lại → THÀNH CÔNG, 19 ngày trước ──
    {
      order_id: order3Retry.orderId,        // Cùng order_id với GD3
      transaction_id: order3Retry.transactionId, // Mã giao dịch MỚI
      user_id: String(userId),
      provider: 'vnpay',
      payment_method: 'Thẻ ATM / Tài khoản ngân hàng',
      amount: fmtAmount(c3.price),
      currency: 'VND',
      status: 'success',
      voucher_code: 'THINKUP10',
      voucher_discount: fmtAmount(c3.price * 0.1),
      course_count: '1',
      order_summary: JSON.stringify({
        courses: [{ id: c3.id, title: c3.title, price: c3.price }],
        subtotal: c3.price,
        total: Math.round(c3.price * 0.9),
      }),
      sandbox_code: 'VNPAYDEMO123',
      payment_code: `VNPAYDEMO123-${order3Retry.transactionId}`,
      payment_url: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?amount=${Math.round(c3.price * 0.9)}&txnRef=${order3Retry.transactionId}`,
      callback_url: `/api/payments/callback?transaction=${order3Retry.transactionId}`,
      created_at: fmtDate(daysAgo(19, 9, 45)),
      updated_at: fmtDate(daysAgo(19, 9, 47)),
      paid_at: fmtDate(daysAgo(19, 9, 47)),
    },

    // ── GD5: 3 khóa, thành công, PayPal + voucher, 14 ngày trước ───────────
    {
      order_id: order4.orderId,
      transaction_id: order4.transactionId,
      user_id: String(userId),
      provider: 'paypal',
      payment_method: 'PayPal',
      amount: fmtAmount(Math.round((c4.price + c5.price + c6.price) * 0.85)),
      currency: 'VND',
      status: 'success',
      voucher_code: 'SALE15',
      voucher_discount: fmtAmount(Math.round((c4.price + c5.price + c6.price) * 0.15)),
      course_count: '3',
      order_summary: JSON.stringify({
        courses: [
          { id: c4.id, title: c4.title, price: c4.price },
          { id: c5.id, title: c5.title, price: c5.price },
          { id: c6.id, title: c6.title, price: c6.price },
        ],
        subtotal: c4.price + c5.price + c6.price,
        total: Math.round((c4.price + c5.price + c6.price) * 0.85),
      }),
      sandbox_code: 'PAYPALDEMO123',
      payment_code: `PAYPALDEMO123-${order4.transactionId}`,
      payment_url: `/main/checkout/success?transaction=${order4.transactionId}`,
      callback_url: `/api/payments/callback?transaction=${order4.transactionId}`,
      created_at: fmtDate(daysAgo(14, 20, 0)),
      updated_at: fmtDate(daysAgo(14, 20, 3)),
      paid_at: fmtDate(daysAgo(14, 20, 3)),
    },

    // ── GD6: 2 khóa, đang chờ, VNPAY, 7 ngày trước ─────────────────────────
    {
      order_id: order5.orderId,
      transaction_id: order5.transactionId,
      user_id: String(userId),
      provider: 'vnpay',
      payment_method: 'QR Code (VNPAY-QR)',
      amount: fmtAmount(c0.price + c3.price),
      currency: 'VND',
      status: 'pending',
      voucher_code: '',
      voucher_discount: '0.00',
      course_count: '2',
      order_summary: JSON.stringify({
        courses: [
          { id: c0.id, title: c0.title, price: c0.price },
          { id: c3.id, title: c3.title, price: c3.price },
        ],
        subtotal: c0.price + c3.price,
        total: c0.price + c3.price,
      }),
      sandbox_code: 'VNPAYDEMO123',
      payment_code: `VNPAYDEMO123-${order5.transactionId}`,
      payment_url: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?amount=${c0.price + c3.price}&txnRef=${order5.transactionId}`,
      callback_url: `/api/payments/callback?transaction=${order5.transactionId}`,
      created_at: fmtDate(daysAgo(7, 16, 45)),
      updated_at: fmtDate(daysAgo(7, 16, 45)),
      paid_at: '',
    },

    // ── GD7: 1 khóa, đang chờ, MoMo, hôm nay ───────────────────────────────
    {
      order_id: order6.orderId,
      transaction_id: order6.transactionId,
      user_id: String(userId),
      provider: 'momo',
      payment_method: 'MoMo',
      amount: fmtAmount(c5.price),
      currency: 'VND',
      status: 'pending',
      voucher_code: '',
      voucher_discount: '0.00',
      course_count: '1',
      order_summary: JSON.stringify({
        courses: [{ id: c5.id, title: c5.title, price: c5.price }],
        subtotal: c5.price,
        total: c5.price,
      }),
      sandbox_code: 'MOMODEMO123',
      payment_code: `MOMODEMO123-${order6.transactionId}`,
      payment_url: `https://test-payment.momo.vn/v2/gateway/pay?amount=${c5.price}&orderId=${order6.orderId}`,
      callback_url: `/api/payments/callback?transaction=${order6.transactionId}`,
      created_at: fmtDate(daysAgo(0, 8, 30)),
      updated_at: fmtDate(daysAgo(0, 8, 30)),
      paid_at: '',
    },
  ];

  // ─── 6. Insert giao dịch ────────────────────────────────────────────────────
  const result = await db.collection('payment_transactions').insertMany(transactions);
  console.log(`   ✅ Đã tạo ${result.insertedCount} giao dịch\n`);

  // ─── 7. In tóm tắt ─────────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('📊 TÓM TẮT TÀI KHOẢN DEMO:');
  console.log('═'.repeat(60));
  console.log(`  Email    : ${DEMO_EMAIL}`);
  console.log(`  Mật khẩu: ${DEMO_PASSWORD}`);
  console.log(`  User ID  : ${userId}`);
  console.log('');
  console.log('📋 LỊCH SỬ GIAO DỊCH:');
  console.log('─'.repeat(60));
  for (const t of transactions) {
    const summary = JSON.parse(t.order_summary);
    const titles = summary.courses.map(c => c.title.substring(0, 30)).join(' + ');
    const status = t.status === 'success' ? '✅' : t.status === 'failed' ? '❌' : '⏳';
    console.log(`  ${status} Đơn: ${t.order_id}`);
    console.log(`     GD : ${t.transaction_id}`);
    console.log(`     KH : ${titles}`);
    console.log(`     Tiền: ${Number(t.amount).toLocaleString('vi-VN')} VND | ${t.payment_method}`);
    if (t.voucher_code) console.log(`     Voucher: ${t.voucher_code} (giảm ${Number(t.voucher_discount).toLocaleString('vi-VN')} VND)`);
    console.log('');
  }
  console.log('═'.repeat(60));
  console.log('\n✅ Seed hoàn tất thành công!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi khi seed:', err);
  process.exit(1);
});
