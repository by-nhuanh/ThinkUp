import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';

export const COLLECTION_LEARNING_ACTIVITY = 'learning_activity_sessions';
export const ACTIVITY_HEARTBEAT_SECONDS = 30;
export const ACTIVITY_MAX_GAP_SECONDS = 60;
export const ACTIVITY_SESSION_SECONDS = 2 * 60 * 60;
const MIN_HEARTBEAT_MILLISECONDS = 10_000;

function failure(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}
function owner(userId) {
  if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) {
    throw failure('Yêu cầu đăng nhập bằng tài khoản hợp lệ.', 401, 'ACTIVITY_AUTH_REQUIRED');
  }
  return userId;
}
function sessionIdentifier(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) {
    throw failure('Mã phiên học không hợp lệ.', 400, 'ACTIVITY_SESSION_INVALID');
  }
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\u0000-\u001f]/.test(value)) {
    throw failure('Mã nội dung học không hợp lệ.', 400, 'ACTIVITY_TARGET_INVALID');
  }
  return value;
}
function instant(options) {
  const value = options.now ?? new Date();
  if (!(value instanceof Date) || !Number.isFinite(+value)) {
    throw failure('Mốc thời gian không hợp lệ.', 400, 'ACTIVITY_TIME_INVALID');
  }
  return new Date(value);
}
function aliases(values) {
  const strings = [...new Set(values.filter(value => value != null).map(String))];
  return [...strings, ...strings.filter(value => /^[a-f\d]{24}$/i.test(value)).map(value => new ObjectId(value))];
}
function ownerQuery(userId) {
  const id = new ObjectId(userId);
  return { $or: [{ user_id: userId }, { user_id: id }, { userId: userId }, { userId: id }] };
}

/** Validate ownership again on every event, including when a course is revoked or a roadmap changes. */
async function accessibleTarget(db, userId, kind, target) {
  if (kind === 'lesson') {
    const courseId = identifier(target?.course_id), lessonId = identifier(target?.lesson_id);
    const course = await db.collection('courses').findOne({ $or: [
      { _id: { $in: aliases([courseId]) } }, { course_id: courseId }, { slug: courseId },
    ] });
    if (!course) throw failure('Không tìm thấy khóa học.', 404, 'ACTIVITY_TARGET_NOT_FOUND');
    const courseIds = aliases([course._id, course.course_id, course.id]);
    const access = { $and: [ownerQuery(userId), { course_id: { $in: courseIds } }] };
    const [enrollment, ownership] = await Promise.all([
      db.collection('user_enrollments').find(access).toArray(),
      db.collection('user_courses').find(access).toArray(),
    ]);
    if (![...enrollment, ...ownership].some(row => row.status == null || row.status === 'active')) {
      throw failure('Bạn không có quyền học khóa này.', 403, 'ACTIVITY_ACCESS_DENIED');
    }
    const lesson = await db.collection('lessons').findOne({ $and: [
      { course_id: { $in: courseIds } },
      { $or: [{ lesson_id: lessonId }, { _id: { $in: aliases([lessonId]) } }] },
    ] });
    if (!lesson) throw failure('Bài học không thuộc khóa học này.', 404, 'ACTIVITY_TARGET_NOT_FOUND');
    return { course_id: String(course.course_id || course._id), lesson_id: String(lesson.lesson_id || lesson._id) };
  }
  if (kind === 'flashcard') {
    const listId = identifier(target?.list_id);
    if (!/^[a-f\d]{24}$/i.test(listId)) throw failure('Mã bộ flashcard không hợp lệ.', 400, 'ACTIVITY_TARGET_INVALID');
    const list = await db.collection('flashcard_lists').findOne({ _id: new ObjectId(listId), user_id: userId });
    if (!list) throw failure('Không tìm thấy bộ flashcard của bạn.', 404, 'ACTIVITY_TARGET_NOT_FOUND');
    if (!Array.isArray(list.cards) || !list.cards.length) {
      throw failure('Bộ flashcard chưa có nội dung học.', 409, 'ACTIVITY_CONTENT_EMPTY');
    }
    return { list_id: String(list._id) };
  }
  if (kind === 'roadmap_quiz') {
    const stageId = identifier(target?.stage_id);
    const roadmap = await db.collection('user_roadmaps').findOne({ user_id: userId, is_active: true }, { sort: { updated_at: -1 } });
    if (!roadmap || (target.roadmap_id != null && String(roadmap._id) !== target.roadmap_id)
      || !(roadmap.nodes || []).some(node => String(node.stage_id) === stageId)) {
      throw failure('Giai đoạn không thuộc lộ trình hiện tại của bạn.', 404, 'ACTIVITY_TARGET_NOT_FOUND');
    }
    const question = await db.collection('roadmap_stage_questions').findOne({ stage_id: stageId });
    if (!question) throw failure('Giai đoạn chưa có câu hỏi.', 409, 'ACTIVITY_CONTENT_EMPTY');
    return { roadmap_id: String(roadmap._id), stage_id: stageId };
  }
  throw failure('Loại hoạt động học không hợp lệ.', 400, 'ACTIVITY_KIND_INVALID');
}

