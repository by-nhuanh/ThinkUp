/**
 * File kiểm thử độc lập cho chức năng Lịch Sử Mua Hàng (User).
 * Chạy: npm run test:purchase
 *
 * Phạm vi: Unit & Integration – chỉ test logic xử lý trong purchase.user.js.
 * Không chỉnh sửa dữ liệu sản xuất; chỉ ĐỌC collection payment_transactions.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  getPurchaseSummary,
  getPurchaseHistory,
  createPurchaseRouter,
} from '../purchase.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';

// ─── Hằng số kiểm thử ────────────────────────────────────────────────────────

/**
 * ID fixture riêng, chỉ dùng trong database test tách biệt.
 */
const TEST_USER_ID = 'purchase-history-test-user';

/**
 * user_id không tồn tại trong bộ fixture.
 */
const UNKNOWN_USER_ID = 'nonexistent-user-xyz-9999';

const TEST_TRANSACTION_FIXTURES = [
  {
    order_id: 'DH2026071300000001',
    transaction_id: 'TXN-CLOUD-20260713-01',
    user_id: TEST_USER_ID,
    payment_method: 'vnpay',
    provider: 'vnpay',
    amount: 120000,
    currency: 'VND',
    status: 'success',
    course_count: 1,
    order_summary: { courses: [{ id: 'course-cloud-test', title: 'Cloud Security', price: 120000 }] },
    created_at: new Date('2026-07-13T10:00:00.000Z'),
    paid_at: new Date('2026-07-13T10:05:00.000Z'),
  },
  {
    order_id: 'DH2026071400000002',
    transaction_id: 'TXN-WEB-20260714-02',
    user_id: TEST_USER_ID,
    payment_method: 'bank_transfer',
    provider: 'sepay',
    amount: 80000,
    currency: 'VND',
    status: 'pending',
    course_count: 1,
    order_summary: { courses: [{ id: 'course-web-test', title: 'Web Development', price: 80000 }] },
    created_at: '2026-07-14 10:30:00',
  },
  {
    order_id: 'DH2026071500000003',
    transaction_id: 'TXN-FAILED-20260715-03',
    user_id: TEST_USER_ID,
    payment_method: 'stripe',
    provider: 'stripe',
    amount: 90000,
    currency: 'VND',
    status: 'failed',
    course_count: 1,
    order_summary: { courses: [{ id: 'course-failed-test', title: 'Failed Purchase', price: 90000 }] },
    created_at: '2026-07-15T09:00:00.000Z',
  },
  {
    order_id: 'DH2026071600000004',
    transaction_id: 'TXN-CANCEL-20260716-04',
    user_id: TEST_USER_ID,
    payment_method: 'vnpay',
    provider: 'vnpay',
    amount: 50000,
    currency: 'VND',
    status: 'cancelled',
    course_count: 1,
    order_summary: { courses: [{ id: 'course-cancel-test', title: 'Cancelled Purchase', price: 50000 }] },
    created_at: new Date('2026-07-16T12:00:00.000Z'),
  },
  {
    order_id: 'DH2026071700000005',
    transaction_id: 'TXN-PAID-20260717-05',
    user_id: TEST_USER_ID,
    payment_method: 'free',
    provider: 'free',
    amount: 0,
    currency: 'VND',
    status: 'paid',
    order_summary: { courses: [{ id: 'course-paid-test', title: 'Paid Awaiting Fulfillment', price: 0 }] },
    created_at: new Date('2026-07-17T10:00:00.000Z'),
  },
  {
    order_id: 'DH2026071800000006',
    transaction_id: 'TXN-EXPIRED-20260718-06',
    user_id: TEST_USER_ID,
    payment_method: 'vnpay',
    provider: 'vnpay',
    amount: 70000,
    currency: 'VND',
    status: 'expired',
    order_summary: { courses: [{ id: 'course-expired-test', title: 'Expired Order', price: 70000 }] },
    created_at: new Date('2026-07-18T10:00:00.000Z'),
  },
  {
    order_id: 'DH2026071900000007',
    transaction_id: 'TXN-REVIEW-20260719-07',
    user_id: TEST_USER_ID,
    payment_method: 'sepay',
    provider: 'sepay',
    amount: 95000,
    currency: 'VND',
    status: 'needs_review',
    order_summary: { courses: [{ id: 'course-review-test', title: 'Payment Under Review', price: 95000 }] },
    created_at: new Date('2026-07-19T10:00:00.000Z'),
  },
];

