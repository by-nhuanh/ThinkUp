import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';
import { createNotificationForEvent } from '../notification/notification.user.js';

// ─── Dữ liệu tham chiếu (lấy từ database thật) ──────────────────────────────

/**
 * Danh sách category_id ↔ tên hiển thị từ collection course_categories.
 * Dùng cho validation câu hỏi "Bạn muốn trở thành?".
 * Nếu cần cập nhật, truy vấn: db.course_categories.find({}, { category_id: 1, name: 1 })
 */
/**
 * Giá trị level hợp lệ từ collection courses (distinct('level')).
 * Chuẩn hoá toàn bộ về chữ thường trước khi so sánh.
 */
const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'];

// ─── Bảng Mapping FE Slug ↔ DB ID ────────────────────────────────────────────

/**
 * Mapping từ slug nghề nghiệp FE (câu hỏi 1) → category_id trong DB.
 * FE dùng: 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'data-ai' | 'devops-cloud' | 'explore'
 * DB dùng: '1' ... '17'
 * Khi FE gửi slug, BE tự chuyển đổi; khi FE gửi ID số, BE giữ nguyên.
 */
const ROLE_SLUG_TO_CATEGORY_ID = {
  'frontend':     '1',  // Frontend Developer
  'backend':      '2',  // Backend Developer
  'fullstack':    '3',  // Fullstack Developer
  'mobile':       '4',  // Mobile Developer
  'data-ai':      '13', // AI & Machine Learning (gần nhất với Data Science & AI)
  'devops-cloud': '9',  // DevOps Engineering
  'explore':      '1',  // Khám phá tự do → mặc định Frontend (popular nhất)
  // Alias tiếng Anh đầy đủ (phòng trường hợp FE gửi tên dài)
  'frontend developer':  '1',
  'backend developer':   '2',
  'fullstack developer': '3',
  'mobile developer':    '4',
  'data science & ai':   '13',
  'devops & cloud':      '9',
};

/**
 * Mapping từ slug công nghệ FE (câu hỏi 2) → tag_id trong DB.
 * FE dùng: 'html-css' | 'js-ts' | 'angular' | 'react-next' | 'node-express' | 'database' | 'dsa' | 'portfolio'
 * DB dùng: tag_id dạng số string (ví dụ '1', '2', '3'...)
 *
 * ⚠️ Tag ID dựa trên dữ liệu thực trong collection 'tags'.
 * Nếu cần cập nhật, truy vấn: db.tags.find({}, { tag_id: 1, name: 1 })
 */
const TECH_SLUG_TO_TAG_ID = {
  'html-css':     '1',  // HTML5 & CSS3/Tailwind
  'js-ts':        '2',  // JavaScript / TypeScript
  'angular':      '3',  // Angular Framework
  'react-next':   '4',  // ReactJS / Next.js
  'node-express': '5',  // NodeJS & ExpressJS API
  'database':     '6',  // Cơ sở dữ liệu (MongoDB / MySQL)
  'dsa':          '7',  // Cấu trúc dữ liệu & Thuật toán
  'portfolio':    '8',  // Xây dựng dự án thực chiến (Portfolio)
};

/**
 * Chuẩn hóa đầu vào khảo sát từ FE về format nội bộ của BE.
 *
 * FE (Angular) gửi lên:
 *   { targetRole: 'frontend', selectedSkills: ['html-css', 'js-ts'], currentLevel: 'beginner' }
 *
 * BE nội bộ cần:
 *   { categoryId: '1', selectedTagIds: ['1', '2'], level: 'beginner' }
 *
 * Hàm này tự động:
 * 1. Alias field names: targetRole→categoryId, selectedSkills→selectedTagIds, currentLevel→level
 * 2. Map slug→id khi cần (nếu đã là số string thì giữ nguyên)
 *
 * @param {object} raw - Body thô từ req.body
 * @returns {{ categoryId: string, selectedTagIds: string[], level: string }}
 */