function sessionView(session) {
  return { session_id: session._id, kind: session.kind, target: session.target,
    state: session.state, sequence: session.sequence, next_sequence: session.sequence + 1,
    active_seconds: Math.floor(session.credited_milliseconds / 1000),
    created_at: session.created_at, expires_at: session.expires_at,
    heartbeat_seconds: ACTIVITY_HEARTBEAT_SECONDS, max_gap_seconds: ACTIVITY_MAX_GAP_SECONDS };
}

/** Creating/reading a session awards no time. All instants originate on the server. */
export async function startLearningActivity(userId, kind, target, options = {}) {
  owner(userId);
  const db = options.db || await getMongoDb();
  const canonical = await accessibleTarget(db, userId, kind, target);
  const now = instant(options);
  const session = { _id: randomUUID(), user_id: userId, kind, target: canonical,
    state: 'ready', sequence: 0, credited_milliseconds: 0, intervals: [],
    created_at: now, last_seen_at: now, expires_at: new Date(+now + ACTIVITY_SESSION_SECONDS * 1000), last_event: null };
  await db.collection(COLLECTION_LEARNING_ACTIVITY).insertOne(session);
  return sessionView(session);
}

/** Recover sequence/state after a lost response or a conflicting event. Reading awards no time. */
export async function getLearningActivitySession(userId, sessionId, options = {}) {
  owner(userId); sessionIdentifier(sessionId);
  const db = options.db || await getMongoDb();
  const session = await db.collection(COLLECTION_LEARNING_ACTIVITY).findOne({ _id: sessionId, user_id: userId });
  if (!session) throw failure('Không tìm thấy phiên học của bạn.', 404, 'ACTIVITY_SESSION_NOT_FOUND');
  await accessibleTarget(db, userId, session.kind, session.target);
  const result = sessionView(session);
  if (session.state !== 'finished' && +instant(options) >= +session.expires_at) result.state = 'expired';
  if (['finished', 'expired'].includes(result.state)) result.next_sequence = null;
  return result;
}

function validateEvent(action, payload) {
  const keys = action === 'heartbeat' ? ['sequence', 'active'] : ['sequence'];
  if (!['heartbeat', 'pause', 'finish'].includes(action) || !payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).some(key => !keys.includes(key))
    || !Number.isSafeInteger(payload.sequence) || payload.sequence < 1 || payload.sequence >= Number.MAX_SAFE_INTEGER
    || (action === 'heartbeat' && typeof payload.active !== 'boolean')) {
    throw failure('Tín hiệu phiên học không hợp lệ.', 400, 'ACTIVITY_EVENT_INVALID');
  }
}

