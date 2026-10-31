import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTION_COURSES,
  COLLECTION_INSTRUCTORS,
  COLLECTION_SECTIONS,
  COLLECTION_LESSONS,
  COLLECTION_USER_LESSON_PROGRESS,
  COLLECTION_USER_COURSE_PROGRESS,
  COLLECTION_ENROLLMENTS,
  COLLECTION_REVIEWS,
  COLLECTION_DISCUSSIONS,
  COLLECTION_DISCUSSION_LIKES,
  COLLECTION_DISCUSSION_REPORTS,
  COLLECTION_QNA,
  COLLECTION_DOCUMENTS,
  calculateArticleDuration,
  formatDurationMmSs,
  formatHoursMinutes,
  formatDurationVietnamese,
  formatCourseLevel,
  maskEmail,
  formatRelativeTime,
  detectDocumentIcon,
  formatFileSize,
  checkCertificateEligibility,
  getCourseStudyCurriculum,
  getCourseOverview,
  updateLessonProgress,
  getCourseDiscussions,
  createDiscussion,
  updateDiscussion,
  toggleDiscussionLike,
  reportDiscussion,
  getCourseQnaList,
  createQnaQuestion,
  replyQnaQuestion,
  updateQnaContent,
  getCourseDocuments,
  downloadCourseDocument,
} from '../lesson.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';

