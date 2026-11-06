import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';
import { getPersonalizedCourseFeed } from '../course/rcm_course.js';
import { getCourseStudyCurriculum } from '../lesson/lesson.user.js';
import { calculateRoadmapProgress } from '../roadmap/roadmap.user.js';
import { getRecordedLearningIntervals, getRecordedCourseLearningTimes } from '../learning-activity/learning-activity.user.js';
import {
  getLearningPreferences, learningDateParts, learningCalendarDay,
  learningDayStart, normalizeLearningTimezone,
} from '../learning-settings/learning-settings.user.js';

export const HOME_LEARNING_DAY_SECONDS = 15 * 60;
const HOME_COURSE_LIMIT = 5;

function failure(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

function owner(userId) {
  if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) {
    throw failure('Yêu cầu đăng nhập bằng tài khoản hợp lệ.', 401, 'HOME_AUTH_REQUIRED');
  }
  return new ObjectId(userId);
}

function ownerQuery(userId) {
  const objectId = owner(userId);
  return { $or: [{ user_id: userId }, { user_id: objectId }, { userId: userId }, { userId: objectId }] };
}

function identifiers(values) {
  const strings = [...new Set(values.filter(value => value != null).map(String))];
  return [...strings, ...strings.filter(value => /^[a-f\d]{24}$/i.test(value)).map(value => new ObjectId(value))];
}

function timestamp(value) {
  return value == null ? 0 : new Date(value).getTime() || 0;
}

function selectedYear(value, currentYear) {
  if (value === undefined) return currentYear;
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d{0,3}$/.test(String(value)) || Number(value) > currentYear) {
    throw failure('Năm thống kê không hợp lệ hoặc thuộc tương lai.', 400, 'HOME_YEAR_INVALID');
  }
  return Number(value);
}

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const weekday = date => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const intensity = seconds => seconds === 0 ? 0 : seconds < 900 ? 1 : seconds < 1800 ? 2 : seconds < 3600 ? 3 : 4;

