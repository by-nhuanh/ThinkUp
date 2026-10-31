import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getMongoDb } from '../../db.js';
import {
  formatVND,
  validateVoucherLogic,
  getCartDetails,
  addToCartLogic,
  removeFromCartLogic,
  mergeGuestCartLogic,
  createCartRouter,
  COLLECTION_CARTS,
  COLLECTION_COURSES,
  COLLECTION_FAVORITES,
  COLLECTION_ENROLLMENTS,
} from '../cart.user.js';

describe('Chức Năng Giỏ Hàng User & Guest (Unit & Integration Tests)', () => {
  let db;
  const testUserId = 'test-cart-user-12345';
  const testCourseId1 = '1'; // ReactJS Masterclass
  const testCourseId2 = '89'; // Khóa học mẫu khác

  before(async () => {
    db = await getMongoDb();
    // Dọn dữ liệu test cũ nếu có
    await db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId });
    await db.collection(COLLECTION_FAVORITES).deleteMany({ user_id: testUserId });
    await db.collection(COLLECTION_ENROLLMENTS).deleteMany({ user_id: testUserId });
  });

  after(async () => {
    if (db) {
      await db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId });
      await db.collection(COLLECTION_FAVORITES).deleteMany({ user_id: testUserId });
      await db.collection(COLLECTION_ENROLLMENTS).deleteMany({ user_id: testUserId });
    }
  });

  // ─── 1. Tiện ích formatVND ─────────────────────────────────────────────────
  describe('1. Kiểm thử hàm tiện ích formatVND', () => {
    it('TC-FMT-01: Định dạng số nguyên thành chuỗi VND chuẩn', () => {
      assert.equal(formatVND(100000), '100.000đ');
      assert.equal(formatVND(0), '0đ');
      assert.equal(formatVND(998000), '998.000đ');
    });
  });

  // ─── 2. Kiểm tra Voucher Logic & Chống Giảm Giá Âm ─────────────────────────
  describe('2. Kiểm tra mã Voucher & Chống giảm giá âm (Non-negative Total)', () => {
    it('TC-VOUCHER-01: Mã voucher rỗng hoặc không nhập -> báo lỗi', async () => {
      const res = await validateVoucherLogic(db, '', 500000);
      assert.equal(res.isValid, false);
      assert.equal(res.discount, 0);
    });

    it('TC-VOUCHER-02: Mã voucher không tồn tại -> báo không hợp lệ', async () => {
      const res = await validateVoucherLogic(db, 'INVALID_CODE_999', 500000);
      assert.equal(res.isValid, false);
      assert.equal(res.discount, 0);
    });

    it('TC-VOUCHER-03: Mã voucher hợp lệ trong DB (THINKUP15) -> tính đúng chiết khấu % và max discount', async () => {
      const subtotal = 1000000;
      const res = await validateVoucherLogic(db, 'THINKUP15', subtotal);
      assert.equal(res.isValid, true);
      assert.equal(res.discount, 150000);
    });

    it('TC-VOUCHER-04: Mã voucher có max discount chặn trên khi vượt mức', async () => {
      const res = await validateVoucherLogic(db, 'THINKUP15', 2000000);
      assert.equal(res.isValid, true);
      assert.equal(res.discount, 200000);
    });

    it('TC-VOUCHER-05: Chống giảm giá âm khi voucher giảm lớn hơn subtotal', async () => {
      const res = await validateVoucherLogic(db, 'THINKUP50', 50000);
      assert.equal(res.isValid, true);
      assert.ok(res.discount <= 50000, 'Tiền giảm không được vượt quá subtotal');
    });
  });

  // ─── 3. Thêm & Xóa khỏi giỏ hàng ───────────────────────────────────────────
  describe('3. Thêm và Xóa khóa học trong Giỏ Hàng', () => {
    it('TC-CART-ADD-01: Báo lỗi 401 khi không có userId', async () => {
      await assert.rejects(async () => {
        await addToCartLogic(null, '1');
      }, /đăng nhập/);
    });

    it('TC-CART-ADD-02: Thêm thành công khóa học vào giỏ hàng', async () => {
      const result = await addToCartLogic(testUserId, testCourseId1);
      assert.ok(result.totalCourses >= 1, 'Tổng số khóa học phải >= 1');
      const found = result.courses.some(c => c.course_id === testCourseId1);
      assert.ok(found, 'Phải tìm thấy khóa học vừa thêm');
    });

    it('TC-CART-ADD-03: Thêm trùng khóa học không làm tăng bản ghi kép', async () => {
      await addToCartLogic(testUserId, testCourseId1);
      const cartCountInDb = await db.collection(COLLECTION_CARTS).countDocuments({
        user_id: testUserId,
        course_id: testCourseId1,
      });
      assert.equal(cartCountInDb, 1, 'Không được có 2 bản ghi trùng lặp trong DB');
    });

    it('TC-CART-DEL-01: Xóa khóa học ra khỏi giỏ hàng thành công', async () => {
      await removeFromCartLogic(testUserId, testCourseId1);
      const cartCountInDb = await db.collection(COLLECTION_CARTS).countDocuments({
        user_id: testUserId,
        course_id: testCourseId1,
      });
      assert.equal(cartCountInDb, 0, 'Khóa học phải được xóa sạch khỏi DB');
    });

    it('TC-CART-ISOLATION-01: Xóa khóa học của user này không xóa cùng course của user khác', async () => {
      const otherUserId = `${testUserId}-other`;
      await db.collection(COLLECTION_CARTS).insertMany([
        { user_id: testUserId, course_id: testCourseId1 },
        { user_id: otherUserId, course_id: testCourseId1 },
      ]);

      await removeFromCartLogic(testUserId, testCourseId1);

      assert.equal(await db.collection(COLLECTION_CARTS).countDocuments({ user_id: otherUserId, course_id: testCourseId1 }), 1);
      await db.collection(COLLECTION_CARTS).deleteMany({ user_id: otherUserId });
    });
  });

  // ─── 4. Cắm cờ Khóa học đã sở hữu & Trạng thái Nút bấm ─────────────────────
  describe('4. Cắm cờ Khóa học đã sở hữu (action_button_state: GO_TO_LEARNING)', () => {
    before(async () => {
      // Đưa khóa học vào giỏ
      await addToCartLogic(testUserId, testCourseId1);
      // Giả lập học viên đã sở hữu khóa học này trong user_enrollments
      await db.collection(COLLECTION_ENROLLMENTS).insertOne({
        user_id: testUserId,
        course_id: testCourseId1,
        enrolled_at: new Date(),
      });
    });

    it('TC-FLAG-01: Cắm cờ is_already_enrolled = true và đổi action_button_state thành GO_TO_LEARNING', async () => {
      const cartData = await getCartDetails({ userId: testUserId });
      const course = cartData.courses.find(c => c.course_id === testCourseId1);

      assert.ok(course, 'Phải tìm thấy khóa học trong giỏ');
      assert.equal(course.is_already_enrolled, true, 'is_already_enrolled phải là true');
      assert.equal(course.action_button_state, 'GO_TO_LEARNING', 'action_button_state phải là GO_TO_LEARNING');
      assert.equal(course.action_button_label, 'Vào khu vực học', 'action_button_label phải là Vào khu vực học');

      // Khóa học đã sở hữu không được tính vào tổng tiền thanh toán
      assert.equal(cartData.summary.finalTotal, 0, 'Khóa học đã sở hữu không được tính tiền vào giỏ thanh toán');
    });
  });

  // ─── 5. Khách Vãng Lai & Đồng Bộ Giỏ Hàng (Guest Cart & Merge) ─────────────
  describe('5. Hỗ trợ Khách Vãng Lai (Guest Cart) & Đồng bộ sau Đăng nhập (Merge)', () => {
    it('TC-GUEST-01: Khách vãng lai xem giỏ hàng thành công qua guestCourseIds và gắn cờ requiresAuthToCheckout', async () => {
      const guestData = await getCartDetails({
        userId: null,
        guestCourseIds: [testCourseId1],
      });

      assert.equal(guestData.isGuest, true, 'isGuest phải là true');
      assert.equal(guestData.requiresAuthToCheckout, true, 'Khách vãng lai bắt buộc phải có cờ requiresAuthToCheckout = true');
      assert.ok(guestData.totalCourses >= 1, 'Phải hiển thị được thông tin khóa học');
    });

    it('TC-GUEST-02: mergeGuestCartLogic đồng bộ mảng khóa học từ khách vào DB của user sau đăng nhập', async () => {
      // Trước khi merge, xóa sạch giỏ của user
      await db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId });

      // Thực hiện đồng bộ 2 khóa học từ LocalStorage của khách
      const mergedData = await mergeGuestCartLogic(testUserId, [testCourseId1, testCourseId2]);

      assert.equal(mergedData.isGuest, false, 'Sau khi merge với userId, isGuest phải là false');
      assert.equal(mergedData.requiresAuthToCheckout, false, 'User đã đăng nhập không bị yêu cầu đăng nhập lại');

      // Kiểm tra trong DB xem đã lưu chưa
      const inDbCount = await db.collection(COLLECTION_CARTS).countDocuments({ user_id: testUserId });
      assert.ok(inDbCount >= 1, 'Khóa học từ khách phải được ghi vào DB');
    });
  });

  // ─── 6. Router Express ─────────────────────────────────────────────────────
  describe('6. createCartRouter – Khởi tạo Express Router với Guest & Merge endpoints', () => {
    it('TC-ROUTER-01: Router hỗ trợ các route GET /, POST /merge, POST /voucher/validate', () => {
      const dummyAuth = (req, res, next) => next();
      const routes = [];
      const dummyExpress = {
        Router: () => ({
          get: (path) => routes.push(`GET ${path}`),
          post: (path) => routes.push(`POST ${path}`),
          delete: (path) => routes.push(`DELETE ${path}`),
        }),
      };
      const router = createCartRouter(dummyExpress, dummyAuth, dummyAuth);
      assert.ok(router !== null && typeof router === 'object');
      assert.ok(routes.includes('GET /'), 'Thiếu route GET /');
      assert.ok(routes.includes('POST /merge'), 'Thiếu route POST /merge');
      assert.ok(routes.includes('POST /voucher/validate'), 'Thiếu route POST /voucher/validate');
    });
  });
});