test('Lesson Module Backend Service Test Suite', async (t) => {
  const db = await getMongoDb();

  // ID fixture dành riêng cho database kiểm thử cô lập.
  const testCourseId = 'test_python_basic_9999';
  const testUserId = 'test_student_user_8888';
  const testUserId2 = 'test_student_user_7777';
  const testSectionId1 = 'test_sec_01';
  const testSectionId2 = 'test_sec_02';

  const cleanAll = async () => {
    await db.collection(COLLECTION_COURSES).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_INSTRUCTORS).deleteMany({
      $or: [
        { instructor_id: 'inst_tran_minh_hieu' },
        { user_id: 'inst_other_test_user' },
      ],
    });
    await db.collection(COLLECTION_SECTIONS).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_LESSONS).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_USER_LESSON_PROGRESS).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_USER_COURSE_PROGRESS).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_ENROLLMENTS).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_REVIEWS).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_DISCUSSIONS).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_DISCUSSION_LIKES).deleteMany({});
    await db.collection(COLLECTION_DISCUSSION_REPORTS).deleteMany({});
    await db.collection(COLLECTION_QNA).deleteMany({ course_id: testCourseId });
    await db.collection(COLLECTION_DOCUMENTS).deleteMany({ course_id: testCourseId });
  };

  // Dọn dẹp dữ liệu trước khi kiểm thử
  await cleanAll();

  // Dọn dẹp sau khi kiểm thử kết thúc
  t.after(async () => {
    await cleanAll();
    assert.equal(await db.collection(COLLECTION_DOCUMENTS).countDocuments({ course_id: testCourseId }), 0,
      'Tài liệu fixture phải được xóa khỏi MongoDB sau kiểm thử');
    assert.equal(await db.collection(COLLECTION_QNA).countDocuments({ course_id: testCourseId }), 0,
      'Q&A fixture phải được xóa khỏi MongoDB sau kiểm thử');
    await closeMongoDb();
  });

  // ─── 1. Kiểm thử các hàm tiện ích tính toán & định dạng ─────────────────────
  await t.test('1. Tiện ích tính thời gian đọc bài đọc (Article) theo số từ', () => {
    // 1040 từ với tốc độ 200 từ/phút = 5.2 phút = 312 giây (05:12)
    const dur1 = calculateArticleDuration(1040, 200);
    assert.equal(dur1, 312, '1040 từ phải được tính xấp xỉ 312 giây');
    assert.equal(formatDurationMmSs(dur1), '05:12', '312 giây phải format ra 05:12');

    // 0 từ -> tối thiểu 60 giây
    assert.equal(calculateArticleDuration(0), 60);

    // Định dạng mm:ss
    assert.equal(formatDurationMmSs(225), '03:45');
    assert.equal(formatDurationMmSs(630), '10:30');

    // Định dạng giờ phút
    assert.equal(formatHoursMinutes(20700), '05h 45m');
    assert.equal(formatHoursMinutes(31500), '08h 45m');
  });

  // ─── 2. Kiểm thử quy tắc cấp chứng chỉ ──────────────────────────────────────
  await t.test('2. Quy tắc cấp chứng chỉ (Tiến độ >= 80% VÀ hoàn thành toàn bộ Quiz)', () => {
    // TH1: Tiến độ < 80% và chưa hoàn thành quiz
    const res1 = checkCertificateEligibility({ progressPercentage: 65, quizzesTotal: 4, quizzesPassed: 2 });
    assert.equal(res1.canClaim, false);

    // TH2: Tiến độ >= 80% nhưng quiz chưa đạt đủ
    const res2 = checkCertificateEligibility({ progressPercentage: 85, quizzesTotal: 4, quizzesPassed: 3 });
    assert.equal(res2.canClaim, false);

    // TH3: Toàn bộ quiz đạt nhưng tiến độ < 80%
    const res3 = checkCertificateEligibility({ progressPercentage: 75, quizzesTotal: 2, quizzesPassed: 2 });
    assert.equal(res3.canClaim, false);

    // TH4: Tiến độ >= 80% VÀ toàn bộ quiz đạt -> Hợp lệ cấp chứng chỉ
    const res4 = checkCertificateEligibility({ progressPercentage: 85, quizzesTotal: 4, quizzesPassed: 4 });
    assert.equal(res4.canClaim, true);

    // TH5: Khóa học không có quiz nào, tiến độ >= 80% -> Hợp lệ
    const res5 = checkCertificateEligibility({ progressPercentage: 80, quizzesTotal: 0, quizzesPassed: 0 });
    assert.equal(res5.canClaim, true);
  });

  // ─── 3. Tạo dữ liệu mẫu khớp với hình ảnh giao diện ThinkUp ─────────────────
  await t.test('3. Chuẩn bị dữ liệu fixture trong MongoDB kiểm thử', async () => {
    // 3.1 Tạo khóa học
    await db.collection(COLLECTION_COURSES).insertOne({
      course_id: testCourseId,
      slug: 'python-co-ban-cho-nguoi-moi-bat-dau',
      title: 'Python Cơ Bản Cho Người Mới Bắt Đầu',
      short_description: 'Khóa học dành cho người mới bắt đầu, giúp bạn nắm vững nền tảng Python từ cơ bản đến nâng cao thông qua các ví dụ thực tế.',
      intro_video_url: 'https://example.com/intro.mp4',
      thumbnail_url: 'https://example.com/thumb.jpg',
      instructor_id: 'inst_tran_minh_hieu',
      instructor_name: 'Trần Minh Hiếu',
      instructor_avatar: 'https://example.com/avatar.jpg',
      // Đánh giá và số học viên thuộc về khóa học
      rating: 4.8,
      total_reviews: 1234,
      total_students: 120456,
      created_at: new Date(),
    });

    // 3.2 Tạo Sections
    await db.collection(COLLECTION_SECTIONS).insertMany([
      {
        course_id: testCourseId,
        section_id: testSectionId1,
        section_number: 1,
        title: 'Phần 1: Giới thiệu',
        order_index: 1,
      },
      {
        course_id: testCourseId,
        section_id: testSectionId2,
        section_number: 2,
        title: 'Chương 2: Biến và kiểu dữ liệu',
        order_index: 2,
      },
    ]);

    // 3.3 Tạo Lessons (4 bài trong Phần 1)
    await db.collection(COLLECTION_LESSONS).insertMany([
      // Bài 1: Video (03:45 = 225s)
      {
        course_id: testCourseId,
        section_id: testSectionId1,
        lesson_id: 'les_01',
        lesson_number: 1,
        title: 'Chào mừng đến với khóa học',
        lesson_type: 'video',
        duration_seconds: 225,
        order_index: 1,
      },
      // Bài 2: Bài đọc (1040 từ -> 05:12)
      {
        course_id: testCourseId,
        section_id: testSectionId1,
        lesson_id: 'les_02',
        lesson_number: 2,
        title: 'Tổng quan khóa học',
        lesson_type: 'article',
        word_count: 1040,
        order_index: 2,
      },
      // Bài 3: Phòng lab (10:30 = 630s)
      {
        course_id: testCourseId,
        section_id: testSectionId1,
        lesson_id: 'les_03',
        lesson_number: 3,
        title: 'Thử ngay: Đoạn code đầu tiên',
        lesson_type: 'lab',
        duration_seconds: 630,
        order_index: 3,
      },
      // Bài 4: Trắc nghiệm (8 câu hỏi)
      {
        course_id: testCourseId,
        section_id: testSectionId1,
        lesson_id: 'les_04',
        lesson_number: 4,
        title: 'Bài kiểm tra giới thiệu',
        lesson_type: 'quiz',
        total_questions: 8,
        passing_score: 80,
        order_index: 4,
      },
      // Bài 5 (ở Section 2): Nhập xuất dữ liệu
      {
        course_id: testCourseId,
        section_id: testSectionId2,
        lesson_id: 'les_05',
        lesson_number: 5,
        title: 'Nhập xuất dữ liệu',
        lesson_type: 'video',
        duration_seconds: 300,
        order_index: 5,
      },
    ]);

    // 3.4 Tạo tiến độ học của User:
    // Bài 1 đã hoàn thành (completed)
    await db.collection(COLLECTION_USER_LESSON_PROGRESS).insertOne({
      user_id: testUserId,
      course_id: testCourseId,
      lesson_id: 'les_01',
      status: 'completed',
      is_completed: true,
      time_spent_seconds: 225,
      completed_at: new Date(),
    });

    // Bài 4 kiểm tra giới thiệu đang dở dang / chưa đạt (in_progress)
    await db.collection(COLLECTION_USER_LESSON_PROGRESS).insertOne({
      user_id: testUserId,
      course_id: testCourseId,
      lesson_id: 'les_04',
      status: 'in_progress',
      is_completed: false,
      time_spent_seconds: 180,
    });

    // Tiến độ tổng quan của User
    await db.collection(COLLECTION_USER_COURSE_PROGRESS).insertOne({
      user_id: testUserId,
      course_id: testCourseId,
      progress_percentage: 20, // 1 bài hoàn thành / 5 bài
      completed_lessons_count: 1,
      total_learning_time_seconds: 31500, // 08h 45m
      last_accessed_lesson_id: 'les_05',
      updated_at: new Date(),
    });

    await db.collection(COLLECTION_ENROLLMENTS).insertOne({
      user_id: testUserId,
      course_id: testCourseId,
      enrolled_at: new Date(),
    });

    // Người dùng đã đánh giá khóa học
    await db.collection(COLLECTION_REVIEWS).insertOne({
      user_id: testUserId,
      course_id: testCourseId,
      rating: 5,
      comment: 'Khóa học rất hay và trực quan!',
      created_at: new Date(),
    });
  });

  // ─── 4. Kiểm thử hàm truy xuất getCourseStudyCurriculum ─────────────────────
  await t.test('4. Kiểm thử truy xuất đầy đủ 5 khối cho màn hình học tập ThinkUp', async () => {
    const result = await getCourseStudyCurriculum(testCourseId, testUserId);

    assert.ok(result, 'Kết quả không được rỗng');

    // Khối 1: Thông tin khóa học & Giảng viên
    assert.equal(result.course.course_name, 'Python Cơ Bản Cho Người Mới Bắt Đầu');
    assert.equal(result.course.rating.average, 4.8);
    assert.equal(result.course.rating.total_reviews, 1234);
    assert.equal(result.course.total_students, 120456);
    assert.equal(result.course.instructor.full_name, 'Trần Minh Hiếu');
    assert.equal(result.breadcrumb, undefined, 'Không được trả về breadcrumb theo yêu cầu');

    // Khối 2: Tabs điều hướng
    assert.ok(Array.isArray(result.navigation_tabs));
    assert.equal(result.navigation_tabs[0].key, 'curriculum');
    assert.equal(result.navigation_tabs[0].is_active, true);

    // Khối 3: Nội dung khóa học (Curriculum)
    assert.equal(result.curriculum.summary.total_sections, 2);
    assert.equal(result.curriculum.summary.total_lessons, 5);

    const sec1 = result.curriculum.sections[0];
    assert.equal(sec1.title, 'Phần 1: Giới thiệu');
    assert.equal(sec1.lessons.length, 4);

    // Kiểm tra 4 bài học Phần 1:
    // Bài 1: Video completed
    assert.equal(sec1.lessons[0].lesson_type, 'video');
    assert.equal(sec1.lessons[0].status, 'completed');
    assert.equal(sec1.lessons[0].duration_formatted, '03:45');

    // Bài 2: Article (1040 từ -> 05:12) not_started, KHÔNG có locked
    assert.equal(sec1.lessons[1].lesson_type, 'article');
    assert.equal(sec1.lessons[1].word_count, 1040);
    assert.equal(sec1.lessons[1].duration_formatted, '05:12');
    assert.equal(sec1.lessons[1].status, 'not_started');

    // Bài 3: Lab (10:30) not_started, KHÔNG có locked
    assert.equal(sec1.lessons[2].lesson_type, 'lab');
    assert.equal(sec1.lessons[2].duration_formatted, '10:30');
    assert.equal(sec1.lessons[2].status, 'not_started');

    // Bài 4: Quiz (8 câu hỏi) in_progress (icon chấm than)
    assert.equal(sec1.lessons[3].lesson_type, 'quiz');
    assert.equal(sec1.lessons[3].duration_formatted, '8 câu hỏi');
    assert.equal(sec1.lessons[3].question_count, 8);
    assert.equal(sec1.lessons[3].status, 'in_progress');

    // Đảm bảo không có bài học nào mang trạng thái locked
    for (const sec of result.curriculum.sections) {
      for (const les of sec.lessons) {
        assert.notEqual(les.status, 'locked', 'Trạng thái locked phải bị loại bỏ hoàn toàn');
      }
    }

    // Khối 4: Sidebar Tiến độ học tập
    assert.equal(result.learning_progress.completed_lessons, 1);
    assert.equal(result.learning_progress.total_lessons, 5);
    assert.equal(result.learning_progress.remaining_lessons, 4);
    assert.equal(result.learning_progress.progress_percentage, 20);
    assert.equal(result.learning_progress.total_time_spent_formatted, '08h 45m');

    // Khối 5: Sidebar Hành động (Actions)
    // Nút Tiếp tục học: Phải gợi ý Bài 5 (last_accessed_lesson_id)
    assert.equal(result.actions.resume_learning.lesson_id, 'les_05');
    assert.equal(result.actions.resume_learning.button_title, 'Tiếp tục học');
    assert.equal(result.actions.resume_learning.button_subtitle, 'Bài 5: Nhập xuất dữ liệu');

    // Nút Đánh giá: has_reviewed = true
    assert.equal(result.actions.course_review.has_reviewed, true);
    assert.equal(result.actions.course_review.user_rating, 5);

    // Nút Chứng chỉ: can_claim = false vì tiến độ mới 20%
    assert.equal(result.actions.certificate.can_claim, false);
  });

  // ─── 5. Kiểm thử hàm cập nhật tiến độ updateLessonProgress ─────────────────
  await t.test('5. Cập nhật tiến độ đang học mà không tự đánh dấu hoàn thành', async () => {
    await updateLessonProgress(testUserId, testCourseId, 'les_02', {
      status: 'in_progress',
      time_spent_seconds: 312,
    });

    await updateLessonProgress(testUserId, testCourseId, 'les_03', {
      status: 'in_progress',
      time_spent_seconds: 630,
    });

    const updated = await getCourseStudyCurriculum(testCourseId, testUserId);
    assert.equal(updated.learning_progress.completed_lessons, 1);
    assert.equal(updated.learning_progress.progress_percentage, 20); // Chỉ Bài 1 có tiến độ completed đã tồn tại.
    assert.equal(updated.learning_progress.remaining_lessons, 4);
  });

  await t.test('5.1 Chỉ học viên đã ghi danh và lesson thuộc course mới được cập nhật tiến độ', async () => {
    await assert.rejects(
      () => updateLessonProgress(testUserId2, testCourseId, 'les_02', { status: 'completed' }),
      error => error.status === 403 && error.code === 'COURSE_ENROLLMENT_REQUIRED',
    );

    const unrelatedCourseId = `unrelated-course-${Date.now()}`;
    const unrelatedLessonId = `unrelated-lesson-${Date.now()}`;
    try {
      await db.collection(COLLECTION_COURSES).insertOne({ course_id: unrelatedCourseId, title: 'Unrelated course' });
      await db.collection(COLLECTION_LESSONS).insertOne({
        course_id: unrelatedCourseId,
        lesson_id: unrelatedLessonId,
        lesson_type: 'video',
      });
      await assert.rejects(
        () => updateLessonProgress(testUserId, testCourseId, unrelatedLessonId, { status: 'completed' }),
        error => error.status === 404,
      );
    } finally {
      await db.collection(COLLECTION_COURSES).deleteMany({ course_id: unrelatedCourseId });
      await db.collection(COLLECTION_LESSONS).deleteMany({ lesson_id: unrelatedLessonId });
    }
  });

  await t.test('5.2 Từ chối status/time sai kiểu và không lưu quiz/lab result do client tự gửi', async () => {
    await assert.rejects(
      () => updateLessonProgress(testUserId, testCourseId, 'les_02', { status: 'approved' }),
      error => error.status === 400,
    );
    await assert.rejects(
      () => updateLessonProgress(testUserId, testCourseId, 'les_02', { time_spent_seconds: -1 }),
      error => error.status === 400,
    );
    await assert.rejects(
      () => updateLessonProgress(testUserId, testCourseId, 'les_02', { time_spent_seconds: '30' }),
      error => error.status === 400,
    );
    await assert.rejects(
      () => updateLessonProgress(testUserId, testCourseId, 'les_02', {
        status: 'completed',
        time_spent_seconds: 99999,
      }),
      error => error.status === 409 && error.code === 'LESSON_COMPLETION_UNVERIFIED',
    );

    const progressBeforeAllowedUpdate = await db.collection(COLLECTION_USER_LESSON_PROGRESS).findOne({
      user_id: testUserId,
      course_id: testCourseId,
      lesson_id: 'les_02',
    });
    assert.equal(progressBeforeAllowedUpdate.status, 'in_progress');
    assert.equal(progressBeforeAllowedUpdate.is_completed, false);
    assert.equal(progressBeforeAllowedUpdate.completed_at, undefined);

    await updateLessonProgress(testUserId, testCourseId, 'les_02', {
      status: 'in_progress',
      time_spent_seconds: 30,
      quiz_result: { score: 100, passed: true },
      lab_result: { passed: true },
    });
    const storedProgress = await db.collection(COLLECTION_USER_LESSON_PROGRESS).findOne({
      user_id: testUserId,
      course_id: testCourseId,
      lesson_id: 'les_02',
    });
    assert.equal(storedProgress.quiz_result, undefined);
    assert.equal(storedProgress.lab_result, undefined);
  });

  // ─── 6. Kiểm thử truy vấn Tab Tổng quan khóa học (Course Overview) ─────────
  await t.test('6. Kiểm thử hàm truy vấn getCourseOverview cho Tab Tổng quan', async () => {
    // 6.1 Kiểm tra định dạng thời lượng tiếng Việt
    assert.equal(formatDurationVietnamese(525), '8 giờ 45 phút');
    assert.equal(formatDurationVietnamese(60), '1 giờ');
    assert.equal(formatDurationVietnamese(45), '45 phút');

    // 6.2 Kiểm tra chuẩn hóa cấp độ
    assert.equal(formatCourseLevel('beginner'), 'Cơ bản');
    assert.equal(formatCourseLevel('intermediate'), 'Trung cấp');
    assert.equal(formatCourseLevel('advanced'), 'Nâng cao');

    // 6.3 Truy vấn thực tế cho khóa học mẫu
    const overview = await getCourseOverview(testCourseId);
    assert.ok(overview, 'Kết quả tổng quan không được null');
    assert.equal(overview.course_name, 'Python Cơ Bản Cho Người Mới Bắt Đầu');

    // Kiểm tra Khối 1: Giới thiệu khóa học & 5 thông số
    assert.equal(overview.introduction.title, 'Giới thiệu khóa học');
    assert.ok(overview.introduction.description.length > 20);
    assert.equal(overview.introduction.highlights.length, 5);

    const levelHighlight = overview.introduction.highlights.find(h => h.key === 'level');
    assert.equal(levelHighlight.value, 'Cơ bản');

    const durationHighlight = overview.introduction.highlights.find(h => h.key === 'duration');
    assert.ok(durationHighlight.value.includes('phút') || durationHighlight.value.includes('giờ'));

    const formatHighlight = overview.introduction.highlights.find(h => h.key === 'format');
    assert.equal(formatHighlight.value, 'Học online, mọi lúc mọi nơi');

    const languageHighlight = overview.introduction.highlights.find(h => h.key === 'language');
    assert.equal(languageHighlight.value, 'Tiếng Việt');

    const lessonsHighlight = overview.introduction.highlights.find(h => h.key === 'lessons_count');
    assert.equal(lessonsHighlight.value, '5 bài học');

    // Kiểm tra Khối 2: Bạn sẽ học được gì (mảng strings)
    assert.ok(Array.isArray(overview.what_you_will_learn));
    assert.ok(overview.what_you_will_learn.length >= 5);
    assert.ok(overview.what_you_will_learn.includes('Nắm vững cú pháp Python cơ bản'));

    // Kiểm tra Khối 3: Yêu cầu (mảng strings)
    assert.ok(Array.isArray(overview.requirements));
    assert.ok(overview.requirements.length >= 2);
    assert.ok(overview.requirements.some(r => r.includes('Internet')));
  });

  // ─── 7. Kiểm thử Nghiệp vụ Thảo luận khóa học (Public Discussion) ───────────
  await t.test('7. Kiểm thử Thảo luận khóa học (SPEC-LRN-DISC-01)', async () => {
    // 7.1 Kiểm tra hàm che email (maskEmail)
    assert.equal(maskEmail('thiet12345@gmail.com'), 'thie******@gmail.com');
    assert.equal(maskEmail('admin@thinkup.vn'), 'admi******@thinkup.vn');

    // 7.2 Đăng bình luận gốc có liên kết với Bài học 2
    const disc1 = await createDiscussion({
      courseId: testCourseId,
      userId: testUserId,
      content: 'Cho mình hỏi về phần cú pháp khai báo biến trong bài 2 với ạ!',
      lessonId: 'les_02',
    });
    assert.equal(disc1.success, true);
    assert.ok(disc1.discussion_id);

    // 7.3 Kiểm tra BR-DISC-03 Chống Spam: Đăng liên tiếp trong vòng 5 giây sẽ bị từ chối
    await assert.rejects(
      async () => {
        await createDiscussion({
          courseId: testCourseId,
          userId: testUserId,
          content: 'Bình luận spam liên tục',
        });
      },
      (err) => err.status === 429
    );

    // 7.4 Học viên khác (testUserId2) trả lời bình luận trên (Tạo Level 2)
    const reply1 = await createDiscussion({
      courseId: testCourseId,
      userId: testUserId2,
      content: 'Trong Python bạn chỉ cần gán tên biến = giá trị là được nhé!',
      parentId: disc1.discussion_id,
    });
    assert.equal(reply1.success, true);

    // 7.5 Kiểm tra BR-DISC-02 Tối đa 2 tầng: Nếu trả lời reply1 (Level 2), hệ thống quy về disc1
    await new Promise(resolve => setTimeout(resolve, 5100));
    const replyNested = await createDiscussion({
      courseId: testCourseId,
      userId: testUserId,
      content: 'Cảm ơn bạn nhiều nhé!',
      parentId: reply1.discussion_id,
    });
    assert.equal(replyNested.data.parent_id, disc1.discussion_id, 'Hệ thống phải tự quy về Level 1 để duy trì tối đa 2 tầng');

    // 7.6 Kiểm tra Toggle Like
    const likeRes1 = await toggleDiscussionLike({ discussionId: disc1.discussion_id, userId: testUserId2 });
    assert.equal(likeRes1.is_liked, true);
    assert.equal(likeRes1.likes_count, 1);

    const likeRes2 = await toggleDiscussionLike({ discussionId: disc1.discussion_id, userId: testUserId2 });
    assert.equal(likeRes2.is_liked, false);
    assert.equal(likeRes2.likes_count, 0);

    // 7.7 Kiểm tra Chỉnh sửa bình luận (BR-DISC-05: Tác giả được sửa)
    const editRes = await updateDiscussion({
      discussionId: disc1.discussion_id,
      userId: testUserId,
      content: 'Nội dung câu hỏi đã được cập nhật chi tiết hơn.',
    });
    assert.equal(editRes.success, true);
    assert.equal(editRes.is_edited, true);

    // Người khác không được sửa bình luận của tác giả
    await assert.rejects(
      async () => {
        await updateDiscussion({
          discussionId: disc1.discussion_id,
          userId: testUserId2,
          content: 'Hack sửa bình luận',
        });
      },
      (err) => err.status === 403
    );

    // 7.8 Lấy danh sách thảo luận (10 bài/lần, kiểm tra is_owner, lesson_info)
    const listRes = await getCourseDiscussions({
      courseId: testCourseId,
      userId: testUserId,
      page: 1,
      limit: 10,
    });
    assert.equal(listRes.discussions.length, 1);
    const rootItem = listRes.discussions[0];
    assert.equal(rootItem.is_owner, true);
    assert.equal(rootItem.is_edited, true);
    assert.ok(rootItem.lesson_info, 'Phải có thông tin bài học liên quan');
    assert.equal(rootItem.lesson_info.lesson_id, 'les_02');
    assert.equal(rootItem.replies.length, 2, 'Phải có 2 câu trả lời con bên dưới');

    // 7.9 Báo cáo vi phạm
    const repRes = await reportDiscussion({
      discussionId: disc1.discussion_id,
      reporterUserId: testUserId2,
      reason: 'Spam nội dung',
    });
    assert.equal(repRes.success, true);
  });

  // ─── 8. Kiểm thử Nghiệp vụ Hỏi đáp 1-1 Với Giảng Viên (Private 1-1 Q&A) ──────
  await t.test('8. Kiểm thử Hỏi đáp 1-1 với Giảng viên (Đặc quyền riêng tư)', async () => {
    await db.collection(COLLECTION_INSTRUCTORS).insertMany([
      {
        instructor_id: 'inst_tran_minh_hieu',
        user_id: 'inst_tran_minh_hieu',
        full_name: 'Trần Minh Hiếu',
      },
      {
        instructor_id: 'inst_other_test_profile',
        user_id: 'inst_other_test_user',
        full_name: 'Giảng viên khác',
      },
    ]);

    // 8.1 Học viên 1 đặt câu hỏi kèm lesson_id
    const q1 = await createQnaQuestion({
      courseId: testCourseId,
      userId: testUserId,
      lessonId: 'les_03',
      content: 'Thầy ơi cho em hỏi bài tập phòng lab số 3 em chạy báo lỗi syntax ạ?',
    });
    assert.equal(q1.success, true);
    assert.ok(q1.qna_id);

    await assert.rejects(
      () => replyQnaQuestion({
        qnaId: q1.qna_id,
        userId: testUserId2,
        content: 'Người học ngoài hội thoại không được phản hồi.',
      }),
      error => error.status === 403 && error.code === 'QNA_REPLY_FORBIDDEN',
    );
    await assert.rejects(
      () => replyQnaQuestion({
        qnaId: q1.qna_id,
        userId: 'inst_other_test_user',
        content: 'Giảng viên không phụ trách không được phản hồi.',
      }),
      error => error.status === 403 && error.code === 'QNA_REPLY_FORBIDDEN',
    );

    // 8.2 Giảng viên phản hồi
    const qReply = await replyQnaQuestion({
      qnaId: q1.qna_id,
      userId: 'inst_tran_minh_hieu',
      content: 'Em kiểm tra lại thụt lề (indentation) 4 dấu cách ở dòng 7 nhé!',
    });
    assert.equal(qReply.success, true);

    // 8.3 Học viên 1 xem danh sách Q&A -> Thấy câu hỏi của mình
    const listHv1 = await getCourseQnaList({
      courseId: testCourseId,
      userId: testUserId,
      role: 'student',
    });
    assert.equal(listHv1.qna_list.length, 1);
    assert.equal(listHv1.qna_list[0].lesson_info.lesson_id, 'les_03');
    assert.equal(listHv1.qna_list[0].replies.length, 1);

    // 8.4 BR-QNA-02: Học viên 2 đăng nhập -> KHÔNG THẤY câu hỏi của Học viên 1 (Cách ly 100%)
    const listHv2 = await getCourseQnaList({
      courseId: testCourseId,
      userId: testUserId2,
      role: 'student',
    });
    assert.equal(listHv2.qna_list.length, 0, 'Học viên 2 tuyệt đối không được thấy câu hỏi của Học viên 1');

    // 8.5 Chỉnh sửa nội dung câu hỏi (BR-QNA-04: Tác giả được sửa)
    const editQna = await updateQnaContent({
      qnaId: q1.qna_id,
      userId: testUserId,
      content: 'Em đã tìm ra lỗi thụt lề rồi ạ, cảm ơn thầy!',
    });
    assert.equal(editQna.success, true);
    assert.equal(editQna.is_edited, true);
  });

  // ─── 9. Kiểm thử Nghiệp vụ Tài liệu khóa học (Course Documents / Resources) ──
  await t.test('9. Kiểm thử Tài liệu khóa học phân chia 3 mục chuẩn', async () => {
    // 9.1 Kiểm tra nhận diện icon file
    assert.equal(detectDocumentIcon('pdf'), 'file-pdf');
    assert.equal(detectDocumentIcon('zip'), 'file-zip');
    assert.equal(detectDocumentIcon('ipynb'), 'file-code');
    assert.equal(detectDocumentIcon('csv'), 'file-spreadsheet');

    // 9.2 DB rỗng phải trả danh mục rỗng, không tự dựng tài liệu mẫu.
    const emptyDocs = await getCourseDocuments(testCourseId);
    assert.equal(emptyDocs.summary.total_documents, 0);
    assert.ok(emptyDocs.categories.every(category => category.items.length === 0));
    await assert.rejects(
      () => downloadCourseDocument('missing-course-document', testUserId),
      error => error.status === 404 && error.code === 'COURSE_DOCUMENT_NOT_FOUND',
    );

    await db.collection(COLLECTION_DOCUMENTS).insertMany([
      {
        document_id: 'test-course-slide-document',
        course_id: testCourseId,
        category: 'lecture_slides',
        title: 'Tài liệu fixture kiểm thử',
        file_name: 'lesson-slides.pdf',
        file_type: 'pdf',
        file_size_bytes: 1024,
        file_url: '/stored-files/lesson-slides.pdf',
        download_count: 0,
        updated_at: new Date(),
      },
      {
        document_id: 'test-course-source-document',
        course_id: testCourseId,
        category: 'source_code',
        title: 'Mã nguồn fixture kiểm thử',
        file_name: 'lesson-source.zip',
        file_type: 'zip',
        file_size_bytes: 2048,
        file_url: '/stored-files/lesson-source.zip',
        download_count: 0,
        updated_at: new Date(),
      },
      {
        document_id: 'test-course-data-document',
        course_id: testCourseId,
        category: 'exercises_data',
        title: 'Dữ liệu fixture kiểm thử',
        file_name: 'lesson-data.csv',
        file_type: 'csv',
        file_size_bytes: 512,
        file_url: '/stored-files/lesson-data.csv',
        download_count: 0,
        updated_at: new Date(),
      },
    ]);
    await db.collection(COLLECTION_DOCUMENTS).insertOne({
      document_id: 'test-course-document-without-storage-url',
      course_id: testCourseId,
      category: 'source_code',
      title: 'Tài liệu chưa có đường dẫn lưu trữ',
      file_name: 'missing-storage-url.zip',
      download_count: 0,
    });

    await assert.rejects(
      () => downloadCourseDocument('test-course-document-without-storage-url', testUserId),
      error => error.status === 409 && error.code === 'COURSE_DOCUMENT_FILE_UNAVAILABLE',
    );

    const docs = await getCourseDocuments(testCourseId);
    assert.ok(docs.summary);
    assert.equal(docs.categories.length, 3, 'Phải chia đúng 3 mục');

    const catSlide = docs.categories.find(c => c.key === 'lecture_slides');
    const catCode = docs.categories.find(c => c.key === 'source_code');
    const catData = docs.categories.find(c => c.key === 'exercises_data');

    assert.ok(catSlide && catSlide.items.length > 0, 'Phải có tài liệu bài giảng');
    assert.ok(catCode && catCode.items.length > 0, 'Phải có mã nguồn bài tập');
    assert.ok(catData && catData.items.length > 0, 'Phải có dữ liệu thực hành');

    // Kiểm tra các trường hiển thị của 1 file tài liệu
    const sampleDoc = catSlide.items[0];
    assert.ok(sampleDoc.document_id);
    assert.ok(sampleDoc.title);
    assert.ok(sampleDoc.file_name);
    assert.ok(sampleDoc.icon_type);
    assert.ok(sampleDoc.file_size_formatted);
    assert.ok(sampleDoc.download_url);

    // 9.3 Tải tài liệu và kiểm tra tăng download_count
    const downloadRes = await downloadCourseDocument(sampleDoc.document_id, testUserId);
    assert.equal(downloadRes.success, true);
    assert.equal(downloadRes.download_count, 1);
    assert.equal(await db.collection(COLLECTION_DOCUMENTS).countDocuments({
      document_id: sampleDoc.document_id,
      download_count: 1,
    }), 1);
  });
});