/** Input must contain full recorded history, not just the selected heatmap year. */
export function summarizeHomeLearningActivity(intervals, { now = new Date(), timezone = 'Asia/Ho_Chi_Minh', year, recordedSince } = {}) {
  timezone = normalizeLearningTimezone(timezone);
  const localNow = learningDateParts(now, timezone);
  if (!localNow) throw failure('Mốc thời gian không hợp lệ.', 400, 'HOME_TIME_INVALID');
  const today = localNow.date, reference = Date.parse(localNow.iso);
  const currentYear = Number(today.slice(0, 4));
  year = selectedYear(year, currentYear);
  const startDate = `${String(year).padStart(4, '0')}-01-01`, endDate = `${String(year).padStart(4, '0')}-12-31`;
  const first = recordedSince == null ? null : learningDateParts(recordedSince, timezone);
  if (recordedSince != null && (!first || Date.parse(first.iso) > reference)) {
    throw failure('Mốc ghi nhận hoạt động không hợp lệ.', 503, 'HOME_HISTORY_INVALID');
  }
  const noTracking = recordedSince === null;
  if (!Array.isArray(intervals)) throw failure('Khoảng học không hợp lệ.', 400, 'HOME_INTERVAL_INVALID');
  const ranges = intervals.map(interval => {
    // Require absolute instants; accepting local timestamps would misattribute days.
    const instant = value => value instanceof Date ? +value
      : typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
    const from = instant(interval?.started_at), to = instant(interval?.ended_at);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      throw failure('Khoảng học phải có thời điểm bắt đầu và kết thúc hợp lệ.', 400, 'HOME_INTERVAL_INVALID');
    }
    return [first ? Math.max(Date.parse(first.iso), from) : from, Math.min(reference, to)];
  }).filter(([from, to]) => to > from).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [from, to] of ranges) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  const totals = new Map(), starts = new Map();
  const dayStart = date => {
    if (!starts.has(date)) {
      const previous = starts.get(learningCalendarDay(date, -1));
      const candidate = previous === undefined ? null : previous + 86400000;
      const local = candidate === null ? null : learningDateParts(candidate, timezone);
      starts.set(date, local?.date === date && local.timeOnly === '00:00:00'
        ? candidate : +learningDayStart(date, timezone));
    }
    return starts.get(date);
  };
  for (const [from, to] of merged) {
    let cursor = from;
    while (cursor < to) {
      const date = learningDateParts(cursor, timezone).date;
      const end = Math.min(to, dayStart(learningCalendarDay(date, 1)));
      totals.set(date, (totals.get(date) || 0) + end - cursor);
      cursor = end;
    }
  }
  const dayView = date => {
    const dayOfWeek = weekday(date);
    const coverage = date > today ? 'future' : noTracking || (first && date < first.date) ? 'untracked'
      : first && date === first.date ? 'partial' : 'tracked';
    const known = coverage === 'tracked' || coverage === 'partial';
    const seconds = known ? Math.floor((totals.get(date) || 0) / 1000) : null;
    return { date, weekday: dayOfWeek, weekday_label: WEEKDAY_LABELS[dayOfWeek], active_seconds: seconds,
      goal_met: known ? seconds >= HOME_LEARNING_DAY_SECONDS : null,
      intensity_level: known ? intensity(seconds) : null, coverage };
  };
  const days = [];
  for (let date = startDate; date <= endDate; date = learningCalendarDay(date, 1)) days.push(dayView(date));
  const weeks = [], offset = weekday(startDate);
  days.forEach((day, index) => {
    const week = Math.floor((index + offset) / 7);
    if (!weeks[week]) weeks[week] = Array(7).fill(null);
    weeks[week][(index + offset) % 7] = day;
  });
  let cursor = today;
  if (!dayView(cursor).goal_met) cursor = learningCalendarDay(cursor, -1);
  let count = 0;
  while (dayView(cursor).goal_met === true) { count++; cursor = learningCalendarDay(cursor, -1); }
  const limited = dayView(cursor).coverage === 'untracked';
  const weekStart = learningCalendarDay(today, -weekday(today));
  const streak = { timezone, daily_goal_seconds: HOME_LEARNING_DAY_SECONDS,
    current_streak: limited && count === 0 ? null : count, history_limited: limited,
    today_goal_met: dayView(today).goal_met, week_start: weekStart, week_end: learningCalendarDay(weekStart, 6),
    days: Array.from({ length: 7 }, (_, index) => dayView(learningCalendarDay(weekStart, index))) };
  const firstYear = first ? Number(first.date.slice(0, 4)) : currentYear;
  const hasKnownDays = days.some(day => day.active_seconds !== null);
  return { timezone, year, start_date: startDate, end_date: endDate, window_days: days.length,
    daily_goal_seconds: HOME_LEARNING_DAY_SECONDS, status: noTracking ? 'not_started' : 'available',
    recorded_since: recordedSince ?? null, history_complete: !noTracking && (!first || Date.parse(first.iso) <= dayStart(startDate)),
    available_years: Array.from({ length: currentYear - firstYear + 1 }, (_, index) => currentYear - index),
    days, weeks, active_days: hasKnownDays ? days.filter(day => day.active_seconds > 0).length : null,
    total_active_seconds: hasKnownDays ? days.reduce((total, day) => total + (day.active_seconds || 0), 0) : null,
    qualifying_days: hasKnownDays ? days.filter(day => day.goal_met === true).length : null,
    current_streak: streak.current_streak, streak_window_limited: streak.history_limited, streak };
}