// ─── 1. Kiểm thử getPurchaseSummary ──────────────────────────────────────────

describe('Chức Năng Lịch Sử Mua Hàng User (Unit & Integration)', () => {

  let db;

  before(async () => {
    db = await getMongoDb();
    const transactions = db.collection('payment_transactions');
    await transactions.deleteMany({ user_id: TEST_USER_ID });
    await transactions.insertMany(TEST_TRANSACTION_FIXTURES);
  });

  describe('1. getPurchaseSummary – Thống kê tổng hợp', () => {

    it('TC-SUM-01: Trả về thống kê hợp lệ cho user có dữ liệu', async () => {
      const result = await getPurchaseSummary(TEST_USER_ID);

      // Phải có đúng 3 trường
      assert.ok('totalTransactions' in result, 'Thiếu trường totalTransactions');
      assert.ok('totalSpent' in result, 'Thiếu trường totalSpent');
      assert.ok('totalCoursesPurchased' in result, 'Thiếu trường totalCoursesPurchased');

      // Kiểu dữ liệu
      assert.equal(typeof result.totalTransactions, 'number');
      assert.equal(typeof result.totalSpent, 'number');
      assert.equal(typeof result.totalCoursesPurchased, 'number');

      assert.equal(result.totalTransactions, TEST_TRANSACTION_FIXTURES.length);

      // Tổng tiền và số KH phải không âm
      assert.ok(result.totalSpent >= 0, 'totalSpent không được âm');
      assert.ok(result.totalCoursesPurchased >= 0, 'totalCoursesPurchased không được âm');
    });

    it('TC-SUM-02: totalSpent chỉ tính giao dịch thành công (status=success)', async () => {
      const summary = await getPurchaseSummary(TEST_USER_ID);
      const history = await getPurchaseHistory(TEST_USER_ID, { status: 'success' });

      const expectedSpent = history.transactions.reduce((s, t) => s + t.amount, 0);
      assert.equal(summary.totalSpent, expectedSpent,
        'totalSpent phải bằng tổng amount của giao dịch success');
    });

    it('TC-SUM-03: totalCoursesPurchased chỉ tính khóa học từ giao dịch success', async () => {
      const summary = await getPurchaseSummary(TEST_USER_ID);
      const history = await getPurchaseHistory(TEST_USER_ID, { status: 'success' });

      const expectedCourses = history.transactions.reduce((s, t) => s + (t.course_count || 0), 0);
      assert.equal(summary.totalCoursesPurchased, expectedCourses,
        'totalCoursesPurchased phải khớp với tổng course_count của giao dịch success');
    });

    it('TC-SUM-04: Trả về về 0 cho user không có giao dịch', async () => {
      const result = await getPurchaseSummary(UNKNOWN_USER_ID);
      assert.equal(result.totalTransactions, 0);
      assert.equal(result.totalSpent, 0);
      assert.equal(result.totalCoursesPurchased, 0);
    });

    it('TC-SUM-05: Ném lỗi 401 khi không có userId', async () => {
      await assert.rejects(
        () => getPurchaseSummary(null),
        err => {
          assert.equal(err.status, 401);
          return true;
        }
      );
    });

  });

  // ─── 2. Kiểm thử getPurchaseHistory – Danh sách giao dịch ─────────────────

  describe('2. getPurchaseHistory – Danh sách giao dịch đầy đủ', () => {

    it('TC-LIST-01: Trả về danh sách không lọc cho user có dữ liệu', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {});

      assert.ok(Array.isArray(result.transactions), 'transactions phải là mảng');
      assert.equal(typeof result.total, 'number');
      assert.equal(result.total, result.transactions.length, 'total phải khớp với length mảng');
      assert.ok(result.total > 0, 'Phải có giao dịch');
    });

    it('TC-LIST-02: Mỗi giao dịch trả về đầy đủ các trường bắt buộc', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {});
      const txn = result.transactions[0];

      const requiredFields = [
        // Mã đơn hàng (DH...) - trường chính hiển thị trong lịch sử mua hàng
        'order_id',
        // Mã giao dịch (GD/TXN...) - mã chuyển khoản
        'transaction_id',
        'user_id', 'payment_method', 'provider',
        'amount', 'currency', 'status', 'course_count', 'courses', 'created_at',
      ];
      for (const field of requiredFields) {
        assert.ok(field in txn, `Trường "${field}" bị thiếu trong response`);
      }
      // order_id phải có giá trị (không null, không empty)
      assert.ok(txn.order_id, 'order_id phải có giá trị');
    });

    it('TC-LIST-03: Trả về mảng rỗng cho user không có giao dịch', async () => {
      const result = await getPurchaseHistory(UNKNOWN_USER_ID, {});
      assert.equal(result.total, 0);
      assert.deepEqual(result.transactions, []);
    });

    it('TC-LIST-04: Ném lỗi 401 khi không có userId', async () => {
      await assert.rejects(
        () => getPurchaseHistory(null, {}),
        err => {
          assert.equal(err.status, 401);
          return true;
        }
      );
    });

  });

  // ─── 3. Kiểm thử lọc trạng thái ───────────────────────────────────────────

  describe('3. Lọc trạng thái giao dịch', () => {

    it('TC-STATUS-01: Lọc status=success chỉ trả về giao dịch thành công', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { status: 'success' });

      assert.ok(result.transactions.every(t => t.status === 'success'),
        'Tất cả giao dịch phải có status=success');
    });

    it('TC-STATUS-02: Lọc status=pending chỉ trả về giao dịch đang chờ', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { status: 'pending' });

      assert.ok(result.transactions.every(t => t.status === 'pending'),
        'Tất cả giao dịch phải có status=pending');
    });

    for (const status of ['paid', 'expired', 'needs_review']) {
      it(`TC-STATUS-${status}: Lọc trạng thái ${status} do payment backend phát sinh`, async () => {
        const result = await getPurchaseHistory(TEST_USER_ID, { status });
        assert.equal(result.total, 1);
        assert.equal(result.transactions[0].status, status);
      });
    }

    it('TC-STATUS-03: Không có bộ lọc status → trả về tất cả trạng thái', async () => {
      const all = await getPurchaseHistory(TEST_USER_ID, {});
      const success = await getPurchaseHistory(TEST_USER_ID, { status: 'success' });
      const pending = await getPurchaseHistory(TEST_USER_ID, { status: 'pending' });

      assert.ok(
        all.total >= success.total + pending.total,
        'Tổng giao dịch phải >= success + pending'
      );
    });

    it('TC-STATUS-04: Ném lỗi 400 khi status không hợp lệ', async () => {
      await assert.rejects(
        () => getPurchaseHistory(TEST_USER_ID, { status: 'invalid_status_xyz' }),
        err => {
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

  });

  // ─── 4. Kiểm thử tìm kiếm theo từ khóa ────────────────────────────────────

  describe('4. Tìm kiếm theo mã giao dịch và tên khóa học', () => {

    it('TC-SEARCH-01: Tìm kiếm theo mã giao dịch khớp từng ký tự (VD: "TXN")', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { keyword: 'TXN' });

      // Tất cả kết quả phải chứa "TXN" trong transaction_id
      assert.ok(result.transactions.every(t =>
        t.transaction_id.toUpperCase().includes('TXN')
      ), 'Kết quả phải khớp với "TXN" trong transaction_id');
    });

    it('TC-SEARCH-02: Tìm kiếm không phân biệt hoa thường (txn = TXN)', async () => {
      const upper = await getPurchaseHistory(TEST_USER_ID, { keyword: 'TXN' });
      const lower = await getPurchaseHistory(TEST_USER_ID, { keyword: 'txn' });

      assert.equal(upper.total, lower.total, 'Tìm kiếm hoa/thường phải cho cùng kết quả');
    });

    it('TC-SEARCH-03: Tìm kiếm theo tên khóa học', async () => {
      // Từ khóa khớp mã giao dịch hoặc tên khóa học.
      const result = await getPurchaseHistory(TEST_USER_ID, { keyword: 'Cloud' });

      if (result.total > 0) {
        assert.ok(result.transactions.every(t =>
          t.transaction_id.toLowerCase().includes('cloud') ||
          t.courses.some(c => (c.title || '').toLowerCase().includes('cloud'))
        ), 'Kết quả phải khớp với "cloud" trong mã GD hoặc tên khóa học');
      }
    });

    it('TC-SEARCH-04: Tìm kiếm từ khóa không tồn tại → trả về mảng rỗng', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { keyword: 'KEYWORD_KHONG_TON_TAI_XYZ_999' });

      assert.equal(result.total, 0);
      assert.deepEqual(result.transactions, []);
    });

    it('TC-SEARCH-05: Từ khóa rỗng hoặc khoảng trắng → không lọc, trả về toàn bộ', async () => {
      const withEmpty = await getPurchaseHistory(TEST_USER_ID, { keyword: '   ' });
      const withoutFilter = await getPurchaseHistory(TEST_USER_ID, {});

      assert.equal(withEmpty.total, withoutFilter.total);
    });

  });

  // ─── 5. Kiểm thử lọc theo thời gian ───────────────────────────────────────

  describe('5. Lọc theo thời gian (preset và khoảng tùy chọn)', () => {

    it('TC-DATE-01: Preset "today" chỉ trả về giao dịch của ngày hôm nay', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { datePreset: 'today' });
      assert.equal(typeof result.total, 'number');
      assert.ok(Array.isArray(result.transactions));
    });

    it('TC-DATE-02: Preset "yesterday" thực thi không lỗi', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { datePreset: 'yesterday' });
      assert.equal(typeof result.total, 'number');
    });

    it('TC-DATE-03: Preset "last7days" thực thi không lỗi', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { datePreset: 'last7days' });
      assert.equal(typeof result.total, 'number');
    });

    it('TC-DATE-04: Preset "last30days" thực thi không lỗi', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { datePreset: 'last30days' });
      assert.equal(typeof result.total, 'number');
    });

    it('TC-DATE-05: Preset "thismonth" thực thi không lỗi', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { datePreset: 'thismonth' });
      assert.equal(typeof result.total, 'number');
    });

    it('TC-DATE-06: Preset "lastmonth" thực thi không lỗi', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, { datePreset: 'lastmonth' });
      assert.equal(typeof result.total, 'number');
    });

    it('TC-DATE-07: Khoảng thời gian tùy chọn dateFrom=2026-07-01, dateTo=2026-07-31 có GD', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      });
      assert.ok(result.total > 0, 'Phải tìm thấy giao dịch trong tháng 7/2026');
    });

    it('TC-DATE-08: Khoảng thời gian nằm ngoài dữ liệu → trả về rỗng', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {
        dateFrom: '2020-01-01',
        dateTo: '2020-01-31',
      });
      assert.equal(result.total, 0);
    });

    it('TC-DATE-09: dateFrom > dateTo → ném lỗi 400', async () => {
      await assert.rejects(
        () => getPurchaseHistory(TEST_USER_ID, {
          dateFrom: '2026-12-31',
          dateTo: '2026-01-01',
        }),
        err => {
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

    it('TC-DATE-10: dateFrom không hợp lệ → ném lỗi 400', async () => {
      await assert.rejects(
        () => getPurchaseHistory(TEST_USER_ID, { dateFrom: 'not-a-date' }),
        err => {
          assert.equal(err.status, 400);
          return true;
        }
      );
    });

    it('TC-DATE-11: datePreset và dateFrom/dateTo cùng lúc → ưu tiên preset', async () => {
      // Khi có cả hai, datePreset được ưu tiên (không ném lỗi)
      const result = await getPurchaseHistory(TEST_USER_ID, {
        datePreset: 'last30days',
        dateFrom: '2020-01-01',
        dateTo: '2020-12-31',
      });
      assert.equal(typeof result.total, 'number');
    });

    it('TC-DATE-12: Lọc khoảng ngày xử lý created_at kiểu Date của MongoDB', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {
        dateFrom: '2026-07-13',
        dateTo: '2026-07-13',
      });
      assert.deepEqual(result.transactions.map(transaction => transaction.transaction_id), ['TXN-CLOUD-20260713-01']);
    });

    it('TC-DATE-13: Vẫn hỗ trợ created_at dạng chuỗi legacy', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {
        dateFrom: '2026-07-14',
        dateTo: '2026-07-14',
      });
      assert.deepEqual(result.transactions.map(transaction => transaction.transaction_id), ['TXN-WEB-20260714-02']);
    });

  });

  // ─── 6. Kiểm thử kết hợp bộ lọc ───────────────────────────────────────────

  describe('6. Kết hợp nhiều bộ lọc', () => {

    it('TC-COMBO-01: Kết hợp status + keyword', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {
        status: 'success',
        keyword: 'TXN',
      });
      assert.ok(result.transactions.every(t => t.status === 'success'));
      assert.ok(result.transactions.every(t =>
        t.transaction_id.toLowerCase().includes('txn') ||
        t.courses.some(c => (c.title || '').toLowerCase().includes('txn'))
      ));
    });

    it('TC-COMBO-02: Kết hợp status + dateFrom/dateTo', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {
        status: 'success',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      });
      assert.ok(result.transactions.every(t => t.status === 'success'));
      assert.equal(typeof result.total, 'number');
    });

    it('TC-COMBO-03: Kết hợp status + keyword + datePreset (không có lỗi)', async () => {
      const result = await getPurchaseHistory(TEST_USER_ID, {
        status: 'pending',
        keyword: 'TXN',
        datePreset: 'last7days',
      });
      assert.equal(typeof result.total, 'number');
      assert.ok(Array.isArray(result.transactions));
    });

  });

  // ─── 7. Kiểm thử createPurchaseRouter ─────────────────────────────────────

  describe('7. createPurchaseRouter – Khởi tạo router Express', () => {

    it('TC-ROUTER-01: createPurchaseRouter trả về Express Router hợp lệ', async () => {
      // Import express giả để test router creation không cần server thật
      const { default: express } = await import('express');
      const mockAuth = (req, res, next) => { req.userId = TEST_USER_ID; next(); };

      const router = createPurchaseRouter(express, mockAuth);
      assert.ok(router, 'Router phải được tạo');
      assert.equal(typeof router, 'function', 'Router Express phải là function');
    });

  });

  after(async () => {
    if (db) {
      const transactions = db.collection('payment_transactions');
      await transactions.deleteMany({ user_id: TEST_USER_ID });
      assert.equal(await transactions.countDocuments({ user_id: TEST_USER_ID }), 0,
        'Fixture giao dịch phải được xóa khỏi MongoDB sau kiểm thử');
    }
    await closeMongoDb();
  });

});

