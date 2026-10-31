import { getLearningPreferences, learningDateParts } from '../learning-settings/learning-settings.user.js';
import { createHash } from 'node:crypto';
import { getMongoDb } from '../db.js';

export const COLLECTION_NOTIFICATIONS = 'notifications';
export const COLLECTION_NOTIFICATION_PREFS = 'notification_preferences';
export const UNDO_WINDOW_MS = 3000;
export const NOTIFICATION_KINDS = Object.freeze({
  learning: ['progress', 'milestone', 'reminder', 'quiz', 'certificate', 'course-update', 'achievement'],
  transactions: ['purchase', 'payment', 'promotion', 'voucher', 'refund'],
  security: ['login', 'password', 'email', 'system', 'alert', 'backup'],
  community: ['invitation'],
});
export const DEFAULT_NOTIFICATION_PREFS = Object.freeze({
  web: true, email: true, newsletter: false, learning: true, community: true,
  courseUpdates: true, marketing: false, security: true, dndUntil: null,
});
const PREFERENCE_SWITCHES = ['web', 'email', 'learning', 'community', 'courseUpdates'];
const DND_DURATIONS = [15, 60, 480, 1440];
const DELIVERY_TOPICS = ['learning', 'community', 'courseUpdates', 'marketing', 'security', 'transactions'];

function failure(message, status = 400, code = 'NOTIFICATION_INVALID') {
  return Object.assign(new Error(message), { status, code });
}
function text(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw failure(`${name} không hợp lệ.`);
  }
  return value.trim();
}
function owner(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw failure('Yêu cầu đăng nhập.', 401, 'NOTIFICATION_AUTH_REQUIRED');
  }
  return value;
}
function recordId(value) {
  if (typeof value !== 'string' || !/^ntf_[a-f0-9]{64}$/.test(value)) {
    throw failure('ID thông báo không hợp lệ.');
  }
  return value;
}
function now(options) {
  return new Date(options.now ?? Date.now());
}
async function database(options) {
  return options.db || await getMongoDb();
}
function view(doc) {
  return {
    id: doc._id, category: doc.category, kind: doc.kind,
    title: doc.title, message: doc.message, href: doc.href,
    createdAt: new Date(doc.created_at).toISOString(),
    readAt: doc.read_at ? new Date(doc.read_at).toISOString() : null,
  };
}
function positiveInteger(value, fallback, max) {
  if (value === undefined) return fallback;
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) {
    throw failure('Tham số phân trang không hợp lệ.');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max) throw failure('Tham số phân trang vượt giới hạn.');
  return number;
}
function listQuery(userId, query = {}) {
  const filter = { user_id: owner(userId), deleted_at: null };
  if (query.category !== undefined && query.category !== 'all') {
    if (typeof query.category !== 'string' || !Object.hasOwn(NOTIFICATION_KINDS, query.category)) {
      throw failure('Nhóm thông báo không hợp lệ.');
    }
    filter.category = query.category;
  }
  const sort = query.sort ?? 'newest';
  if (!['newest', 'oldest', 'unread'].includes(sort)) throw failure('Kiểu sắp xếp không hợp lệ.');
  if (query.unread !== undefined && ![true, false, 'true', 'false'].includes(query.unread)) {
    throw failure('Bộ lọc chưa đọc không hợp lệ.');
  }
  if (sort === 'unread' || query.unread === true || query.unread === 'true') filter.read_at = null;
  return {
    filter, direction: sort === 'oldest' ? 1 : -1,
    page: positiveInteger(query.page, 1, 100000),
    limit: positiveInteger(query.limit, 20, 100),
  };
}

