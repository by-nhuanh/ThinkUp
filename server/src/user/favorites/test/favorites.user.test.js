import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getMongoDb } from '../../db.js';
import {
  sortFavoriteCourses,
  getUserFavoriteCourseIds,
  checkFavoriteStatus,
  addFavoriteCourse,
  removeFavoriteCourse,
  toggleFavoriteCourse,
  syncFavoritesLogic,
  getUserFavorites,
  clearUserFavorites,
  createFavoritesRouter,
  COLLECTION_FAVORITES,
  COLLECTION_COURSES,
  SORT_OPTIONS,
} from '../favorites.user.js';

describe('Chức Năng Khóa Học Yêu Thích & Đồng Bộ Đa Thiết Bị (Favorites Unit & Integration Tests)', () => {
  let db;
  const testUserId = 'test-fav-sync-user-99999';
  let validCourse1 = null;
  let validCourse2 = null;
  let validCourse3 = null;

  before(async () => {
    db = await getMongoDb();
    // Dọn dữ liệu test cũ nếu có
    await db.collection(COLLECTION_FAVORITES).deleteMany({
      $or: [{ user_id: testUserId }, { userId: testUserId }],
    });

    // Lấy 3 khóa học thực tế có trong DB để kiểm thử
    const courses = await db.collection(COLLECTION_COURSES).find({ status: 'published' }).limit(3).toArray();
    if (courses.length >= 2) {
      validCourse1 = courses[0];
      validCourse2 = courses[1];
      validCourse3 = courses[2] || courses[0];
    } else {
      // Nếu chưa có khóa học, tạo khóa mẫu tạm thời
      const insRes = await db.collection(COLLECTION_COURSES).insertOne({
        course_id: 'mock-fav-course-101',
        title: 'Khóa học Lập trình Test A',
        price: 299000,
        original_price: 599000,
        rating: 4.8,
        total_students: 1200,
        status: 'published',
      });
      validCourse1 = { course_id: 'mock-fav-course-101', _id: insRes.insertedId };
      validCourse2 = { course_id: 'mock-fav-course-102', _id: insRes.insertedId };
    }
  });

  after(async () => {
    if (db) {
      await db.collection(COLLECTION_FAVORITES).deleteMany({
        $or: [{ user_id: testUserId }, { userId: testUserId }],
      });
      await db.collection(COLLECTION_COURSES).deleteMany({
        course_id: { $in: ['mock-fav-course-101', 'mock-fav-course-102'] },
      });
    }
  });

  // ─── 1. Kiểm thử Hàm Sắp Xếp Đa Tiêu Chí (sortFavoriteCourses) ─────────────
  describe('1. Kiểm thử Hàm Sắp Xếp Đa Tiêu Chí (sortFavoriteCourses)', () => {
    const mockList = [
      {
        id: '1',
        title: 'B - ReactJS Nâng Cao',
        price: { sale: 499000 },
        rating: 4.5,
        total_students: 500,
        favorited_at: new Date('2026-01-01T10:00:00Z'),
      },
      {
        id: '2',
        title: 'A - HTML CSS Cơ Bản',
        price: { sale: 0 },
        rating: 4.9,
        total_students: 2500,
        favorited_at: new Date('2026-03-01T10:00:00Z'),
      },
      {
        id: '3',
        title: 'C - NodeJS Microservices',
        price: { sale: 899000 },
        rating: 4.7,
        total_students: 1200,
        favorited_at: new Date('2026-02-01T10:00:00Z'),
      },
    ];

    it('TC-SORT-01: Sắp xếp theo ngày thêm mới nhất (newest / added_desc)', () => {
      const sorted = sortFavoriteCourses(mockList, SORT_OPTIONS.NEWEST);
      assert.equal(sorted[0].id, '2'); // Tháng 3 mới nhất
      assert.equal(sorted[1].id, '3'); // Tháng 2
      assert.equal(sorted[2].id, '1'); // Tháng 1
    });

    it('TC-SORT-02: Sắp xếp theo ngày thêm cũ nhất (oldest / added_asc)', () => {
      const sorted = sortFavoriteCourses(mockList, SORT_OPTIONS.OLDEST);
      assert.equal(sorted[0].id, '1'); // Tháng 1
      assert.equal(sorted[2].id, '2'); // Tháng 3
    });

    it('TC-SORT-03: Sắp xếp theo giá tăng dần (price_asc)', () => {
      const sorted = sortFavoriteCourses(mockList, SORT_OPTIONS.PRICE_ASC);
      assert.equal(sorted[0].id, '2'); // Miễn phí (0đ)
      assert.equal(sorted[1].id, '1'); // 499k
      assert.equal(sorted[2].id, '3'); // 899k
    });

    it('TC-SORT-04: Sắp xếp theo giá giảm dần (price_desc)', () => {
      const sorted = sortFavoriteCourses(mockList, SORT_OPTIONS.PRICE_DESC);
      assert.equal(sorted[0].id, '3'); // 899k
      assert.equal(sorted[1].id, '1'); // 499k
      assert.equal(sorted[2].id, '2'); // 0đ
    });

    it('TC-SORT-05: Sắp xếp theo đánh giá sao cao nhất (highest_rated)', () => {
      const sorted = sortFavoriteCourses(mockList, SORT_OPTIONS.HIGHEST_RATED);
      assert.equal(sorted[0].id, '2'); // 4.9 sao
      assert.equal(sorted[1].id, '3'); // 4.7 sao
      assert.equal(sorted[2].id, '1'); // 4.5 sao
    });

    it('TC-SORT-06: Sắp xếp theo tiêu đề A -> Z (title_asc)', () => {
      const sorted = sortFavoriteCourses(mockList, SORT_OPTIONS.TITLE_ASC);
      assert.equal(sorted[0].id, '2'); // "A - HTML..."
      assert.equal(sorted[1].id, '1'); // "B - React..."
      assert.equal(sorted[2].id, '3'); // "C - NodeJS..."
    });

    it('TC-SORT-07: Sắp xếp theo số lượng học viên đông nhất (popular)', () => {
      const sorted = sortFavoriteCourses(mockList, SORT_OPTIONS.POPULAR);
      assert.equal(sorted[0].id, '2'); // 2500 học viên
      assert.equal(sorted[1].id, '3'); // 1200 học viên
      assert.equal(sorted[2].id, '1'); // 500 học viên
    });

    it('TC-SORT-08: Xử lý an toàn khi mảng rỗng hoặc không hợp lệ', () => {
      assert.deepEqual(sortFavoriteCourses([]), []);
      assert.deepEqual(sortFavoriteCourses(null), []);
    });
  });

  // ─── 2. Thêm Khóa Học Vào Yêu Thích (addFavoriteCourse) ─────────────────────
  describe('2. Thêm Khóa Học Vào Yêu Thích (addFavoriteCourse)', () => {
    it('TC-ADD-01: Báo lỗi 401 khi không truyền userId', async () => {
      await assert.rejects(
        async () => addFavoriteCourse('', '1', db),
        err => err.status === 401
      );
    });

    it('TC-ADD-02: Báo lỗi 400 khi thiếu courseId', async () => {
      await assert.rejects(
        async () => addFavoriteCourse(testUserId, '', db),
        err => err.status === 400
      );
    });

    it('TC-ADD-03: Báo lỗi 404 khi khóa học không tồn tại trong hệ thống', async () => {
      await assert.rejects(
        async () => addFavoriteCourse(testUserId, 'NON_EXISTENT_COURSE_999999', db),
        err => err.status === 404
      );
    });

    it('TC-ADD-04: Thêm thành công khóa học hợp lệ vào user_favorite_courses', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const res = await addFavoriteCourse(testUserId, targetCid, db);

      assert.equal(res.success, true);
      assert.equal(res.is_favorite, true);

      // Kiểm tra trong MongoDB
      const record = await db.collection(COLLECTION_FAVORITES).findOne({
        user_id: testUserId,
        course_id: targetCid,
      });
      assert.ok(record, 'Bản ghi phải tồn tại trong MongoDB');
    });

    it('TC-ADD-05: Đảm bảo tính Idempotency (Thêm lại khóa đã thích không nhân bản dữ liệu)', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const res = await addFavoriteCourse(testUserId, targetCid, db);

      assert.equal(res.success, true);
      assert.equal(res.is_favorite, true);

      const count = await db.collection(COLLECTION_FAVORITES).countDocuments({
        user_id: testUserId,
        course_id: targetCid,
      });
      assert.equal(count, 1, 'Số lượng bản ghi phải duy nhất là 1, không bị trùng lặp');
    });
  });

  // ─── 3. Kiểm tra Trạng Thái & Lấy ID Yêu Thích ──────────────────────────────
  describe('3. Kiểm tra Trạng Thái & Lấy ID Yêu Thích (checkFavoriteStatus & getUserFavoriteCourseIds)', () => {
    it('TC-CHECK-01: checkFavoriteStatus trả về true với khóa đã yêu thích và false với khóa chưa thích', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const isFav = await checkFavoriteStatus(testUserId, targetCid, db);
      assert.equal(isFav, true);

      const notFav = await checkFavoriteStatus(testUserId, 'UNKNOWN_COURSE_XYZ', db);
      assert.equal(notFav, false);
    });

    it('TC-IDS-01: getUserFavoriteCourseIds trả về mảng ID chính xác', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const ids = await getUserFavoriteCourseIds(testUserId, db);
      assert.ok(Array.isArray(ids));
      assert.ok(ids.includes(targetCid));
    });
  });

  // ─── 4. Bật / Tắt Yêu Thích (toggleFavoriteCourse) ──────────────────────────
  describe('4. Bật / Tắt Yêu Thích (toggleFavoriteCourse)', () => {
    it('TC-TOGGLE-01: Đang có trong danh sách -> toggle sẽ XÓA KHỎI danh sách (is_favorite: false)', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const res = await toggleFavoriteCourse(testUserId, targetCid, db);

      assert.equal(res.success, true);
      assert.equal(res.is_favorite, false);
      assert.equal(res.action, 'removed');

      const isFav = await checkFavoriteStatus(testUserId, targetCid, db);
      assert.equal(isFav, false);
    });

    it('TC-TOGGLE-02: Đang chưa có trong danh sách -> toggle sẽ THÊM VÀO danh sách (is_favorite: true)', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const res = await toggleFavoriteCourse(testUserId, targetCid, db);

      assert.equal(res.success, true);
      assert.equal(res.is_favorite, true);
      assert.equal(res.action, 'added');

      const isFav = await checkFavoriteStatus(testUserId, targetCid, db);
      assert.equal(isFav, true);
    });
  });

  // ─── 5. Đồng Bộ Đa Thiết Bị (Multi-Device 100% Sync) ────────────────────────
  describe('5. Đồng Bộ Đa Thiết Bị (syncFavoritesLogic)', () => {
    it('TC-SYNC-01: Học viên đăng nhập trên máy tính / điện thoại gửi clientCourseIds lên -> đồng bộ 100% vào MongoDB', async () => {
      const cid1 = String(validCourse1.course_id || validCourse1._id);
      const cid2 = String(validCourse2.course_id || validCourse2._id);

      // Giả sử trên máy tính đã có cid1, sang điện thoại học viên tick thêm cid2 lúc chưa đăng nhập
      const syncRes = await syncFavoritesLogic(testUserId, [cid1, cid2], db);

      assert.equal(syncRes.success, true);
      assert.ok(syncRes.course_ids.includes(cid1));
      assert.ok(syncRes.course_ids.includes(cid2));

      // Kiểm tra 100% dữ liệu trong MongoDB user_favorite_courses
      const dbRecords = await db.collection(COLLECTION_FAVORITES)
        .find({ user_id: testUserId })
        .toArray();
      const dbIds = dbRecords.map(r => r.course_id);

      assert.ok(dbIds.includes(cid1), 'cid1 phải có trên MongoDB');
      assert.ok(dbIds.includes(cid2), 'cid2 phải có trên MongoDB');
    });

    it('TC-SYNC-02: Đồng bộ an toàn khi gửi mảng trùng lặp hoặc ID rỗng', async () => {
      const cid1 = String(validCourse1.course_id || validCourse1._id);
      const syncRes = await syncFavoritesLogic(testUserId, [cid1, cid1, '', null, undefined], db);

      assert.equal(syncRes.success, true);
      assert.ok(syncRes.course_ids.includes(cid1));
    });
  });

  // ─── 6. Lấy Danh Sách Chi Tiết Kèm Bộ Lọc & Phân Trang (getUserFavorites) ───
  describe('6. Lấy Danh Sách Chi Tiết Kèm Bộ Lọc & Phân Trang (getUserFavorites)', () => {
    it('TC-GET-01: Lấy danh sách thành công, các thẻ có cờ is_in_wishlist = true và favorited_at', async () => {
      const res = await getUserFavorites({
        userId: testUserId,
        sort: 'newest',
        page: 1,
        limit: 10,
        dbInstance: db,
      });

      assert.ok(Array.isArray(res.favorites));
      assert.ok(res.total >= 1);
      assert.ok(res.favorites.length >= 1);

      const firstCard = res.favorites[0];
      assert.equal(firstCard.is_in_wishlist, true, 'is_in_wishlist phải bằng true');
      assert.ok(firstCard.favorited_at, 'Phải có thời điểm favorited_at');
    });

    it('TC-GET-02: Phân trang limit = 1 trả về đúng 1 bản ghi và tổng số trang chính xác', async () => {
      const res = await getUserFavorites({
        userId: testUserId,
        sort: 'newest',
        page: 1,
        limit: 1,
        dbInstance: db,
      });

      assert.equal(res.favorites.length, 1);
      assert.equal(res.limit, 1);
      assert.ok(res.totalPages >= 1);
    });

    it('TC-GET-03: Người dùng chưa có khóa học yêu thích nào -> trả về mảng rỗng không lỗi', async () => {
      const res = await getUserFavorites({
        userId: 'empty-user-no-favorites-000',
        dbInstance: db,
      });

      assert.deepEqual(res.favorites, []);
      assert.equal(res.total, 0);
      assert.deepEqual(res.course_ids, []);
    });
  });

  // ─── 7. Xóa Khóa Học Khỏi Yêu Thích & Clear All ─────────────────────────────
  describe('7. Xóa Khóa Học Khỏi Yêu Thích (removeFavoriteCourse & clearUserFavorites)', () => {
    it('TC-DEL-01: Xóa thành công một khóa học cụ thể', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const res = await removeFavoriteCourse(testUserId, targetCid, db);

      assert.equal(res.success, true);
      assert.equal(res.is_favorite, false);

      const isFav = await checkFavoriteStatus(testUserId, targetCid, db);
      assert.equal(isFav, false);
    });

    it('TC-ISOLATION-01: Xóa favorite của user này không ảnh hưởng user khác', async () => {
      const targetCid = String(validCourse1.course_id || validCourse1._id);
      const otherUserId = `${testUserId}-other`;
      await db.collection(COLLECTION_FAVORITES).insertMany([
        { user_id: testUserId, course_id: targetCid },
        { user_id: otherUserId, course_id: targetCid },
      ]);

      await removeFavoriteCourse(testUserId, targetCid, db);

      assert.equal(await db.collection(COLLECTION_FAVORITES).countDocuments({ user_id: otherUserId, course_id: targetCid }), 1);
      await db.collection(COLLECTION_FAVORITES).deleteMany({ user_id: otherUserId });
    });

    it('TC-SYNC-INVALID-01: Bỏ qua ID khóa học không tồn tại khi đồng bộ', async () => {
      const invalidId = 'missing-course-for-favorites';
      const result = await syncFavoritesLogic(testUserId, [invalidId], db);
      assert.equal(result.course_ids.includes(invalidId), false);
    });

    it('TC-DEL-02: Xóa sạch toàn bộ danh sách yêu thích của người dùng', async () => {
      const res = await clearUserFavorites(testUserId, db);
      assert.equal(res.success, true);

      const remainingIds = await getUserFavoriteCourseIds(testUserId, db);
      assert.equal(remainingIds.length, 0);
    });
  });

  // ─── 8. Khởi Tạo Express Router: createFavoritesRouter ───────────────────────
  describe('8. Khởi Tạo Express Router: createFavoritesRouter', () => {
    it('TC-ROUTER-01: Router được khởi tạo thành công và chứa đầy đủ các endpoints mong muốn', async () => {
      // Mock Express Router
      const mockExpress = {
        Router: () => {
          const routes = [];
          return {
            get: (path, ...handlers) => routes.push({ method: 'GET', path, handlers }),
            post: (path, ...handlers) => routes.push({ method: 'POST', path, handlers }),
            delete: (path, ...handlers) => routes.push({ method: 'DELETE', path, handlers }),
            _routes: routes,
          };
        },
      };

      const mockRequireAuth = (req, res, next) => next();
      const mockOptionalAuth = (req, res, next) => next();

      const router = createFavoritesRouter(mockExpress, mockRequireAuth, mockOptionalAuth);
      const paths = router._routes.map(r => `${r.method} ${r.path}`);

      assert.ok(paths.includes('GET /'), 'Thiếu route GET /');
      assert.ok(paths.includes('GET /ids'), 'Thiếu route GET /ids');
      assert.ok(paths.includes('GET /check/:courseId'), 'Thiếu route GET /check/:courseId');
      assert.ok(paths.includes('POST /sync'), 'Thiếu route POST /sync');
      assert.ok(paths.includes('POST /toggle'), 'Thiếu route POST /toggle');
      assert.ok(paths.includes('POST /'), 'Thiếu route POST /');
      assert.ok(paths.includes('DELETE /:courseId'), 'Thiếu route DELETE /:courseId');
      assert.ok(paths.includes('DELETE /'), 'Thiếu route DELETE /');
    });
  });
});
