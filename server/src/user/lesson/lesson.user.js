import { getLearningPreferences, DEFAULT_LEARNING_PREFERENCES } from '../learning-settings/learning-settings.user.js';
import { hasCourseEnrollment } from '../course/course.user.js';
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';

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
      .find({
        $or: [
          { course_id: targetCourseId },
          { course_id: courseDoc.course_id },
          { course_id: String(courseDoc._id) },
        ],
      })
      .sort({ order_index: 1, order: 1 })
      .toArray(),
    // Danh sách toàn bộ bài học
    db.collection(COLLECTION_LESSONS)
      .find({
        $or: [
          { course_id: targetCourseId },
          { course_id: courseDoc.course_id },
          { course_id: String(courseDoc._id) },
        ],
      })
      .sort({ section_id: 1, order_index: 1, order: 1, lesson_number: 1 })
      .toArray(),
    // Tiến độ chi tiết từng bài học của user
    userId
      ? db.collection(COLLECTION_USER_LESSON_PROGRESS)
          .find({
            user_id: String(userId),
            course_id: targetCourseId,
          })
          .toArray()
      : [],
    // Tiến độ tổng quan của user đối với khóa học
    userId
      ? db.collection(COLLECTION_USER_COURSE_PROGRESS).findOne({
          user_id: String(userId),
          course_id: targetCourseId,
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

    if (normalizedType === 'article') {
      // Bài đọc cấu hình theo số lượng từ
      durationSeconds = les.duration_seconds
        ? parseInt(les.duration_seconds, 10)
        : calculateArticleDuration(wordCount, les.reading_speed_wpm || 200);
      durationFormatted = formatDurationMmSs(durationSeconds);
    } else if (normalizedType === 'quiz') {
      totalQuizzesCount += 1;
      questionCount = parseInt(les.total_questions || les.questions_count || les.questions?.length, 10) || 0;
      durationFormatted = `${questionCount} câu hỏi`;
    } else {
      // video hoặc lab
      durationSeconds = parseInt(les.duration_seconds || les.duration, 10) || 0;
      durationFormatted = formatDurationMmSs(durationSeconds);
    }

    totalCourseSeconds += durationSeconds;

    // Xác định trạng thái học bài (Loại bỏ locked, chỉ có: completed, in_progress, not_started)
    const prog = progressMap.get(lessonIdStr);
    let status = 'not_started';

    if (prog) {
      if (prog.status === 'completed' || prog.is_completed === true) {
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
      const secLessons = lessonsBySectionMap.get(secIdStr) || [];
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
      total_time_spent_seconds: totalUserSpentSeconds,
      total_time_spent_formatted: formatHoursMinutes(totalUserSpentSeconds),
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

    return {
      discussion_id: commentIdStr,
      course_id: item.course_id,
      parent_id: item.parent_id ? String(item.parent_id) : null,
      author: {
        user_id: String(item.author?.user_id || item.user_id || ''),
        full_name: item.author?.full_name || 'Học viên ThinkUp',
        masked_email: item.author?.masked_email || maskEmail(item.author?.email || ''),
        avatar_url: item.author?.avatar_url || '',
        role: item.author?.role || 'student', // 'student' | 'instructor'
        is_instructor: ['instructor', 'mentor', 'admin'].includes(item.author?.role || ''),
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

    return {
      qna_id: String(item._id),
      course_id: item.course_id,
      parent_id: item.parent_id ? String(item.parent_id) : null,
      lesson_id: item.lesson_id || null,
      lesson_info: lessonInfo,
      author: {
        user_id: String(item.author?.user_id || item.user_id || ''),
        full_name: item.author?.full_name || 'Người dùng',
        avatar_url: item.author?.avatar_url || '',
        role: item.author?.role || 'student',
        is_instructor: ['instructor', 'mentor', 'admin'].includes(item.author?.role || ''),
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

    const item = {
      document_id: String(doc.document_id || doc._id),
      title: doc.title || doc.file_name || 'Tài liệu học tập',
      file_name: doc.file_name || 'document',
      file_type: String(doc.file_type || doc.file_name?.split('.').pop() || 'pdf').toLowerCase(),
      icon_type: detectDocumentIcon(doc.file_type, doc.file_name),
      file_size_bytes: doc.file_size_bytes || 0,
      file_size_formatted: doc.file_size_formatted || formatFileSize(doc.file_size_bytes || 0),
      download_count: parseInt(doc.download_count, 10) || 0,
      download_url: `/api/user/lessons/documents/${String(doc.document_id || doc._id)}/download`,
      can_download: Boolean(userId && (enrolled || doc.is_free === true || String(doc.is_free) === '1' || doc.is_preview === true) && doc.file_url),
      file_url: userId && (enrolled || doc.is_free === true || String(doc.is_free) === '1' || doc.is_preview === true) ? doc.file_url || '' : '',
      updated_at: doc.updated_at || null,
      updated_at_formatted: formatRelativeTime(doc.updated_at),
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

// ─── 8. Router Express dành cho Module Bài Học & Tiện Ích Học Tập ─────────────

/**
 * Khởi tạo Router xử lý API Module Bài học & Giao diện học tập
 * @param {Object} express - Module Express
 * @param {Function} requireAuth - Middleware bắt buộc xác thực
 * @param {Function} optionalAuth - Middleware xác thực tùy chọn
 * @returns {Router}
 */
export function createLessonRouter(express, requireAuth, optionalAuth) {
  const router = express.Router();

  const extractAuth = optionalAuth || ((req, res, next) => next());
  const enforceAuth = requireAuth || ((req, res, next) => next());

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

  return router;
}
