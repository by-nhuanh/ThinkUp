import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import {
  COLLECTION_USERS,
  COLLECTION_USER_ACTIVITY_LOGS,
  COLLECTION_COURSES,
  COLLECTION_LESSONS,
  COLLECTION_USER_COURSE_PROGRESS,
  COLLECTION_CERTIFICATES,
  formatVietnamDate,
  formatActivityRelativeTime,
  logUserActivity,
  cleanUpOldActivityLogs,
  getProfileOverviewData,
} from '../profile.user.js';
import { getMongoDb, closeMongoDb } from '../../db.js';

test('Hồ sơ học viên (Profile Overview) Test Suite - BR-PRF & Acceptance Tests', async (t) => {
  const db = await getMongoDb();
  const testUserId = new ObjectId();
  const testUserEmail = `test_student_${Date.now()}@thinkup.vn`;
  const courseFixtureIds = [];
  const lessonFixtureIds = [];

  // Thiết lập dọn dẹp trước & sau khi chạy test
  const cleanUpAll = async () => {
    await db.collection(COLLECTION_USERS).deleteMany({ _id: testUserId });
    await db.collection(COLLECTION_USER_ACTIVITY_LOGS).deleteMany({ user_id: testUserId });
    await db.collection(COLLECTION_USER_COURSE_PROGRESS).deleteMany({ user_id: testUserId });
    await db.collection(COLLECTION_CERTIFICATES).deleteMany({ user_id: testUserId });
    if (lessonFixtureIds.length > 0) {
      await db.collection(COLLECTION_LESSONS).deleteMany({ _id: { $in: lessonFixtureIds } });
    }
    if (courseFixtureIds.length > 0) {
      await db.collection(COLLECTION_COURSES).deleteMany({ _id: { $in: courseFixtureIds } });
    }
  };

  await cleanUpAll();

  t.after(async () => {
    await cleanUpAll();
    await closeMongoDb();
  });

  // Tạo mock user trong CSDL
  await db.collection(COLLECTION_USERS).insertOne({
    _id: testUserId,
    email: testUserEmail,
    full_name: 'Nguyễn Văn Test',
    avatar_url: 'https://thinkup.vn/avatar.png',
    headline: 'Fullstack Student',
    location: 'TP. Hồ Chí Minh',
    phone: '0987654321', // Dữ liệu nhạy cảm
    address: '123 Đường Test, Quận 1', // Dữ liệu nhạy cảm
    created_at: new Date('2026-03-15T08:00:00Z'),
  });

  await t.test('1. Kiểm tra Tiện ích Format Ngày & Thời gian tương đối Timeline', () => {
    const d = new Date('2026-03-15T08:00:00.000Z');
    assert.equal(formatVietnamDate(d), '15/03/2026');

    // Cùng ngày (Hôm nay)
    const now = new Date('2026-10-29T10:30:00.000Z');
    const actToday = new Date('2026-10-29T03:30:00.000Z'); // 10:30 VN
    const strToday = formatActivityRelativeTime(actToday, now);
    assert.ok(strToday.startsWith('Hôm nay'), `Kỳ vọng bắt đầu bằng "Hôm nay", thực tế: ${strToday}`);

    // Hôm qua
    const actYesterday = new Date('2026-10-28T03:30:00.000Z');
    const strYesterday = formatActivityRelativeTime(actYesterday, now);
    assert.ok(strYesterday.startsWith('Hôm qua'), `Kỳ vọng bắt đầu bằng "Hôm qua", thực tế: ${strYesterday}`);

    // 3 ngày trước
    const act3DaysAgo = new Date('2026-10-26T03:30:00.000Z');
    const str3Days = formatActivityRelativeTime(act3DaysAgo, now);
    assert.ok(str3Days.includes('ngày trước'), `Kỳ vọng có "ngày trước", thực tế: ${str3Days}`);
  });

  await t.test('2. TC-PRF-01 & BR-PRF-07: Bảo mật dữ liệu Banner (Không trả về Phone hay Address)', async () => {
    const overview = await getProfileOverviewData(testUserId);
    assert.ok(overview.profile, 'Profile banner phải tồn tại');
    assert.equal(overview.profile.name, 'Nguyễn Văn Test');
    assert.equal(overview.profile.email, testUserEmail);
    assert.equal(overview.profile.joinedAt, '15/03/2026');

    // Kiểm tra không rò rỉ phone hoặc address (BR-PRF-07)
    assert.equal(overview.profile.phone, undefined, 'Tuyệt đối KHÔNG trả về phone');
    assert.equal(overview.profile.address, undefined, 'Tuyệt đối KHÔNG trả về address');
  });

  await t.test('3. TC-PRF-02, TC-PRF-03, BR-PRF-01 & BR-PRF-02: Giới hạn 5 hoạt động & Cơ chế đẩy lùi (Push-down & Hide)', async () => {
    // Tạo 6 hoạt động theo thứ tự thời gian
    for (let i = 1; i <= 6; i++) {
      await logUserActivity(testUserId, {
        text: `Hoạt động số ${i}`,
        tone: 'blue',
        action_type: 'LESSON_PROGRESS',
      });
      // Delay nhỏ để created_at cách nhau
      await new Promise((r) => setTimeout(r, 20));
    }

    const overview = await getProfileOverviewData(testUserId);
    // TC-PRF-02: Cột trái chỉ hiện đúng 5 hoạt động mới nhất
    assert.equal(overview.recentActivities.length, 5, 'Chỉ lấy đúng tối đa 5 hoạt động');

    // TC-PRF-03: Hoạt động mới nhất (số 6) ở đầu mảng, hoạt động cũ nhất (số 1) bị đẩy ra khỏi giao diện
    assert.equal(overview.recentActivities[0].text, 'Hoạt động số 6', 'Hoạt động mới nhất chèn lên Top 1');
    const texts = overview.recentActivities.map((a) => a.text);
    assert.ok(!texts.includes('Hoạt động số 1'), 'Hoạt động cũ nhất (số 1) đã bị ẩn (Push-down & Hide)');
  });

  await t.test('4. TC-PRF-05, TC-PRF-07, BR-PRF-01, BR-PRF-02, BR-PRF-03: Chứng chỉ đạt được (Limit 3, Biến đếm tổng, Push-down & Keep)', async () => {
    // Tạo 5 chứng chỉ cho user
    for (let i = 1; i <= 5; i++) {
      await db.collection(COLLECTION_CERTIFICATES).insertOne({
        user_id: testUserId,
        course_title: `Chứng chỉ khóa học ${i}`,
        code: `CERT-TEST-${i}`,
        status: 'active',
        issued_at: new Date(Date.now() + i * 1000), // i tăng dần => chứng chỉ 5 mới nhất
        created_at: new Date(),
      });
    }

    const overview = await getProfileOverviewData(testUserId);

    // BR-PRF-03 & TC-PRF-05: Biến đếm tổng là tổng số lượng thực tế từ Database (5)
    assert.equal(overview.totalCertificates, 5, 'Biến đếm tổng phải phản ánh 5 chứng chỉ từ Database');

    // BR-PRF-01: Limit cứng đúng 3 chứng chỉ mới nhất trên UI
    assert.equal(overview.certificates.length, 3, 'Chỉ trả về 3 chứng chỉ mới nhất');

    // BR-PRF-02 & TC-PRF-07: Chứng chỉ mới nhất (số 5) nằm ở đầu, chứng chỉ cũ nhất nằm ngoài top 3 vẫn được giữ trong DB
    assert.equal(overview.certificates[0].title, 'Chứng chỉ khóa học 5');
    assert.equal(overview.certificates[1].title, 'Chứng chỉ khóa học 4');
    assert.equal(overview.certificates[2].title, 'Chứng chỉ khóa học 3');
  });

  await t.test('5. TC-PRF-04 & BR-PRF-05: Tính % làm tròn và dòng bài học kế tiếp có ID nhỏ nhất', async () => {
    const testCourseId = new ObjectId();
    courseFixtureIds.push(testCourseId);
    await db.collection(COLLECTION_COURSES).insertOne({
      _id: testCourseId,
      title: 'Lập trình React Chuyên sâu',
      category: 'Lập trình',
      instructor_name: 'Nguyễn Văn Thầy',
      thumbnail: 'https://thinkup.vn/react.png',
    });

    // Tạo 3 bài học với order tăng dần
    const lesson1Id = new ObjectId();
    const lesson2Id = new ObjectId();
    const lesson3Id = new ObjectId();
    lessonFixtureIds.push(lesson1Id, lesson2Id, lesson3Id);

    await db.collection(COLLECTION_LESSONS).insertMany([
      { _id: lesson1Id, course_id: testCourseId, title: 'Bài 1: Giới thiệu', order: 1 },
      { _id: lesson2Id, course_id: testCourseId, title: 'Bài 2: JSX và Props', order: 2 },
      { _id: lesson3Id, course_id: testCourseId, title: 'Bài 3: State và Lifecycle', order: 3 },
    ]);

    // Giả lập user đã học bài 1 (tiến độ 75.4% -> làm tròn thành 75%)
    await db.collection(COLLECTION_USER_COURSE_PROGRESS).insertOne({
      user_id: testUserId,
      course_id: testCourseId,
      progress_percentage: 75.4,
      completed_lesson_ids: [lesson1Id],
      is_completed: false,
      updated_at: new Date(),
    });

    const overview = await getProfileOverviewData(testUserId);
    const reactCourse = overview.currentCourses.find((c) => c.id === testCourseId.toString());

    assert.ok(reactCourse, 'Khóa học đang học phải có trong mảng currentCourses');
    // Làm tròn đến số nguyên gần nhất (75.4 -> 75)
    assert.equal(reactCourse.progress, 75, 'Tiến độ 75.4% phải làm tròn thành 75%');
    // Bài học kế tiếp chưa hoàn thành có ID/order nhỏ nhất (Bài 2)
    assert.equal(reactCourse.nextLesson, 'Tiếp theo: Bài 2: JSX và Props');
    assert.equal(reactCourse.href, `/main/learning/${testCourseId}/${lesson2Id}`);
  });

  await t.test('5.1 Ghép course_id dạng chuỗi và lesson có course_id dạng ObjectId', async () => {
    const mongoCourseId = new ObjectId();
    const publicCourseId = `profile-course-${Date.now()}`;
    const completedLessonId = new ObjectId();
    const nextLessonId = new ObjectId();
    courseFixtureIds.push(mongoCourseId);
    lessonFixtureIds.push(completedLessonId, nextLessonId);

    await db.collection(COLLECTION_COURSES).insertOne({
      _id: mongoCourseId,
      course_id: publicCourseId,
      title: 'Khóa học ID hỗn hợp',
    });
    await db.collection(COLLECTION_LESSONS).insertMany([
      { _id: completedLessonId, course_id: mongoCourseId, title: 'Bài đã học', order: 1 },
      { _id: nextLessonId, course_id: mongoCourseId.toString(), title: 'Bài kế tiếp', order: 2 },
    ]);
    await db.collection(COLLECTION_USER_COURSE_PROGRESS).insertOne({
      user_id: testUserId,
      course_id: publicCourseId,
      progress_percentage: 40,
      completed_lesson_ids: [completedLessonId],
      updated_at: new Date(),
    });

    const overview = await getProfileOverviewData(testUserId);
    const course = overview.currentCourses.find(item => item.id === publicCourseId);
    assert.ok(course, 'Progress dùng course_id dạng chuỗi phải được ghép với course');
    assert.equal(course.nextLesson, 'Tiếp theo: Bài kế tiếp');
    assert.equal(course.href, `/main/learning/${publicCourseId}/${nextLessonId}`);
  });

  await t.test('6. BR-PRF-06: Cron Job Garbage Collection dọn dẹp log > 30 ngày', async () => {
    // Tạo 1 log cũ 40 ngày trước và 1 log mới
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db.collection(COLLECTION_USER_ACTIVITY_LOGS).insertOne({
      user_id: testUserId,
      text: 'Hoạt động cũ hơn 30 ngày',
      tone: 'blue',
      created_at: oldDate,
    });

    const result = await cleanUpOldActivityLogs(30);
    assert.ok(result.deletedCount >= 1, 'Phải xóa ít nhất 1 bản ghi cũ hơn 30 ngày');

    // Kiểm tra log cũ không còn trong collection
    const checkOld = await db.collection(COLLECTION_USER_ACTIVITY_LOGS).findOne({
      user_id: testUserId,
      text: 'Hoạt động cũ hơn 30 ngày',
    });
    assert.equal(checkOld, null, 'Bản ghi cũ đã bị Hard Delete thành công');
  });
});