/**
 * Consecutive active signals bound elapsed time; they do not prove human attention.
 * First/resumed/late signals only arm a new interval. Explicit inactive signals
 * discard their preceding interval. No endpoint accepts client durations or dates.
 */
export async function recordLearningActivity(userId, sessionId, action, payload, options = {}) {
  owner(userId);
  sessionIdentifier(sessionId);
  validateEvent(action, payload);
  const db = options.db || await getMongoDb();
  const collection = db.collection(COLLECTION_LEARNING_ACTIVITY);
  const session = await collection.findOne({ _id: sessionId, user_id: userId });
  if (!session) throw failure('Không tìm thấy phiên học của bạn.', 404, 'ACTIVITY_SESSION_NOT_FOUND');
  await accessibleTarget(db, userId, session.kind, session.target);
  const signature = JSON.stringify([action, action === 'heartbeat' ? payload.active : null]);
  const replay = doc => doc.sequence === payload.sequence && doc.last_event === signature;
  if (replay(session)) return sessionView(session);
  if (payload.sequence !== session.sequence + 1) {
    throw failure('Thứ tự tín hiệu phiên học không khớp.', 409, 'ACTIVITY_SEQUENCE_CONFLICT');
  }
  const now = instant(options);
  if (session.state === 'finished' || +now >= +session.expires_at) {
    throw failure('Phiên học đã kết thúc hoặc hết hạn.', 410, 'ACTIVITY_SESSION_CLOSED');
  }
  const elapsed = +now - +session.last_seen_at;
  if (!Number.isFinite(elapsed) || elapsed < 0) throw failure('Đồng hồ phiên học không hợp lệ.', 503, 'ACTIVITY_CLOCK_INVALID');
  if (action === 'heartbeat' && session.state === 'tracking' && payload.active && elapsed < MIN_HEARTBEAT_MILLISECONDS) {
    throw failure('Tín hiệu được gửi quá sớm. Vui lòng đợi.', 409, 'ACTIVITY_HEARTBEAT_TOO_SOON');
  }
  const credit = session.state === 'tracking' && (action !== 'heartbeat' || payload.active)
    && elapsed <= ACTIVITY_MAX_GAP_SECONDS * 1000 ? elapsed : 0;
  const state = action === 'finish' ? 'finished' : action === 'pause' || !payload.active ? 'paused' : 'tracking';
  const update = { $set: { state, sequence: payload.sequence, last_event: signature,
    last_seen_at: now, credited_milliseconds: session.credited_milliseconds + credit } };
  if (credit > 0) update.$push = { intervals: { started_at: session.last_seen_at, ended_at: now } };
  const updated = await collection.findOneAndUpdate({ _id: sessionId, user_id: userId, sequence: session.sequence }, update,
    { returnDocument: 'after' });
  if (updated) return sessionView(updated);
  const concurrent = await collection.findOne({ _id: sessionId, user_id: userId });
  if (concurrent && replay(concurrent)) return sessionView(concurrent);
  throw failure('Phiên học vừa được cập nhật. Vui lòng đồng bộ lại.', 409, 'ACTIVITY_SEQUENCE_CONFLICT');
}

/** Preserve intervals beyond the display window; do not use the 30-day profile logs. */
export async function getRecordedLearningIntervals(userId, from, to, options = {}) {
  owner(userId);
  if (!(from instanceof Date) || !(to instanceof Date) || !Number.isFinite(+from) || !Number.isFinite(+to) || +from > +to) {
    throw failure('Khoảng thống kê không hợp lệ.', 400, 'ACTIVITY_RANGE_INVALID');
  }
  const db = options.db || await getMongoDb();
  const collection = db.collection(COLLECTION_LEARNING_ACTIVITY);
  const first = await collection.findOne({ user_id: userId }, { sort: { created_at: 1 }, projection: { created_at: 1 } });
  if (!first) return { recorded_since: null, intervals: [] };
  const sessions = await collection.find({ user_id: userId, created_at: { $lte: to }, expires_at: { $gt: from } },
    { projection: { intervals: 1 } }).toArray();
  return { recorded_since: first.created_at, intervals: sessions.flatMap(session => session.intervals) };
}

