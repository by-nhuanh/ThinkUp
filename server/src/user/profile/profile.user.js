import { getLearningPreferences, DEFAULT_LEARNING_PREFERENCES, learningDateParts, learningUtcDate } from '../learning-settings/learning-settings.user.js';
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';

// ─── 0. Tên Collection MongoDB ───────────────────────────────────────────────
export const COLLECTION_USERS = 'users';
export const COLLECTION_USER_ACTIVITY_LOGS = 'user_activity_logs';
export const COLLECTION_COURSES = 'courses';
export const COLLECTION_LESSONS = 'lessons';
export const COLLECTION_USER_COURSE_PROGRESS = 'user_course_progress';
export const COLLECTION_CERTIFICATES = 'certificates';

// ─── 1. Tiện ích Định dạng & Xử lý Thời gian chuẩn Việt Nam (UTC+7) ──────────

/**
 * Định dạng ngày tham gia / ngày cấp: "DD/MM/YYYY" theo giờ Việt Nam
 * @param {Date|string|number} dateInput
 * @returns {string}
 */
export function formatVietnamDate(dateInput, timezone = DEFAULT_LEARNING_PREFERENCES.timezone) {
  return learningDateParts(dateInput, timezone)?.dateOnly || '';
}

/**
 * Định dạng thời gian tương đối cho Timeline Hoạt động gần đây
 * Ví dụ: "Hôm nay, 10:30", "Hôm qua, 15:15", "2 ngày trước, 09:00", hoặc "DD/MM/YYYY"
 * @param {Date|string|number} dateInput
 * @param {Date} [nowRef] Mốc thời gian đối chiếu (mặc định là hiện tại)
 * @returns {string}
 */
export function formatActivityRelativeTime(dateInput, nowRef = new Date(), timezone = DEFAULT_LEARNING_PREFERENCES.timezone) {
  if (!dateInput) return '';
  const date = learningUtcDate(dateInput);
  if (!date) return '';

  const vnTz = timezone;
  const getVnDateParts = (d) => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: vnTz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    return {
      year: parseInt(m.year, 10),
      month: parseInt(m.month, 10),
      day: parseInt(m.day, 10),
      time: `${m.hour}:${m.minute}`,
    };
  };

  const targetParts = getVnDateParts(date);
  const nowParts = getVnDateParts(nowRef);

  const targetDayUtc = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  const nowDayUtc = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
  const diffDays = Math.round((nowDayUtc - targetDayUtc) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return `Hôm nay, ${targetParts.time}`;
  } else if (diffDays === 1) {
    return `Hôm qua, ${targetParts.time}`;
  } else if (diffDays >= 2 && diffDays <= 7) {
    return `${diffDays} ngày trước, ${targetParts.time}`;
  } else {
    return formatVietnamDate(date, timezone);
  }
}

// ─── 2. Ghi nhận Hoạt động Học viên (Activity Logger) ────────────────────────

/**
 * Ghi 1 bản ghi hoạt động vào user_activity_logs
 * @param {string|ObjectId} userId
 * @param {Object} activity
 * @param {string} activity.text Nội dung thao tác
 * @param {'blue'|'amber'|'green'|'sky'|string} [activity.tone='blue'] Màu biểu thị
 * @param {string} [activity.action_type] Loại hành động (COURSE_START, LESSON_COMPLETE, CERT_ISSUED,...)
 * @param {Object} [activity.metadata] Dữ liệu bổ sung
 * @returns {Promise<Object>} Bản ghi đã tạo
 */
export async function logUserActivity(userId, { text, tone = 'blue', action_type = 'GENERAL', metadata = {} }) {
  if (!userId || !text) {
    throw new Error('Thiếu userId hoặc text khi ghi nhận hoạt động người dùng');
  }
  const db = await getMongoDb();
  const uid = typeof userId === 'string' && ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

  const doc = {
    user_id: uid,
    text: String(text).trim(),
    tone: tone || 'blue',
    action_type: String(action_type).trim().toUpperCase(),
    metadata: metadata || {},
    created_at: new Date(),
  };

  const result = await db.collection(COLLECTION_USER_ACTIVITY_LOGS).insertOne(doc);
  return { _id: result.insertedId, ...doc };
}

