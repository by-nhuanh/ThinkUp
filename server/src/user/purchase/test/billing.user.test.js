/**
 * File kiểm thử độc lập cho chức năng Chi Tiết Giao Dịch, Thanh Toán & Hóa Đơn Điện Tử (Billing).
 * Chạy: node --test src/user/purchase/test/billing.user.test.js
 *
 * Kiểm thử toàn diện:
 * 1. Truy xuất thông tin chi tiết bằng mã đơn hàng (order_id) và mã giao dịch (transaction_id).
 * 2. Xác thực thông tin người mua (họ và tên, email, số điện thoại).
 * 3. Xác thực danh sách khóa học (tên, giảng viên, giá giảm, giá gốc, ảnh bìa, badge).
 * 4. Xác thực bóc tách tài chính (tạm tính theo giá gốc, giảm giá khóa học, mã giảm giá, tổng thanh toán).
 * 5. Xác thực thông tin thanh toán (phương thức, ngân hàng, số TK, chủ TK, nội dung CK, số tiền đã TT, thời gian TT ngày/tháng/năm giờ:phút:giây, trạng thái).
 * 6. Xác thực hóa đơn điện tử (mã hóa đơn, mã đơn hàng, thời gian phát hành, trạng thái).
 * 7. Kiểm tra bảo mật: 401 khi chưa đăng nhập, 403 khi truy cập giao dịch của người khác, 404 khi không tồn tại.
 * 8. Kiểm tra khởi tạo router Express cho Billing.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTransactionBillingDetail,
  createBillingRouter,
  formatVND,
  formatDateTimeParts,
} from '../billing.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';

// ─── Hằng số kiểm thử ────────────────────────────────────────────────────────

const TEST_USER_ID = 'billing-history-test-user';
const OTHER_USER_ID = '999999';
const TEST_COURSE_ID = 'billing-history-course';
const TEST_TRANSACTION_ID = 'TXN-BILLING-HISTORY-01';
const TEST_ORDER_ID = 'DH-BILLING-HISTORY-01';
const INCOMPLETE_TRANSACTION_ID = 'TXN-BILLING-LEGACY-INCOMPLETE';
const INCONSISTENT_TRANSACTION_ID = 'TXN-BILLING-SNAPSHOT-INCONSISTENT';

describe('Chức Năng Chi Tiết Giao Dịch & Hóa Đơn Điện Tử (Billing)', () => {
  let sampleTxn = null;
  let db = null;

  before(async () => {
    db = await getMongoDb();
    const transactions = db.collection('payment_transactions');
    await Promise.all([
      transactions.deleteMany({ user_id: TEST_USER_ID }),
      db.collection('users').deleteMany({ id: TEST_USER_ID }),
      db.collection('courses').deleteMany({ course_id: TEST_COURSE_ID }),
    ]);
    await db.collection('users').insertOne({
      id: TEST_USER_ID,
      full_name: 'Nguyễn Người Mua',
      email: 'billing-test@example.invalid',
      phone: '0900000000',
    });
    await db.collection('courses').insertOne({
      course_id: TEST_COURSE_ID,
      title: 'Tên khóa học hiện tại đã đổi',
      price: 70000,
      original_price: 80000,
      thumbnail_url: 'current-thumbnail.png',
    });
    const historicalSnapshot = {
      courses: [{
        id: TEST_COURSE_ID,
        title: 'Tên khóa học lúc mua',
        price: 150000,
        original_price: 200000,
        thumbnail_url: 'purchase-thumbnail.png',
      }],
      subtotal: 200000,
      sale_subtotal: 150000,
      voucher_code: 'SAVE20K',
      voucher_discount: 20000,
      total: 130000,
    };
    await transactions.insertMany([
      {
        transaction_id: TEST_TRANSACTION_ID,
        order_id: TEST_ORDER_ID,
        user_id: TEST_USER_ID,
        payment_method: 'sepay',
        amount: 130000,
        currency: 'VND',
        status: 'success',
        transfer_content: `THINKUP ${TEST_TRANSACTION_ID}`,
        order_summary: JSON.stringify(historicalSnapshot),
        created_at: new Date('2026-07-13T10:00:00.000Z'),
        paid_at: new Date('2026-07-13T10:05:00.000Z'),
      },
      {
        transaction_id: INCOMPLETE_TRANSACTION_ID,
        order_id: 'DH-BILLING-LEGACY-INCOMPLETE',
        user_id: TEST_USER_ID,
        payment_method: 'sepay',
        amount: 130000,
        currency: 'VND',
        status: 'success',
        order_summary: JSON.stringify({
          courses: [{ id: TEST_COURSE_ID, title: 'Legacy course', price: 150000 }],
          subtotal: 200000,
          sale_subtotal: 150000,
          voucher_code: 'SAVE20K',
          voucher_discount: 20000,
          total: 130000,
        }),
      },
      {
        transaction_id: INCONSISTENT_TRANSACTION_ID,
        order_id: 'DH-BILLING-SNAPSHOT-INCONSISTENT',
        user_id: TEST_USER_ID,
        payment_method: 'sepay',
        amount: 130000,
        currency: 'VND',
        status: 'success',
        order_summary: JSON.stringify({
          courses: [{ id: TEST_COURSE_ID, title: 'Historical course', price: 150000, original_price: 200000 }],
          subtotal: 200000,
          sale_subtotal: 150000,
          voucher_code: 'SAVE20K',
          voucher_discount: 20000,
          total: 120000,
        }),
      },
    ]);
    sampleTxn = await transactions.findOne({ transaction_id: TEST_TRANSACTION_ID });
  });

  after(async () => {
    if (db) {
      await Promise.all([
        db.collection('payment_transactions').deleteMany({ user_id: TEST_USER_ID }),
        db.collection('users').deleteMany({ id: TEST_USER_ID }),
        db.collection('courses').deleteMany({ course_id: TEST_COURSE_ID }),
      ]);
      assert.equal(await db.collection('payment_transactions').countDocuments({ user_id: TEST_USER_ID }), 0);
      assert.equal(await db.collection('users').countDocuments({ id: TEST_USER_ID }), 0);
      assert.equal(await db.collection('courses').countDocuments({ course_id: TEST_COURSE_ID }), 0);
    }
    await closeMongoDb();
  });

  // ─── 1. Hàm Tiện Ích Format ─────────────────────────────────────────────────

  describe('1. Hàm tiện ích format tiền và ngày giờ', () => {
    it('TC-FMT-01: formatVND định dạng chuẩn tiền tệ Việt Nam', () => {
      assert.equal(formatVND(499000), '499.000đ');
      assert.equal(formatVND(1099000), '1.099.000đ');
      assert.equal(formatVND(0), '0đ');
    });

    it('TC-FMT-02: formatDateTimeParts phân tách đầy đủ ngày, tháng, năm, giờ, phút, giây', () => {
      const parts = formatDateTimeParts('2026-07-13 19:50:53');
      assert.ok(parts, 'Phải parse được ngày giờ');
      assert.equal(parts.dateOnly, '13/07/2026');
      assert.equal(parts.timeOnly, '19:50:53');
      assert.equal(parts.full, '13/07/2026 19:50:53');
      assert.equal(parts.text, 'Ngày 13 tháng 07 năm 2026, 19:50:53');
    });

    it('TC-FMT-03: formatDateTimeParts trả về null với ngày rỗng hoặc không hợp lệ', () => {
      assert.equal(formatDateTimeParts(null), null);
      assert.equal(formatDateTimeParts(''), null);
      assert.equal(formatDateTimeParts('invalid-date-string-xyz'), null);
    });
  });

  // ─── 2. Truy xuất theo mã giao dịch và mã đơn hàng ─────────────────────────

  describe('2. Truy xuất theo mã giao dịch (transaction_id) hoặc mã đơn hàng (order_id)', () => {
    it('TC-GET-01: Truy xuất thành công bằng transaction_id', async () => {
      assert.ok(sampleTxn, 'Cần có giao dịch mẫu trong DB');
      const detail = await getTransactionBillingDetail(TEST_USER_ID, sampleTxn.transaction_id);

      assert.ok(detail, 'Phải trả về chi tiết giao dịch');
      assert.equal(detail.transaction_id, sampleTxn.transaction_id);
      assert.equal(detail.transactionCode, sampleTxn.transaction_id);
      assert.equal(detail.status, sampleTxn.status);
    });

    it('TC-GET-02: Truy xuất thành công bằng order_id (nếu có trường order_id)', async () => {
      const orderId = sampleTxn.order_id || sampleTxn.transaction_id;
      const detail = await getTransactionBillingDetail(TEST_USER_ID, orderId);

      assert.ok(detail);
      assert.equal(detail.order_id, orderId);
      assert.equal(detail.id, orderId);
    });

    it('TC-GET-03: Truy xuất thành công bằng MongoDB _id', async () => {
      const detail = await getTransactionBillingDetail(TEST_USER_ID, String(sampleTxn._id));
      assert.ok(detail);
      assert.equal(detail.transaction_id, sampleTxn.transaction_id);
    });
  });

  // ─── 3. Thông tin người mua (Buyer) ────────────────────────────────────────

  describe('3. Truy xuất thông tin người mua', () => {
    it('TC-BUYER-01: Chi tiết chứa họ tên, email, số điện thoại người mua', async () => {
      const detail = await getTransactionBillingDetail(TEST_USER_ID, sampleTxn.transaction_id);

      assert.ok(detail.buyer, 'Thiếu trường buyer');
      assert.ok('name' in detail.buyer, 'Thiếu buyer.name');
      assert.ok('email' in detail.buyer, 'Thiếu buyer.email');
      assert.ok('phone' in detail.buyer, 'Thiếu buyer.phone');

      assert.ok(detail.invoice.buyer, 'Thiếu invoice.buyer');
      assert.equal(detail.invoice.buyer.name, detail.buyer.name);
      assert.equal(detail.invoice.buyer.email, detail.buyer.email);
      assert.equal(detail.invoice.buyer.phone, detail.buyer.phone);
    });
  });

  // ─── 4. Thông tin đơn hàng & Khóa học ──────────────────────────────────────

  describe('4. Truy xuất thông tin đơn hàng và danh sách khóa học', () => {
    it('TC-ORDER-01: Chứa số lượng khóa học, tên, giảng viên, giá và ảnh bìa', async () => {
      const detail = await getTransactionBillingDetail(TEST_USER_ID, sampleTxn.transaction_id);

      assert.ok(detail.order, 'Thiếu trường order');
      assert.ok(Array.isArray(detail.order.courses), 'order.courses phải là mảng');
      assert.ok(detail.order.countLabel.includes('khóa học'), 'countLabel phải có từ khóa học');

      if (detail.order.courses.length > 0) {
        const c = detail.order.courses[0];
        assert.ok(c.id, 'Khóa học phải có id');
        assert.ok(c.title, 'Khóa học phải có tên (title)');
        assert.ok(c.instructor, 'Khóa học phải có tác giả/giảng viên (instructor)');
        assert.ok('price' in c, 'Khóa học phải có giá bán (price)');
        assert.ok('originalPrice' in c, 'Khóa học phải có giá gốc (originalPrice)');
        assert.ok('thumbnail_url' in c, 'Khóa học phải có trường ảnh bìa (thumbnail_url)');
      }
    });

    it('TC-ORDER-02: Bóc tách đúng các khoản giá trị trong đơn hàng', async () => {
      const detail = await getTransactionBillingDetail(TEST_USER_ID, sampleTxn.transaction_id);

      // Giá tạm tính (tổng theo giá gốc)
      assert.ok('subtotal' in detail.order, 'Thiếu order.subtotal');
      assert.ok('subtotal_number' in detail.order, 'Thiếu order.subtotal_number');

      // Giảm giá khóa học
      assert.ok('courseDiscount' in detail.order, 'Thiếu order.courseDiscount');
      assert.ok('course_discount_number' in detail.order, 'Thiếu order.course_discount_number');

      // Mã giảm giá + số tiền giảm
      assert.ok('voucherCode' in detail.order, 'Thiếu order.voucherCode');
      assert.ok('voucherDiscount' in detail.order, 'Thiếu order.voucherDiscount');

      // Tổng thanh toán thực sự
      assert.ok('total' in detail.order, 'Thiếu order.total');
      assert.ok('total_number' in detail.order, 'Thiếu order.total_number');
      assert.ok(detail.order.total_number >= 0, 'total_number không được âm');
      assert.equal(detail.order.courses[0].price_number, 150000);
      assert.equal(detail.order.courses[0].original_price_number, 200000);
      assert.equal(detail.order.subtotal_number, 200000);
      assert.equal(detail.order.course_discount_number, 50000);
      assert.equal(detail.order.voucher_discount_number, 20000);
      assert.equal(detail.order.total_number, 130000);
      assert.equal(detail.order.courses[0].title, 'Tên khóa học lúc mua');
    });

    it('TC-ORDER-03: Từ chối hóa đơn legacy thiếu giá gốc snapshot thay vì lấy giá catalog hiện tại', async () => {
      await assert.rejects(
        () => getTransactionBillingDetail(TEST_USER_ID, INCOMPLETE_TRANSACTION_ID),
        error => error.status === 409 && error.code === 'BILLING_SNAPSHOT_INCOMPLETE',
      );
    });

    it('TC-ORDER-04: Từ chối hóa đơn khi số tổng snapshot không khớp', async () => {
      await assert.rejects(
        () => getTransactionBillingDetail(TEST_USER_ID, INCONSISTENT_TRANSACTION_ID),
        error => error.status === 409 && error.code === 'BILLING_SNAPSHOT_INCONSISTENT',
      );
    });
  });

  // ─── 5. Thông tin thanh toán (Payment) ──────────────────────────────────────

  describe('5. Truy xuất thông tin thanh toán', () => {
    it('TC-PAY-01: Chứa đầy đủ phương thức, ngân hàng, STK, chủ TK, nội dung CK, số tiền và thời gian', async () => {
      const detail = await getTransactionBillingDetail(TEST_USER_ID, sampleTxn.transaction_id);

      assert.ok(detail.payment, 'Thiếu trường payment');
      assert.ok(detail.payment.bank, 'payment.bank phải có giá trị');
      assert.ok(detail.payment.accountNumber, 'payment.accountNumber phải có giá trị');
      assert.ok(detail.payment.accountName, 'payment.accountName phải có giá trị');
      assert.ok(detail.payment.transferContent, 'payment.transferContent phải có giá trị');
      assert.ok(detail.payment.paidAmount, 'payment.paidAmount phải có giá trị');
      assert.ok(detail.payment.paidAt, 'payment.paidAt phải có giá trị');
      assert.ok(detail.payment.status, 'payment.status phải có giá trị');
    });
  });

  // ─── 6. Hóa đơn điện tử (Invoice) ──────────────────────────────────────────

  describe('6. Truy xuất hóa đơn điện tử', () => {
    it('TC-INV-01: Chứa mã hóa đơn, mã đơn hàng, thời gian phát hành và trạng thái', async () => {
      const detail = await getTransactionBillingDetail(TEST_USER_ID, sampleTxn.transaction_id);

      assert.ok(detail.invoice, 'Thiếu trường invoice');
      assert.ok(detail.invoice.code, 'Thiếu invoice.code');
      assert.ok(detail.invoice.order_id, 'Thiếu invoice.order_id');
      assert.ok(detail.invoice.issuedAt, 'Thiếu invoice.issuedAt');
      assert.ok(detail.invoice.status, 'Thiếu invoice.status');
    });
  });

  // ─── 7. Kiểm tra bảo mật và ngoại lệ ───────────────────────────────────────

  describe('7. Kiểm tra bảo mật & ngoại lệ', () => {
    it('TC-SEC-01: Ném lỗi 401 khi không truyền userId', async () => {
      await assert.rejects(
        () => getTransactionBillingDetail(null, sampleTxn.transaction_id),
        err => {
          assert.equal(err.status, 401);
          return true;
        }
      );
    });

    it('TC-SEC-02: Ném lỗi 400 khi mã giao dịch rỗng', async () => {
      await assert.rejects(
        () => getTransactionBillingDetail(TEST_USER_ID, ''),
        err => {
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

    it('TC-SEC-03: Ném lỗi 404 khi giao dịch không tồn tại', async () => {
      await assert.rejects(
        () => getTransactionBillingDetail(TEST_USER_ID, 'NON_EXISTENT_TRANSACTION_XYZ_123'),
        err => {
          assert.equal(err.status, 404);
          return true;
        }
      );
    });

    it('TC-SEC-04: Ném lỗi 403 khi truy cập giao dịch của người khác', async () => {
      await assert.rejects(
        () => getTransactionBillingDetail(OTHER_USER_ID, sampleTxn.transaction_id),
        err => {
          assert.equal(err.status, 403);
          return true;
        }
      );
    });
  });

  // ─── 8. Kiểm tra khởi tạo router Express ───────────────────────────────────

  describe('8. Router Express createBillingRouter', () => {
    it('TC-ROUTER-01: createBillingRouter trả về Express Router hợp lệ', async () => {
      const express = (await import('express')).default;
      const fakeAuth = (req, res, next) => next();
      const router = createBillingRouter(express, fakeAuth);

      assert.ok(router, 'Router phải được khởi tạo');
      assert.equal(typeof router, 'function', 'Express router là middleware function');
    });
  });
});

it('Learning integration: billing preserves UTC instants and renders selected timezone', () => {
  const source = '2026-10-30T18:00:00Z';
  const result = formatDateTimeParts(source, 'Asia/Tokyo');
  assert.equal(result.full, '31/10/2026 03:00:00');assert.equal(result.iso, '2026-10-30T18:00:00.000Z');
  assert.equal(formatDateTimeParts('2026-10-31 01:00:00', 'Etc/UTC').full, '30/10/2026 18:00:00');
  assert.equal(formatDateTimeParts('bad'), null);
});

it('Learning integration: billing loads owner timezone while retaining immutable payment snapshot', async () => {
  const tx = { transaction_id: 'txn', order_id: 'order', user_id: 'learner', status: 'success', amount: 70,
    created_at: '2026-10-30T18:00:00Z', paid_at: '2026-10-30T18:00:00Z',
    order_summary: { courses: [{ id: 'course', title: 'Course', price: 80, original_price: 100 }], subtotal: 100, sale_subtotal: 80, voucher_code: 'VOUCHER', voucher_discount: 10, total: 70 } };
  let preferenceReads = 0;
  const db = { collection(name) { return { async findOne() {
    if (name === 'payment_transactions') return tx;
    if (name === 'learning_preferences') { preferenceReads++;return { timezone: 'Asia/Tokyo' }; }
    if (['users', 'courses', 'instructor_profiles'].includes(name)) return null;
    throw new Error(name);
  } }; } };
  await assert.rejects(getTransactionBillingDetail('other', 'txn', { db }), { status: 403 });assert.equal(preferenceReads, 0);
  const result = await getTransactionBillingDetail('learner', 'txn', { db });
  assert.equal(result.timezone, 'Asia/Tokyo');assert.equal(result.created_at, '31/10/2026 03:00:00');
  assert.equal(result.created_at_iso, '2026-10-30T18:00:00.000Z');assert.equal(result.order.total_number, 70);
});