/** Lists only the authenticated owner's non-deleted inbox. Dates are UTC ISO strings. */
export async function getUserNotifications(userId, query = {}, options = {}) {
  const { filter, direction, page, limit } = listQuery(userId, query);
  const db = await database(options);
  const { timezone } = await getLearningPreferences(userId, { db });
  const collection = db.collection(COLLECTION_NOTIFICATIONS);
  const [documents, total] = await Promise.all([
    collection.find(filter).sort({ created_at: direction, _id: direction })
      .skip((page - 1) * limit).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);
  return { timezone, items: documents.map(doc => ({ ...view(doc), createdAtLocal: learningDateParts(doc.created_at, timezone), readAtLocal: learningDateParts(doc.read_at, timezone) })), pagination: { page, limit, total, hasMore: page * limit < total } };
}

/** One aggregation keeps all counters internally consistent; independent of list filters/pages. */
export async function getNotificationSummary(userId, options = {}) {
  const id = owner(userId);
  const db = await database(options);
  const groups = await db.collection(COLLECTION_NOTIFICATIONS).aggregate([
    { $match: { user_id: id, deleted_at: null } },
    { $group: { _id: '$category', total: { $sum: 1 }, unread: {
      $sum: { $cond: [{ $eq: [{ $ifNull: ['$read_at', null] }, null] }, 1, 0] },
    } } },
  ]).toArray();
  const result = { totalCount: 0, unreadCount: 0, readCount: 0,
    countsByCategory: Object.fromEntries(Object.keys(NOTIFICATION_KINDS).map(key => [key, 0])),
    unreadCountsByCategory: Object.fromEntries(Object.keys(NOTIFICATION_KINDS).map(key => [key, 0])) };
  for (const row of groups) {
    if (!Object.hasOwn(NOTIFICATION_KINDS, row._id)) continue;
    result.totalCount += row.total;
    result.unreadCount += row.unread;
    result.countsByCategory[row._id] = row.total;
    result.unreadCountsByCategory[row._id] = row.unread;
  }
  result.readCount = result.totalCount - result.unreadCount;
  return result;
}

async function ownedNotification(userId, id, options, includeDeleted = false) {
  const filter = { _id: recordId(id), user_id: owner(userId) };
  if (!includeDeleted) filter.deleted_at = null;
  const collection = (await database(options)).collection(COLLECTION_NOTIFICATIONS);
  const doc = await collection.findOne(filter);
  if (!doc) throw failure('Không tìm thấy thông báo.', 404, 'NOTIFICATION_NOT_FOUND');
  return { collection, doc, filter };
}

export async function markNotificationRead(userId, id, options = {}) {
  const { collection, filter } = await ownedNotification(userId, id, options);
  const timestamp = now(options);
  await collection.updateOne({ ...filter, read_at: null }, { $set: { read_at: timestamp, updated_at: timestamp } });
  const doc = await collection.findOne(filter);
  if (!doc) throw failure('Không tìm thấy thông báo.', 404, 'NOTIFICATION_NOT_FOUND');
  return view(doc);
}

export async function markAllNotificationsRead(userId, options = {}) {
  const filter = { user_id: owner(userId), deleted_at: null, read_at: null };
  const timestamp = now(options);
  const result = await (await database(options)).collection(COLLECTION_NOTIFICATIONS)
    .updateMany(filter, { $set: { read_at: timestamp, updated_at: timestamp } });
  return { changed: result.modifiedCount };
}

export async function deleteNotification(userId, id, options = {}) {
  const { collection, doc } = await ownedNotification(userId, id, options, true);
  // Retrying DELETE never extends the undo window.
  const timestamp = doc.deleted_at || now(options);
  await collection.updateOne({ _id: doc._id, user_id: owner(userId), deleted_at: null },
    { $set: { deleted_at: timestamp, updated_at: timestamp } });
  const current = await collection.findOne({ _id: doc._id, user_id: userId });
  return { id, undoUntil: new Date(new Date(current.deleted_at).getTime() + UNDO_WINDOW_MS).toISOString() };
}

export async function restoreNotification(userId, id, options = {}) {
  const { collection, doc } = await ownedNotification(userId, id, options, true);
  const timestamp = now(options);
  if (!doc.deleted_at) return view(doc);
  if (timestamp.getTime() >= new Date(doc.deleted_at).getTime() + UNDO_WINDOW_MS) {
    throw failure('Đã hết thời gian hoàn tác.', 409, 'NOTIFICATION_UNDO_EXPIRED');
  }
  const result = await collection.updateOne({ _id: doc._id, user_id: userId, deleted_at: doc.deleted_at },
    { $set: { deleted_at: null, updated_at: timestamp } });
  if (!result.matchedCount) throw failure('Thông báo đã thay đổi. Vui lòng tải lại.', 409, 'NOTIFICATION_CONFLICT');
  return view({ ...doc, deleted_at: null });
}

function storageFailure() {
  return failure('Dữ liệu cấu hình thông báo chưa hợp lệ. Vui lòng thử lại.', 503, 'NOTIFICATION_STORAGE_ERROR');
}
function storedDate(value) {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw storageFailure();
  return date.toISOString();
}
function normalizeDnd(doc, timestamp) {
  const off = { mode: 'off', durationMinutes: null, startedAt: null, endsAt: null, active: false };
  if (!doc?.dnd) {
    if (doc?.dndUntil == null) return off;
    const endsAt = storedDate(doc.dndUntil);
    return Date.parse(endsAt) <= +timestamp ? off
      : { mode: 'timed', durationMinutes: null, startedAt: null, endsAt, active: true };
  }
  if (doc.dnd.mode === 'off') return off;
  if (!['timed', 'indefinite'].includes(doc.dnd.mode)) throw storageFailure();
  const startedAt = doc.dnd.startedAt == null ? null : storedDate(doc.dnd.startedAt);
  if (doc.dnd.mode === 'indefinite') {
    return { mode: 'indefinite', durationMinutes: null, startedAt, endsAt: null, active: true };
  }
  const endsAt = storedDate(doc.dnd.endsAt);
  if (doc.dnd.durationMinutes != null && !DND_DURATIONS.includes(doc.dnd.durationMinutes)) throw storageFailure();
  if (Date.parse(endsAt) <= +timestamp) return off;
  return { mode: 'timed', durationMinutes: doc.dnd.durationMinutes ?? null, startedAt, endsAt, active: true };
}
function preferencesView(doc, timestamp) {
  const prefs = {};
  for (const key of PREFERENCE_SWITCHES) {
    if (doc && Object.hasOwn(doc, key) && typeof doc[key] !== 'boolean') throw storageFailure();
    prefs[key] = doc?.[key] ?? DEFAULT_NOTIFICATION_PREFS[key];
  }
  let marketingOptIn = false;
  if (doc && Object.hasOwn(doc, 'marketingOptIn')) {
    if (typeof doc.marketingOptIn !== 'boolean') throw storageFailure();
    marketingOptIn = doc.marketingOptIn;
  } else {
    const legacy = ['newsletter', 'marketing'].filter(key => doc && Object.hasOwn(doc, key)).map(key => doc[key]);
    if (legacy.some(value => typeof value !== 'boolean')) throw storageFailure();
    // When old switches disagree, an explicit opt-out wins. Never silently expand marketing consent.
    marketingOptIn = legacy.length > 0 && legacy.every(value => value === true);
  }
  const revision = doc?.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw storageFailure();
  const dnd = normalizeDnd(doc, timestamp);
  return { ...prefs, marketingOptIn, newsletter: marketingOptIn, marketing: marketingOptIn,
    security: true, dnd, dndUntil: dnd.endsAt, revision, serverTime: timestamp.toISOString() };
}

export async function getNotificationPreferences(userId, options = {}) {
  const id = owner(userId);
  const doc = await (await database(options)).collection(COLLECTION_NOTIFICATION_PREFS).findOne({ _id: id });
  return preferencesView(doc, now(options));
}

function parseDnd(value, timestamp) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !['off', 'timed', 'indefinite'].includes(value.mode)) {
    throw failure('Chế độ không làm phiền không hợp lệ.');
  }
  const allowed = value.mode === 'timed' ? ['mode', 'durationMinutes'] : ['mode'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw failure('Trường không làm phiền không được hỗ trợ.');
  if (value.mode === 'timed' && !DND_DURATIONS.includes(value.durationMinutes)) {
    throw failure('Thời lượng không làm phiền phải là 15, 60, 480 hoặc 1440 phút.');
  }
  return { mode: value.mode,
    durationMinutes: value.mode === 'timed' ? value.durationMinutes : null,
    startedAt: value.mode === 'off' ? null : timestamp,
    endsAt: value.mode === 'timed' ? new Date(+timestamp + value.durationMinutes * 60_000) : null };
}