function normalizeOnboardingInput(raw = {}) {
  // ── 1. Resolve categoryId (hỗ trợ cả targetRole và categoryId) ──────────
  const rawRole = raw.categoryId ?? raw.targetRole ?? '';
  const roleLower = String(rawRole).trim().toLowerCase();
  const categoryId = ROLE_SLUG_TO_CATEGORY_ID[roleLower] ?? rawRole;

  // ── 2. Resolve selectedTagIds (hỗ trợ cả selectedSkills và selectedTagIds) ─
  const rawSkills = raw.selectedTagIds ?? raw.selectedSkills ?? [];
  const skillsArray = Array.isArray(rawSkills) ? rawSkills : [];
  const selectedTagIds = skillsArray.map((s) => {
    const slug = String(s).trim().toLowerCase();
    return TECH_SLUG_TO_TAG_ID[slug] ?? s; // Nếu không có trong map → giữ nguyên (đã là id)
  });

  // ── 3. Resolve level (hỗ trợ cả currentLevel và level) ──────────────────
  const level = String(raw.level ?? raw.currentLevel ?? '').trim().toLowerCase();

  return { categoryId: String(categoryId).trim(), selectedTagIds, level };
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Kiểm tra userId hợp lệ và trả về ObjectId.
 */
function parseUserId(userId) {
  if (!userId) {
    const err = new Error('Không có thông tin đăng nhập.');
    err.status = 401;
    throw err;
  }
  try {
    return new ObjectId(userId);
  } catch {
    const err = new Error('ID người dùng không hợp lệ.');
    err.status = 400;
    throw err;
  }
}

/**
 * Lấy user từ DB và kiểm tra tồn tại.
 */
async function findUserById(db, objId) {
  const user = await db.collection('users').findOne({ _id: objId });
  if (!user) {
    const err = new Error('Tài khoản không tồn tại.');
    err.status = 404;
    throw err;
  }
  return user;
}

// ─── Course Lookup & Sorting Helpers ──────────────────────────────────────────

/**
 * Lấy toàn bộ khóa học published kèm danh sách tag_id tương ứng.
 *
 * Pipeline:
 * 1. Lọc courses có status = 'published'
 * 2. Lookup bảng nối course_tags → lấy mảng tag_id[] cho mỗi course
 *
 * @param {object} db
 * @returns {Promise<Array<object>>} Mỗi course có thêm trường _tag_ids: string[]
 */
async function fetchPublishedCoursesWithTags(db) {
  const courses = await db
    .collection('courses')
    .find({ status: 'published' })
    .sort({ total_students: -1 })
    .toArray();

  // Lấy tất cả course_tags 1 lần (batch) thay vì N+1 query
  const courseIds = courses.map((c) => c.course_id);
  const allCourseTags = await db
    .collection('course_tags')
    .find({ course_id: { $in: courseIds } })
    .toArray();

  // Tạo Map: course_id → [tag_id, tag_id, ...]
  const tagMap = new Map();
  for (const ct of allCourseTags) {
    if (!tagMap.has(ct.course_id)) tagMap.set(ct.course_id, []);
    tagMap.get(ct.course_id).push(ct.tag_id);
  }

  // Gắn _tag_ids vào từng course
  return courses.map((c) => ({
    ...c,
    _tag_ids: tagMap.get(c.course_id) || [],
  }));
}

/**
 * Sắp xếp ưu tiên danh sách khóa học theo câu trả lời khảo sát.
 * Không dùng bộ lọc cứng loại bỏ — mọi khóa học đều được trả về,
 * các khóa không thỏa mãn ưu tiên nào hiển thị sau cùng.
 *
 * Thứ tự ưu tiên:
 *   Ưu tiên 1: Khớp category_id + level + có ≥1 tag_id trong selectedTagIds
 *   Ưu tiên 2: Khớp category_id + level (không cần khớp tag)
 *   Ưu tiên 3: Khớp category_id HOẶC có ≥1 tag_id trong selectedTagIds
 *   Phần còn lại: Giữ thứ tự gốc (total_students DESC)
 *
 * @param {Array<object>} courses - Mảng courses đã có _tag_ids
 * @param {{ categoryId: string, selectedTagIds: string[], level: string }} prefs
 * @returns {Array<object>}
 */
function sortCoursesByPreferences(courses, prefs) {
  const { categoryId, selectedTagIds = [], level } = prefs;
  const tagSet = new Set(selectedTagIds);
  const normalizedLevel = (level || '').toLowerCase();

  const getPriority = (course) => {
    const matchCategory = course.category_id === categoryId;
    const matchLevel = (course.level || '').toLowerCase() === normalizedLevel;
    const matchTag =
      Array.isArray(course._tag_ids) && course._tag_ids.some((tid) => tagSet.has(tid));

    if (matchCategory && matchLevel && matchTag) return 1;
    if (matchCategory && matchLevel) return 2;
    if (matchCategory || matchTag) return 3;
    return 4;
  };

  return [...courses].sort((a, b) => getPriority(a) - getPriority(b));
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Bỏ qua khảo sát đầu vào.
 *
 * Hành vi:
 * - Không lưu bất kỳ lựa chọn nào vào CSDL.
 * - Chỉ cập nhật onboarding_completed = true.
 * - Trả về danh sách khóa học published theo thứ tự gốc (total_students DESC).
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {object} [options.db] - DB instance (dùng cho test)
 * @returns {Promise<{ message: string, courses: Array<object> }>}
 */
export async function skipOnboarding(userId, options = {}) {
  const db = options.db || (await getMongoDb());
  const objId = parseUserId(userId);
  await findUserById(db, objId);

  const courses = await fetchPublishedCoursesWithTags(db);
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const updated = await db.collection('users').updateOne({ _id: objId },
        { $set: { onboarding_completed: true, updated_at: new Date() } }, { session });
      if (updated.matchedCount !== 1) throw Object.assign(new Error('Tài khoản không tồn tại.'), { status: 404 });
      await createOnboardingNotification(String(objId), db, session, options);
    });
  } finally { await session.endSession(); }

  return {
    message: 'Bạn đã bỏ qua khảo sát. Hiển thị toàn bộ khóa học.',
    courses: courses.map(formatCourse),
  };
}