// ─── 3. Garbage Collection: Dọn dẹp Hoạt động > 30 ngày (BR-PRF-06) ──────────

/**
 * Xóa cứng (Hard Delete) các bản ghi hoạt động có tuổi đời vượt quá 30 ngày (BR-PRF-06)
 * @param {number} [days=30]
 * @returns {Promise<{ deletedCount: number }>}
 */
export async function cleanUpOldActivityLogs(days = 30) {
  const db = await getMongoDb();
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await db.collection(COLLECTION_USER_ACTIVITY_LOGS).deleteMany({
    created_at: { $lt: cutoffDate },
  });
  return { deletedCount: result.deletedCount || 0 };
}

// ─── 4. Lấy Dữ liệu Tổng quan Hồ sơ Học viên (Dashboard Profile Overview) ─────

/**
 * Lấy toàn bộ dữ liệu tổng quan cho trang hồ sơ học viên theo chuẩn BA
 * @param {string|ObjectId} userId
 * @returns {Promise<Object>}
 */
export async function getProfileOverviewData(userId, options = {}) {
  if (!userId) {
    throw new Error('UserId là bắt buộc');
  }

  const db = options.db || await getMongoDb();
  const uid = typeof userId === 'string' && ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

  // 1. Lấy thông tin cơ bản người dùng (Bảo mật: BR-PRF-07: Không trả về phone, address)
  const userDoc = await db.collection(COLLECTION_USERS).findOne(
    { _id: uid },
    {
      projection: {
        password: 0,
        password_hash: 0,
        phone: 0,
        address: 0,
        reset_token: 0,
        reset_token_expiry: 0,
        otp: 0,
        otp_expiry: 0,
      },
    }
  );

  if (!userDoc) {
    const err = new Error('Không tìm thấy tài khoản học viên');
    err.status = 404;
    throw err;
  }

  const { timezone } = await getLearningPreferences(String(userId), { db });
  const joinedAtFormatted = formatVietnamDate(userDoc.created_at || userDoc._id.getTimestamp(), timezone);
  const profileBanner = {
    name: userDoc.full_name || userDoc.name || 'Học viên ThinkUp',
    email: userDoc.email || '',
    avatarUrl: userDoc.avatar_url || userDoc.avatar || '',
    joinedAt: joinedAtFormatted,
    headline: userDoc.headline || '',
    location: userDoc.location || '',
  };

  // 2. Lấy Hoạt động gần đây (Timeline): Giới hạn cứng 5 bản ghi mới nhất (BR-PRF-01, BR-PRF-02)
  const rawActivities = await db.collection(COLLECTION_USER_ACTIVITY_LOGS)
    .find({ user_id: uid })
    .sort({ created_at: -1 })
    .limit(5)
    .toArray();

  const recentActivities = rawActivities.map((act) => ({
    key: act._id.toString(),
    text: act.text,
    time: formatActivityRelativeTime(act.created_at, new Date(), timezone),
    tone: act.tone || 'blue',
  }));

  // 3. Khóa học của tôi (Đang học & Đã hoàn thành):
  // Lấy tiến trình học tập của user
  const progressDocs = await db.collection(COLLECTION_USER_COURSE_PROGRESS)
    .find({ user_id: uid })
    .sort({ updated_at: -1 })
    .toArray();

  // Biến đếm tổng số khóa đã hoàn thành thực tế từ Database (BR-PRF-03)
  const totalCompletedCourses = await db.collection(COLLECTION_USER_COURSE_PROGRESS).countDocuments({
    user_id: uid,
    $or: [{ is_completed: true }, { progress_percentage: { $gte: 100 } }],
  });

  const rawCourseIds = [...new Set(progressDocs
    .map(progress => progress.course_id)
    .filter(courseId => courseId !== undefined && courseId !== null))];
  const courseIdVariants = [...new Set(rawCourseIds.flatMap(courseId => {
    const variants = [courseId, String(courseId)];
    if (typeof courseId === 'string' && ObjectId.isValid(courseId)) variants.push(new ObjectId(courseId));
    return variants;
  }))];
  const courseLookup = courseIdVariants.length > 0
    ? {
      $or: [
        { _id: { $in: courseIdVariants } },
        { course_id: { $in: courseIdVariants } },
      ],
    }
    : null;
  const coursesList = courseLookup
    ? await db.collection(COLLECTION_COURSES).find(courseLookup).toArray()
    : [];

  const courseMap = new Map();
  for (const c of coursesList) {
    for (const identifier of [c._id, c.course_id, c.id]) {
      if (identifier !== undefined && identifier !== null) courseMap.set(String(identifier), c);
    }
  }

  const currentCourses = [];
  const completedCourses = [];

  for (const prog of progressDocs) {
    const cidStr = prog.course_id ? prog.course_id.toString() : '';
    const course = courseMap.get(cidStr);
    if (!course) continue;
    const canonicalCourseId = String(course.course_id || course._id || prog.course_id);

    // Làm tròn tiến độ đến số nguyên gần nhất (BR-PRF-05)
    const rawProgress = typeof prog.progress_percentage === 'number' ? prog.progress_percentage : 0;
    const progress = Math.min(100, Math.max(0, Math.round(rawProgress)));
    const isCompleted = prog.is_completed === true || progress >= 100;

    let nextLessonText = '';
    let targetLessonHref = `/main/learning/${canonicalCourseId}`;

    if (isCompleted) {
      const finishDateStr = formatVietnamDate(prog.updated_at || new Date(), timezone);
      nextLessonText = `Hoàn thành ngày ${finishDateStr}`;
    } else {
      // Tìm bài học chưa hoàn thành có ID hoặc order nhỏ nhất (BR-PRF-05)
      const lessonCourseIds = [...new Set([
        prog.course_id,
        course.course_id,
        course._id,
        ...[prog.course_id, course.course_id, course._id]
          .filter(value => value !== undefined && value !== null)
          .map(value => String(value)),
      ].filter(value => value !== undefined && value !== null))];
      const uncompletedLesson = await db.collection(COLLECTION_LESSONS).findOne(
        {
          course_id: { $in: lessonCourseIds },
          ...(prog.completed_lesson_ids?.length ? { _id: { $nin: prog.completed_lesson_ids } } : {}),
        },
        { sort: { order: 1, _id: 1 } }
      );

      if (uncompletedLesson) {
        nextLessonText = `Tiếp theo: ${uncompletedLesson.title || 'Bài học tiếp theo'}`;
        targetLessonHref = `/main/learning/${cidStr}/${uncompletedLesson._id}`;
      } else {
        nextLessonText = 'Tiếp tục bài học dở';
      }
    }

    const courseCardItem = {
        id: canonicalCourseId,
      category: course.category || course.level || 'Khóa học',
      instructor: course.instructor_name || course.instructor || 'ThinkUp Giảng viên',
      title: course.title || 'Khóa học',
      progress,
      nextLesson: nextLessonText,
      image: course.thumbnail || course.image || '/assets/profile/course-default.png',
      href: targetLessonHref,
    };

    if (isCompleted) {
      completedCourses.push(courseCardItem);
    } else {
      currentCourses.push(courseCardItem);
    }
  }

  // 4. Chứng chỉ đạt được (Limit 3 bản ghi mới nhất, View-only, Push-down & Keep) (BR-PRF-01, BR-PRF-02, BR-PRF-04)
  // Biến đếm tổng số lượng thực tế truy vấn từ Database (BR-PRF-03)
  const totalCertificates = await db.collection(COLLECTION_CERTIFICATES).countDocuments({
    user_id: uid,
    status: { $ne: 'revoked' },
  });

  const rawCerts = await db.collection(COLLECTION_CERTIFICATES)
    .find({ user_id: uid, status: { $ne: 'revoked' } })
    .sort({ issued_at: -1, created_at: -1 })
    .limit(3)
    .toArray();

  const certificates = rawCerts.map((c) => ({
    id: c._id.toString(),
    title: c.course_title || c.title || 'Chứng chỉ hoàn thành khóa học',
    issuedAt: formatVietnamDate(c.issued_at || c.created_at, timezone),
  }));

  return {
    timezone,
    profile: profileBanner,
    recentActivities,
    currentCourses,
    completedCourses,
    totalCompletedCourses,
    certificates,
    totalCertificates,
  };
}