export async function updateNotificationPreferences(userId, payload, options = {}) {
  const id = owner(userId);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.keys(payload).length) {
    throw failure('Cấu hình thông báo không hợp lệ.');
  }
  const timestamp = now(options);
  const update = {};
  const marketingValues = [];
  const allowed = [...PREFERENCE_SWITCHES, 'newsletter', 'marketing', 'marketingOptIn', 'security',
    'dndUntil', 'dnd', 'expectedRevision'];
  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.includes(key)) throw failure('Trường cấu hình không được hỗ trợ.');
    if (key === 'expectedRevision') {
      if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
        throw failure('Phiên bản cấu hình không hợp lệ.');
      }
      continue;
    }
    if (key === 'dnd') {
      if (Object.hasOwn(payload, 'dndUntil')) throw failure('Chỉ gửi một cách cấu hình không làm phiền.');
      update.dnd = parseDnd(value, timestamp);
      continue;
    }
    if (key === 'dndUntil') {
      if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
        !Number.isFinite(Date.parse(value)) || Date.parse(value) <= timestamp.getTime())) {
        throw failure('Thời điểm kết thúc không làm phiền phải là thời gian tương lai hợp lệ.');
      }
      update.dnd = value === null ? parseDnd({ mode: 'off' }, timestamp)
        : { mode: 'timed', durationMinutes: null, startedAt: timestamp, endsAt: new Date(value) };
    } else {
      if (typeof value !== 'boolean') throw failure('Cấu hình bật/tắt phải là boolean.');
      if (key === 'security' && !value) {
        throw failure('Thông báo bảo mật là bắt buộc để bảo vệ an toàn tài khoản của bạn.', 400, 'NOTIFICATION_SECURITY_REQUIRED');
      }
      if (['newsletter', 'marketing', 'marketingOptIn'].includes(key)) marketingValues.push(value);
      else update[key] = value;
    }
  }
  if (marketingValues.some(value => value !== marketingValues[0])) {
    throw failure('Hai lựa chọn khuyến mãi phải có cùng trạng thái.', 400, 'NOTIFICATION_PREFERENCE_CONFLICT');
  }
  if (marketingValues.length) update.marketingOptIn = marketingValues[0];
  if (!Object.keys(update).length) throw failure('Thiếu trường cấu hình cần cập nhật.');
  if (Object.hasOwn(payload, 'dnd') && !Object.hasOwn(payload, 'expectedRevision')) {
    // Retrying a timed request with the same revision must never extend its deadline a second time.
    throw failure('Cần gửi phiên bản cấu hình khi thay đổi không làm phiền.', 400, 'NOTIFICATION_REVISION_REQUIRED');
  }
  const db = await database(options);
  const collection = db.collection(COLLECTION_NOTIFICATION_PREFS);
  const existing = await collection.findOne({ _id: id });
  const current = preferencesView(existing, timestamp);
  const conflict = () => failure('Cấu hình đã thay đổi. Vui lòng tải lại trước khi lưu.', 409, 'NOTIFICATION_CONFLICT');
  if (current.revision === Number.MAX_SAFE_INTEGER) throw conflict();
  if (Object.hasOwn(payload, 'expectedRevision') && payload.expectedRevision !== current.revision) throw conflict();
  const next = { _id: id, marketingOptIn: current.marketingOptIn, security: true,
    dnd: { mode: current.dnd.mode, durationMinutes: current.dnd.durationMinutes,
      startedAt: current.dnd.startedAt ? new Date(current.dnd.startedAt) : null,
      endsAt: current.dnd.endsAt ? new Date(current.dnd.endsAt) : null },
    revision: current.revision + 1, updated_at: timestamp };
  for (const key of PREFERENCE_SWITCHES) next[key] = current[key];
  Object.assign(next, update);
  if (!existing) {
    try { await collection.insertOne(next); }
    catch (error) { if (error.code === 11000) throw conflict(); throw error; }
  } else {
    const { _id, ...fields } = next;
    const result = await collection.updateOne({ _id, revision: Object.hasOwn(existing, 'revision')
      ? existing.revision : { $exists: false } },
    { $set: fields, $unset: { newsletter: '', marketing: '', dndUntil: '' } });
    if (!result.matchedCount) throw conflict();
  }
  return preferencesView(next, timestamp);
}