async function learningCourses(db, userId) {
  const query = ownerQuery(userId);
  const [enrollments, ownership, progress] = await Promise.all([
    db.collection('user_enrollments').find(query).toArray(),
    db.collection('user_courses').find(query).toArray(),
    db.collection('user_course_progress').find(query).toArray(),
  ]);
  // Progress is not evidence of ownership. This home projection deliberately
  // requires an enrollment, unlike the older all-courses dashboard projection.
  const ownedIds = identifiers([...enrollments, ...ownership]
    .filter(row => row.status == null || row.status === 'active')
    .map(row => row.course_id));
  if (!ownedIds.length) return { total: 0, courses: [] };
  const courses = await db.collection('courses').find({ $or: [
    { _id: { $in: ownedIds } }, { course_id: { $in: ownedIds } }, { id: { $in: ownedIds } },
  ] }).toArray();
  const current = [];
  for (const course of courses) {
    const aliases = new Set([course._id, course.course_id, course.id].filter(value => value != null).map(String));
    const row = progress.filter(item => aliases.has(String(item.course_id)))
      .sort((a, b) => timestamp(b.updated_at || b.last_accessed_at) - timestamp(a.updated_at || a.last_accessed_at))[0];
    const effectiveRow = row || { progress_percentage: 0, updated_at: null, last_accessed_at: null };
    const study = await getCourseStudyCurriculum(String(course.course_id || course._id), String(userId), { db });
    const percentage = study.learning_progress.progress_percentage;
    if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw failure('Tiến độ học tập chưa hợp lệ.', 503, 'HOME_PROGRESS_INVALID');
    }
    if (percentage >= 100) continue;
    current.push({ course, row: effectiveRow, percentage, aliases, study });
  }
  current.sort((a, b) => timestamp(b.row.updated_at || b.row.last_accessed_at) - timestamp(a.row.updated_at || a.row.last_accessed_at)
    || String(a.course._id).localeCompare(String(b.course._id)));
  const cards = await Promise.all(current.slice(0, HOME_COURSE_LIMIT).map(async ({ course, row, percentage, aliases, study }) => {
    const courseIds = identifiers([...aliases]);
    const [directLessons, lessonProgress, sections] = await Promise.all([
      db.collection('lessons').find({ course_id: { $in: courseIds } }).toArray(),
      db.collection('user_lesson_progress').find({ $and: [query, { course_id: { $in: courseIds } }] }).toArray(),
      db.collection('course_sections').find({ course_id: { $in: courseIds } }).toArray(),
    ]);
    const sectionIds = sections.flatMap(section => [section._id, section.section_id]).filter(Boolean);
    const sectionLessons = sectionIds.length ? await db.collection('lessons').find({
      section_id: { $in: [...sectionIds, ...sectionIds.map(String)] },
    }).toArray() : [];
    const lessons = [...new Map([...directLessons, ...sectionLessons]
      .map(lesson => [String(lesson.lesson_id || lesson._id), lesson])).values()];
    const sectionOrder = new Map();
    for (const section of sections) {
      for (const id of [section._id, section.section_id].filter(value => value != null)) {
        sectionOrder.set(String(id), section.order_index ?? section.order ?? 0);
      }
    }
    lessons.sort((a, b) => (sectionOrder.get(String(a.section_id)) ?? 0) - (sectionOrder.get(String(b.section_id)) ?? 0)
      || (a.order_index ?? a.order ?? a.lesson_number ?? 0) - (b.order_index ?? b.order ?? b.lesson_number ?? 0)
      || String(a.lesson_id || a._id).localeCompare(String(b.lesson_id || b._id)));
    const completed = new Set((row.completed_lesson_ids || []).map(String));
    for (const item of lessonProgress) {
      if (item.is_completed === true || item.status === 'completed') completed.add(String(item.lesson_id));
    }
    const remaining = lessons.filter(lesson => ![lesson._id, lesson.lesson_id].some(id => id != null && completed.has(String(id))));
    const resume = remaining.find(lesson => [lesson.lesson_id, lesson._id]
      .some(id => id != null && String(id) === String(row.last_accessed_lesson_id))) || remaining[0] || lessons[0];
    const resumeLessonData = study.actions.resume_learning?.lesson_id
      ? { lesson_id: study.actions.resume_learning.lesson_id, title: study.actions.resume_learning.title }
      : (resume ? { lesson_id: String(resume.lesson_id || resume._id), title: resume.title || 'Tiếp tục bài học' } : null);
    const thumbnailUrl = course.thumbnail_url || course.thumbnail || course.image || null;
    return { course_id: String(course.course_id || course._id), title: course.title,
      thumbnail_url: thumbnailUrl,
      progress_percentage: percentage, last_studied_at: row.updated_at || row.last_accessed_at || null,
      resume_lesson: resumeLessonData };
  }));
  return { total: current.length, courses: cards };
}

async function roadmapSummary(db, userId) {
  const roadmap = await db.collection('user_roadmaps').findOne({ user_id: userId, is_active: true }, { sort: { updated_at: -1 } });
  if (!roadmap) return null;
  const progress = calculateRoadmapProgress(roadmap.nodes || []);
  return { roadmap_id: String(roadmap._id), category_id: roadmap.category_id,
    career_name: roadmap.career_name, current_stage_id: roadmap.current_stage_id || null, ...progress };
}

async function totalRecordedCourseLearningSeconds(db, userId) {
  const rows = await db.collection('user_course_progress').find(ownerQuery(userId), {
    projection: { course_id: 1, total_learning_time_seconds: 1 },
  }).toArray();
  const perCourse = new Map();
  for (const row of rows) {
    const seconds = row.total_learning_time_seconds ?? 0;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      throw failure('Tổng thời gian học chưa hợp lệ.', 503, 'HOME_LEARNING_TIME_INVALID');
    }
    const courseId = String(row.course_id ?? row._id);
    perCourse.set(courseId, Math.max(perCourse.get(courseId) ?? 0, seconds));
  }
  const recorded = await getRecordedCourseLearningTimes(userId, { db });
  // Canonicalize both old progress IDs and the session target IDs before merging.
  const courses = await db.collection('courses').find({}).toArray();
  const canonicalIds = new Map();
  for (const course of courses) {
    const canonical = String(course.course_id || course._id);
    for (const id of [course.course_id, course._id, course.id].filter(id => id != null)) canonicalIds.set(String(id), canonical);
  }
  const merged = new Map();
  for (const [id, seconds] of [...perCourse, ...recorded]) {
    const canonical = canonicalIds.get(id) || id;
    merged.set(canonical, Math.max(merged.get(canonical) || 0, seconds));
  }
  return [...merged.values()].reduce((total, seconds) => total + seconds, 0);
}