// ─── 5. Express Router Factory ───────────────────────────────────────────────

/**
 * Tạo Router Express cho Profile Học viên
 * @param {Object} express
 * @param {Function} requireAuth
 * @param {Function} [getCurrentUser]
 * @returns {Object} Router Express
 */
export function createProfileRouter(express, requireAuth, getCurrentUser) {
  const router = express.Router();

  // GET /api/user/profile/overview - Lấy tổng quan hồ sơ học viên (Dashboard)
  router.get('/overview', requireAuth, async (req, res, next) => {
    try {
      const data = await getProfileOverviewData(req.userId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/user/profile - Cập nhật thông tin cơ bản
  router.put('/', requireAuth, async (req, res, next) => {
    try {
      const db = await getMongoDb();
      const {
        avatarUrl,
        avatar,
        full_name,
        name,
        firstName,
        lastName,
        headline,
        location,
        bio,
        phone,
        gender,
        birthDate,
        facebook,
        linkedin,
        x,
        youtube,
        github,
        portfolio,
      } = req.body;
      const newAvatar = avatarUrl || avatar;
      const nextName = [lastName, firstName].filter(Boolean).join(' ').trim() || full_name || name;

      const updateFields = {
        updated_at: new Date(),
      };
      if (nextName) updateFields.full_name = nextName;
      if (firstName !== undefined) updateFields.first_name = firstName;
      if (lastName !== undefined) updateFields.last_name = lastName;
      if (phone !== undefined) updateFields.phone = phone;
      if (headline !== undefined) updateFields.headline = headline;
      if (location !== undefined) updateFields.location = location;
      if (bio !== undefined) updateFields.bio = bio;
      if (gender !== undefined) updateFields.gender = gender;
      if (birthDate !== undefined) updateFields.birth_date = birthDate;

      // Các liên kết mạng xã hội & portfolio
      if (facebook !== undefined) updateFields.facebook = facebook;
      if (linkedin !== undefined) updateFields.linkedin = linkedin;
      if (x !== undefined) updateFields.x = x;
      if (youtube !== undefined) updateFields.youtube = youtube;
      if (github !== undefined) updateFields.github = github;
      if (portfolio !== undefined) updateFields.portfolio = portfolio;

      if (newAvatar) {
        updateFields.avatar_url = newAvatar;
        updateFields.is_custom_avatar = true;
      }

      const uid = typeof req.userId === 'string' && ObjectId.isValid(req.userId)
        ? new ObjectId(req.userId)
        : req.userId;

      await db.collection(COLLECTION_USERS).updateOne(
        { _id: uid },
        { $set: updateFields }
      );

      let updatedData = {};
      if (typeof getCurrentUser === 'function') {
        const userRes = await getCurrentUser(req.userId);
        updatedData = userRes?.user || userRes;
      } else {
        const u = await db.collection(COLLECTION_USERS).findOne({ _id: uid });
        updatedData = u;
      }

      res.json({
        success: true,
        message: 'Cập nhật hồ sơ thành công!',
        data: updatedData,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