/** Internal delivery gate, separate from inbox creation. Call immediately before sending. */
export async function getNotificationDeliveryPolicy(userId, topic, options = {}) {
  owner(userId);
  if (!DELIVERY_TOPICS.includes(topic)) throw failure('Loại phân phối thông báo không hợp lệ.');
  if (topic === 'security') {
    // Critical auth mail must not depend on availability or values of optional preferences.
    return { inbox: true, email: true, web: true, reason: 'security_required', dndEndsAt: null };
  }
  const prefs = await getNotificationPreferences(userId, options);
  const enabled = topic === 'transactions' ? true : topic === 'marketing' ? prefs.marketingOptIn : prefs[topic];
  const muted = prefs.dnd.active;
  return { inbox: true, email: enabled && prefs.email && !muted, web: enabled && prefs.web && !muted,
    reason: !enabled ? 'topic_disabled' : muted ? 'dnd' : 'channel_preferences', dndEndsAt: prefs.dnd.endsAt };
}

/**
 * Internal producer ONLY: call after a verified business event, never from a public POST.
 * eventKey must identify the successful event, not an HTTP attempt. A deterministic _id
 * uses MongoDB's existing unique _id constraint without a migration/index side effect.
 * Inbox history is retained regardless of delivery preferences; email/DND delivery is separate.
 * options.session allows the caller to include creation in its business transaction.
 */