/** Read-only home contract. Identity comes from requireAuth; options are server-side dependencies. */
export async function getHomeOverview(userId, options = {}) {
  const objectId = owner(userId);
  const db = options.db || await getMongoDb();
  const user = await db.collection('users').findOne({ _id: objectId },
    { projection: { full_name: 1, status: 1, is_active: 1 } });
  if (!user) throw failure('Tài khoản không tồn tại.', 404, 'HOME_USER_NOT_FOUND');
  if (user.is_active === false || user.status === 'locked') throw failure('Tài khoản không được phép truy cập.', 403, 'HOME_USER_FORBIDDEN');
  const now = options.now ?? new Date();
  const preferences = await getLearningPreferences(userId, { db });
  const timezone = preferences.timezone;
  const localNow = learningDateParts(now, timezone);
  if (!localNow) throw failure('Mốc thời gian không hợp lệ.', 400, 'HOME_TIME_INVALID');
  const year = selectedYear(options.year, Number(localNow.date.slice(0, 4)));
  const [myLearning, roadmap, recommendationFeed, history, totalLearningSeconds] = await Promise.all([
    learningCourses(db, userId), roadmapSummary(db, userId),
    getPersonalizedCourseFeed({ userId, page: 1, limit: HOME_COURSE_LIMIT, dbInstance: db, excludeOwned: true }),
    getRecordedLearningIntervals(userId, new Date(-8640000000000000), new Date(now), { db }),
    totalRecordedCourseLearningSeconds(db, userId),
  ]);
  const { streak, ...activity } = summarizeHomeLearningActivity(history.intervals,
    { now, timezone, year, recordedSince: history.recorded_since });
  activity.total_learning_seconds = totalLearningSeconds;
  const hour = Number(learningDateParts(now, timezone).timeOnly.slice(0, 2));
  return { user: { full_name: user.full_name || null },
    greeting: hour < 12 ? 'Chào buổi sáng,' : hour < 18 ? 'Chào buổi chiều,' : 'Chào buổi tối,',
    timezone, my_learning: myLearning, roadmap,
    recommendations: {
      personalized: recommendationFeed.preferences !== null,
      behavior_weight: recommendationFeed.blend.behavior_weight,
      interactions: recommendationFeed.blend.interactions,
      courses: recommendationFeed.courses.slice(0, HOME_COURSE_LIMIT).map((course) => ({
        id: course.id,
        course_id: course.course_id,
        title: course.title,
        slug: course.slug,
        short_description: null,
        description: null,
        category_id: null,
        level: course.level,
        duration_minutes: course.duration_minutes,
        price: course.price?.sale ?? null,
        original_price: course.price?.original ?? null,
        thumbnail_url: course.thumbnail_url,
        status: course.status,
        rating: course.rating,
        total_reviews: course.total_reviews,
        total_students: course.total_students,
        instructor_id: course.instructor?.id ?? null,
        instructor_name: course.instructor?.name ?? null,
        instructor_avatar: course.instructor?.avatar_url ?? null,
        instructor: {
          id: course.instructor?.id ?? null,
          name: course.instructor?.name ?? null,
          avatar_url: course.instructor?.avatar_url ?? null,
        },
        badge: course.badge,
        language: course.language,
        tag_ids: (course.tags || []).map((tag) => String(tag.tag_id ?? tag.id)).filter(Boolean),
        tag_names: (course.tags || []).map((tag) => String(tag.name ?? tag.tag_name ?? '')).filter(Boolean),
        recommend_score: course.recommend_score,
        recommendation_method: course.recommendation_method,
      })),
    },
    learning_activity: activity, learning_streak: streak,
    generated_at: new Date(now).toISOString() };
}

export function createHomeRouter(express, requireAuth, options = {}) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireAuth);
  router.get('/', async (req, res) => {
    try {
      if (Object.keys(req.query).some(key => key !== 'year')) throw failure('Trang chủ chỉ nhận tham số year.', 400, 'HOME_QUERY_INVALID');
      res.json({ success: true, data: await getHomeOverview(req.userId, { ...options, year: req.query.year ?? options.year }) });
    } catch (error) {
      const known = typeof error.code === 'string' && error.code.startsWith('HOME_') && error.status >= 400 && error.status < 500;
      res.status(known ? error.status : 503).json({ success: false,
        code: known ? error.code : 'HOME_UNAVAILABLE',
        message: known ? error.message : 'Chưa thể tải trang chủ. Vui lòng thử lại.' });
    }
  });
  return router;
}
