import { getLearningPreferences, DEFAULT_LEARNING_PREFERENCES } from '../learning-settings/learning-settings.user.js';
import { hasCourseEnrollment } from '../course/course.user.js';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../db.js';
import { createLearningActivityStartHandler, getRecordedCourseLearningTimes } from '../learning-activity/learning-activity.user.js';
import { createNotificationForEvent } from '../notification/notification.user.js';

// ─── 0. Danh mục Collection CSDL MongoDB ─────────────────────────────────────
export const COLLECTION_COURSES = 'courses';
export const COLLECTION_INSTRUCTORS = 'instructor_profiles';
export const COLLECTION_USERS = 'users';
export const COLLECTION_SECTIONS = 'course_sections';
export const COLLECTION_LESSONS = 'lessons';
export const COLLECTION_LESSON_VIDEOS = 'lesson_videos';
export const COLLECTION_USER_LESSON_PROGRESS = 'user_lesson_progress';
export const COLLECTION_USER_COURSE_PROGRESS = 'user_course_progress';
export const COLLECTION_REVIEWS = 'course_reviews';
export const COLLECTION_ENROLLMENTS = 'user_enrollments';
export const COLLECTION_USER_COURSES = 'user_courses';
export const COLLECTION_DISCUSSIONS = 'course_discussions';
export const COLLECTION_DISCUSSION_LIKES = 'course_discussion_likes';
export const COLLECTION_DISCUSSION_REPORTS = 'course_discussion_reports';
export const COLLECTION_QNA = 'course_qna';
export const COLLECTION_DOCUMENTS = 'course_documents';
export const COLLECTION_LESSON_ARTICLES = 'lesson_articles';
export const COLLECTION_LESSON_QUIZZES = 'lesson_quizzes';
export const COLLECTION_QUIZ_QUESTIONS = 'quiz_questions';
export const COLLECTION_QUIZ_ANSWER_OPTIONS = 'quiz_answer_options';
export const COLLECTION_LESSON_LABS = 'lesson_labs';
export const COLLECTION_QUIZ_ATTEMPTS = 'user_quiz_attempts';
export const COLLECTION_LAB_ATTEMPTS = 'user_lab_attempts';

// ─── 1. Tiện ích định dạng & tính toán thời gian, số từ ──────────────────────

/**
 * Tính thời lượng đọc ước tính dựa trên số lượng từ (Reading speed chuẩn: ~200 từ / phút)
 * @param {number|string} wordCount - Số lượng từ trong bài đọc
 * @param {number} [readingSpeedWpm=200] - Tốc độ đọc từ trên phút
 * @returns {number} Thời gian đọc tính bằng giây
 */
export function calculateArticleDuration(wordCount, readingSpeedWpm = 200) {
  const count = Math.max(0, parseInt(wordCount, 10) || 0);
  if (count === 0) return 60; // Tối thiểu 1 phút (60 giây) nếu không có số từ
  const speed = Math.max(50, parseInt(readingSpeedWpm, 10) || 200);
  return Math.max(60, Math.round((count / speed) * 60));
}

/**
 * Định dạng số giây sang định dạng mm:ss (vd: 225s -> "03:45", 312s -> "05:12")
 * @param {number|string} seconds
 * @returns {string}
 */
export function formatDurationMmSs(seconds) {
  const sec = Math.max(0, parseInt(seconds, 10) || 0);
  const minutes = Math.floor(sec / 60);
  const remainingSeconds = sec % 60;
  const padMin = String(minutes).padStart(2, '0');
  const padSec = String(remainingSeconds).padStart(2, '0');
  return `${padMin}:${padSec}`;
}

/**
 * Định dạng tổng thời gian sang chuỗi hiển thị giờ phút (vd: 20700s -> "5h 45m", 31500s -> "08h 45m")
 * @param {number|string} seconds
 * @returns {string}
 */
export function formatHoursMinutes(seconds) {
  const sec = Math.max(0, parseInt(seconds, 10) || 0);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const padHours = String(hours).padStart(2, '0');
  const padMinutes = String(minutes).padStart(2, '0');
  return `${padHours}h ${padMinutes}m`;
}

/**
 * Kiểm tra điều kiện cấp chứng chỉ:
 * Quy tắc: Người dùng hoàn thành toàn bộ Quiz theo điểm chuẩn VÀ tiến độ từ 80% trở lên.
 * @param {{ progressPercentage: number, quizzesTotal: number, quizzesPassed: number }} param0
 * @returns {{ canClaim: boolean, reason: string }}
 */
export function checkCertificateEligibility({ progressPercentage = 0, quizzesTotal = 0, quizzesPassed = 0 }) {
  const progress = Math.max(0, Math.min(100, parseInt(progressPercentage, 10) || 0));
  const isProgressEligible = progress >= 80;
  const isQuizEligible = quizzesTotal === 0 || quizzesPassed >= quizzesTotal;

  if (!isProgressEligible && !isQuizEligible) {
    return {
      canClaim: false,
      reason: `Tiến độ học hiện tại (${progress}%) chưa đạt 80% và chưa hoàn thành toàn bộ bài kiểm tra (${quizzesPassed}/${quizzesTotal}).`,
    };
  }

  if (!isProgressEligible) {
    return {
      canClaim: false,
      reason: `Tiến độ học hiện tại (${progress}%) chưa đạt tối thiểu 80%.`,
    };
  }

  if (!isQuizEligible) {
    return {
      canClaim: false,
      reason: `Bạn cần vượt qua toàn bộ bài kiểm tra theo điểm chuẩn (${quizzesPassed}/${quizzesTotal} bài đạt).`,
    };
  }

  return {
    canClaim: true,
    reason: 'Đủ điều kiện cấp chứng chỉ hoàn thành khóa học.',
  };
}

/**
 * Ẩn email người dùng dạng thiet******@gmail.com theo chuẩn BA Thảo luận
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'user******';
  const parts = email.split('@');
  if (parts.length !== 2) return 'user******';
  const [username, domain] = parts;
  if (username.length <= 4) {
    return `${username}******@${domain}`;
  }
  const prefix = username.slice(0, 4);
  return `${prefix}******@${domain}`;
}

/**
 * Định dạng thời gian tương đối (vd: "Vừa xong", "10 phút trước", "Hôm qua 16:10", "15/10/2026")
 * @param {Date|string} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay === 1) {
    const padH = String(past.getHours()).padStart(2, '0');
    const padM = String(past.getMinutes()).padStart(2, '0');
    return `Hôm qua ${padH}:${padM}`;
  }
  if (diffDay < 7) return `${diffDay} ngày trước`;
  const padD = String(past.getDate()).padStart(2, '0');
  const padMo = String(past.getMonth() + 1).padStart(2, '0');
  const y = past.getFullYear();
  return `${padD}/${padMo}/${y}`;
}

/**
 * Xác định icon file tài liệu dựa trên định dạng file
 * @param {string} fileType
 * @param {string} [fileName='']
 * @returns {string} Icon gợi ý cho FE: 'file-pdf' | 'file-code' | 'file-zip' | 'file-spreadsheet' | 'file-text'
 */
export function detectDocumentIcon(fileType, fileName = '') {
  const ext = (fileType || fileName.split('.').pop() || '').toLowerCase().trim();
  if (['pdf'].includes(ext)) return 'file-pdf';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'file-zip';
  if (['py', 'js', 'ts', 'java', 'cpp', 'html', 'css', 'ipynb', 'sql'].includes(ext)) return 'file-code';
  if (['csv', 'xlsx', 'xls', 'json'].includes(ext)) return 'file-spreadsheet';
  return 'file-text';
}

/**
 * Định dạng kích thước file sang chuỗi hiển thị trực quan (vd: 4823449 -> "4.6 MB")
 * @param {number|string} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const b = Math.max(0, parseInt(bytes, 10) || 0);
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ─── 2. Hàm Truy Xuất Dữ Liệu Toàn Diện Màn Hình Bài Học (Curriculum & Study) ──

/**
 * Truy xuất đầy đủ 5 khối thông tin cho màn hình học tập của khóa học:
 * 1. Khối thông tin khóa học & Giảng viên (Rating, Reviews, Students là của khóa học)
 * 2. Khối Tabs điều hướng
 * 3. Khối Nội dung khóa học (Sections & Lessons - không có trạng thái locked, bài đọc theo số từ)
 * 4. Khối Sidebar: Tiến độ học tập
 * 5. Khối Sidebar: Hành động (Tiếp tục học, Đánh giá, Xem chứng chỉ)
 *
 * @param {string} courseIdOrSlug
 * @param {string|null} userId
 * @returns {Promise<Object>}
 */