export function sendLearningActivityError(res, error) {
  const known = typeof error.code === 'string' && error.code.startsWith('ACTIVITY_') && error.status >= 400 && error.status < 500;
  return res.status(known ? error.status : 503).json({ success: false,
    code: known ? error.code : 'ACTIVITY_UNAVAILABLE',
    message: known ? error.message : 'Chưa thể xử lý phiên học. Vui lòng thử lại.' });
}

export function createLearningActivityStartHandler(kind, selectTarget, allowedFields, options = {}) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const body = req.body ?? {};
      if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedFields.includes(key))
        || Object.keys(req.query || {}).length) throw failure('Dữ liệu mở phiên học không hợp lệ.', 400, 'ACTIVITY_TARGET_INVALID');
      res.status(201).json({ success: true, data: await startLearningActivity(req.userId, kind, selectTarget(req), options) });
    } catch (error) { sendLearningActivityError(res, error); }
  };
}

export function createLearningActivityRouter(express, requireAuth, options = {}) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireAuth);
  router.get('/sessions/:sessionId', async (req, res) => {
    try {
      if (Object.keys(req.query).length) throw failure('Phiên học không nhận query.', 400, 'ACTIVITY_EVENT_INVALID');
      res.json({ success: true, data: await getLearningActivitySession(req.userId, req.params.sessionId, options) });
    } catch (error) { sendLearningActivityError(res, error); }
  });
  for (const action of ['heartbeat', 'pause', 'finish']) {
    router.post(`/sessions/:sessionId/${action}`, async (req, res) => {
      try {
        if (Object.keys(req.query).length) throw failure('Tín hiệu phiên học không nhận query.', 400, 'ACTIVITY_EVENT_INVALID');
        res.json({ success: true, data: await recordLearningActivity(req.userId, req.params.sessionId, action, req.body, options) });
      } catch (error) { sendLearningActivityError(res, error); }
    });
  }
  return router;
}

/** Read-only course totals from server-credited intervals; merge concurrent tabs. */
export async function getRecordedCourseLearningTimes(userId, options = {}) {
  owner(userId);
  const db = options.db || await getMongoDb();
  const sessions = await db.collection(COLLECTION_LEARNING_ACTIVITY).find(ownerQuery(userId)).toArray();
  const grouped = new Map();
  for (const session of sessions) {
    if (session.kind !== 'lesson') continue;
    const courseId = session.target?.course_id;
    if (typeof courseId !== 'string' || !Array.isArray(session.intervals)) {
      throw failure('Dữ liệu thời gian khóa học không hợp lệ.', 503, 'ACTIVITY_TIME_INVALID');
    }
    const intervals = grouped.get(courseId) || [];
    for (const interval of session.intervals) {
      const start = +new Date(interval.started_at), end = +new Date(interval.ended_at);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        throw failure('Khoảng thời gian học không hợp lệ.', 503, 'ACTIVITY_TIME_INVALID');
      }
      intervals.push([start, end]);
    }
    grouped.set(courseId, intervals);
  }
  const totals = new Map();
  for (const [courseId, intervals] of grouped) {
    intervals.sort((a, b) => a[0] - b[0]);
    let start = null, end = null, milliseconds = 0;
    for (const [nextStart, nextEnd] of intervals) {
      if (start === null) { start = nextStart; end = nextEnd; }
      else if (nextStart <= end) end = Math.max(end, nextEnd);
      else { milliseconds += end - start; start = nextStart; end = nextEnd; }
    }
    if (start !== null) milliseconds += end - start;
    totals.set(courseId, Math.floor(milliseconds / 1000));
  }
  return totals;
}