test('Learning integration: profile dates and activity calendar use selected timezone', () => {
  const instant = '2026-10-30T18:00:00Z';
  assert.equal(formatVietnamDate(instant, 'Asia/Tokyo'), '31/10/2026');
  assert.equal(formatVietnamDate(instant, 'Etc/UTC'), '30/10/2026');
  assert.equal(formatActivityRelativeTime(instant, new Date('2026-10-31T02:00:00Z'), 'Asia/Tokyo'), 'Hôm nay, 03:00');
  assert.equal(formatActivityRelativeTime(instant, new Date('2026-10-31T02:00:00Z'), 'Etc/UTC'), 'Hôm qua, 18:00');
});

test('Learning integration: profile overview loads timezone for joined date and certificates', async () => {
  const db = { collection(name) { return {
    async findOne() {
      if (name === 'users') return { _id: 'learner', created_at: '2026-10-30T18:00:00Z' };
      if (name === 'learning_preferences') return { timezone: 'Asia/Tokyo' };
      throw new Error(name);
    },
    async countDocuments() { return name === 'certificates' ? 1 : 0; },
    find() { return { sort() { return this; }, limit() { return this; }, async toArray() {
      return name === 'certificates' ? [{ _id: 'certificate', issued_at: '2026-10-30T18:00:00Z' }] : [];
    } }; },
  }; } };
  const result = await getProfileOverviewData('learner', { db });
  assert.equal(result.timezone, 'Asia/Tokyo');assert.equal(result.profile.joinedAt, '31/10/2026');
  assert.equal(result.certificates[0].issuedAt, '31/10/2026');assert.equal(result.totalCertificates, 1);
});
