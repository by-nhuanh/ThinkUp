import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeMongoDb, getMongoDb } from '../../db.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import {
  formatVND,
  calculateDiscount,
  formatDuration,
  getCourseCards,
  getSingleCourseCard,
  getCourseDetailLanding,
  getCoursePreviewData,
  getCourseReviews,
  getUserEnrolledCourses,
  getInstructorProfileDetail,
  createCourseRouter,
  COLLECTION_COURSES,
  COLLECTION_CARTS,
  COLLECTION_FAVORITES,
  COLLECTION_ENROLLMENTS,
  COLLECTION_LESSONS,
  COLLECTION_LESSON_VIDEOS,
} from '../course.user.js';

describe('Kiểm thử Module Truy Xuất Thẻ Khóa Học (Course Cards)', () => {
  let db;
  const testUserId = 'test-course-card-user-999';
  let sampleCourseId = '1';

  before(async () => {
    db = await getMongoDb();

    // Dọn dẹp dữ liệu tương tác test nếu có
    await Promise.all([
      db.collection(COLLECTION_FAVORITES).deleteMany({ user_id: testUserId }),
      db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId }),
      db.collection(COLLECTION_ENROLLMENTS).deleteMany({ user_id: testUserId }),
    ]);

    // Lấy 1 khóa học mẫu đang có trong DB
    const courseDoc = await db.collection(COLLECTION_COURSES).findOne({ status: 'published' });
    if (courseDoc && courseDoc.course_id) {
      sampleCourseId = String(courseDoc.course_id);
    }
  });

  after(async () => {
    if (db) {
      await Promise.all([
        db.collection(COLLECTION_FAVORITES).deleteMany({ user_id: testUserId }),
        db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId }),
        db.collection(COLLECTION_ENROLLMENTS).deleteMany({ user_id: testUserId }),
      ]);
      await closeMongoDb();
    }
  });

  // ─── 1. Tiện ích format và tính toán ─────────────────────────────────────────
  describe('1. Kiểm thử các hàm tiện ích', () => {
    it('TC-FMT-01: formatVND chuyển đổi số tiền hoặc miễn phí', () => {
      assert.strictEqual(formatVND(0), 'Miễn phí');
      assert.strictEqual(formatVND(-500), 'Miễn phí');
      assert.strictEqual(formatVND(499000), '499.000đ');
      assert.strictEqual(formatVND(1000000), '1.000.000đ');
    });

    it('TC-DISC-01: calculateDiscount tính chính xác tiền giảm và % chiết khấu', () => {
      const d1 = calculateDiscount(1000000, 500000);
      assert.strictEqual(d1.discountAmount, 500000);
      assert.strictEqual(d1.discountPercent, 50);

      const d2 = calculateDiscount(1000000, 1000000);
      assert.strictEqual(d2.discountAmount, 0);
      assert.strictEqual(d2.discountPercent, 0);

      const d3 = calculateDiscount(0, 0);
      assert.strictEqual(d3.discountAmount, 0);
      assert.strictEqual(d3.discountPercent, 0);
    });

    it('TC-DUR-01: formatDuration chuyển phút thành chuỗi trực quan', () => {
      assert.strictEqual(formatDuration(45), '45 phút');
      assert.strictEqual(formatDuration(120), '2 giờ');
      assert.strictEqual(formatDuration(135), '2 giờ 15 phút');
      assert.strictEqual(formatDuration(0), '');
    });
  });

  // ─── 2. Truy xuất danh sách Thẻ Khóa Học ────────────────────────────────────
  describe('2. Truy xuất danh sách Thẻ Khóa Học và kiểm tra các trường bắt buộc', () => {
    it('TC-CARD-01: Trả về danh sách khóa học với đầy đủ 14 trường yêu cầu', async () => {
      const result = await getCourseCards({
        limit: 5,
        dbInstance: db,
      });

      assert.ok(result.pagination, 'Phải có metadata phân trang');
      assert.ok(Array.isArray(result.courses), 'Danh sách khóa học phải là mảng');
      assert.ok(result.courses.length > 0, 'Phải có ít nhất 1 khóa học trong CSDL');

      const card = result.courses[0];

      // 1. Tên khóa học
      assert.ok(card.title, 'Card phải có tên khóa học (title)');

      // 2. Bìa khóa học
      assert.ok(typeof card.thumbnail_url === 'string', 'Card phải có thumbnail_url');

      // 3 & 4. Tên và Avatar giảng viên
      assert.ok(card.instructor, 'Card phải có object instructor');
      assert.ok(card.instructor.name, 'Phải có tên giảng viên (instructor.name)');
      assert.ok(typeof card.instructor.avatar_url === 'string', 'Phải có avatar giảng viên (instructor.avatar_url)');

      // 5. Trung bình sao đánh giá
      assert.ok(typeof card.rating === 'number', 'Phải có số sao trung bình (rating)');

      // 6. Số comment/review
      assert.ok(typeof card.total_reviews === 'number', 'Phải có total_reviews');
      assert.ok(typeof card.total_comments === 'number', 'Phải có total_comments');

      // 7. Tổng số học viên
      assert.ok(typeof card.total_students === 'number', 'Phải có tổng số học viên (total_students)');

      // 8. Các tag liên quan đến khóa học
      assert.ok(Array.isArray(card.tags), 'tags phải là mảng');
      assert.ok(Array.isArray(card.tag_names), 'tag_names phải là mảng chuỗi');

      // 9. Số tiền gốc
      assert.ok(typeof card.price.original === 'number', 'Phải có giá gốc price.original');

      // 10. Số giảm giá (% discount)
      assert.ok(typeof card.price.discount_percent === 'number', 'Phải có % giảm giá (price.discount_percent)');

      // 11. Số tiền giảm giá
      assert.ok(typeof card.price.discount_amount === 'number', 'Phải có số tiền giảm (price.discount_amount)');

      // 12. Tình trạng cờ có trong wishlist
      assert.ok(typeof card.is_in_wishlist === 'boolean', 'Phải có cờ is_in_wishlist');

      // 13. Tình trạng bỏ vào giỏ hàng
      assert.ok(typeof card.is_in_cart === 'boolean', 'Phải có cờ is_in_cart');

      // 14. Cờ đánh dấu khóa học đã mua hay chưa
      assert.ok(typeof card.is_purchased === 'boolean', 'Phải có cờ is_purchased');
      assert.ok(typeof card.is_already_enrolled === 'boolean', 'Phải có cờ is_already_enrolled');

      // Các trường chuẩn định danh & giao diện
      assert.ok(card.id, 'Phải có id (ObjectId hoặc string)');
      assert.ok(card.slug, 'Phải có slug chuẩn SEO');
      assert.strictEqual(card.status, 'published', 'status phải là published');
      assert.ok(typeof card.badge === 'string', 'Phải có trường badge (chuỗi)');
      assert.ok(card.level, 'Phải có cấp độ khóa học level');
      assert.ok(typeof card.duration_minutes === 'number', 'Phải có duration_minutes dạng số');
      assert.ok(typeof card.is_free === 'boolean', 'Phải có cờ is_free dạng boolean');
      assert.ok(card.action_state, 'Phải có trạng thái nút bấm (action_state)');
    });

    it('TC-CARD-02: Truy xuất với limit="all" hoặc limit=0 trả về tất cả các khóa học', async () => {
      const result = await getCourseCards({
        limit: 'all',
        dbInstance: db,
      });

      assert.ok(result.courses.length >= 1, 'Lấy tất cả phải có ít nhất 1 khóa học');
      assert.strictEqual(result.pagination.total_pages, 1);
    });

    it('TC-CARD-03: Lọc khóa học theo từ khóa tìm kiếm (search)', async () => {
      const result = await getCourseCards({
        filters: { search: 'React' },
        limit: 10,
        dbInstance: db,
      });

      assert.ok(Array.isArray(result.courses));
      if (result.courses.length > 0) {
        assert.ok(result.courses.some(c => c.title.toLowerCase().includes('react')));
      }
    });

    it('TC-CARD-04: Sắp xếp theo học viên nhiều nhất (sort=popular)', async () => {
      const result = await getCourseCards({
        sort: 'popular',
        limit: 5,
        dbInstance: db,
      });

      if (result.courses.length >= 2) {
        assert.ok(result.courses[0].total_students >= result.courses[1].total_students);
      }
    });
  });

  // ─── 3. Kiểm thử Cờ Cá Nhân Hóa (Wishlist, Cart, Purchased) ─────────────────
  describe('3. Kiểm thử cờ tương tác học viên đã đăng nhập', () => {
    it('TC-FLAG-01: Cập nhật chính xác cờ is_in_wishlist khi khóa học nằm trong user_favorite_courses', async () => {
      // Giả lập thêm vào wishlist
      await db.collection(COLLECTION_FAVORITES).insertOne({
        user_id: testUserId,
        course_id: sampleCourseId,
        created_at: new Date(),
      });

      const result = await getCourseCards({
        userId: testUserId,
        limit: 'all',
        dbInstance: db,
      });

      const matched = result.courses.find(c => c.course_id === sampleCourseId);
      assert.ok(matched, 'Phải tìm thấy khóa học mẫu');
      assert.strictEqual(matched.is_in_wishlist, true, 'is_in_wishlist phải bằng true');
      assert.strictEqual(matched.is_in_cart, false, 'is_in_cart vẫn là false');
    });

    it('TC-FLAG-02: Cập nhật chính xác cờ is_in_cart khi khóa học nằm trong user_cart_items', async () => {
      // Giả lập thêm vào giỏ hàng
      await db.collection(COLLECTION_CARTS).insertOne({
        user_id: testUserId,
        course_id: sampleCourseId,
        added_at: new Date(),
      });

      const result = await getCourseCards({
        userId: testUserId,
        limit: 'all',
        dbInstance: db,
      });

      const matched = result.courses.find(c => c.course_id === sampleCourseId);
      assert.ok(matched);
      assert.strictEqual(matched.is_in_cart, true, 'is_in_cart phải bằng true');
    });

    it('TC-FLAG-03: Cập nhật chính xác cờ is_purchased và tiến độ học khi đã ghi danh', async () => {
      // Giả lập ghi danh khóa học với tiến độ 40%
      await db.collection(COLLECTION_ENROLLMENTS).insertOne({
        user_id: testUserId,
        course_id: sampleCourseId,
        progress_percentage: 40,
        enrolled_at: new Date(),
      });

      const result = await getCourseCards({
        userId: testUserId,
        limit: 'all',
        dbInstance: db,
      });

      const matched = result.courses.find(c => c.course_id === sampleCourseId);
      assert.ok(matched);
      assert.strictEqual(matched.is_purchased, true, 'is_purchased phải bằng true');
      assert.strictEqual(matched.is_already_enrolled, true, 'is_already_enrolled phải bằng true');
      assert.strictEqual(matched.progress_percentage, 40, 'Tiến độ học phải là 40%');
      assert.strictEqual(matched.action_state, 'CONTINUE_LEARNING', 'Trạng thái nút phải là CONTINUE_LEARNING');
    });
  });

  // ─── 4. Kiểm thử getSingleCourseCard & Router ───────────────────────────────
  describe('4. Truy xuất chi tiết thẻ khóa học đơn lẻ & Router Express', () => {
    it('TC-SINGLE-01: Lấy thành công thẻ khóa học qua course_id hợp lệ', async () => {
      const card = await getSingleCourseCard(sampleCourseId, testUserId, db);
      assert.ok(card);
      assert.strictEqual(card.course_id, sampleCourseId);
      assert.ok(card.instructor.name);
    });

    it('TC-SINGLE-02: Báo lỗi 404 khi course_id không tồn tại', async () => {
      await assert.rejects(async () => {
        await getSingleCourseCard('non_existent_course_id_xyz_9999', null, db);
      }, (err) => {
        assert.strictEqual(err.status, 404);
        return true;
      });
    });

    it('TC-ROUTER-01: Khởi tạo router thành công', () => {
      const mockExpress = {
        Router: () => ({
          get: () => {},
          post: () => {},
        }),
      };
      const router = createCourseRouter(mockExpress);
      assert.ok(router);
    });

    it('TC-STREAM-COURSE-01: Không phát lesson của course khác và vẫn phát preview thuộc đúng course', async () => {
      const suffix = randomUUID();
      const courseA = `stream-a-${suffix}`;
      const courseB = `stream-b-${suffix}`;
      const lessonA = `lesson-a-${suffix}`;
      const lessonB = `lesson-b-${suffix}`;
      let server;

      try {
        await db.collection(COLLECTION_COURSES).insertMany([
          { course_id: courseA, slug: courseA, title: 'Stream A', status: 'published' },
          { course_id: courseB, slug: courseB, title: 'Stream B', status: 'published' },
        ]);
        await db.collection(COLLECTION_LESSONS).insertMany([
          { lesson_id: lessonA, course_id: courseA, is_free: '1' },
          { lesson_id: lessonB, course_id: courseB, is_free: '1' },
        ]);
        await db.collection(COLLECTION_LESSON_VIDEOS).insertMany([
          { lesson_id: lessonA, video_url: 'https://example.test/a.mp4' },
          { lesson_id: lessonB, video_url: 'https://example.test/b.mp4' },
        ]);

        const app = express();
        app.use('/courses', createCourseRouter(express, (req, res, next) => next()));
        server = createServer(app);
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const crossCourseResponse = await fetch(`${baseUrl}/courses/${courseA}/lessons/${lessonB}/stream`);
        assert.equal(crossCourseResponse.status, 404);

        const matchingPreviewResponse = await fetch(`${baseUrl}/courses/${courseA}/lessons/${lessonA}/stream`);
        assert.equal(matchingPreviewResponse.status, 200);
        const matchingPreview = await matchingPreviewResponse.json();
        assert.equal(matchingPreview.data.video_url, 'https://example.test/a.mp4');
      } finally {
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        await Promise.all([
          db.collection(COLLECTION_COURSES).deleteMany({ course_id: { $in: [courseA, courseB] } }),
          db.collection(COLLECTION_LESSONS).deleteMany({ lesson_id: { $in: [lessonA, lessonB] } }),
          db.collection(COLLECTION_LESSON_VIDEOS).deleteMany({ lesson_id: { $in: [lessonA, lessonB] } }),
        ]);
      }
    });
  });

  // ─── 5. Kiểm thử Tái Sử Dụng & Chiết Xuất Trường (Projection / Selective Fields) ─
  describe('5. Kiểm thử Tái Sử Dụng & Chỉ lấy 1-2 trường (Projection)', () => {
    it('TC-FIELDS-01: getCourseCards chỉ trả về các trường được chỉ định (vd: title, thumbnail_url)', async () => {
      const result = await getCourseCards({
        limit: 3,
        fields: ['title', 'thumbnail_url'],
        dbInstance: db,
      });

      assert.ok(result.courses.length > 0);
      for (const card of result.courses) {
        assert.ok(card.title, 'Phải có trường title');
        assert.ok(card.thumbnail_url !== undefined, 'Phải có trường thumbnail_url');
        assert.strictEqual(card.instructor, undefined, 'Không được có trường instructor');
        assert.strictEqual(card.price, undefined, 'Không được có trường price');
        assert.strictEqual(card.is_in_cart, undefined, 'Không được có trường is_in_cart');
      }
    });

    it('TC-FIELDS-02: getCourseCards nhận fields dạng chuỗi ngăn cách dấu phẩy (vd: "title,price")', async () => {
      const result = await getCourseCards({
        limit: 2,
        fields: 'title,price',
        dbInstance: db,
      });

      assert.ok(result.courses.length > 0);
      const card = result.courses[0];
      assert.ok(card.title);
      assert.ok(card.price);
      assert.strictEqual(card.thumbnail_url, undefined);
    });

    it('TC-FIELDS-03: getSingleCourseCard chỉ trả về đúng các trường yêu cầu', async () => {
      const card = await getSingleCourseCard(sampleCourseId, null, db, ['title', 'price']);
      assert.ok(card.title);
      assert.ok(card.price);
      assert.strictEqual(card.instructor, undefined);
      assert.strictEqual(card.rating, undefined);
    });
  });

  // ─── 6. Kiểm thử Chi Tiết Khóa Học (Course Landing Page) ───────────────────
  describe('6. Kiểm thử Chi Tiết Khóa Học (Course Landing Page - BA Spec)', () => {
    it('TC-DETAIL-01: Lấy thành công dữ liệu Landing Page với Banner, Pricing, Syllabus, Instructor, Reviews Summary', async () => {
      const detail = await getCourseDetailLanding(sampleCourseId, null, db);

      assert.ok(detail.title, 'Khóa học phải có tiêu đề');
      assert.ok(detail.thumbnail_url, 'Phải có ảnh bìa khóa học');
      assert.ok(detail.pricing, 'Phải có khối pricing');
      assert.ok(detail.pricing.price_formatted, 'Phải có định dạng giá');
      assert.ok(Array.isArray(detail.sections), 'Syllabus sections phải là mảng');
      assert.ok(detail.reviews_summary, 'Phải có reviews_summary');
      assert.ok(detail.reviews_summary.breakdown, 'Phải có thống kê rating breakdown');
      assert.ok(Array.isArray(detail.breadcrumbs), 'Phải có breadcrumbs');
    });

    it('TC-DETAIL-02: Kiểm tra phân quyền bảo mật trong Syllabus (Chương 1 mở bài thử, chương 2 khóa)', async () => {
      const detail = await getCourseDetailLanding(sampleCourseId, null, db);
      if (detail.sections.length > 1) {
        assert.strictEqual(detail.sections[0].is_chapter_locked, false, 'Chương 1 không bị khóa');
        assert.strictEqual(detail.sections[1].is_chapter_locked, true, 'Từ chương 2 trở đi bị khóa');
      }
    });

    it('TC-DETAIL-03: Báo lỗi 404 khi mã khóa học không tồn tại', async () => {
      await assert.rejects(
        async () => {
          await getCourseDetailLanding('non-existing-course-id-9999', null, db);
        },
        err => err.status === 404
      );
    });
  });

  // ─── 7. Kiểm thử Màn hình Học Thử (Free Trial Player) ───────────────────────
  describe('7. Kiểm thử Màn hình Học Thử (Free Trial Player - BA Spec)', () => {
    it('TC-PREVIEW-01: Trả về cấu hình học thử, danh sách bài học thử và tài liệu', async () => {
      const previewData = await getCoursePreviewData(sampleCourseId, null, db);

      assert.ok(previewData.course, 'Phải có thông tin tóm tắt khóa học');
      assert.ok(previewData.player_config, 'Phải có player_config');
      assert.strictEqual(previewData.player_config.allow_mark_completed, false, 'Không cho phép đánh dấu hoàn thành');
      assert.strictEqual(previewData.player_config.allow_qa, false, 'Tab Hỏi đáp bị khóa đối với người học thử');
      assert.ok(Array.isArray(previewData.syllabus), 'Syllabus phải là mảng');
      assert.ok(Array.isArray(previewData.preview_lessons), 'preview_lessons phải là mảng');
      assert.ok(Array.isArray(previewData.resources), 'resources tài liệu phải là mảng');
    });
  });

  // ─── 8. Kiểm thử Đánh giá & Bộ Lọc Đánh Giá (Reviews Filtering) ────────────
  describe('8. Kiểm thử Đánh giá & Bộ Lọc Đánh Giá (Course Reviews)', () => {
    it('TC-REV-01: Lấy danh sách đánh giá kèm phân trang Ajax', async () => {
      const res = await getCourseReviews(sampleCourseId, { page: 1, limit: 5 }, db);

      assert.ok(res.pagination, 'Phải có pagination');
      assert.ok(Array.isArray(res.reviews), 'reviews phải là mảng');
    });

    it('TC-REV-02: Lọc đánh giá theo số sao (vd: 5 sao)', async () => {
      const res = await getCourseReviews(sampleCourseId, { rating: 5, limit: 5 }, db);

      for (const rev of res.reviews) {
        assert.strictEqual(Math.round(rev.rating), 5, 'Chỉ chứa đánh giá 5 sao');
      }
    });

    it('TC-REV-03: Sắp xếp theo đánh giá cao nhất (highest) và thấp nhất (lowest)', async () => {
      const resHigh = await getCourseReviews(sampleCourseId, { sort: 'highest', limit: 3 }, db);
      assert.ok(resHigh.reviews.length > 0);
      for (let i = 0; i < resHigh.reviews.length - 1; i++) {
        assert.ok(resHigh.reviews[i].rating >= resHigh.reviews[i + 1].rating, 'Phải xếp giảm dần theo số sao');
      }

      const resLow = await getCourseReviews(sampleCourseId, { sort: 'lowest', limit: 3 }, db);
      assert.ok(resLow.reviews.length > 0);
      for (let i = 0; i < resLow.reviews.length - 1; i++) {
        assert.ok(resLow.reviews[i].rating <= resLow.reviews[i + 1].rating, 'Phải xếp tăng dần theo số sao');
      }
    });

    it('TC-REV-04: Trả về danh sách filter_options kèm tổng số lượng từng mức sao phục vụ Dropdown lọc', async () => {
      const res = await getCourseReviews(sampleCourseId, {}, db);
      assert.ok(res.filter_summary, 'Phải có filter_summary');
      assert.ok(Array.isArray(res.filter_summary.filter_options), 'Phải có danh sách filter_options');
      
      const opt5Star = res.filter_summary.filter_options.find(o => o.value === 5);
      assert.ok(opt5Star, 'Phải có lựa chọn 5 sao');
      assert.ok(typeof opt5Star.count === 'number', 'Lựa chọn phải có số đếm count');
      assert.ok(opt5Star.label.includes('5 sao'), 'Label phải ghi 5 sao');
    });

    it('TC-REV-05: Mỗi bình luận phải có created_at_relative (vd: 2 tuần trước, 1 tháng trước)', async () => {
      const res = await getCourseReviews(sampleCourseId, { limit: 5 }, db);
      assert.ok(res.reviews.length > 0);
      for (const rev of res.reviews) {
        assert.ok(typeof rev.created_at_relative === 'string', 'Phải có trường created_at_relative');
      }
    });
  });

  // ─── 7. Kiểm thử Khóa học của tôi (My Courses / Enrolled Courses Dashboard) ─
  describe('7. Kiểm thử Nghiệp vụ Khóa học của tôi (getUserEnrolledCourses)', () => {
    it('TC-ENROLL-01: Trả về mảng rỗng nếu userId không có khóa học nào', async () => {
      const res = await getUserEnrolledCourses('non-existent-user-id');
      assert.ok(Array.isArray(res));
      assert.strictEqual(res.length, 0);
    });

    it('TC-ENROLL-02: Lấy danh sách khóa học của học viên đã ghi danh đầy đủ thuộc tính', async () => {
      // Giả lập ghi danh khóa học mẫu cho testUserId
      await db.collection(COLLECTION_ENROLLMENTS).insertOne({
        user_id: testUserId,
        course_id: sampleCourseId,
        enrolled_at: new Date(),
      });
      await db.collection('user_course_progress').insertOne({
        user_id: testUserId,
        course_id: sampleCourseId,
        progress_percentage: 45,
        completed_lessons_count: 5,
        updated_at: new Date(),
      });

      const res = await getUserEnrolledCourses(testUserId);
      assert.ok(Array.isArray(res));
      assert.ok(res.length >= 1, 'Phải có ít nhất 1 khóa học đã ghi danh');

      const enrolled = res.find((c) => c.id === sampleCourseId);
      assert.ok(enrolled, 'Khóa học mẫu phải có trong danh sách');
      assert.ok(enrolled.title, 'Phải có title');
      assert.ok(enrolled.instructor, 'Phải có instructor');
      assert.ok(typeof enrolled.totalLessons === 'number', 'Phải có totalLessons');
      assert.ok(typeof enrolled.completedLessons === 'number', 'Phải có completedLessons');
      assert.ok(enrolled.cover, 'Phải có cover color');
      assert.ok(enrolled.coverTitle, 'Phải có coverTitle');
      assert.ok(enrolled.lastStudiedAt, 'Phải có lastStudiedAt');

      // Dọn dẹp
      await db.collection(COLLECTION_ENROLLMENTS).deleteMany({ user_id: testUserId });
      await db.collection('user_course_progress').deleteMany({ user_id: testUserId });
    });
  });

  // ─── 8. Kiểm thử Hồ sơ giảng viên công khai (Public Instructor Profile) ────
  describe('8. Kiểm thử Hồ sơ giảng viên công khai (getInstructorProfileDetail)', () => {
    it('TC-INST-01: Báo lỗi 400 hoặc 404 khi instructorId không hợp lệ hoặc không tồn tại', async () => {
      await assert.rejects(
        async () => {
          await getInstructorProfileDetail('');
        },
        (err) => err.status === 400
      );

      await assert.rejects(
        async () => {
          await getInstructorProfileDetail('instructor-that-never-exists-9999');
        },
        (err) => err.status === 404
      );
    });

    it('TC-INST-02: Truy xuất đầy đủ thông tin giảng viên chuẩn chuyên nghiệp và danh sách khóa học', async () => {
      const res = await getInstructorProfileDetail('dang-van-anh-tai');
      assert.ok(res.instructor, 'Phải có object instructor');
      assert.strictEqual(res.instructor.full_name, 'ĐẶNG VĂN ANH TÀI');
      assert.ok(res.instructor.title, 'Phải có chức danh title');
      assert.ok(res.instructor.avatar_url, 'Phải có avatar_url');
      assert.ok(res.instructor.location, 'Phải có location');
      assert.ok(res.instructor.joined_at, 'Phải có joined_at');
      assert.ok(res.instructor.total_students >= 0, 'Phải có tổng học viên');
      assert.ok(res.instructor.rating >= 0, 'Phải có rating');
      assert.ok(res.instructor.github, 'Phải có link github');
      assert.ok(res.instructor.linkedin, 'Phải có link linkedin');
      assert.ok(Array.isArray(res.instructor.specializations), 'Phải có mảng công nghệ chuyên môn');
      assert.ok(Array.isArray(res.instructor.experiences), 'Phải có mảng kinh nghiệm & học vấn');
      assert.ok(Array.isArray(res.courses), 'Phải có mảng danh sách khóa học đang giảng dạy');
    });
  });
});
import { getLessonStream, hasCourseEnrollment } from '../course.user.js';
it('Learning integration: stream applies settings only after course access', async () => {
  let enrolled = false, mediaReads = 0;
  const db = { collection(name) { return { async findOne(query) {
    if (name === 'courses') return { course_id: 'course', _id: 'course-db' };
    if (name === 'lessons') return query.course_id.$in.includes('course') && query.lesson_id === 'lesson' ? { lesson_id: 'lesson', is_free: '0' } : null;
    if (name === 'users') return null;
    if (name === 'user_enrollments') return null;
    if (name === 'user_courses') return enrolled ? { user_id: 'learner' } : null;
    if (name === 'learning_preferences') return { _id: 'learner', playbackSpeed: '1.5', autoNext: false, videoQuality: '720p' };
    if (name === 'lesson_videos') { mediaReads++; return { video_url: '/original.mp4', video_sources: [{ quality: '720p', url: '/720.mp4' }] }; }
    throw new Error('Unexpected collection ' + name);
  } }; } };
  await assert.rejects(getLessonStream('course', 'lesson', 'learner', { db }), { status: 403 });
  assert.equal(mediaReads, 0);
  enrolled = true;
  const result = await getLessonStream('course', 'lesson', 'learner', { db });
  assert.equal(result.video_url, '/720.mp4');assert.equal(result.playback.effective.playbackSpeed, 1.5);
  assert.equal(result.playback.effective.autoNext, false);
  await assert.rejects(getLessonStream('course', 'other', 'learner', { db }), { status: 404 });
  assert.equal(await hasCourseEnrollment({ course_id: 'course' }, null, { db }), false);
});

it('Learning integration: course preview cannot bypass document download permissions', async () => {
  let enrolled = false;
  const db = { collection(name) { return {
    async findOne() {
      if (name === 'courses') return { _id: 'course-db', course_id: 'course', status: 'published', price: 100 };
      if (name === 'users') return null;
      if (name === 'user_enrollments') return enrolled ? { user_id: 'learner' } : null;
      if (name === 'user_courses') return null;
      throw new Error(name);
    },
    find() { return { sort() { return this; }, async toArray() {
      if (name === 'course_sections') return [];
      if (name === 'course_documents') return [{ _id: 'document', file_url: '/private.pdf', download_url: '/old-public.pdf' }];
      throw new Error(name);
    } }; },
  }; } };
  const guest = await getCoursePreviewData('course', null, db);
  assert.equal(guest.resources[0].download_url, null);assert.equal(guest.resources[0].can_download, false);
  enrolled = true;
  const owner = await getCoursePreviewData('course', 'learner', db);
  assert.equal(owner.resources[0].download_url, '/api/user/lessons/documents/document/download');
});