test('Learning integration: documents redact storage URLs and deny unauthorized downloads without counting', async () => {
  let enrolled = false, increments = 0;
  const doc = { _id: 'document-db', document_id: 'document', course_id: 'course', file_url: '/private.pdf', file_name: 'private.pdf' };
  const db = { collection(name) { return {
    async findOne(q) {
      if (name === 'courses') return { course_id: 'course', _id: 'course-db' };
      if (name === 'users') return null;
      if (name === 'user_enrollments') return enrolled ? { user_id: 'learner' } : null;
      if (name === 'user_courses') return null;
      if (name === 'learning_preferences') return null;
      if (name === 'course_documents') return q.$or.some(v => v.document_id === 'document') ? doc : null;
      throw new Error('Unexpected collection ' + name);
    },
    find() { assert.equal(name, 'course_documents'); return { sort() { return this; }, async toArray() { return [doc]; } }; },
    async updateOne(q, update) { assert.equal(name, 'course_documents');assert.equal(update.$inc.download_count, 1);increments++; },
  }; } };
  const guest = await getCourseDocuments('course', null, { db });
  assert.equal(guest.categories[0].items[0].file_url, '');assert.equal(guest.categories[0].items[0].can_download, false);
  await assert.rejects(downloadCourseDocument('document', null, { db }), { status: 401 });
  await assert.rejects(downloadCourseDocument('document', 'learner', { db }), { status: 403 });assert.equal(increments, 0);
  enrolled = true;
  assert.equal((await getCourseDocuments('course', 'learner', { db })).categories[0].items[0].file_url, '/private.pdf');
  const downloaded = await downloadCourseDocument('document', 'learner', { db });
  assert.equal(downloaded.download_url, '/private.pdf');assert.equal(downloaded.download.quality, 'original');assert.equal(increments, 1);
  doc.file_url = '';
  await assert.rejects(downloadCourseDocument('document', 'learner', { db }), { status: 409 });assert.equal(increments, 1);
});

test('Learning integration: curriculum carries saved playback options without changing progress', async () => {
  const db = { collection(name) { return {
    async findOne() {
      if (name === 'courses') return { course_id: 'course', _id: 'course-db' };
      if (name === 'learning_preferences') return { playbackSpeed: '1.75', autoNext: false };
      if (['user_course_progress', 'course_reviews'].includes(name)) return null;
      throw new Error('Unexpected collection ' + name);
    },
    find() { return { sort() { return this; }, async toArray() { return []; } }; },
  }; } };
  const result = await getCourseStudyCurriculum('course', 'learner', { db });
  assert.equal(result.learning_preferences.playbackSpeed, '1.75');assert.equal(result.learning_preferences.autoNext, false);
  assert.equal(result.learning_progress.completed_lessons, 0);assert.equal(result.learning_progress.progress_percentage, 0);
});