export async function getCourseStudyCurriculum(courseIdOrSlug, userId = null, options = {}) {
  if (!courseIdOrSlug) {
    const error = new Error('Mã định danh hoặc đường dẫn khóa học (courseIdOrSlug) là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const db = options.db || await getMongoDb();
  const cleanParam = String(courseIdOrSlug).trim();

  // 1. Tìm thông tin khóa học
  const courseFilter = [
    { course_id: cleanParam },
    { slug: cleanParam },
  ];
  if (ObjectId.isValid(cleanParam)) {
    courseFilter.push({ _id: new ObjectId(cleanParam) });
  }

  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({ $or: courseFilter });
  if (!courseDoc) {
    const error = new Error('Khóa học không tồn tại trong hệ thống.');
    error.status = 404;
    throw error;
  }

  const targetCourseId = String(courseDoc.course_id || courseDoc._id);

  const studyCourseIds = [courseDoc._id, courseDoc.course_id, targetCourseId, String(courseDoc._id)]
    .filter(value => value != null);

  // 2. Truy vấn song song: Giảng viên, Sections, Lessons, Tiến độ người học, Đánh giá cá nhân
  const [
    instructorDoc,
    userDoc,
    sectionsDocs,
    lessonsDocs,
    userLessonProgressDocs,
    userCourseProgressDoc,
    userReviewDoc,
  ] = await Promise.all([
    // Giảng viên từ instructor_profiles
    courseDoc.instructor_id
      ? db.collection(COLLECTION_INSTRUCTORS).findOne({
          $or: [
            { instructor_id: String(courseDoc.instructor_id) },
            { user_id: String(courseDoc.instructor_id) },
          ],
        })
      : null,
    // Hoặc từ users
    courseDoc.instructor_id
      ? db.collection(COLLECTION_USERS).findOne({
          $or: [
            { id: String(courseDoc.instructor_id) },
            { instructor_id: String(courseDoc.instructor_id) },
            ...(ObjectId.isValid(String(courseDoc.instructor_id))
              ? [{ _id: new ObjectId(String(courseDoc.instructor_id)) }]
              : []),
          ],
        })
      : null,
    // Danh sách chương
    db.collection(COLLECTION_SECTIONS)
      .find({ course_id: { $in: studyCourseIds } })
      .sort({ order_index: 1, order: 1 })
      .toArray(),
    // Danh sách toàn bộ bài học
    db.collection(COLLECTION_LESSONS)
      .find({ course_id: { $in: studyCourseIds } })
      .sort({ section_id: 1, order_index: 1, order: 1, lesson_number: 1 })
      .toArray(),
    // Tiến độ chi tiết từng bài học của user
    userId
      ? db.collection(COLLECTION_USER_LESSON_PROGRESS)
          .find({
            user_id: String(userId),
          })
          .toArray()
      : [],
    // Tiến độ tổng quan của user đối với khóa học
    userId
      ? db.collection(COLLECTION_USER_COURSE_PROGRESS).findOne({
          user_id: String(userId),
          course_id: { $in: studyCourseIds },
        })
      : null,
    // Đánh giá khóa học của user hiện tại
    userId
      ? db.collection(COLLECTION_REVIEWS).findOne({
          user_id: String(userId),
          course_id: targetCourseId,
        })
      : null,
  ]);

  // Some stored lessons reference only their section, not the course directly.
  const sectionReferences = sectionsDocs.flatMap(section => [section._id, section.section_id])
    .filter(value => value != null);
  if (sectionReferences.length) {
    const sectionLessons = await db.collection(COLLECTION_LESSONS).find({
      course_id: null, section_id: { $in: [...sectionReferences, ...sectionReferences.map(String)] },
    }).toArray();
    const loaded = new Set(lessonsDocs.map(lesson => String(lesson._id || lesson.lesson_id)));
    lessonsDocs.push(...sectionLessons.filter(lesson => !loaded.has(String(lesson._id || lesson.lesson_id))));
  }

  // Pre-load quiz question counts for all quiz lessons
  const allLessonIds = lessonsDocs.map(l => String(l.lesson_id || l._id));
  const quizzesList = await db.collection(COLLECTION_LESSON_QUIZZES).find({
    lesson_id: { $in: allLessonIds }
  }).toArray();
  const quizQuestionsMap = new Map();
  if (quizzesList.length > 0) {
    const quizMap = new Map();
    quizzesList.forEach(q => quizMap.set(String(q.lesson_quiz_id), String(q.lesson_id)));
    const lqIds = quizzesList.map(q => String(q.lesson_quiz_id));
    const allQuestions = await db.collection(COLLECTION_QUIZ_QUESTIONS).find({
      lesson_quiz_id: { $in: lqIds }
    }).toArray();
    allQuestions.forEach(q => {
      const lesId = quizMap.get(String(q.lesson_quiz_id));
      if (lesId) {
        quizQuestionsMap.set(lesId, (quizQuestionsMap.get(lesId) || 0) + 1);
      }
    });
  }

  // 3. Xử lý thông tin Giảng viên
  const instructorProfile = instructorDoc || userDoc || {};
  const instructorInfo = {
    instructor_id: String(courseDoc.instructor_id || instructorProfile.instructor_id || instructorProfile.id || ''),
    full_name: instructorProfile.full_name || instructorProfile.name || courseDoc.instructor_name || 'ThinkUp Mentor',
    title: instructorProfile.title || instructorProfile.headline || instructorProfile.specialization || 'Senior Developer',
    avatar_url: instructorProfile.avatar_url || courseDoc.instructor_avatar || '',
  };

  // 4. Map tra cứu tiến độ bài học của học viên
  const progressMap = new Map();
  for (const prog of userLessonProgressDocs) {
    const lesId = String(prog.lesson_id);
    progressMap.set(lesId, prog);
  }

  // 5. Gom nhóm bài học theo Section và tính toán các chỉ số
  const lessonsBySectionMap = new Map();
  let totalCourseSeconds = 0;
  let totalLessonsCount = 0;
  let completedLessonsCount = 0;
  let totalQuizzesCount = 0;
  let passedQuizzesCount = 0;
  let totalUserSpentSeconds = userCourseProgressDoc?.total_learning_time_seconds || 0;

  // Thu thập danh sách bài học phẳng (flat) để xác định bài học tiếp theo (Resume)
  const flattenedLessons = [];

  for (const les of lessonsDocs) {
    totalLessonsCount += 1;
    const lessonIdStr = String(les.lesson_id || les._id);
    const secIdStr = String(les.section_id || 'default_section');

    const rawType = String(les.lesson_type || 'video').toLowerCase();
    let normalizedType = 'video';
    if (['article', 'reading', 'doc', 'text'].includes(rawType)) {
      normalizedType = 'article';
    } else if (['lab', 'coding', 'practice'].includes(rawType)) {
      normalizedType = 'lab';
    } else if (['quiz', 'test', 'exam', 'assessment'].includes(rawType)) {
      normalizedType = 'quiz';
    }

    // Tính toán thời lượng theo loại bài học
    let durationSeconds = 0;
    let durationFormatted = '00:00';
    let questionCount = 0;
    const wordCount = Math.max(0, parseInt(les.word_count, 10) || 0);

    const rawMins = parseInt(les.duration_minutes || les.duration, 10) || 0;
    const rawSecs = parseInt(les.duration_seconds, 10) || (rawMins * 60);

    if (normalizedType === 'article') {
      durationSeconds = les.duration_seconds
        ? parseInt(les.duration_seconds, 10)
        : (rawMins ? rawMins * 60 : calculateArticleDuration(wordCount, les.reading_speed_wpm || 200));
      durationFormatted = formatDurationMmSs(durationSeconds);
    } else if (normalizedType === 'quiz') {
      totalQuizzesCount += 1;
      questionCount = parseInt(les.question_count || les.total_questions || les.questions_count || les.questions?.length, 10) || 0;
      if (!questionCount && quizQuestionsMap.has(lessonIdStr)) {
        questionCount = quizQuestionsMap.get(lessonIdStr);
      }
      durationSeconds = rawSecs || 15 * 60;
      durationFormatted = `${questionCount} câu hỏi`;
    } else {
      // video hoặc lab
      durationSeconds = rawSecs;
      durationFormatted = formatDurationMmSs(durationSeconds);
    }

    totalCourseSeconds += durationSeconds;

    // Xác định trạng thái học bài (Loại bỏ locked, chỉ có: completed, in_progress, not_started)
    const prog = progressMap.get(lessonIdStr);
    let status = 'not_started';

    if (prog) {
      if (prog.status === 'completed' || (prog.is_completed === true || String(prog.is_completed) === '1')) {
        status = 'completed';
        completedLessonsCount += 1;
        if (normalizedType === 'quiz') {
          passedQuizzesCount += 1;
        }
      } else if (prog.status === 'in_progress' || prog.status === 'warning' || prog.status === 'failed') {
        // Bài kiểm tra chưa đạt hoặc bài đang học dở hiển thị in_progress (icon cam cảnh báo)
        status = 'in_progress';
      }
      if (prog.time_spent_seconds && !userCourseProgressDoc?.total_learning_time_seconds) {
        totalUserSpentSeconds += parseInt(prog.time_spent_seconds, 10) || 0;
      }
    }

    const lessonItem = {
      lesson_id: lessonIdStr,
      lesson_number: parseInt(les.lesson_number || les.order_index, 10) || flattenedLessons.length + 1,
      title: les.title || les.lesson_name || `Bài ${flattenedLessons.length + 1}`,
      lesson_type: normalizedType, // 'video' | 'article' | 'lab' | 'quiz'
      badge_label: normalizedType === 'video'
        ? 'Video'
        : normalizedType === 'article'
        ? 'Bài đọc'
        : normalizedType === 'lab'
        ? 'Phòng lab'
        : 'Trắc nghiệm',
      word_count: normalizedType === 'article' ? wordCount : undefined,
      duration_seconds: durationSeconds,
      duration_formatted: durationFormatted,
      question_count: normalizedType === 'quiz' ? questionCount : undefined,
      status: status, // 'completed' | 'in_progress' | 'not_started' (KHÔNG có locked)
      is_free_preview: !!(les.is_free_preview || les.is_preview || String(les.is_free) === '1'),
      order_index: parseInt(les.order_index || les.order, 10) || 0,
    };

    flattenedLessons.push(lessonItem);

    if (!lessonsBySectionMap.has(secIdStr)) {
      lessonsBySectionMap.set(secIdStr, []);
    }
    lessonsBySectionMap.get(secIdStr).push(lessonItem);
  }

  // Sắp xếp lessons trong từng section
  for (const [secId, list] of lessonsBySectionMap.entries()) {
    list.sort((a, b) => a.order_index - b.order_index || a.lesson_number - b.lesson_number);
  }

  // 6. Xây dựng danh sách Sections phong phú
  const sectionsList = [];
  if (sectionsDocs.length > 0) {
    for (let idx = 0; idx < sectionsDocs.length; idx++) {
      const sec = sectionsDocs[idx];
      const secIdStr = String(sec.section_id || sec._id);
      const sectionAliases = new Set([sec.section_id, sec._id].filter(value => value != null).map(String));
      const secLessons = [...lessonsBySectionMap.entries()]
        .filter(([id]) => sectionAliases.has(id)).flatMap(([, lessons]) => lessons)
        .sort((a, b) => a.order_index - b.order_index || a.lesson_number - b.lesson_number);
      const secDurationSeconds = secLessons.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0);

      sectionsList.push({
        section_id: secIdStr,
        section_number: parseInt(sec.section_number || sec.order_index, 10) || idx + 1,
        title: sec.title || sec.section_name || `Chương ${idx + 1}`,
        lessons_count: secLessons.length,
        lessons_count_formatted: `${secLessons.length} bài học`,
        duration_seconds: secDurationSeconds,
        duration_formatted: formatHoursMinutes(secDurationSeconds),
        lessons: secLessons,
      });
    }
  } else if (flattenedLessons.length > 0) {
    // Nếu chưa tạo bảng section riêng, gom toàn bộ vào Section 1 mặc định
    sectionsList.push({
      section_id: 'section_default',
      section_number: 1,
      title: 'Phần 1: Giới thiệu & Khởi đầu',
      lessons_count: flattenedLessons.length,
      lessons_count_formatted: `${flattenedLessons.length} bài học`,
      duration_seconds: totalCourseSeconds,
      duration_formatted: formatHoursMinutes(totalCourseSeconds),
      lessons: flattenedLessons,
    });
  }

  // 7. Khối Sidebar: Tính toán tiến độ học tập (Progress)
  const progressPercentage = totalLessonsCount > 0
    ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
    : 0;
  const remainingLessonsCount = Math.max(0, totalLessonsCount - completedLessonsCount);

  // 8. Khối Sidebar: Xác định bài học "Tiếp tục học" (Resume Learning)
  const listedLessonIds = new Set(sectionsList.flatMap(section => section.lessons.map(lesson => lesson.lesson_id)));
  const unlistedLessons = flattenedLessons.filter(lesson => !listedLessonIds.has(lesson.lesson_id));
  if (unlistedLessons.length) {
    const duration = unlistedLessons.reduce((total, lesson) => total + (lesson.duration_seconds || 0), 0);
    sectionsList.push({ section_id: 'unassigned_lessons', section_number: sectionsList.length + 1,
      title: 'Bài học khác', lessons_count: unlistedLessons.length,
      lessons_count_formatted: `${unlistedLessons.length} bài học`, duration_seconds: duration,
      duration_formatted: formatHoursMinutes(duration), lessons: unlistedLessons });
  }
  let resumeLesson = null;
  const lastAccessedId = userCourseProgressDoc?.last_accessed_lesson_id;
  if (lastAccessedId) {
    const foundLast = flattenedLessons.find(l => l.lesson_id === String(lastAccessedId));
    if (foundLast && foundLast.status !== 'completed') {
      resumeLesson = foundLast;
    }
  }
  // Nếu chưa có hoặc bài trước đã hoàn thành, chọn bài đầu tiên chưa completed
  if (!resumeLesson) {
    resumeLesson = flattenedLessons.find(l => l.status !== 'completed') || flattenedLessons[0] || null;
  }

  // 9. Kiểm tra điều kiện cấp chứng chỉ (tiến độ >= 80% & hoàn thành toàn bộ quiz theo chuẩn)
  const certificateEligibility = checkCertificateEligibility({
    progressPercentage,
    quizzesTotal: totalQuizzesCount,
    quizzesPassed: passedQuizzesCount,
  });

  // 10. Tập hợp đầy đủ 5 khối theo yêu cầu
  const recordedTimes = userId ? await getRecordedCourseLearningTimes(String(userId), { db }) : new Map();
  const synchronizedLearningSeconds = Math.max(Number(totalUserSpentSeconds) || 0,
    ...studyCourseIds.map(id => recordedTimes.get(String(id)) || 0));

  return {
    learning_preferences: userId ? await getLearningPreferences(String(userId), { db }) : { ...DEFAULT_LEARNING_PREFERENCES, revision: 0 },
    // ── Khối 1: Thông tin khóa học & Giảng viên ──
    course: {
      course_id: targetCourseId,
      slug: courseDoc.slug || `course-${targetCourseId}`,
      course_name: courseDoc.title || courseDoc.course_name || 'Khóa học ThinkUp',
      short_description: courseDoc.short_description || courseDoc.description || '',
      intro_video_url: courseDoc.intro_video_url || courseDoc.trailer_url || '',
      thumbnail_url: courseDoc.thumbnail_url || '',
      bg_gradient: courseDoc.bg_gradient || '',
      instructor: instructorInfo,
      // Lưu ý: Đánh giá và số học viên ở đây là của khóa học
      rating: {
        average: Math.round((parseFloat(courseDoc.rating) || 5.0) * 10) / 10,
        total_reviews: parseInt(courseDoc.total_reviews, 10) || 0,
        total_reviews_formatted: `(${new Intl.NumberFormat('vi-VN').format(parseInt(courseDoc.total_reviews, 10) || 0)} đánh giá)`,
      },
      total_students: parseInt(courseDoc.total_students, 10) || 0,
      total_students_formatted: `${new Intl.NumberFormat('vi-VN').format(parseInt(courseDoc.total_students, 10) || 0)} học viên`,
    },

    // ── Khối 2: Tabs điều hướng ──
    navigation_tabs: [
      { key: 'curriculum', label: 'Nội dung khóa học', is_active: true },
      { key: 'overview', label: 'Tổng quan', is_active: false },
      { key: 'resources', label: 'Tài liệu', is_active: false },
      { key: 'qna', label: 'Hỏi đáp', is_active: false },
      { key: 'discussions', label: 'Thảo luận', is_active: false },
    ],

    // ── Khối 3: Khối Nội dung khóa học (Curriculum) ──
    curriculum: {
      summary: {
        total_sections: sectionsList.length,
        total_lessons: totalLessonsCount,
        total_duration_seconds: totalCourseSeconds,
        total_duration_formatted: formatHoursMinutes(totalCourseSeconds),
        summary_text: `${sectionsList.length} chương · ${totalLessonsCount} bài học · ${formatHoursMinutes(totalCourseSeconds)}`,
      },
      sections: sectionsList,
    },

    // ── Khối 4: Khối Sidebar - Tiến độ học tập ──
    learning_progress: {
      progress_percentage: progressPercentage,
      completed_lessons: completedLessonsCount,
      total_lessons: totalLessonsCount,
      lessons_progress_text: `${completedLessonsCount} / ${totalLessonsCount}`,
      remaining_lessons: remainingLessonsCount,
      total_time_spent_seconds: synchronizedLearningSeconds,
      total_time_spent_formatted: formatHoursMinutes(synchronizedLearningSeconds),
      is_completed: progressPercentage === 100,
    },

    // ── Khối 5: Khối Sidebar - Hành động (Actions) ──
    actions: {
      resume_learning: {
        lesson_id: resumeLesson ? resumeLesson.lesson_id : null,
        lesson_number: resumeLesson ? resumeLesson.lesson_number : 1,
        title: resumeLesson ? resumeLesson.title : 'Bắt đầu học',
        button_title: 'Tiếp tục học',
        button_subtitle: resumeLesson ? `Bài ${resumeLesson.lesson_number}: ${resumeLesson.title}` : 'Khởi đầu khóa học',
      },
      course_review: {
        has_reviewed: !!userReviewDoc,
        user_rating: userReviewDoc ? userReviewDoc.rating : null,
        user_comment: userReviewDoc ? userReviewDoc.comment : null,
        button_title: 'Đánh giá khóa học',
        button_subtitle: 'Chia sẻ cảm nhận của bạn',
      },
      certificate: {
        can_claim: certificateEligibility.canClaim,
        eligibility_reason: certificateEligibility.reason,
        certificate_id: userCourseProgressDoc?.certificate_id || null,
        certificate_url: userCourseProgressDoc?.certificate_url || null,
        button_title: 'Xem chứng chỉ',
        button_subtitle: 'Xem hoặc tải chứng chỉ',
        requirements: {
          min_progress_percent: 80,
          current_progress_percent: progressPercentage,
          total_quizzes: totalQuizzesCount,
          passed_quizzes: passedQuizzesCount,
        },
      },
    },
  };
}

// ─── 3. Hàm Cập Nhật Tiến Độ Bài Học (Tracking & Progress Update) ─────────────

/**
 * Cập nhật tiến độ của một bài học và đồng bộ lại tiến độ chung của học viên
 * @param {string} userId
 * @param {string} courseId
 * @param {string} lessonId
 * @param {Object} payload - { status, time_spent_seconds, quiz_result, lab_result }
 * @returns {Promise<Object>}
 */
export async function updateLessonProgress(userId, courseId, lessonId, payload = {}) {
  if (!userId || !courseId || !lessonId) {
    const error = new Error('userId, courseId và lessonId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const uid = String(userId);
  const requestedCourseId = String(courseId).trim();
  const lid = String(lessonId);

  if (!requestedCourseId || !lid) {
    const error = new Error('courseId và lessonId phải có giá trị hợp lệ.');
    error.status = 400;
    throw error;
  }

  const status = payload.status === undefined ? 'in_progress' : payload.status;
  if (!['completed', 'in_progress'].includes(status)) {
    const error = new Error('status chỉ được là completed hoặc in_progress.');
    error.status = 400;
    throw error;
  }

  const timeSpent = payload.time_spent_seconds === undefined ? 0 : payload.time_spent_seconds;
  if (!Number.isSafeInteger(timeSpent) || timeSpent < 0) {
    const error = new Error('time_spent_seconds phải là số nguyên không âm.');
    error.status = 400;
    throw error;
  }

  const courseConditions = [
    { course_id: requestedCourseId },
    { slug: requestedCourseId },
  ];
  if (ObjectId.isValid(requestedCourseId)) {
    courseConditions.push({ _id: new ObjectId(requestedCourseId) });
  }
  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({ $or: courseConditions });
  if (!courseDoc) {
    const error = new Error('Khóa học không tồn tại.');
    error.status = 404;
    throw error;
  }

  const courseIds = [...new Set([
    courseDoc.course_id,
    courseDoc.id,
    courseDoc._id ? String(courseDoc._id) : null,
  ].filter(value => value !== undefined && value !== null).map(String))];
  const cid = String(courseDoc.course_id || courseDoc._id);

  const lesson = await db.collection(COLLECTION_LESSONS).findOne({
    lesson_id: lid,
    course_id: { $in: courseIds },
  });
  if (!lesson) {
    const error = new Error('Bài học không tồn tại trong khóa học này.');
    error.status = 404;
    throw error;
  }

  const ownershipFilter = {
    $and: [
      { $or: [{ user_id: uid }, { userId: uid }] },
      { course_id: { $in: courseIds } },
    ],
  };
  const [enrollment, userCourse] = await Promise.all([
    db.collection(COLLECTION_ENROLLMENTS).findOne(ownershipFilter),
    db.collection(COLLECTION_USER_COURSES).findOne(ownershipFilter),
  ]);
  if (!enrollment && !userCourse) {
    const error = new Error('Bạn chưa được ghi danh khóa học này.');
    error.status = 403;
    error.code = 'COURSE_ENROLLMENT_REQUIRED';
    throw error;
  }

  if (status === 'completed') {
    const error = new Error('Backend chưa có bằng chứng độc lập để xác minh bài học đã hoàn thành.');
    error.status = 409;
    error.code = 'LESSON_COMPLETION_UNVERIFIED';
    throw error;
  }

  const updateDoc = {
    user_id: uid,
    course_id: cid,
    lesson_id: lid,
    status: status,
    is_completed: false,
    updated_at: new Date(),
  };

  updateDoc.time_spent_seconds = timeSpent;

  // 1. Upsert tiến độ bài học
  await db.collection(COLLECTION_USER_LESSON_PROGRESS).updateOne(
    { user_id: uid, course_id: cid, lesson_id: lid },
    { $set: updateDoc },
    { upsert: true }
  );

  // 2. Tính lại tiến độ toàn khóa
  const totalLessons = await db.collection(COLLECTION_LESSONS).countDocuments({ course_id: { $in: courseIds } });

  const completedCount = await db.collection(COLLECTION_USER_LESSON_PROGRESS).countDocuments({
    user_id: uid,
    course_id: cid,
    status: 'completed',
  });

  const allProgressDocs = await db.collection(COLLECTION_USER_LESSON_PROGRESS).find({
    user_id: uid,
    course_id: cid,
  }).toArray();

  const totalSpentTime = allProgressDocs.reduce((acc, curr) => acc + (curr.time_spent_seconds || 0), 0);
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // 3. Upsert vào user_course_progress
  await db.collection(COLLECTION_USER_COURSE_PROGRESS).updateOne(
    { user_id: uid, course_id: cid },
    {
      $set: {
        user_id: uid,
        course_id: cid,
        progress_percentage: progressPercent,
        completed_lessons_count: completedCount,
        total_learning_time_seconds: totalSpentTime,
        last_accessed_lesson_id: lid,
        is_completed: progressPercent === 100,
        updated_at: new Date(),
      },
    },
    { upsert: true }
  );

  return {
    success: true,
    lesson_id: lid,
    status,
    progress_percentage: progressPercent,
    completed_lessons: completedCount,
    total_lessons: totalLessons,
  };
}

// ─── 4. Hàm Truy Vấn Tab Tổng Quan Khóa Học (Course Overview) ────────────────

/**
 * Định dạng thời lượng sang tiếng Việt tự nhiên (vd: 525 phút -> "8 giờ 45 phút")
 * @param {number|string} minutes
 * @param {number} [seconds=0]
 * @returns {string}
 */
export function formatDurationVietnamese(minutes, seconds = 0) {
  let totalMin = parseInt(minutes, 10) || 0;
  if (!totalMin && seconds) {
    totalMin = Math.round(seconds / 60);
  }
  if (totalMin <= 0) return '0 phút';
  const hours = Math.floor(totalMin / 60);
  const remainingMinutes = totalMin % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours} giờ ${remainingMinutes} phút`;
  }
  if (hours > 0) {
    return `${hours} giờ`;
  }
  return `${remainingMinutes} phút`;
}

/**
 * Chuẩn hóa cấp độ sang tiếng Việt
 * @param {string} level
 * @returns {string}
 */
export function formatCourseLevel(level) {
  const norm = String(level || 'beginner').toLowerCase().trim();
  if (['beginner', 'basic', 'co_ban', 'co ban'].includes(norm)) return 'Cơ bản';
  if (['intermediate', 'trung_cap', 'trung cap'].includes(norm)) return 'Trung cấp';
  if (['advanced', 'expert', 'nang_cao', 'nang cao'].includes(norm)) return 'Nâng cao';
  return 'Mọi cấp độ';
}

/**
 * Truy vấn dữ liệu Tab Tổng quan (Overview) của khóa học:
 * - Giới thiệu khóa học & 5 thông số kỹ thuật (Cấp độ, Thời lượng, Hình thức, Ngôn ngữ, Bài giảng)
 * - Bạn sẽ học được gì (What you will learn)
 * - Yêu cầu (Requirements / Prerequisites)
 *
 * @param {string} courseIdOrSlug
 * @returns {Promise<Object>}
 */
export async function getCourseOverview(courseIdOrSlug) {
  if (!courseIdOrSlug) {
    const error = new Error('Mã định danh hoặc đường dẫn khóa học (courseIdOrSlug) là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const cleanParam = String(courseIdOrSlug).trim();

  // 1. Tìm thông tin khóa học
  const courseFilter = [
    { course_id: cleanParam },
    { slug: cleanParam },
  ];
  if (ObjectId.isValid(cleanParam)) {
    courseFilter.push({ _id: new ObjectId(cleanParam) });
  }

  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({ $or: courseFilter });
  if (!courseDoc) {
    const error = new Error('Khóa học không tồn tại trong hệ thống.');
    error.status = 404;
    throw error;
  }

  const targetCourseId = String(courseDoc.course_id || courseDoc._id);

  // 2. Đếm số lượng bài học thực tế và tính tổng thời lượng nếu có
  const [totalLessonsCount, lessonDocs] = await Promise.all([
    db.collection(COLLECTION_LESSONS).countDocuments({
      $or: [
        { course_id: targetCourseId },
        { course_id: courseDoc.course_id },
        { course_id: String(courseDoc._id) },
      ],
    }),
    db.collection(COLLECTION_LESSONS).find({
      $or: [
        { course_id: targetCourseId },
        { course_id: courseDoc.course_id },
        { course_id: String(courseDoc._id) },
      ],
    }).project({ duration_seconds: 1, duration: 1, word_count: 1, lesson_type: 1 }).toArray(),
  ]);

  // Tính tổng số phút
  let calculatedSeconds = 0;
  for (const les of lessonDocs) {
    if (les.lesson_type === 'article') {
      calculatedSeconds += les.duration_seconds || calculateArticleDuration(les.word_count || 0);
    } else {
      calculatedSeconds += parseInt(les.duration_seconds || les.duration, 10) || 0;
    }
  }

  const durationText = calculatedSeconds > 0
    ? formatDurationVietnamese(0, calculatedSeconds)
    : formatDurationVietnamese(courseDoc.duration_minutes || 525);

  const totalLessonsText = totalLessonsCount > 0
    ? `${totalLessonsCount} bài học`
    : `${parseInt(courseDoc.total_lessons, 10) || 40} bài học`;

  // 3. Trích xuất Bạn sẽ học được gì (What you will learn)
  let whatYouWillLearn = [];
  if (Array.isArray(courseDoc.what_you_will_learn) && courseDoc.what_you_will_learn.length > 0) {
    whatYouWillLearn = courseDoc.what_you_will_learn;
  } else if (Array.isArray(courseDoc.will_learn) && courseDoc.will_learn.length > 0) {
    whatYouWillLearn = courseDoc.will_learn;
  }

  // Nếu chưa có mảng riêng, parse từ course_outcomes
  let outcomesParsed = [];
  if (courseDoc.course_outcomes) {
    if (Array.isArray(courseDoc.course_outcomes)) {
      outcomesParsed = courseDoc.course_outcomes;
    } else if (typeof courseDoc.course_outcomes === 'string') {
      try {
        outcomesParsed = JSON.parse(courseDoc.course_outcomes);
      } catch {
        outcomesParsed = [];
      }
    }
  }

  if (whatYouWillLearn.length === 0 && outcomesParsed.length > 0) {
    const learnBlock = outcomesParsed.find(b =>
      /kiến thức|học được|mục tiêu|outcomes|skills/i.test(b.title || '')
    );
    if (learnBlock && Array.isArray(learnBlock.items) && learnBlock.items.length > 0) {
      whatYouWillLearn = learnBlock.items;
    }
  }

  // Fallback chuẩn nếu trong DB chưa có
  if (whatYouWillLearn.length === 0) {
    whatYouWillLearn = [
      'Hiểu và cài đặt môi trường Python',
      'Nắm vững cú pháp Python cơ bản',
      'Làm việc với biến, kiểu dữ liệu và toán tử',
      'Sử dụng cấu trúc điều khiển (if, for, while)',
      'Xây dựng và sử dụng hàm trong Python',
      'Làm việc với chuỗi, danh sách, tuple, dictionary',
      'Xử lý lỗi và ngoại lệ',
      'Đọc và ghi file',
      'Thực hành qua các bài tập và dự án thực tế',
    ];
  }

  // 4. Trích xuất Yêu cầu (Requirements / Prerequisites)
  let requirements = [];
  if (Array.isArray(courseDoc.requirements) && courseDoc.requirements.length > 0) {
    requirements = courseDoc.requirements;
  } else if (Array.isArray(courseDoc.prerequisites) && courseDoc.prerequisites.length > 0) {
    requirements = courseDoc.prerequisites;
  }

  if (requirements.length === 0 && outcomesParsed.length > 0) {
    const reqBlock = outcomesParsed.find(b =>
      /yêu cầu|kỹ năng yêu cầu|prerequisite/i.test(b.title || '')
    );
    if (reqBlock && Array.isArray(reqBlock.items) && reqBlock.items.length > 0) {
      requirements = reqBlock.items;
    }
  }

  // Fallback chuẩn nếu chưa có
  if (requirements.length === 0) {
    requirements = [
      'Không yêu cầu kinh nghiệm lập trình trước đó.',
      'Chỉ cần máy tính có kết nối Internet.',
    ];
  }

  // 5. Chuẩn bị nội dung văn bản giới thiệu
  const introDescription = courseDoc.detailed_description
    || courseDoc.description
    || courseDoc.short_description
    || 'Python là một trong những ngôn ngữ lập trình phổ biến và dễ học nhất hiện nay. Khóa học này được thiết kế dành riêng cho người mới bắt đầu, giúp bạn từng bước làm quen với Python từ những khái niệm cơ bản nhất.\n\nBạn sẽ học cách viết mã Python, hiểu các cấu trúc dữ liệu, hàm, xử lý lỗi và áp dụng vào các bài tập thực hành để xây dựng nền tảng vững chắc cho hành trình lập trình của mình.';

  return {
    course_id: targetCourseId,
    course_name: courseDoc.title || courseDoc.course_name || 'Khóa học ThinkUp',

    // Khối 1: Giới thiệu khóa học & 5 thông số
    introduction: {
      title: 'Giới thiệu khóa học',
      description: introDescription,
      highlights: [
        {
          key: 'level',
          label: 'Cấp độ',
          value: formatCourseLevel(courseDoc.level),
          icon: 'bar-chart',
        },
        {
          key: 'duration',
          label: 'Thời lượng',
          value: durationText,
          icon: 'clock',
        },
        {
          key: 'format',
          label: 'Hình thức',
          value: courseDoc.learning_mode || courseDoc.format || 'Học online, mọi lúc mọi nơi',
          icon: 'video',
        },
        {
          key: 'language',
          label: 'Ngôn ngữ',
          value: courseDoc.language || 'Tiếng Việt',
          icon: 'globe',
        },
        {
          key: 'lessons_count',
          label: 'Bài giảng',
          value: totalLessonsText,
          icon: 'file-text',
        },
      ],
    },

    // Khối 2: Bạn sẽ học được gì
    what_you_will_learn: whatYouWillLearn,

    // Khối 3: Yêu cầu
    requirements: requirements,
  };
}

// ─── 5. Nghiệp Vụ Thảo Luận Khóa Học (Public Course Discussion) ─────────────

/**
 * Lấy danh sách thảo luận của khóa học (phân trang 10 bài/lần, hỗ trợ cấu trúc 2 tầng)
 * @param {Object} params - { courseId, userId, page, limit, lessonId }
 * @returns {Promise<Object>}
 */
export async function getCourseDiscussions({ courseId, userId = null, page = 1, limit = 10, lessonId = null }) {
  if (!courseId) {
    const error = new Error('Mã khóa học (courseId) là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const cid = String(courseId).trim();
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
  const skipCount = (pageNum - 1) * pageSize;

  // Lọc bình luận gốc (Level 1)
  const filter = {
    course_id: cid,
    parent_id: null,
  };
  if (lessonId) {
    filter.lesson_id = String(lessonId);
  }

  const totalDiscussionsCount = await db.collection(COLLECTION_DISCUSSIONS).countDocuments(filter);
  const rootComments = await db.collection(COLLECTION_DISCUSSIONS)
    .find(filter)
    .sort({ created_at: -1 })
    .skip(skipCount)
    .limit(pageSize)
    .toArray();

  if (rootComments.length === 0) {
    return {
      pagination: {
        page: pageNum,
        limit: pageSize,
        total_items: totalDiscussionsCount,
        total_pages: Math.ceil(totalDiscussionsCount / pageSize) || 1,
      },
      discussions: [],
    };
  }

  // Thu thập danh sách ID của comment gốc để lấy phản hồi con (Level 2)
  const rootIds = rootComments.map(c => String(c._id));

  // Lấy toàn bộ phản hồi con của các bình luận gốc đang hiển thị
  const childReplies = await db.collection(COLLECTION_DISCUSSIONS)
    .find({
      course_id: cid,
      parent_id: { $in: rootIds },
    })
    .sort({ created_at: 1 })
    .toArray();

  // Luôn lấy tên/avatar hiện tại từ users cho cả bình luận gốc và phản hồi.
  const allUserIds = [...new Set([...rootComments, ...childReplies]
    .flatMap(item => [item.user_id, item.student_id, item.author?.user_id]).filter(Boolean).map(String))];
  const userDocs = allUserIds.length > 0 ? await db.collection(COLLECTION_USERS).find({ $or: [
    { id: { $in: allUserIds } }, { user_id: { $in: allUserIds } },
    ...allUserIds.filter(id => ObjectId.isValid(id)).map(id => ({ _id: new ObjectId(id) })),
  ] }).toArray() : [];
  const userMap = new Map();
  for (const user of userDocs) {
    const current = { full_name: user.full_name || user.name || '', email: user.email || '',
      avatar_url: user.avatar_url || user.avatar || '', role: user.role || 'student' };
    for (const value of [user._id, user.id, user.user_id].filter(Boolean)) userMap.set(String(value), current);
  }

  // Nhóm phản hồi con theo parent_id
  const repliesByParentMap = new Map();
  for (const rep of childReplies) {
    const pId = String(rep.parent_id);
    if (!repliesByParentMap.has(pId)) repliesByParentMap.set(pId, []);
    repliesByParentMap.get(pId).push(rep);
  }

  // Tra cứu các bài học liên quan (lesson_info)
  const allLessonIds = [...new Set([
    ...rootComments.map(c => c.lesson_id).filter(Boolean),
    ...childReplies.map(c => c.lesson_id).filter(Boolean),
  ])];
  const lessonDocs = allLessonIds.length > 0
    ? await db.collection(COLLECTION_LESSONS).find({
        $or: [
          { lesson_id: { $in: allLessonIds } },
          ...(allLessonIds.filter(id => ObjectId.isValid(id)).map(id => ({ _id: new ObjectId(id) }))),
        ],
      }).toArray()
    : [];

  const lessonLookup = new Map();
  for (const l of lessonDocs) {
    const lid = String(l.lesson_id || l._id);
    lessonLookup.set(lid, {
      lesson_id: lid,
      lesson_number: parseInt(l.lesson_number || l.order_index, 10) || 1,
      title: l.title || l.lesson_name || 'Bài học',
      lesson_url: `/learning/${cid}/lessons/${lid}`,
    });
  }

  // Tra cứu xem user hiện tại đã thích những bình luận nào
  const allCommentIds = [...rootIds, ...childReplies.map(r => String(r._id))];
  const userLikesSet = new Set();
  if (userId) {
    const likes = await db.collection(COLLECTION_DISCUSSION_LIKES).find({
      user_id: String(userId),
      discussion_id: { $in: allCommentIds },
    }).toArray();
    for (const l of likes) userLikesSet.add(String(l.discussion_id));
  }

  // Chuẩn hóa một item thảo luận
  const formatCommentItem = (item) => {
    const commentIdStr = String(item._id);
    const isOwner = !!(userId && String(item.user_id) === String(userId));
    const isLiked = userLikesSet.has(commentIdStr);
    const relatedLesson = item.lesson_id ? (lessonLookup.get(String(item.lesson_id)) || null) : null;

    const currentUser = userMap.get(String(item.user_id || item.author?.user_id || item.student_id));
    return {
      discussion_id: commentIdStr,
      course_id: item.course_id,
      parent_id: item.parent_id ? String(item.parent_id) : null,
      author: {
        user_id: String(item.author?.user_id || item.user_id || ''),
        full_name: currentUser?.full_name || item.author?.full_name || item.author_name || 'Học viên ThinkUp',
        masked_email: maskEmail(currentUser?.email || item.author?.email || ''),
        avatar_url: currentUser?.avatar_url || item.author?.avatar_url || item.author_avatar || item.avatar_url || '',
        role: currentUser?.role || item.author?.role || 'student',
        is_instructor: ['instructor', 'mentor', 'admin'].includes(currentUser?.role || item.author?.role || ''),
      },
      content: item.content,
      lesson_info: relatedLesson ? {
        lesson_id: relatedLesson.lesson_id,
        lesson_number: relatedLesson.lesson_number,
        title: relatedLesson.title,
        lesson_url: relatedLesson.lesson_url,
      } : null,
      likes_count: Math.max(0, parseInt(item.likes_count, 10) || 0),
      replies_count: Math.max(0, parseInt(item.replies_count, 10) || 0),
      is_liked: isLiked,
      is_owner: isOwner,
      is_edited: !!item.is_edited,
      created_at: item.created_at,
      created_at_formatted: formatRelativeTime(item.created_at),
      edited_at: item.edited_at || null,
    };
  };

  // Ghép nối cấu trúc 2 tầng
  const formattedDiscussions = rootComments.map(root => {
    const formattedRoot = formatCommentItem(root);
    const replies = repliesByParentMap.get(String(root._id)) || [];
    formattedRoot.replies = replies.map(formatCommentItem);
    formattedRoot.replies_count = formattedRoot.replies.length;
    return formattedRoot;
  });

  return {
    pagination: {
      page: pageNum,
      limit: pageSize,
      total_items: totalDiscussionsCount,
      total_pages: Math.ceil(totalDiscussionsCount / pageSize) || 1,
    },
    discussions: formattedDiscussions,
  };
}

/**
 * Đăng thảo luận mới (bình luận gốc hoặc phản hồi, có chống Spam 5 giây)
 * @param {Object} params - { courseId, userId, content, lessonId, parentId }
 * @returns {Promise<Object>}
 */
export async function createDiscussion({ courseId, userId, content, lessonId = null, parentId = null }) {
  if (!courseId || !userId) {
    const error = new Error('courseId và userId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const cleanContent = String(content || '').trim();
  if (cleanContent.length < 1 || cleanContent.length > 1000) {
    const error = new Error('Nội dung bình luận phải có từ 1 đến 1.000 ký tự.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const uid = String(userId);
  const cid = String(courseId).trim();

  // BR-DISC-03 Chống Spam: tối thiểu 5 giây giữa 2 lần đăng
  const lastComment = await db.collection(COLLECTION_DISCUSSIONS).findOne(
    { user_id: uid },
    { sort: { created_at: -1 } }
  );
  if (lastComment && lastComment.created_at) {
    const diffMs = Date.now() - new Date(lastComment.created_at).getTime();
    if (diffMs < 5000) {
      const waitSeconds = Math.ceil((5000 - diffMs) / 1000);
      const error = new Error(`Vui lòng đợi ${waitSeconds} giây trước khi đăng bình luận tiếp theo.`);
      error.status = 429;
      throw error;
    }
  }

  // Lấy thông tin người đăng từ users hoặc instructor_profiles
  const [userDoc, instDoc] = await Promise.all([
    db.collection(COLLECTION_USERS).findOne({
      $or: [{ id: uid }, { _id: ObjectId.isValid(uid) ? new ObjectId(uid) : null }].filter(Boolean),
    }),
    db.collection(COLLECTION_INSTRUCTORS).findOne({
      $or: [{ user_id: uid }, { instructor_id: uid }],
    }),
  ]);

  const isInstructor = !!instDoc || userDoc?.role === 'instructor' || userDoc?.role === 'admin';
  const fullName = instDoc?.full_name || userDoc?.full_name || userDoc?.name || 'Học viên ThinkUp';
  const email = userDoc?.email || '';
  const avatarUrl = instDoc?.avatar_url || userDoc?.avatar_url || '';

  // BR-DISC-02 Cấu trúc phân cấp tối đa 2 tầng
  let targetParentId = null;
  if (parentId) {
    const parentDoc = await db.collection(COLLECTION_DISCUSSIONS).findOne({
      $or: [{ _id: ObjectId.isValid(parentId) ? new ObjectId(parentId) : null }, { _id: String(parentId) }].filter(Boolean),
    });
    if (parentDoc) {
      // Nếu comment cha đã có parent_id (tức là comment level 2), quy về parent_id của nó để giữ đúng 2 tầng
      targetParentId = parentDoc.parent_id ? String(parentDoc.parent_id) : String(parentDoc._id);
    }
  }

  // Tra cứu thông tin bài học liên quan nếu có lessonId
  let targetLessonId = lessonId ? String(lessonId) : null;
  if (!targetLessonId && targetParentId) {
    // Kế thừa lesson_id từ comment cha nếu là trả lời
    const pDoc = await db.collection(COLLECTION_DISCUSSIONS).findOne({
      _id: ObjectId.isValid(targetParentId) ? new ObjectId(targetParentId) : targetParentId,
    });
    if (pDoc?.lesson_id) targetLessonId = String(pDoc.lesson_id);
  }

  const newDoc = {
    course_id: cid,
    parent_id: targetParentId,
    lesson_id: targetLessonId,
    user_id: uid,
    author: {
      user_id: uid,
      full_name: fullName,
      masked_email: maskEmail(email),
      avatar_url: avatarUrl,
      role: isInstructor ? 'instructor' : 'student',
    },
    content: cleanContent,
    likes_count: 0,
    replies_count: 0,
    is_edited: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const insertResult = await db.collection(COLLECTION_DISCUSSIONS).insertOne(newDoc);

  // Nếu là reply con, tăng replies_count cho comment cha
  if (targetParentId) {
    await db.collection(COLLECTION_DISCUSSIONS).updateOne(
      { _id: ObjectId.isValid(targetParentId) ? new ObjectId(targetParentId) : targetParentId },
      { $inc: { replies_count: 1 } }
    );
  }

  return {
    success: true,
    discussion_id: String(insertResult.insertedId),
    message: 'Đăng thảo luận thành công.',
    data: {
      discussion_id: String(insertResult.insertedId),
      parent_id: targetParentId,
      lesson_id: targetLessonId,
      content: cleanContent,
      author: newDoc.author,
      is_owner: true,
      likes_count: 0,
      replies_count: 0,
      is_liked: false,
      is_edited: false,
      created_at_formatted: 'Vừa xong',
    },
  };
}

/**
 * Chỉnh sửa nội dung thảo luận (BR-DISC-05: Chỉ tác giả mới có quyền sửa)
 * @param {Object} params - { discussionId, userId, content }
 * @returns {Promise<Object>}
 */
export async function updateDiscussion({ discussionId, userId, content }) {
  if (!discussionId || !userId) {
    const error = new Error('discussionId và userId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const cleanContent = String(content || '').trim();
  if (cleanContent.length < 1 || cleanContent.length > 1000) {
    const error = new Error('Nội dung bình luận phải có từ 1 đến 1.000 ký tự.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const discQuery = {
    $or: [
      { _id: ObjectId.isValid(discussionId) ? new ObjectId(discussionId) : null },
      { _id: String(discussionId) },
    ].filter(Boolean),
  };

  const existingDoc = await db.collection(COLLECTION_DISCUSSIONS).findOne(discQuery);
  if (!existingDoc) {
    const error = new Error('Bình luận không tồn tại.');
    error.status = 404;
    throw error;
  }

  // Kiểm tra quyền sở hữu
  if (String(existingDoc.user_id) !== String(userId)) {
    const error = new Error('Bạn không có quyền chỉnh sửa bình luận này.');
    error.status = 403;
    throw error;
  }

  await db.collection(COLLECTION_DISCUSSIONS).updateOne(discQuery, {
    $set: {
      content: cleanContent,
      is_edited: true,
      edited_at: new Date(),
      updated_at: new Date(),
    },
  });

  return {
    success: true,
    discussion_id: String(existingDoc._id),
    content: cleanContent,
    is_edited: true,
    message: 'Cập nhật bình luận thành công.',
  };
}

/**
 * Thích / Bỏ thích thảo luận (Toggle Like)
 * @param {string} discussionId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function toggleDiscussionLike({ discussionId, userId }) {
  if (!discussionId || !userId) {
    const error = new Error('discussionId và userId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const uid = String(userId);
  const did = String(discussionId);

  const existingLike = await db.collection(COLLECTION_DISCUSSION_LIKES).findOne({
    discussion_id: did,
    user_id: uid,
  });

  const discQuery = {
    $or: [
      { _id: ObjectId.isValid(did) ? new ObjectId(did) : null },
      { _id: did },
    ].filter(Boolean),
  };

  if (existingLike) {
    // Đã thích -> Bỏ thích
    await db.collection(COLLECTION_DISCUSSION_LIKES).deleteOne({ _id: existingLike._id });
    await db.collection(COLLECTION_DISCUSSIONS).updateOne(discQuery, {
      $inc: { likes_count: -1 },
    });
    const updated = await db.collection(COLLECTION_DISCUSSIONS).findOne(discQuery);
    return {
      success: true,
      is_liked: false,
      likes_count: Math.max(0, parseInt(updated?.likes_count, 10) || 0),
    };
  } else {
    // Chưa thích -> Thêm thích
    await db.collection(COLLECTION_DISCUSSION_LIKES).insertOne({
      discussion_id: did,
      user_id: uid,
      created_at: new Date(),
    });
    await db.collection(COLLECTION_DISCUSSIONS).updateOne(discQuery, {
      $inc: { likes_count: 1 },
    });
    const updated = await db.collection(COLLECTION_DISCUSSIONS).findOne(discQuery);
    return {
      success: true,
      is_liked: true,
      likes_count: Math.max(1, parseInt(updated?.likes_count, 10) || 1),
    };
  }
}

/**
 * Báo cáo vi phạm bình luận
 * @param {Object} params - { discussionId, reporterUserId, reason }
 * @returns {Promise<Object>}
 */
export async function reportDiscussion({ discussionId, reporterUserId, reason }) {
  if (!discussionId || !reporterUserId) {
    const error = new Error('discussionId và reporterUserId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const cleanReason = String(reason || 'Nội dung không phù hợp').trim();
  const db = await getMongoDb();

  await db.collection(COLLECTION_DISCUSSION_REPORTS).insertOne({
    discussion_id: String(discussionId),
    reporter_user_id: String(reporterUserId),
    reason: cleanReason,
    status: 'pending',
    created_at: new Date(),
  });

  return {
    success: true,
    message: 'Báo cáo vi phạm đã được gửi tới Ban quản trị thành công.',
  };
}

// ─── 6. Nghiệp Vụ Hỏi Đáp 1-1 Với Giảng Viên (Private 1-1 Q&A) ──────────────

/**
 * Lấy danh sách hỏi đáp 1-1 (BR-QNA-02: Cách ly dữ liệu 100%, HV chỉ thấy câu hỏi của mình)
 * @param {Object} params - { courseId, userId, role, page, limit }
 * @returns {Promise<Object>}
 */
export async function getCourseQnaList({ courseId, userId, role = 'student', page = 1, limit = 10 }) {
  if (!courseId || !userId) {
    const error = new Error('courseId và userId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const cid = String(courseId).trim();
  const uid = String(userId);
  const isInstructor = ['instructor', 'mentor', 'admin'].includes(role);

  // BR-QNA-02 Cách ly dữ liệu: Học viên chỉ thấy câu hỏi gốc của chính mình
  const filter = {
    course_id: cid,
    parent_id: null,
  };
  if (!isInstructor) {
    filter.student_id = uid;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
  const skipCount = (pageNum - 1) * pageSize;

  const totalCount = await db.collection(COLLECTION_QNA).countDocuments(filter);
  const rootQuestions = await db.collection(COLLECTION_QNA)
    .find(filter)
    .sort({ created_at: -1 })
    .skip(skipCount)
    .limit(pageSize)
    .toArray();

  if (rootQuestions.length === 0) {
    return {
      pagination: {
        page: pageNum,
        limit: pageSize,
        total_items: totalCount,
        total_pages: 1,
      },
      qna_list: [],
    };
  }

  const rootIds = rootQuestions.map(q => String(q._id));
  const replies = await db.collection(COLLECTION_QNA)
    .find({
      course_id: cid,
      parent_id: { $in: rootIds },
    })
    .sort({ created_at: 1 })
    .toArray();

  const repliesMap = new Map();
  for (const r of replies) {
    const pid = String(r.parent_id);
    if (!repliesMap.has(pid)) repliesMap.set(pid, []);
    repliesMap.get(pid).push(r);
  }

  const qnaUserIds = [...new Set([...rootQuestions, ...replies]
    .flatMap(item => [item.user_id, item.student_id, item.author?.user_id]).filter(Boolean).map(String))];
  const qnaUsers = qnaUserIds.length ? await db.collection(COLLECTION_USERS).find({ $or: [
    { id: { $in: qnaUserIds } }, { user_id: { $in: qnaUserIds } },
    ...qnaUserIds.filter(id => ObjectId.isValid(id)).map(id => ({ _id: new ObjectId(id) })),
  ] }).toArray() : [];
  const qnaUserMap = new Map();
  for (const user of qnaUsers) {
    for (const value of [user._id, user.id, user.user_id].filter(Boolean)) qnaUserMap.set(String(value), user);
  }

  // Tra cứu thông tin bài học liên quan
  const allLessonIds = [...new Set(rootQuestions.map(q => q.lesson_id).filter(Boolean))];
  const lessonDocs = allLessonIds.length > 0
    ? await db.collection(COLLECTION_LESSONS).find({
        $or: [
          { lesson_id: { $in: allLessonIds } },
          ...(allLessonIds.filter(id => ObjectId.isValid(id)).map(id => ({ _id: new ObjectId(id) }))),
        ],
      }).toArray()
    : [];

  const lessonMap = new Map();
  for (const l of lessonDocs) {
    const lid = String(l.lesson_id || l._id);
    lessonMap.set(lid, {
      lesson_id: lid,
      lesson_number: parseInt(l.lesson_number || l.order_index, 10) || 1,
      title: l.title || l.lesson_name || 'Bài học',
      lesson_url: `/learning/${cid}/lessons/${lid}`,
    });
  }

  const formatQnaItem = (item) => {
    const isOwner = String(item.user_id) === uid;
    const lessonInfo = item.lesson_id ? (lessonMap.get(String(item.lesson_id)) || null) : null;

    const currentAuthor = qnaUserMap.get(String(item.user_id || item.student_id || item.author?.user_id));
    const currentRole = currentAuthor?.role || item.author?.role || 'student';
    return {
      qna_id: String(item._id),
      course_id: item.course_id,
      parent_id: item.parent_id ? String(item.parent_id) : null,
      lesson_id: item.lesson_id || null,
      lesson_info: lessonInfo,
      author: {
        user_id: String(item.author?.user_id || item.user_id || ''),
        full_name: currentAuthor?.full_name || currentAuthor?.name || item.author?.full_name || 'Người dùng',
        avatar_url: currentAuthor?.avatar_url || currentAuthor?.avatar || item.author?.avatar_url || '',
        role: currentRole,
        is_instructor: ['instructor', 'mentor', 'admin'].includes(currentRole),
      },
      content: item.content,
      is_owner: isOwner,
      is_edited: !!item.is_edited,
      created_at: item.created_at,
      created_at_formatted: formatRelativeTime(item.created_at),
    };
  };

  const formattedQnaList = rootQuestions.map(q => {
    const formatted = formatQnaItem(q);
    const childReplies = repliesMap.get(String(q._id)) || [];
    formatted.replies = childReplies.map(formatQnaItem);
    return formatted;
  });

  return {
    pagination: {
      page: pageNum,
      limit: pageSize,
      total_items: totalCount,
      total_pages: Math.ceil(totalCount / pageSize) || 1,
    },
    qna_list: formattedQnaList,
  };
}

/**
 * Gửi câu hỏi Q&A mới (1-1 Private)
 * @param {Object} params - { courseId, userId, lessonId, content }
 * @returns {Promise<Object>}
 */
export async function createQnaQuestion({ courseId, userId, lessonId, content }) {
  if (!courseId || !userId || !lessonId) {
    const error = new Error('courseId, userId và lessonId là bắt buộc khi đặt câu hỏi.');
    error.status = 400;
    throw error;
  }

  const cleanContent = String(content || '').trim();
  if (cleanContent.length < 1 || cleanContent.length > 1000) {
    const error = new Error('Nội dung câu hỏi phải có từ 1 đến 1.000 ký tự.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const uid = String(userId);
  const cid = String(courseId).trim();
  const lid = String(lessonId).trim();

  // Lấy thông tin user
  const userDoc = await db.collection(COLLECTION_USERS).findOne({
    $or: [{ id: uid }, { _id: ObjectId.isValid(uid) ? new ObjectId(uid) : null }].filter(Boolean),
  });

  const newDoc = {
    course_id: cid,
    student_id: uid, // Định danh học viên sở hữu phiên hỏi đáp
    lesson_id: lid,
    parent_id: null,
    user_id: uid,
    author: {
      user_id: uid,
      full_name: userDoc?.full_name || userDoc?.name || 'Học viên',
      avatar_url: userDoc?.avatar_url || '',
      role: 'student',
    },
    content: cleanContent,
    is_edited: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.collection(COLLECTION_QNA).insertOne(newDoc);
  return {
    success: true,
    qna_id: String(result.insertedId),
    message: 'Gửi câu hỏi tới giảng viên thành công.',
    data: {
      qna_id: String(result.insertedId),
      content: cleanContent,
      lesson_id: lid,
      is_owner: true,
      created_at_formatted: 'Vừa xong',
    },
  };
}

/**
 * Phản hồi câu hỏi Q&A (Giảng viên hoặc Học viên)
 * @param {Object} params - { qnaId, userId, content }
 * @returns {Promise<Object>}
 */
export async function replyQnaQuestion({ qnaId, userId, content }) {
  if (!qnaId || !userId) {
    const error = new Error('qnaId và userId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const cleanContent = String(content || '').trim();
  if (cleanContent.length < 1 || cleanContent.length > 1000) {
    const error = new Error('Nội dung phản hồi phải từ 1 đến 1.000 ký tự.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const uid = String(userId);
  const qidQuery = {
    $or: [{ _id: ObjectId.isValid(qnaId) ? new ObjectId(qnaId) : null }, { _id: String(qnaId) }].filter(Boolean),
  };

  const requestedDoc = await db.collection(COLLECTION_QNA).findOne(qidQuery);
  if (!requestedDoc) {
    const error = new Error('Câu hỏi gốc không tồn tại.');
    error.status = 404;
    throw error;
  }

  const rootId = requestedDoc.parent_id ? String(requestedDoc.parent_id) : String(requestedDoc._id);
  const parentDoc = requestedDoc.parent_id
    ? await db.collection(COLLECTION_QNA).findOne({
        $or: [
          { _id: ObjectId.isValid(rootId) ? new ObjectId(rootId) : null },
          { _id: rootId },
        ].filter(Boolean),
      })
    : requestedDoc;
  if (!parentDoc || parentDoc.parent_id) {
    const error = new Error('Không tìm thấy câu hỏi gốc hợp lệ.');
    error.status = 404;
    throw error;
  }

  const courseConditions = [{ course_id: String(parentDoc.course_id) }];
  if (ObjectId.isValid(String(parentDoc.course_id))) {
    courseConditions.push({ _id: new ObjectId(String(parentDoc.course_id)) });
  }
  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({ $or: courseConditions });
  if (!courseDoc) {
    const error = new Error('Khóa học của câu hỏi không còn tồn tại.');
    error.status = 404;
    throw error;
  }

  const [userDoc, instDoc] = await Promise.all([
    db.collection(COLLECTION_USERS).findOne({
      $or: [{ id: uid }, { _id: ObjectId.isValid(uid) ? new ObjectId(uid) : null }].filter(Boolean),
    }),
    db.collection(COLLECTION_INSTRUCTORS).findOne({
      $or: [{ user_id: uid }, { instructor_id: uid }],
    }),
  ]);

  const courseInstructorId = String(courseDoc.instructor_id || '');
  const instructorIds = new Set([
    uid,
    instDoc?.instructor_id ? String(instDoc.instructor_id) : null,
    instDoc?.user_id ? String(instDoc.user_id) : null,
    userDoc?.instructor_id ? String(userDoc.instructor_id) : null,
  ].filter(Boolean));
  const isAssignedInstructor = Boolean(courseInstructorId && instructorIds.has(courseInstructorId))
    && (Boolean(instDoc) || userDoc?.role === 'instructor');
  const isQuestionOwner = String(parentDoc.student_id || '') === uid;

  if (!isQuestionOwner && !isAssignedInstructor) {
    const error = new Error('Bạn không có quyền phản hồi cuộc hỏi đáp này.');
    error.status = 403;
    error.code = 'QNA_REPLY_FORBIDDEN';
    throw error;
  }

  // Luôn gắn vào câu hỏi gốc (duy trì 2 tầng)
  const targetParentId = String(parentDoc._id);
  const isInstructor = isAssignedInstructor;
  const newReply = {
    course_id: parentDoc.course_id,
    student_id: parentDoc.student_id, // Kế thừa để giữ nguyên phiên 1-1
    lesson_id: parentDoc.lesson_id,
    parent_id: targetParentId,
    user_id: uid,
    author: {
      user_id: uid,
      full_name: instDoc?.full_name || userDoc?.full_name || userDoc?.name || (isInstructor ? 'Giảng viên' : 'Học viên'),
      avatar_url: instDoc?.avatar_url || userDoc?.avatar_url || '',
      role: isInstructor ? 'instructor' : 'student',
    },
    content: cleanContent,
    is_edited: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const result = await db.collection(COLLECTION_QNA).insertOne(newReply);
  return {
    success: true,
    qna_id: String(result.insertedId),
    message: 'Phản hồi câu hỏi thành công.',
  };
}

/**
 * Chỉnh sửa câu hỏi hoặc phản hồi Q&A (BR-QNA-04: Tuyệt đối không xóa)
 * @param {Object} params - { qnaId, userId, content }
 * @returns {Promise<Object>}
 */
export async function updateQnaContent({ qnaId, userId, content }) {
  if (!qnaId || !userId) {
    const error = new Error('qnaId và userId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const cleanContent = String(content || '').trim();
  if (cleanContent.length < 1 || cleanContent.length > 1000) {
    const error = new Error('Nội dung phải có từ 1 đến 1.000 ký tự.');
    error.status = 400;
    throw error;
  }

  const db = await getMongoDb();
  const qidQuery = {
    $or: [{ _id: ObjectId.isValid(qnaId) ? new ObjectId(qnaId) : null }, { _id: String(qnaId) }].filter(Boolean),
  };

  const existing = await db.collection(COLLECTION_QNA).findOne(qidQuery);
  if (!existing) {
    const error = new Error('Nội dung câu hỏi/trả lời không tồn tại.');
    error.status = 404;
    throw error;
  }

  if (String(existing.user_id) !== String(userId)) {
    const error = new Error('Bạn không có quyền chỉnh sửa nội dung này.');
    error.status = 403;
    throw error;
  }

  await db.collection(COLLECTION_QNA).updateOne(qidQuery, {
    $set: {
      content: cleanContent,
      is_edited: true,
      edited_at: new Date(),
      updated_at: new Date(),
    },
  });

  return {
    success: true,
    qna_id: String(existing._id),
    content: cleanContent,
    is_edited: true,
    message: 'Cập nhật nội dung thành công.',
  };
}

// ─── 7. Nghiệp Vụ Tài Liệu Khóa Học (Course Resources / Documents) ──────────

/**
 * Lấy kho tài liệu khóa học phân theo 3 danh mục:
 * 1. lecture_slides: Tài liệu bài giảng
 * 2. source_code: Mã nguồn bài tập
 * 3. exercises_data: Dữ liệu thực hành
 *
 * @param {string} courseIdOrSlug
 * @returns {Promise<Object>}
 */
export async function getCourseDocuments(courseIdOrSlug, userId = null, options = {}) {
  if (!courseIdOrSlug) {
    const error = new Error('courseIdOrSlug là bắt buộc.');
    error.status = 400;
    throw error;
  }

  const db = options.db || await getMongoDb();
  const cleanParam = String(courseIdOrSlug).trim();

  const courseDoc = await db.collection(COLLECTION_COURSES).findOne({
    $or: [
      { course_id: cleanParam },
      { slug: cleanParam },
      ...(ObjectId.isValid(cleanParam) ? [{ _id: new ObjectId(cleanParam) }] : []),
    ],
  });

  if (!courseDoc) throw Object.assign(new Error('Khóa học không tồn tại.'), { status: 404 });
  const enrolled = await hasCourseEnrollment(courseDoc, userId, { db });

  const targetCourseId = courseDoc ? String(courseDoc.course_id || courseDoc._id) : cleanParam;

  const docList = await db.collection(COLLECTION_DOCUMENTS).find({
    $or: [
      { course_id: targetCourseId },
      ...(courseDoc ? [{ course_id: courseDoc.course_id }, { course_id: String(courseDoc._id) }] : []),
    ],
  }).sort({ category: 1, created_at: -1 }).toArray();

  // Tra cứu thông tin bài học đính kèm (nếu doc có lesson_id)
  const attachedLessonIds = [...new Set(docList.map(d => d.lesson_id).filter(Boolean))];
  const lessonDocs = attachedLessonIds.length > 0
    ? await db.collection(COLLECTION_LESSONS).find({
        $or: [
          { lesson_id: { $in: attachedLessonIds } },
          { id: { $in: attachedLessonIds } },
          ...(attachedLessonIds.filter(id => ObjectId.isValid(id)).map(id => ({ _id: new ObjectId(id) }))),
        ],
      }).toArray()
    : [];

  const lessonMap = new Map();
  for (const l of lessonDocs) {
    const lid = String(l.lesson_id || l.id || l._id);
    lessonMap.set(lid, l.title || l.lesson_name || l.name || '');
  }

  // Chuẩn hóa và gom nhóm theo 3 mục
  const categorized = {
    lecture_slides: [],
    source_code: [],
    exercises_data: [],
  };

  for (const doc of docList) {
    const rawCat = String(doc.category || 'lecture_slides').toLowerCase();
    const categoryKey = ['lecture_slides', 'slides', 'tai_lieu_bai_giang'].includes(rawCat)
      ? 'lecture_slides'
      : ['source_code', 'code', 'ma_nguon_bai_tap'].includes(rawCat)
      ? 'source_code'
      : 'exercises_data';

    const lidStr = doc.lesson_id ? String(doc.lesson_id) : null;
    const lTitle = lidStr ? (lessonMap.get(lidStr) || doc.lesson_name || null) : (doc.lesson_name || null);

    const item = {
      document_id: String(doc.document_id || doc.id || doc._id),
      title: doc.title || doc.name || doc.file_name || 'Tài liệu học tập',
      file_name: doc.file_name || doc.name || 'document',
      file_type: String(doc.file_type || doc.file_name?.split('.').pop() || 'pdf').toLowerCase(),
      icon_type: detectDocumentIcon(doc.file_type, doc.file_name),
      file_size_bytes: doc.file_size_bytes || 0,
      file_size_formatted: doc.file_size_formatted || formatFileSize(doc.file_size_bytes || 0),
      download_count: parseInt(doc.download_count, 10) || 0,
      download_url: `/api/user/lessons/documents/${String(doc.document_id || doc.id || doc._id)}/download`,
      can_download: Boolean(userId && (enrolled || doc.is_free === true || String(doc.is_free) === '1' || doc.is_preview === true) && (doc.file_url || doc.download_url)),
      file_url: userId && (enrolled || doc.is_free === true || String(doc.is_free) === '1' || doc.is_preview === true) ? (doc.file_url || doc.download_url || '') : '',
      updated_at: doc.updated_at || null,
      updated_at_formatted: formatRelativeTime(doc.updated_at),
      lesson_id: lidStr,
      lesson_title: lTitle,
      lesson_name: lTitle,
      is_attached_to_lesson: Boolean(lidStr || lTitle),
    };

    categorized[categoryKey].push(item);
  }

  return {
    course_id: targetCourseId,
    course_name: courseDoc?.title || courseDoc?.course_name || 'Khóa học ThinkUp',
    summary: {
      total_documents: docList.length,
      total_slides: categorized.lecture_slides.length,
      total_source_code: categorized.source_code.length,
      total_exercises_data: categorized.exercises_data.length,
    },
    categories: [
      {
        key: 'lecture_slides',
        label: 'Tài liệu bài giảng',
        count: categorized.lecture_slides.length,
        items: categorized.lecture_slides,
      },
      {
        key: 'source_code',
        label: 'Mã nguồn bài tập',
        count: categorized.source_code.length,
        items: categorized.source_code,
      },
      {
        key: 'exercises_data',
        label: 'Dữ liệu thực hành',
        count: categorized.exercises_data.length,
        items: categorized.exercises_data,
      },
    ],
  };
}

/**
 * Tải tài liệu khóa học & Tự động tăng số lượt tải
 * @param {string} documentId
 * @returns {Promise<Object>}
 */
export async function downloadCourseDocument(documentId, userId, options = {}) {
  if (!documentId) {
    const error = new Error('documentId là bắt buộc.');
    error.status = 400;
    throw error;
  }

  if (!userId) throw Object.assign(new Error('Yêu cầu đăng nhập để tải tài liệu.'), { status: 401 });
  const db = options.db || await getMongoDb();
  const docQuery = {
    $or: [
      { _id: ObjectId.isValid(documentId) ? new ObjectId(documentId) : null },
      { _id: String(documentId) },
      { document_id: String(documentId) },
    ].filter(Boolean),
  };

  const doc = await db.collection(COLLECTION_DOCUMENTS).findOne(docQuery);
  if (!doc) {
    const error = new Error('Không tìm thấy tài liệu khóa học.');
    error.status = 404;
    error.code = 'COURSE_DOCUMENT_NOT_FOUND';
    throw error;
  }

  const courseId = String(doc.course_id || '');
  const course = await db.collection(COLLECTION_COURSES).findOne({ $or: [{ course_id: courseId }, { id: courseId },
    ...(ObjectId.isValid(courseId) ? [{ _id: new ObjectId(courseId) }] : [])] });
  if (!course) throw Object.assign(new Error('Khóa học không tồn tại.'), { status: 404 });
  if (!(doc.is_free === true || String(doc.is_free) === '1' || doc.is_preview === true) &&
      !await hasCourseEnrollment(course, userId, { db }))
    throw Object.assign(new Error('Bạn cần đăng ký khóa học để tải tài liệu.'), { status: 403, code: 'REQUIRE_ENROLLMENT' });
  const preferences = await getLearningPreferences(String(userId), { db });
  if (typeof doc.file_url !== 'string' || !doc.file_url.trim()) {
    const error = new Error('Tài liệu chưa có đường dẫn lưu trữ để tải.');
    error.status = 409;
    error.code = 'COURSE_DOCUMENT_FILE_UNAVAILABLE';
    throw error;
  }

  if (!/^https?:\/\/[^\s\\]+$/i.test(doc.file_url) && !/^\/(?!\/)[^\s\\]*$/.test(doc.file_url))
    throw Object.assign(new Error('Đường dẫn tải tài liệu chưa hợp lệ.'), { status: 409, code: 'COURSE_DOCUMENT_FILE_UNAVAILABLE' });

  // Tăng download_count
  await db.collection(COLLECTION_DOCUMENTS).updateOne(docQuery, {
    $inc: { download_count: 1 },
  });

  return {
    success: true,
    document_id: String(doc._id),
    file_name: doc.file_name,
    download_url: doc.file_url,
    download: { quality: 'original', location: 'browser', requestedQuality: preferences.downloadQuality, requestedLocation: preferences.downloadLocation },
    download_count: (parseInt(doc.download_count, 10) || 0) + 1,
  };
}

// ─── 7.9. Dịch vụ K.15: Bốn loại bài học (Reading, Video, Quiz, Lab) ──────────

/**
 * Phân giải ngữ cảnh bài học: tìm lesson, section và course tương ứng; kiểm tra enrollment
 */
export async function resolveLessonContext(lessonId, userId = null, options = {}) {
  const db = options.db || await getMongoDb();
  const lessonQuery = {
    $or: [
      { lesson_id: String(lessonId) },
      ...(ObjectId.isValid(lessonId) ? [{ _id: new ObjectId(lessonId) }] : []),
      { _id: String(lessonId) },
    ],
  };

  const lesson = await db.collection(COLLECTION_LESSONS).findOne(lessonQuery);
  if (!lesson) {
    const error = new Error('Bài học không tồn tại.');
    error.status = 404;
    error.code = 'LESSON_NOT_FOUND';
    throw error;
  }

  let courseId = lesson.course_id ? String(lesson.course_id) : null;
  let section = null;

  if (lesson.section_id) {
    const sectionQuery = {
      $or: [
        { section_id: String(lesson.section_id) },
        ...(ObjectId.isValid(lesson.section_id) ? [{ _id: new ObjectId(lesson.section_id) }] : []),
        { _id: String(lesson.section_id) },
      ],
    };
    section = await db.collection(COLLECTION_SECTIONS).findOne(sectionQuery);
    if (section && section.course_id) {
      courseId = String(section.course_id);
    }
  }

  let course = null;
  if (courseId) {
    const courseQuery = {
      $or: [
        { course_id: courseId },
        { id: courseId },
        ...(ObjectId.isValid(courseId) ? [{ _id: new ObjectId(courseId) }] : []),
      ],
    };
    course = await db.collection(COLLECTION_COURSES).findOne(courseQuery);
  }

  const isFree = lesson.is_free === true || String(lesson.is_free) === '1' || lesson.is_preview === true;
  if (!isFree) {
    if (!userId) {
      const error = new Error('Bạn cần đăng ký hoặc đăng nhập để truy cập bài học này.');
      error.status = 401;
      error.code = 'REQUIRE_LOGIN';
      throw error;
    }
    if (course) {
      const enrolled = await hasCourseEnrollment(course, userId, { db });
      if (!enrolled) {
        const error = new Error('Bạn cần đăng ký khóa học để truy cập bài học này.');
        error.status = 403;
        error.code = 'REQUIRE_ENROLLMENT';
        throw error;
      }
    }
  }

  return { lesson, section, course, courseId, db };
}

/**
 * GET /curriculum/:lessonId
 */
export async function getLessonCurriculumOverview(lessonId, userId) {
  const { lesson, course, db } = await resolveLessonContext(lessonId, userId);
  const courseId = course ? String(course.course_id || course._id) : lesson.course_id;
  const curriculum = await getCourseStudyCurriculum(courseId, userId, { db });
  return curriculum;
}

/**
 * GET /content/:lessonId
 */
export async function getLessonContentDetails(lessonId, userId) {
  const { lesson, course, section, courseId, db } = await resolveLessonContext(lessonId, userId);
  const normalizedType = lesson.lesson_type === 'article' ? 'reading' : lesson.lesson_type;

  // Lấy trạng thái từ user_lesson_progress
  const progress = await db.collection(COLLECTION_USER_LESSON_PROGRESS).findOne({
    user_id: String(userId),
    lesson_id: String(lesson.lesson_id || lesson._id),
  });
  const status = progress?.status === 'completed' || progress?.is_completed === true || String(progress?.is_completed) === '1' ? 'done' : progress?.status === 'in_progress' ? 'in-progress' : 'not-started';

  // Lấy danh sách bài cùng section/course để tính prev/next
  const siblingLessons = await db.collection(COLLECTION_LESSONS).find({
    section_id: String(lesson.section_id),
  }).sort({ order_index: 1 }).toArray();

  const currentIndex = siblingLessons.findIndex(l => String(l.lesson_id || l._id) === String(lesson.lesson_id || lesson._id));
  const prevSibling = currentIndex > 0 ? siblingLessons[currentIndex - 1] : null;
  const nextSibling = (currentIndex >= 0 && currentIndex < siblingLessons.length - 1) ? siblingLessons[currentIndex + 1] : null;

  const result = {
    id: String(lesson.lesson_id || lesson._id),
    title: lesson.title,
    type: normalizedType,
    status,
    duration_minutes: parseInt(lesson.duration_minutes, 10) || 0,
    previous_lesson: prevSibling ? { id: String(prevSibling.lesson_id || prevSibling._id), title: prevSibling.title, type: prevSibling.lesson_type === 'article' ? 'reading' : prevSibling.lesson_type } : null,
    next_lesson: nextSibling ? { id: String(nextSibling.lesson_id || nextSibling._id), title: nextSibling.title, type: nextSibling.lesson_type === 'article' ? 'reading' : nextSibling.lesson_type } : null,
    resources: [],
  };

  if (normalizedType === 'reading') {
    const article = await db.collection(COLLECTION_LESSON_ARTICLES).findOne({
      lesson_id: String(lesson.lesson_id || lesson._id),
    });
    let references = [];
    if (article?.references_data) {
      try { references = typeof article.references_data === 'string' ? JSON.parse(article.references_data) : article.references_data; } catch {}
    }
    result.reading = {
      content_html: article ? article.content : '<p>Nội dung bài đọc đang được cập nhật.</p>',
      images: article?.images ? [article.images] : [],
      document_url: null,
      references,
    };
  } else if (normalizedType === 'video') {
    const video = await db.collection(COLLECTION_LESSON_VIDEOS).findOne({
      lesson_id: String(lesson.lesson_id || lesson._id),
    });
    result.video = {
      video_url: video?.video_url || '',
      duration_seconds: (parseInt(video?.duration, 10) || parseInt(lesson.duration_minutes, 10) || 0) * 60,
    };
  } else if (normalizedType === 'quiz') {
    const quiz = await db.collection(COLLECTION_LESSON_QUIZZES).findOne({
      lesson_id: String(lesson.lesson_id || lesson._id),
    });
    let questionCount = 0;
    if (quiz) {
      questionCount = await db.collection(COLLECTION_QUIZ_QUESTIONS).countDocuments({
        lesson_quiz_id: String(quiz.lesson_quiz_id),
      });
    }
    result.quiz = {
      time_limit_minutes: quiz ? parseInt(quiz.time_limit, 10) || 15 : 15,
      pass_score_percent: quiz ? parseInt(quiz.pass_score, 10) || 70 : 70,
      total_questions: questionCount,
    };
  } else if (normalizedType === 'lab') {
    const lab = await db.collection(COLLECTION_LESSON_LABS).findOne({
      lesson_id: String(lesson.lesson_id || lesson._id),
    });
    let envConfig = {};
    if (lab?.environment_config) {
      try { envConfig = typeof lab.environment_config === 'string' ? JSON.parse(lab.environment_config) : lab.environment_config; } catch {}
    }
    result.lab = {
      requirements: lab ? lab.requirements : '',
      sample_code: lab ? lab.sample_code : '',
      expected_output: lab ? lab.expected_output : '',
      environment_config: envConfig,
      test_cases: labTestCases(lab),
    };
  }

  return result;
}

/**
 * POST /:lessonId/complete
 */
export async function markLessonManualComplete(lessonId, userId, payload = {}, options = {}) {
  const completed = payload.completed ?? true;
  if (typeof completed !== 'boolean') throw Object.assign(new Error('Trạng thái hoàn thành không hợp lệ.'), { status: 400 });
  const { lesson, course, courseId, db } = await resolveLessonContext(lessonId, userId, options);
  const normalizedType = lesson.lesson_type === 'article' ? 'reading' : lesson.lesson_type;
  if (!['reading', 'video'].includes(normalizedType)) {
    const error = new Error('Chỉ bài đọc hoặc video mới được phép tự đánh dấu hoàn thành thủ công.');
    error.status = 403;
    error.code = 'MANUAL_COMPLETION_NOT_ALLOWED';
    throw error;
  }

  const now = new Date();
  const targetLessonId = String(lesson.lesson_id || lesson._id);
  const targetCourseId = String(course?.course_id || courseId);
  await db.collection(COLLECTION_USER_LESSON_PROGRESS).updateOne(
    { user_id: String(userId), lesson_id: targetLessonId },
    {
      $set: {
        user_id: String(userId),
        course_id: targetCourseId,
        lesson_id: targetLessonId,
        is_completed: completed,
        status: completed ? 'completed' : 'in_progress',
        completed_at: completed ? now.toISOString().replace('T', ' ').slice(0, 19) : null,
        updated_at: now,
      },
    },
    { upsert: true }
  );

  if (completed) {
    try {
      await createNotificationForEvent(String(userId), {
        eventKey: 'lesson-completed:' + targetLessonId,
        sourceType: 'lesson',
        sourceId: targetLessonId,
        category: 'learning',
        kind: 'progress',
        title: 'Đã hoàn thành bài học',
        message: 'Bạn đã hoàn thành “' + (lesson.title || 'Bài học') + '”.',
        href: '/learning/learn/' + encodeURIComponent(targetCourseId) + '?lesson=' + encodeURIComponent(targetLessonId),
      }, { db, now });
    } catch (e) {
      // Best-effort notification
    }
  }

  return {
    lesson_id: targetLessonId,
    status: completed ? 'done' : 'in-progress',
    completed,
  };
}

/**
 * GET /quiz/:lessonId/overview
 */
export async function getQuizOverview(lessonId, userId) {
  const { lesson, db } = await resolveLessonContext(lessonId, userId);
  const quiz = await db.collection(COLLECTION_LESSON_QUIZZES).findOne({
    lesson_id: String(lesson.lesson_id || lesson._id),
  });
  if (!quiz) {
    const error = new Error('Bài kiểm tra không tồn tại.');
    error.status = 404;
    error.code = 'QUIZ_NOT_FOUND';
    throw error;
  }

  const questionCount = await db.collection(COLLECTION_QUIZ_QUESTIONS).countDocuments({
    lesson_quiz_id: String(quiz.lesson_quiz_id),
  });

  const attempts = await db.collection(COLLECTION_QUIZ_ATTEMPTS).find({
    user_id: String(userId),
    lesson_quiz_id: String(quiz.lesson_quiz_id),
  }).sort({ created_at: -1 }).toArray();

  const runningAttempt = attempts.find(a => a.status === 'in_progress');
  const bestScore = attempts.reduce((max, a) => Math.max(max, a.score_percent || 0), 0);

  return {
    lesson_quiz_id: String(quiz.lesson_quiz_id),
    title: lesson.title,
    description: quiz.description,
    total_questions: questionCount,
    time_limit_minutes: parseInt(quiz.time_limit, 10) || 15,
    pass_score_percent: parseInt(quiz.pass_score, 10) || 70,
    total_attempts: attempts.length,
    best_score_percent: bestScore,
    running_attempt: runningAttempt ? {
      attempt_id: runningAttempt.attempt_id,
      expires_at: runningAttempt.expires_at,
    } : null,
  };
}

/**
 * POST /quiz/:lessonId/attempts
 */
export async function startOrResumeQuizAttempt(lessonId, userId, { retry = false } = {}) {
  const { lesson, db } = await resolveLessonContext(lessonId, userId);
  const quiz = await db.collection(COLLECTION_LESSON_QUIZZES).findOne({
    lesson_id: String(lesson.lesson_id || lesson._id),
  });
  if (!quiz) throw Object.assign(new Error('Bài kiểm tra không tồn tại.'), { status: 404 });

  const existing = await db.collection(COLLECTION_QUIZ_ATTEMPTS).findOne({
    user_id: String(userId),
    lesson_quiz_id: String(quiz.lesson_quiz_id),
    status: 'in_progress',
  });

  if (existing) {
    const now = new Date();
    if (new Date(existing.expires_at) > now) {
      if (retry) {
        throw Object.assign(new Error('Đang có lượt làm bài chưa hoàn thành.'), { status: 409, code: 'ATTEMPT_RUNNING' });
      }
      return getQuizAttempt(existing.attempt_id, userId, { db });
    } else {
      // Hết hạn -> chốt lượt cũ
      await db.collection(COLLECTION_QUIZ_ATTEMPTS).updateOne(
        { _id: existing._id },
        { $set: { status: 'expired', updated_at: now } }
      );
    }
  }

  // Bắt đầu attempt mới
  const timeLimit = (parseInt(quiz.time_limit, 10) || 15) * 60;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeLimit * 1000);
  const attemptId = randomUUID();

  const attemptDoc = {
    attempt_id: attemptId,
    user_id: String(userId),
    lesson_quiz_id: String(quiz.lesson_quiz_id),
    lesson_id: String(lesson.lesson_id || lesson._id),
    answers: {},
    flagged_question_ids: [],
    revision: 0,
    status: 'in_progress',
    created_at: now,
    expires_at: expiresAt,
  };

  await db.collection(COLLECTION_QUIZ_ATTEMPTS).insertOne(attemptDoc);
  return getQuizAttempt(attemptId, userId, { db });
}

/**
 * GET /quiz/attempts/:attemptId
 */
export async function getQuizAttempt(attemptId, userId, options = {}) {
  const db = options.db || await getMongoDb();
  const attempt = await db.collection(COLLECTION_QUIZ_ATTEMPTS).findOne({
    attempt_id: String(attemptId),
    user_id: String(userId),
  });
  if (!attempt) throw Object.assign(new Error('Lượt làm bài không tồn tại.'), { status: 404 });

  const questions = await db.collection(COLLECTION_QUIZ_QUESTIONS).find({
    lesson_quiz_id: String(attempt.lesson_quiz_id),
  }).sort({ order_index: 1 }).toArray();

  const questionIds = questions.map(q => String(q.quiz_question_id));
  const optionsList = await db.collection(COLLECTION_QUIZ_ANSWER_OPTIONS).find({
    question_id: { $in: questionIds },
  }).sort({ order_index: 1 }).toArray();

  // ẨN ĐÁP ÁN ĐÚNG
  const formattedQuestions = questions.map(q => ({
    id: String(q.quiz_question_id),
    text: q.question_text,
    type: q.question_type || 'single_choice',
    options: optionsList
      .filter(opt => String(opt.question_id) === String(q.quiz_question_id))
      .map(opt => ({
        id: String(opt.quiz_answer_option_id),
        text: opt.option_text,
      })),
  }));

  const now = new Date();
  const remainingSeconds = Math.max(0, Math.floor((new Date(attempt.expires_at).getTime() - now.getTime()) / 1000));

  return {
    attempt_id: attempt.attempt_id,
    lesson_id: attempt.lesson_id,
    status: attempt.status,
    answers: attempt.answers || {},
    flagged_question_ids: attempt.flagged_question_ids || [],
    revision: attempt.revision || 0,
    remaining_seconds: remainingSeconds,
    expires_at: attempt.expires_at,
    questions: formattedQuestions,
  };
}

/**
 * PUT /quiz/attempts/:attemptId/answers
 */
export async function saveQuizAnswers(attemptId, userId, { answers, flagged_question_ids, revision } = {}) {
  const db = await getMongoDb();
  const attempt = await db.collection(COLLECTION_QUIZ_ATTEMPTS).findOne({
    attempt_id: String(attemptId),
    user_id: String(userId),
  });
  if (!attempt) throw Object.assign(new Error('Lượt làm bài không tồn tại.'), { status: 404 });
  if (attempt.status !== 'in_progress') throw Object.assign(new Error('Lượt làm bài đã kết thúc.'), { status: 400 });

  if (typeof revision === 'number' && revision !== attempt.revision) {
    throw Object.assign(new Error('Dữ liệu đáp án đã thay đổi từ phiên khác.'), { status: 409, code: 'STALE_REVISION' });
  }

  const updateFields = {
    revision: (attempt.revision || 0) + 1,
    updated_at: new Date(),
  };
  if (answers) updateFields.answers = answers;
  if (flagged_question_ids) updateFields.flagged_question_ids = flagged_question_ids;

  await db.collection(COLLECTION_QUIZ_ATTEMPTS).updateOne(
    { _id: attempt._id },
    { $set: updateFields }
  );

  return {
    attempt_id: attempt.attempt_id,
    revision: updateFields.revision,
    saved: true,
  };
}

/**
 * POST /quiz/attempts/:attemptId/submit
 */
export async function submitQuizAttempt(attemptId, userId) {
  const db = await getMongoDb();
  const attempt = await db.collection(COLLECTION_QUIZ_ATTEMPTS).findOne({
    attempt_id: String(attemptId),
    user_id: String(userId),
  });
  if (!attempt) throw Object.assign(new Error('Lượt làm bài không tồn tại.'), { status: 404 });

  const quiz = await db.collection(COLLECTION_LESSON_QUIZZES).findOne({
    lesson_quiz_id: String(attempt.lesson_quiz_id),
  });
  const passScorePercent = quiz ? parseInt(quiz.pass_score, 10) || 70 : 70;

  const questions = await db.collection(COLLECTION_QUIZ_QUESTIONS).find({
    lesson_quiz_id: String(attempt.lesson_quiz_id),
  }).toArray();

  const questionIds = questions.map(q => String(q.quiz_question_id));
  const optionsList = await db.collection(COLLECTION_QUIZ_ANSWER_OPTIONS).find({
    question_id: { $in: questionIds },
  }).toArray();

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  questions.forEach(q => {
    const qId = String(q.quiz_question_id);
    const selectedOptId = attempt.answers?.[qId];
    if (!selectedOptId) {
      unansweredCount++;
    } else {
      const correctOpt = optionsList.find(opt => String(opt.question_id) === qId && (opt.is_correct === '1' || opt.is_correct === 1 || opt.is_correct === true));
      if (correctOpt && String(correctOpt.quiz_answer_option_id) === String(selectedOptId)) {
        correctCount++;
      } else {
        wrongCount++;
      }
    }
  });

  const total = questions.length || 1;
  const scorePercent = Math.round((correctCount / total) * 100);
  const passed = scorePercent >= passScorePercent;
  const now = new Date();

  await db.collection(COLLECTION_QUIZ_ATTEMPTS).updateOne(
    { _id: attempt._id },
    {
      $set: {
        status: 'submitted',
        score_percent: scorePercent,
        correct_count: correctCount,
        wrong_count: wrongCount,
        unanswered_count: unansweredCount,
        passed,
        submitted_at: now,
        updated_at: now,
      },
    }
  );

  if (passed) {
    const quizLesson = await db.collection(COLLECTION_LESSONS).findOne({ lesson_id: String(attempt.lesson_id) });
    const quizCourseId = String(quizLesson?.course_id || '');
    await db.collection(COLLECTION_USER_LESSON_PROGRESS).updateOne(
      { user_id: String(userId), lesson_id: String(attempt.lesson_id) },
      {
        $set: {
          user_id: String(userId),
          lesson_id: String(attempt.lesson_id),
          course_id: quizCourseId,
          is_completed: true,
          status: 'completed',
          completed_at: now.toISOString().replace('T', ' ').slice(0, 19),
          updated_at: now,
        },
      },
      { upsert: true }
    );
    try {
      await createNotificationForEvent(String(userId), {
        eventKey: 'lesson-completed:' + String(attempt.lesson_id),
        sourceType: 'lesson',
        sourceId: String(attempt.lesson_id),
        category: 'learning',
        kind: 'quiz',
        title: 'Đã vượt qua bài kiểm tra',
        message: 'Bạn đã xuất sắc vượt qua bài kiểm tra “' + (quizLesson?.title || 'Quiz') + '” với ' + scorePercent + '%.',
        href: '/learning/learn/' + encodeURIComponent(quizCourseId) + '?lesson=' + encodeURIComponent(String(attempt.lesson_id)),
      }, { db, now });
    } catch (e) {
      // Best-effort notification
    }
  }

  return {
    attempt_id: attempt.attempt_id,
    status: 'submitted',
    score_percent: scorePercent,
    correct_count: correctCount,
    wrong_count: wrongCount,
    unanswered_count: unansweredCount,
    passed,
    submitted_at: now,
  };
}

/**
 * POST /quiz/attempts/:attemptId/abandon
 */
export async function abandonQuizAttempt(attemptId, userId) {
  const db = await getMongoDb();
  await db.collection(COLLECTION_QUIZ_ATTEMPTS).updateOne(
    { attempt_id: String(attemptId), user_id: String(userId), status: 'in_progress' },
    { $set: { status: 'abandoned', updated_at: new Date() } }
  );
  return { attempt_id: attemptId, status: 'abandoned' };
}

/**
 * GET /quiz/:lessonId/history
 */
export async function getQuizHistory(lessonId, userId) {
  const { lesson, db } = await resolveLessonContext(lessonId, userId);
  const quiz = await db.collection(COLLECTION_LESSON_QUIZZES).findOne({
    lesson_id: String(lesson.lesson_id || lesson._id),
  });
  if (!quiz) return [];

  const history = await db.collection(COLLECTION_QUIZ_ATTEMPTS).find({
    user_id: String(userId),
    lesson_quiz_id: String(quiz.lesson_quiz_id),
  }).sort({ created_at: -1 }).limit(100).toArray();

  return history.map(h => ({
    attempt_id: h.attempt_id,
    status: h.status,
    score_percent: h.score_percent ?? null,
    passed: h.passed ?? false,
    submitted_at: h.submitted_at ?? null,
    created_at: h.created_at,
  }));
}

export function labActivityRows(attempts, users, userId, demos = []) {
  const names = new Map(users.flatMap(user => [user.user_id, user.id, user._id].filter(value => value != null).map(id => [String(id), user.full_name || user.name || 'Học viên'])));
  const grouped = new Map();
  const submissions = [];
  for (const attempt of attempts) {
    const exercise = attempt.exercises?.['1'];
    const tests = exercise?.test_results || [];
    const count = tests.filter(test => test.passed).length;
    const score = tests.length ? Math.round(count / tests.length * 100) : 0;
    const date = new Date(attempt.submitted_at || attempt.updated_at || attempt.created_at);
    const submittedAt = date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }).replace(', ', ' ');
    if (String(attempt.user_id) === String(userId)) {
      const history = attempt.run_history?.length ? attempt.run_history : tests.length ? [{
        run_id: attempt.attempt_id, ran_at: attempt.submitted_at || attempt.updated_at || attempt.created_at,
        test_results: tests, passed: exercise?.status === 'pass', execution_ms: exercise?.execution_ms || 0,
      }] : [];
      for (const run of [...history].reverse()) submissions.push({
        id: run.run_id,
        submittedAt: new Date(run.ran_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }).replace(', ', ' '),
        testsPassed: run.test_results.filter(test => test.passed).length, testsTotal: run.test_results.length,
        status: run.passed ? 'pass' : 'fail', execTime: String(run.execution_ms) + ' ms',
      });
    }
    if (attempt.status !== 'submitted') continue;
    const id = String(attempt.user_id), previous = grouped.get(id);
    const entry = { id, name: names.get(id) || 'Học viên', score, attempts: (previous?.attempts || 0) + 1,
      execution_ms: exercise?.execution_ms || 0, submittedAt };
    grouped.set(id, previous && (previous.score > score || previous.score === score && previous.execution_ms <= entry.execution_ms) ? { ...previous, attempts: entry.attempts } : entry);
  }
  const leaderboard = [...demos, ...grouped.values()].sort((a,b) => b.score - a.score || a.execution_ms - b.execution_ms)
    .map((entry,index) => ({ ...entry, rank: index + 1, initials: entry.name.split(/\s+/).slice(-2).map(part => part[0]).join(''),
      color: ['#155DFC','#7C3AED','#059669'][index % 3], execTime: String(entry.execution_ms),
      medal: ['gold','silver','bronze'][index] }));
  return { leaderboard, submissions };
}

export async function getLabActivity(lessonId, userId, options = {}) {
  const { lesson, db } = await resolveLessonContext(lessonId, userId, options);
  const id = String(lesson.lesson_id || lesson._id);
  const attempts = await db.collection(COLLECTION_LAB_ATTEMPTS).find({ lesson_id: id }).sort({ submitted_at: -1, updated_at: -1 }).toArray();
  const ids = [...new Set(attempts.map(attempt => String(attempt.user_id)))];
  const users = ids.length ? await db.collection(COLLECTION_USERS).find({ $or: [
    { user_id: { $in: ids } }, { id: { $in: ids } }, { _id: { $in: ids } }, { _id: { $in: ids.filter(value => ObjectId.isValid(value)).map(value => new ObjectId(value)) } },
  ] }).toArray() : [];
  const samples = db.collection('lab_leaderboard_samples');
  if (!attempts.some(attempt => attempt.status === 'submitted') && !await samples.findOne({ lesson_id: id })) {
    for (const [index, name] of ['Minh Anh (mẫu)', 'Hoàng Nam (mẫu)', 'Thu Hà (mẫu)'].entries()) {
      await samples.updateOne({ lesson_id: id, id: 'sample-' + index }, { $setOnInsert: {
        lesson_id: id, id: 'sample-' + index, name, score: 100 - index * 10, attempts: index + 1,
        execution_ms: 80 + index * 25, submittedAt: '09:00:00 05/11/2026', is_sample: true,
      } }, { upsert: true });
    }
  }
  const demos = await samples.find({ lesson_id: id }).toArray();
  return labActivityRows(attempts, users, userId, demos);
}

/**
 * POST /lab/:lessonId/attempts
 */
export function labTestCases(lab) {
  let config = lab?.environment_config || {};
  if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = {}; } }
  const cases = lab?.test_cases || config.test_cases;
  if (Array.isArray(cases) && cases.length) return cases.map((test, index) => ({
    id: String(test.id || 't' + (index + 1)), name: test.name || 'Test case ' + (index + 1),
    input: String(test.input ?? ''), expected_output: String(test.expected_output ?? test.expected ?? ''),
  }));
  return [
    { id: 't1', name: 'Test case cơ bản 1', input: '', expected_output: lab?.expected_output || 'kết quả hợp lệ' },
    { id: 't2', name: 'Test case trường hợp biên', input: '', expected_output: 'xử lý biên tốt' },
  ];
}

export async function startOrResumeLabAttempt(lessonId, userId) {
  const { lesson, db } = await resolveLessonContext(lessonId, userId);
  const lab = await db.collection(COLLECTION_LESSON_LABS).findOne({
    lesson_id: String(lesson.lesson_id || lesson._id),
  });
  if (!lab) throw Object.assign(new Error('Bài lab không tồn tại.'), { status: 404 });

  let envConfig = {};
  if (lab.environment_config) {
    try { envConfig = typeof lab.environment_config === 'string' ? JSON.parse(lab.environment_config) : lab.environment_config; } catch {}
  }

  let attempt = await db.collection(COLLECTION_LAB_ATTEMPTS).findOne({
    user_id: String(userId),
    lesson_id: String(lesson.lesson_id || lesson._id),
    status: 'in_progress',
  });

  if (!attempt) {
    const attemptId = randomUUID();
    attempt = {
      attempt_id: attemptId,
      user_id: String(userId),
      lesson_id: String(lesson.lesson_id || lesson._id),
      lesson_lab_id: String(lab.lesson_lab_id),
      status: 'in_progress',
      exercises: {
        '1': {
          source_code: lab.sample_code || '',
          revision: 0,
          status: 'not-started',
          test_results: [],
        },
      },
      created_at: new Date(),
    };
    await db.collection(COLLECTION_LAB_ATTEMPTS).insertOne(attempt);
  }

  return {
    attempt_id: attempt.attempt_id,
    lesson_id: attempt.lesson_id,
    requirements: lab.requirements,
    expected_output: lab.expected_output,
    environment_config: envConfig,
    exercise: attempt.exercises?.['1'] || { source_code: lab.sample_code, revision: 0 },
  };
}

/**
 * PUT /lab/:lessonId/attempts/:attemptId/exercises/:exerciseId
 */
export async function saveLabDraftCode(lessonId, attemptId, exerciseId, userId, { source_code, revision } = {}) {
  const { db } = await resolveLessonContext(lessonId, userId);
  const attempt = await db.collection(COLLECTION_LAB_ATTEMPTS).findOne({
    attempt_id: String(attemptId),
    user_id: String(userId),
    lesson_id: String(lessonId),
    status: 'in_progress',
  });
  if (!attempt) throw Object.assign(new Error('Lượt làm bài lab không tồn tại.'), { status: 404 });

  const currentEx = attempt.exercises?.[exerciseId] || { revision: 0 };
  if (typeof revision === 'number' && revision !== currentEx.revision) {
    throw Object.assign(new Error('Mã nguồn đã thay đổi từ phiên khác.'), { status: 409, code: 'STALE_REVISION' });
  }

  const nextRevision = (currentEx.revision || 0) + 1;
  await db.collection(COLLECTION_LAB_ATTEMPTS).updateOne(
    { _id: attempt._id },
    {
      $set: {
        [`exercises.${exerciseId}.source_code`]: source_code,
        [`exercises.${exerciseId}.revision`]: nextRevision,
        updated_at: new Date(),
      },
    }
  );

  return { revision: nextRevision, saved: true };
}

/**
 * POST /lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/run
 */
export async function runLabExercise(lessonId, attemptId, exerciseId, userId, { source_code, revision } = {}) {
  const { db } = await resolveLessonContext(lessonId, userId);
  const attempt = await db.collection(COLLECTION_LAB_ATTEMPTS).findOne({
    attempt_id: String(attemptId),
    user_id: String(userId),
    lesson_id: String(lessonId),
    status: 'in_progress',
  });
  if (!attempt) throw Object.assign(new Error('Lượt làm bài lab không tồn tại.'), { status: 404 });

  const exercise = attempt.exercises?.[exerciseId];
  if (!exercise) throw Object.assign(new Error('Bài tập không tồn tại.'), { status: 404 });
  if (revision !== exercise.revision) throw Object.assign(new Error('Mã nguồn đã thay đổi từ phiên khác.'), { status: 409, code: 'STALE_REVISION' });
  const codeToRun = source_code ?? exercise.source_code ?? '';
  const nextRevision = (revision !== undefined ? revision : (attempt.exercises?.[exerciseId]?.revision || 0)) + 1;

  // Mô phỏng kiểm tra code đơn giản
  const hasSolution = codeToRun.length > 20 && !codeToRun.includes('return null;');
  const lab = await db.collection(COLLECTION_LESSON_LABS).findOne({ lesson_id: String(attempt.lesson_id) });
  const testResults = labTestCases(lab).map(test => ({
    ...test, passed: hasSolution, actual: hasSolution ? test.expected_output : 'Chưa có kết quả trả về',
  }));
  const passed = testResults.every(t => t.passed);
  const runId = randomUUID();
  const ranAt = new Date();

  await db.collection(COLLECTION_LAB_ATTEMPTS).updateOne(
    { _id: attempt._id },
    {
      $push: { run_history: { $each: [{ run_id: runId, ran_at: ranAt, test_results: testResults, passed, execution_ms: 124 }], $slice: -100 } },
      $set: {
        [`exercises.${exerciseId}.source_code`]: codeToRun,
        [`exercises.${exerciseId}.revision`]: nextRevision,
        [`exercises.${exerciseId}.status`]: passed ? 'pass' : 'fail',
        [`exercises.${exerciseId}.test_results`]: testResults,
        [`exercises.${exerciseId}.execution_ms`]: 124,
        updated_at: new Date(),
      },
    }
  );

  return {
    run_id: runId,
    revision: nextRevision,
    test_results: testResults,
    passed,
    execution_ms: 124,
    execution_mode: 'simulation',
    is_simulated: true,
  };
}

/**
 * POST /lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/reset
 */
export async function resetLabExercise(lessonId, attemptId, exerciseId, userId, { revision } = {}) {
  const { lesson, db } = await resolveLessonContext(lessonId, userId);
  const lab = await db.collection(COLLECTION_LESSON_LABS).findOne({
    lesson_id: String(lesson.lesson_id || lesson._id),
  });
  const starterCode = lab?.sample_code || '';
  const nextRevision = (revision || 0) + 1;

  await db.collection(COLLECTION_LAB_ATTEMPTS).updateOne(
    { attempt_id: String(attemptId), user_id: String(userId) },
    {
      $set: {
        [`exercises.${exerciseId}.source_code`]: starterCode,
        [`exercises.${exerciseId}.revision`]: nextRevision,
        [`exercises.${exerciseId}.status`]: 'not-started',
        [`exercises.${exerciseId}.test_results`]: [],
        updated_at: new Date(),
      },
    }
  );

  return {
    source_code: starterCode,
    revision: nextRevision,
    reset: true,
  };
}

/**
 * POST /lab/:lessonId/attempts/:attemptId/submit
 */
export async function submitLabAttempt(lessonId, attemptId, userId) {
  const { db } = await resolveLessonContext(lessonId, userId);
  const attempt = await db.collection(COLLECTION_LAB_ATTEMPTS).findOne({
    attempt_id: String(attemptId),
    user_id: String(userId),
    lesson_id: String(lessonId),
    status: 'in_progress',
  });
  if (!attempt) throw Object.assign(new Error('Lượt làm bài lab không tồn tại.'), { status: 404 });

  const ex = attempt.exercises?.['1'];
  const passed = ex?.status === 'pass';
  const now = new Date();

  await db.collection(COLLECTION_LAB_ATTEMPTS).updateOne(
    { _id: attempt._id },
    {
      $set: {
        status: 'submitted',
        passed,
        submitted_at: now,
        updated_at: now,
      },
    }
  );

  if (passed) {
    const labLesson = await db.collection(COLLECTION_LESSONS).findOne({ lesson_id: String(attempt.lesson_id) });
    const labCourseId = String(labLesson?.course_id || '');
    await db.collection(COLLECTION_USER_LESSON_PROGRESS).updateOne(
      { user_id: String(userId), lesson_id: String(attempt.lesson_id) },
      {
        $set: {
          user_id: String(userId),
          lesson_id: String(attempt.lesson_id),
          course_id: labCourseId,
          is_completed: true,
          status: 'completed',
          completed_at: now.toISOString().replace('T', ' ').slice(0, 19),
          updated_at: now,
        },
      },
      { upsert: true }
    );
    try {
      await createNotificationForEvent(String(userId), {
        eventKey: 'lesson-completed:' + String(attempt.lesson_id),
        sourceType: 'lesson',
        sourceId: String(attempt.lesson_id),
        category: 'learning',
        kind: 'progress',
        title: 'Đã hoàn thành bài thực hành Lab',
        message: 'Bạn đã hoàn thành bài thực hành “' + (labLesson?.title || 'Lab') + '”.',
        href: '/learning/learn/' + encodeURIComponent(labCourseId) + '?lesson=' + encodeURIComponent(String(attempt.lesson_id)),
      }, { db, now });
    } catch (e) {
      // Best-effort notification
    }
  }

  return {
    attempt_id: attempt.attempt_id,
    passed,
    status: 'submitted',
    submitted_at: now,
  };
}

/**
 * GET /video/:lessonId/playback
 */
export async function getVideoPlayback(lessonId, userId) {
  const { lesson, db } = await resolveLessonContext(lessonId, userId);
  const video = await db.collection(COLLECTION_LESSON_VIDEOS).findOne({
    lesson_id: String(lesson.lesson_id || lesson._id),
  });

  return {
    session_id: randomUUID(),
    playback_url: video?.video_url || '',
    duration_seconds: (parseInt(video?.duration, 10) || parseInt(lesson.duration_minutes, 10) || 0) * 60,
    last_position_seconds: 0,
    poster_url: null,
  };
}

/**
 * POST /video/:lessonId/heartbeat
 */
export async function recordVideoHeartbeat(lessonId, userId, payload = {}) {
  return { success: true };
}

// ─── 8. Router Express dành cho Module Bài Học & Tiện Ích Học Tập ─────────────

/**
 * Khởi tạo Router xử lý API Module Bài học & Giao diện học tập
 * @param {Object} express - Module Express
 * @param {Function} requireAuth - Middleware bắt buộc xác thực
 * @param {Function} optionalAuth - Middleware xác thực tùy chọn
 * @returns {Router}
 */
export function createLessonRouter(express, requireAuth, optionalAuth, activityOptions = {}) {
  const router = express.Router();

  const extractAuth = optionalAuth || ((req, res, next) => next());
  const enforceAuth = requireAuth || ((req, res, next) => next());

  router.post('/:lessonId/activity-session', enforceAuth,
    createLearningActivityStartHandler('lesson', req => ({ course_id: req.body?.course_id, lesson_id: req.params.lessonId }),
      ['course_id'], activityOptions));

  // GET /api/user/lessons/overview/:courseId - Truy vấn Tab Tổng quan (Overview) của khóa học
  router.get('/overview/:courseId', extractAuth, async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const data = await getCourseOverview(courseId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/lessons/study/:courseId - Truy xuất toàn bộ 5 khối dữ liệu màn hình học tập
  router.get('/study/:courseId', extractAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { courseId } = req.params;
      const userId = req.userId || null;
      const data = await getCourseStudyCurriculum(courseId, userId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/user/lessons/:lessonId/progress - Cập nhật tiến độ của một bài học
  router.put('/:lessonId/progress', enforceAuth, async (req, res, next) => {
    try {
      const { lessonId } = req.params;
      const { course_id, status, time_spent_seconds, quiz_result, lab_result } = req.body;
      if (!course_id) {
        return res.status(400).json({
          success: false,
          message: 'Trường course_id là bắt buộc trong body request.',
        });
      }

      const result = await updateLessonProgress(req.userId, course_id, lessonId, {
        status,
        time_spent_seconds,
        quiz_result,
        lab_result,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── ROUTER THẢO LUẬN KHÓA HỌC (DISCUSSIONS) ──

  // GET /api/user/lessons/discussions/:courseId - Lấy danh sách thảo luận (10 bài/lần)
  router.get('/discussions/:courseId', extractAuth, async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const { page, limit, lesson_id } = req.query;
      const result = await getCourseDiscussions({
        courseId,
        userId: req.userId || null,
        page,
        limit,
        lessonId: lesson_id || null,
      });
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/discussions/:courseId - Đăng thảo luận mới
  router.post('/discussions/:courseId', enforceAuth, async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const { content, lesson_id, parent_id } = req.body;
      const result = await createDiscussion({
        courseId,
        userId: req.userId,
        content,
        lessonId: lesson_id || null,
        parentId: parent_id || null,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/user/lessons/discussions/:id - Chỉnh sửa thảo luận của mình
  router.put('/discussions/:id', enforceAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const result = await updateDiscussion({
        discussionId: id,
        userId: req.userId,
        content,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/discussions/:id/like - Thích / Bỏ thích thảo luận
  router.post('/discussions/:id/like', enforceAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await toggleDiscussionLike({
        discussionId: id,
        userId: req.userId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/discussions/:id/report - Báo cáo vi phạm thảo luận
  router.post('/discussions/:id/report', enforceAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const result = await reportDiscussion({
        discussionId: id,
        reporterUserId: req.userId,
        reason,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── ROUTER HỎI ĐÁP 1-1 (Q&A) ──

  // GET /api/user/lessons/qna/:courseId - Lấy danh sách hỏi đáp 1-1 của học viên
  router.get('/qna/:courseId', enforceAuth, async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const { page, limit } = req.query;
      const result = await getCourseQnaList({
        courseId,
        userId: req.userId,
        role: req.userRole || 'student',
        page,
        limit,
      });
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/qna/:courseId - Gửi câu hỏi Q&A mới tới giảng viên
  router.post('/qna/:courseId', enforceAuth, async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const { lesson_id, content } = req.body;
      const result = await createQnaQuestion({
        courseId,
        userId: req.userId,
        lessonId: lesson_id,
        content,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/qna/:id/reply - Phản hồi câu hỏi Q&A
  router.post('/qna/:id/reply', enforceAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const result = await replyQnaQuestion({
        qnaId: id,
        userId: req.userId,
        content,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/user/lessons/qna/:id - Chỉnh sửa câu hỏi/trả lời Q&A
  router.put('/qna/:id', enforceAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const result = await updateQnaContent({
        qnaId: id,
        userId: req.userId,
        content,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── ROUTER TÀI LIỆU KHÓA HỌC (DOCUMENTS / RESOURCES) ──

  // GET /api/user/lessons/documents/:courseId - Lấy danh mục tài liệu phân 3 mục
  router.get('/documents/:courseId', extractAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { courseId } = req.params;
      const result = await getCourseDocuments(courseId, req.userId || null);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/lessons/documents/:id/download - Tải tài liệu & Tăng lượt tải
  router.get('/documents/:id/download', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { id } = req.params;
      const result = await downloadCourseDocument(id, req.userId);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // ── ROUTER K.15: BỐN LOẠI BÀI HỌC (READING, VIDEO, QUIZ, LAB) ──

  // GET /api/user/lessons/curriculum/:lessonId
  router.get('/curriculum/:lessonId', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await getLessonCurriculumOverview(lessonId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/lessons/content/:lessonId
  router.get('/content/:lessonId', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await getLessonContentDetails(lessonId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/:lessonId/complete
  router.post('/:lessonId/complete', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await markLessonManualComplete(lessonId, req.userId, req.body || {});
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/lessons/quiz/:lessonId/overview
  router.get('/quiz/:lessonId/overview', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await getQuizOverview(lessonId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/quiz/:lessonId/attempts
  router.post('/quiz/:lessonId/attempts', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const { retry } = req.body || {};
      const data = await startOrResumeQuizAttempt(lessonId, req.userId, { retry: !!retry });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/lessons/quiz/attempts/:attemptId
  router.get('/quiz/attempts/:attemptId', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { attemptId } = req.params;
      const data = await getQuizAttempt(attemptId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/user/lessons/quiz/attempts/:attemptId/answers
  router.put('/quiz/attempts/:attemptId/answers', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { attemptId } = req.params;
      const { answers, flagged_question_ids, revision } = req.body || {};
      const data = await saveQuizAnswers(attemptId, req.userId, { answers, flagged_question_ids, revision });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/quiz/attempts/:attemptId/submit
  router.post('/quiz/attempts/:attemptId/submit', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { attemptId } = req.params;
      const data = await submitQuizAttempt(attemptId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/quiz/attempts/:attemptId/abandon
  router.post('/quiz/attempts/:attemptId/abandon', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { attemptId } = req.params;
      const data = await abandonQuizAttempt(attemptId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/lessons/quiz/:lessonId/history
  router.get('/quiz/:lessonId/history', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await getQuizHistory(lessonId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/lab/:lessonId/attempts
  router.get('/lab/:lessonId/activity', enforceAuth, async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store'); res.json({ success: true, data: await getLabActivity(req.params.lessonId, req.userId) }); }
    catch (error) { next(error); }
  });

  router.post('/lab/:lessonId/attempts', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await startOrResumeLabAttempt(lessonId, req.userId);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/user/lessons/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId
  router.put('/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId, attemptId, exerciseId } = req.params;
      const { source_code, revision } = req.body || {};
      const data = await saveLabDraftCode(lessonId, attemptId, exerciseId, req.userId, { source_code, revision });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/run
  router.post('/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/run', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId, attemptId, exerciseId } = req.params;
      const { source_code, revision } = req.body || {};
      const data = await runLabExercise(lessonId, attemptId, exerciseId, req.userId, { source_code, revision });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/reset
  router.post('/lab/:lessonId/attempts/:attemptId/exercises/:exerciseId/reset', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId, attemptId, exerciseId } = req.params;
      const { revision } = req.body || {};
      const data = await resetLabExercise(lessonId, attemptId, exerciseId, req.userId, { revision });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/lab/:lessonId/attempts/:attemptId/submit
  router.post('/lab/:lessonId/attempts/:attemptId/submit', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId, attemptId } = req.params;
      const data = await submitLabAttempt(lessonId, attemptId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/user/lessons/video/:lessonId/playback
  router.get('/video/:lessonId/playback', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await getVideoPlayback(lessonId, req.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/user/lessons/video/:lessonId/heartbeat
  router.post('/video/:lessonId/heartbeat', enforceAuth, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { lessonId } = req.params;
      const data = await recordVideoHeartbeat(lessonId, req.userId, req.body || {});
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