export async function createNotificationForEvent(userId, input, options = {}) {
  const id = owner(userId);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('Thiếu dữ liệu sự kiện.');
  const eventKey = text(input.eventKey, 'Mã sự kiện', 256);
  const category = input.category;
  if (typeof category !== 'string' || !Object.hasOwn(NOTIFICATION_KINDS, category) ||
    !NOTIFICATION_KINDS[category].includes(input.kind)) throw failure('Nhóm và loại thông báo không tương ứng.');
  const title = text(input.title, 'Tiêu đề', 200);
  const message = text(input.message, 'Nội dung', 2000);
  let href;
  if (input.href !== undefined) {
    href = text(input.href, 'Đường dẫn', 1000);
    if (!/^\/(?!\/)/.test(href) || /[\\\s\u0000-\u001f]/.test(href) || /%5c|%0[ad]/i.test(href)) {
      throw failure('Chỉ hỗ trợ đường dẫn nội bộ hợp lệ.');
    }
  }
  const sourceType = text(input.sourceType, 'Loại nguồn', 80);
  const sourceId = text(input.sourceId, 'ID nguồn', 256);
  const timestamp = now(options);
  const notificationId = `ntf_${createHash('sha256').update(JSON.stringify([id, eventKey])).digest('hex')}`;
  const doc = { _id: notificationId, user_id: id, category, kind: input.kind,
    title, message, ...(href ? { href } : {}), event_key: eventKey,
    source_type: sourceType, source_id: sourceId,
    created_at: timestamp, updated_at: timestamp, read_at: null, deleted_at: null };
  const collection = (await database(options)).collection(COLLECTION_NOTIFICATIONS);
  const writeOptions = { upsert: true, ...(options.session ? { session: options.session } : {}) };
  try {
    await collection.updateOne({ _id: notificationId }, { $setOnInsert: doc }, writeOptions);
  } catch (error) {
    // Concurrent upserts for the same event may race on the unique _id.
    if (error.code !== 11000 || options.session) throw error;
  }
  const saved = await collection.findOne({ _id: notificationId, user_id: id },
    options.session ? { session: options.session } : {});
  if (!saved) throw failure('Không thể lưu thông báo.', 503, 'NOTIFICATION_STORAGE_ERROR');
  return view(saved);
}

/** Reuses the application's authentication and central error handler. No producer endpoint. */
export function createNotificationRouter(express, requireAuth, options = {}) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handle = (operation) => async (req, res, next) => {
    try { res.json({ success: true, data: await operation(req) }); }
    catch (error) {
      // Do not expose driver errors through the application's central error handler.
      if (!error.code?.startsWith?.('NOTIFICATION_') || !error.status || error.status >= 500) {
        return next(failure('Không thể xử lý thông báo lúc này. Vui lòng thử lại.', 503, 'NOTIFICATION_UNAVAILABLE'));
      }
      next(error);
    }
  };
  router.get('/', handle(req => getUserNotifications(req.userId, req.query, options)));
  router.get('/summary', handle(req => getNotificationSummary(req.userId, options)));
  router.get('/latest', handle(req => getUserNotifications(req.userId, { limit: 5 }, options)));
  router.get('/preferences', handle(req => getNotificationPreferences(req.userId, options)));
  router.put('/preferences', handle(req => updateNotificationPreferences(req.userId, req.body, options)));
  router.patch('/read-all', handle(req => markAllNotificationsRead(req.userId, options)));
  router.patch('/:id/read', handle(req => markNotificationRead(req.userId, req.params.id, options)));
  router.delete('/:id', handle(req => deleteNotification(req.userId, req.params.id, options)));
  router.post('/:id/restore', handle(req => restoreNotification(req.userId, req.params.id, options)));
  return router;
}