/**
 * Hoàn thành khảo sát 3 bước và lưu lựa chọn vào CSDL.
 *
 * 3 bước khảo sát (theo tài liệu Onboarding):
 *   Bước 1: Bạn muốn trở thành? → categoryId (FK course_categories.category_id)
 *   Bước 2: Bạn quan tâm kỹ năng nào? → selectedTagIds[] (FK tags.tag_id), 1–3 tag
 *   Bước 3: Trình độ hiện tại? → level ("beginner" | "intermediate" | "advanced")
 *
 * Hành vi:
 * - Validate đầu vào theo schema thật.
 * - Upsert vào collection student_onboarding_answers.
 * - Cập nhật onboarding_completed = true.
 * - Sắp xếp courses theo ưu tiên 1 → 2 → 3 → còn lại. Không loại bỏ cứng.
 *
 * @param {string} userId
 * @param {{ categoryId: string, selectedTagIds: string[], level: string }} surveyAnswers
 * @param {object} [options]
 * @returns {Promise<{ message: string, preferences: object, courses: Array<object> }>}
 */
export async function submitOnboarding(userId, surveyAnswers = {}, options = {}) {
  const db = options.db || (await getMongoDb());
  const objId = parseUserId(userId);
  await findUserById(db, objId);

  if (!surveyAnswers || typeof surveyAnswers !== 'object' || Array.isArray(surveyAnswers)) {
    const err = new Error('Dữ liệu khảo sát không hợp lệ.');
    err.status = 400;
    err.code = 'INVALID_ONBOARDING_INPUT';
    throw err;
  }

  // Chuẩn hóa đầu vào: chấp nhận cả format FE (slug) lẫn format DB (id)
  const { categoryId, selectedTagIds, level } = normalizeOnboardingInput(surveyAnswers);

  // Validate categoryId (bước 1)
  if (!categoryId || typeof categoryId !== 'string') {
    const err = new Error('Vui lòng chọn nghề nghiệp mục tiêu.');
    err.status = 400;
    err.field = 'categoryId';
    throw err;
  }
  const categoryIdVariants = [categoryId];
  if (/^\d+$/.test(categoryId)) categoryIdVariants.push(Number(categoryId));
  const categoryExists = await db.collection('course_categories').findOne({
    category_id: { $in: categoryIdVariants },
  }, { projection: { _id: 1 } });
  if (!categoryExists) {
    const err = new Error('Nghề nghiệp mục tiêu không hợp lệ.');
    err.status = 400;
    err.field = 'categoryId';
    err.code = 'INVALID_ONBOARDING_CATEGORY';
    throw err;
  }

  // Validate selectedTagIds (bước 2)
  if (!Array.isArray(selectedTagIds) || selectedTagIds.length === 0) {
    const err = new Error('Vui lòng chọn ít nhất 1 kỹ năng quan tâm.');
    err.status = 400;
    err.field = 'selectedTagIds';
    throw err;
  }
  if (selectedTagIds.length > 3) {
    const err = new Error('Chỉ được chọn tối đa 3 kỹ năng quan tâm.');
    err.status = 400;
    err.field = 'selectedTagIds';
    throw err;
  }
  const cleanedTagIds = [...new Set(selectedTagIds
    .filter((tagId) => typeof tagId === 'string' && tagId.trim())
    .map(tagId => tagId.trim()))];
  if (cleanedTagIds.length === 0) {
    const err = new Error('Kỹ năng quan tâm không hợp lệ.');
    err.status = 400;
    err.field = 'selectedTagIds';
    throw err;
  }

  const tagIdVariants = [...new Set(cleanedTagIds.flatMap(tagId =>
    /^\d+$/.test(tagId) ? [tagId, Number(tagId)] : [tagId],
  ))];
  const existingTags = await db.collection('tags').find(
    { tag_id: { $in: tagIdVariants } },
    { projection: { tag_id: 1 } },
  ).toArray();
  const existingTagIds = new Set(existingTags.map(tag => String(tag.tag_id)));
  const missingTagIds = cleanedTagIds.filter(tagId => !existingTagIds.has(tagId));
  if (missingTagIds.length > 0) {
    const err = new Error('Một hoặc nhiều kỹ năng đã chọn không tồn tại.');
    err.status = 400;
    err.field = 'selectedTagIds';
    err.code = 'INVALID_ONBOARDING_TAGS';
    err.details = { invalid_tag_ids: missingTagIds };
    throw err;
  }

  // Validate level (bước 3)
  if (!level || typeof level !== 'string') {
    const err = new Error('Vui lòng chọn trình độ hiện tại.');
    err.status = 400;
    err.field = 'level';
    throw err;
  }
  const normalizedLevel = level.trim().toLowerCase();
  if (!VALID_LEVELS.includes(normalizedLevel)) {
    const err = new Error('Trình độ hiện tại không hợp lệ.');
    err.status = 400;
    err.field = 'level';
    throw err;
  }

  // Lưu câu trả lời khảo sát (upsert — 1 user chỉ 1 bản ghi)
  const onboardingAnswer = {
    user_id: objId,
    category_id: categoryId,
    selected_tag_ids: cleanedTagIds,
    level: normalizedLevel,
    submitted_at: new Date(),
  };

  // Lấy toàn bộ khóa học published kèm tags và sắp xếp ưu tiên
  const allCourses = await fetchPublishedCoursesWithTags(db);
  const sortedCourses = sortCoursesByPreferences(allCourses, {
    categoryId,
    selectedTagIds: cleanedTagIds,
    level: normalizedLevel,
  });

  // Hai thay đổi trạng thái phải cùng thành công hoặc cùng được rollback.
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection('student_onboarding_answers').updateOne(
        { user_id: objId },
        { $set: onboardingAnswer },
        { upsert: true, session },
      );

      const userUpdate = await db.collection('users').updateOne(
        { _id: objId },
        { $set: { onboarding_completed: true, updated_at: new Date() } },
        { session },
      );
      if (userUpdate.matchedCount !== 1) {
        const err = new Error('Tài khoản không tồn tại.');
        err.status = 404;
        throw err;
      }
      await createOnboardingNotification(String(objId), db, session, options);
    });
  } finally {
    await session.endSession();
  }

  return {
    message: 'Hoàn tất khảo sát! Đây là danh sách khóa học được gợi ý cho bạn.',
    preferences: {
      categoryId,
      selectedTagIds: cleanedTagIds,
      level: normalizedLevel,
    },
    courses: sortedCourses.map(formatCourse),
  };
}