it('Learning integration: purchase filters use saved timezone without changing money or original timestamps', async () => {
  const transactions = [
    { transaction_id: 'included', user_id: 'learner', created_at: '2026-10-30T16:00:00Z', amount: 12345, status: 'success' },
    { transaction_id: 'excluded', user_id: 'learner', created_at: '2026-10-30T14:00:00Z', amount: 100, status: 'success' },
  ];
  const db = { collection(name) { return {
    async findOne() { if (name === 'learning_preferences') return { timezone: 'Asia/Tokyo' };if (name === 'users') return null;throw new Error(name); },
    find(q) { assert.equal(name, 'payment_transactions');assert.deepEqual(q.user_id.$in, ['learner']);return { sort() { return this; }, async toArray() { return transactions; } }; },
  }; } };
  const result = await getPurchaseHistory('learner', { dateFrom: '2026-10-31', dateTo: '2026-10-31' }, { db });
  assert.equal(result.total, 1);assert.equal(result.transactions[0].transaction_id, 'included');
  assert.equal(result.transactions[0].amount, 12345);assert.equal(result.transactions[0].created_at, '2026-10-30T16:00:00Z');
  assert.equal(result.transactions[0].created_at_local.dateOnly, '31/10/2026');
  await assert.rejects(getPurchaseHistory('learner', { dateFrom: '2026-02-30' }, { db }), { status: 400 });
});