async function createOnboardingNotification(userId, db, session, options) {
  return createNotificationForEvent(userId, {
    eventKey: `onboarding-completed:${userId}`, category: 'learning', kind: 'achievement',
    title: 'Chào mừng bạn đến ThinkUp', message: 'Bạn đã hoàn tất bước bắt đầu. Hãy khám phá khóa học và lộ trình học tập của mình.',
    sourceType: 'onboarding', sourceId: userId, href: '/main/home',
  }, { ...options, db, session });
}

/**
 * Lấy danh sách khóa học cho trang chủ.
 * Nếu đã có câu trả lời khảo sát → sắp xếp ưu tiên.
 * Nếu chưa → trả về theo thứ tự gốc (total_students DESC).
 *
 * @param {string} userId
 * @param {object} [options]
 * @returns {Promise<{ courses: Array<object>, preferences: object | null }>}
 */
export async function getOnboardingCourseList(userId, options = {}) {
  const db = options.db || (await getMongoDb());
  const objId = parseUserId(userId);
  await findUserById(db, objId);

  const savedAnswer = await db
    .collection('student_onboarding_answers')
    .findOne({ user_id: objId });

  const allCourses = await fetchPublishedCoursesWithTags(db);

  if (!savedAnswer) {
    return {
      courses: allCourses.map(formatCourse),
      preferences: null,
    };
  }

  const sortedCourses = sortCoursesByPreferences(allCourses, {
    categoryId: savedAnswer.category_id,
    selectedTagIds: savedAnswer.selected_tag_ids,
    level: savedAnswer.level,
  });

  return {
    courses: sortedCourses.map(formatCourse),
    preferences: {
      categoryId: savedAnswer.category_id,
      selectedTagIds: savedAnswer.selected_tag_ids,
      level: savedAnswer.level,
    },
  };
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Chuẩn hoá dữ liệu khóa học trước khi trả về cho Frontend.
 * Mapping 1:1 với schema thực trong collection courses.
 * Loại bỏ trường nội bộ _tag_ids.
 */
function formatCourse(course) {
  return {
    id: course._id ? String(course._id) : null,
    course_id: course.course_id || null,
    title: course.title || null,
    slug: course.slug || null,
    short_description: course.short_description || null,
    description: course.description || null,
    category_id: course.category_id || null,
    level: course.level || null,
    duration_minutes: course.duration_minutes || null,
    price: course.price || null,
    original_price: course.original_price || null,
    thumbnail_url: course.thumbnail_url || null,
    status: course.status || null,
    rating: course.rating || null,
    total_reviews: course.total_reviews || null,
    total_students: course.total_students || null,
    instructor_id: course.instructor_id || null,
    badge: course.badge || null,
    language: course.language || null,
    tag_ids: Array.isArray(course._tag_ids) ? course._tag_ids : [],
  };
}
