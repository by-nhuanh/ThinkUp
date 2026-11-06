/**
 * P3/P4 — Admin notification core.
 *
 * The collection is scoped by `admin_id`; every read path filters on the
 * authenticated admin, so one admin can never observe another admin's inbox.
 * Writes are idempotent through a per-admin unique `dedupe_key`.
 */
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../user/db.js';

export const ADMIN_NOTIFICATIONS_COLLECTION = 'admin_notifications';

export const ADMIN_NOTIFICATION_TYPES = Object.freeze([
  'security',
  'order',
  'ticket',
  'complaint',
  'payout',
  'course',
]);

export const ADMIN_NOTIFICATION_SEVERITIES = Object.freeze(['info', 'warning', 'critical']);

export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;
export const MAX_NOTIFICATION_PAGE_SIZE = 50;

function failure(message, status = 400, code = 'NOTIFICATION_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

function requireAdminId(adminId) {
  if (typeof adminId !== 'string' || !/^[a-f0-9]{24}$/i.test(adminId.trim())) {
    // Tests may inject ObjectId values directly; production always passes the JWT string.
    if (adminId instanceof ObjectId) return adminId;
    throw failure('Yêu cầu đăng nhập quản trị viên.', 401, 'NOTIFICATION_AUTH_REQUIRED');
  }
  return new ObjectId(adminId.trim());
}

function adminObjectId(adminId) {
  const value = requireAdminId(adminId);
  return value instanceof ObjectId ? value : new ObjectId(value);
}

function notificationId(value) {
  if (typeof value !== 'string' || !/^anf_[a-f0-9]{64}$/.test(value)) {
    throw failure('Mã thông báo không hợp lệ.', 400, 'NOTIFICATION_ID_INVALID');
  }
  return value;
}

function boundedText(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw failure(`${name} không hợp lệ.`);
  }
  return value.trim();
}

function internalHref(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 512) {
    throw failure('Đường dẫn điều hướng không hợp lệ.');
  }
  return value;
}

function normalizeLimit(value) {
  if (value === undefined) return DEFAULT_NOTIFICATION_PAGE_SIZE;
  if (!/^[1-9]\d*$/.test(String(value))) throw failure('Tham số phân trang không hợp lệ.');
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > MAX_NOTIFICATION_PAGE_SIZE) {
    throw failure('Số lượng thông báo vượt giới hạn.');
  }
  return limit;
}

function encodeCursor(doc) {
  const payload = JSON.stringify({ at: new Date(doc.created_at).toISOString(), id: String(doc._id) });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (typeof value !== 'string' || !value || value.length > 512) {
    throw failure('Con trỏ phân trang không hợp lệ.', 400, 'NOTIFICATION_CURSOR_INVALID');
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw failure('Con trỏ phân trang không hợp lệ.', 400, 'NOTIFICATION_CURSOR_INVALID');
  }
  const at = new Date(decoded?.at);
  const id = decoded?.id;
  if (!Number.isFinite(at.getTime()) || typeof id !== 'string' || !id) {
    throw failure('Con trỏ phân trang không hợp lệ.', 400, 'NOTIFICATION_CURSOR_INVALID');
  }
  return { at, id };
}

function view(doc, timezone = 'Asia/Ho_Chi_Minh') {
  const formatter = safeFormatter(timezone);
  return {
    id: String(doc._id),
    type: doc.type,
    severity: doc.severity || 'info',
    title: doc.title,
    message: doc.message,
    href: doc.href || null,
    eventKey: doc.event_key,
    createdAt: new Date(doc.created_at).toISOString(),
    createdAtLocal: formatter ? formatter.format(new Date(doc.created_at)) : null,
    readAt: doc.read_at ? new Date(doc.read_at).toISOString() : null,
  };
}

function safeFormatter(timezone) {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return null;
  }
}

function normalizeNewNotification(input) {
  if (!input || typeof input !== 'object') {
    throw failure('Dữ liệu thông báo không hợp lệ.');
  }
  if (!ADMIN_NOTIFICATION_TYPES.includes(input.type)) {
    throw failure('Loại thông báo không hợp lệ.', 400, 'NOTIFICATION_TYPE_INVALID');
  }
  const severity = input.severity === undefined ? 'info' : input.severity;
  if (!ADMIN_NOTIFICATION_SEVERITIES.includes(severity)) {
    throw failure('Mức độ thông báo không hợp lệ.');
  }
  return {
    type: input.type,
    severity,
    title: boundedText(input.title, 'Tiêu đề', 160),
    message: boundedText(input.message, 'Nội dung', 500),
    href: internalHref(input.href),
    event_key: boundedText(input.eventKey, 'Event key', 120),
    dedupe_key: boundedText(input.dedupeKey, 'Dedupe key', 160),
  };
}

/**
 * Creates (or ignores an already-delivered) admin notification.
 * Returns `{ created, id }`; never throws for duplicates.
 */
export async function createAdminNotification(adminId, input, options = {}) {
  const owner = adminObjectId(adminId);
  const payload = normalizeNewNotification(input);
  const db = options.db || (await getMongoDb());
  const collection = db.collection(ADMIN_NOTIFICATIONS_COLLECTION);
  const createdAt = options.now ? new Date(options.now) : new Date();
  const document = {
    _id: `anf_${crypto.randomBytes(32).toString('hex')}`,
    admin_id: owner,
    ...payload,
    created_at: createdAt,
    read_at: null,
  };

  try {
    const result = await collection.updateOne(
      { admin_id: owner, dedupe_key: payload.dedupe_key },
      { $setOnInsert: document },
      { upsert: true },
    );
    const created = Boolean(result?.upsertedCount ?? result?.upsertedId);
    return { created, id: String(result?.upsertedId || document._id) };
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await collection.findOne({ admin_id: owner, dedupe_key: payload.dedupe_key });
      return { created: false, id: existing ? String(existing._id) : null };
    }
    throw error;
  }
}

export async function listAdminNotifications(adminId, query = {}, options = {}) {
  const owner = adminObjectId(adminId);
  const limit = normalizeLimit(query.limit);
  const filter = { admin_id: owner, deleted_at: null };

  if (query.type !== undefined && query.type !== 'all') {
    if (!ADMIN_NOTIFICATION_TYPES.includes(query.type)) {
      throw failure('Loại thông báo không hợp lệ.', 400, 'NOTIFICATION_TYPE_INVALID');
    }
    filter.type = query.type;
  }
  if (query.unread !== undefined && !['true', 'false', true, false].includes(query.unread)) {
    throw failure('Bộ lọc chưa đọc không hợp lệ.');
  }
  if (query.unread === true || query.unread === 'true') filter.read_at = null;

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    filter.$or = [
      { created_at: { $lt: cursor.at } },
      { created_at: cursor.at, _id: { $lt: cursor.id } },
    ];
  }

  const documents = await (options.db || (await getMongoDb()))
    .collection(ADMIN_NOTIFICATIONS_COLLECTION)
    .find(filter)
    .sort({ created_at: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = documents.length > limit;
  const page = documents.slice(0, limit);
  const timezone = options.timezone || 'Asia/Ho_Chi_Minh';
  return {
    success: true,
    items: page.map((doc) => view(doc, timezone)),
    pageSize: limit,
    hasMore,
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function getAdminNotificationSummary(adminId, options = {}) {
  const owner = adminObjectId(adminId);
  const groups = await (options.db || (await getMongoDb()))
    .collection(ADMIN_NOTIFICATIONS_COLLECTION)
    .aggregate([
      { $match: { admin_id: owner, deleted_at: null } },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$read_at', null] }, null] }, 1, 0] } },
        },
      },
    ])
    .toArray();

  const byType = Object.fromEntries(ADMIN_NOTIFICATION_TYPES.map((type) => [type, { total: 0, unread: 0 }]));
  let total = 0;
  let unread = 0;
  for (const row of groups) {
    if (!Object.hasOwn(byType, row._id)) continue;
    byType[row._id] = { total: row.total, unread: row.unread };
    total += row.total;
    unread += row.unread;
  }
  return { success: true, total, unread, read: total - unread, byType };
}

export async function markAdminNotificationRead(adminId, id, options = {}) {
  const owner = adminObjectId(adminId);
  const notification = notificationId(id);
  const db = options.db || (await getMongoDb());
  const collection = db.collection(ADMIN_NOTIFICATIONS_COLLECTION);
  const readAt = options.now ? new Date(options.now) : new Date();

  await collection.updateOne(
    { _id: notification, admin_id: owner, read_at: null },
    { $set: { read_at: readAt } },
  );
  const doc = await collection.findOne({ _id: notification, admin_id: owner });
  if (!doc) throw failure('Không tìm thấy thông báo.', 404, 'NOTIFICATION_NOT_FOUND');
  return { success: true, notification: view(doc, options.timezone) };
}

export async function markAllAdminNotificationsRead(adminId, options = {}) {
  const owner = adminObjectId(adminId);
  const readAt = options.now ? new Date(options.now) : new Date();
  const result = await (options.db || (await getMongoDb()))
    .collection(ADMIN_NOTIFICATIONS_COLLECTION)
    .updateMany({ admin_id: owner, read_at: null, deleted_at: null }, { $set: { read_at: readAt } });
  return { success: true, changed: result?.modifiedCount ?? 0 };
}

/** Index plan for the new collection. Idempotent; safe to call on startup. */
export async function ensureAdminNotificationIndexes(db) {
  const collection = (db || (await getMongoDb())).collection(ADMIN_NOTIFICATIONS_COLLECTION);
  await collection.createIndex({ admin_id: 1, created_at: -1, _id: -1 }, { name: 'admin_created' });
  await collection.createIndex({ admin_id: 1, read_at: 1 }, { name: 'admin_unread' });
  await collection.createIndex(
    { admin_id: 1, dedupe_key: 1 },
    { name: 'admin_dedupe', unique: true },
  );
}

export function createAdminNotificationsRouter(express, requireAdmin) {
  if (typeof requireAdmin !== 'function') {
    throw new Error('createAdminNotificationsRouter requires admin auth middleware');
  }
  const router = express.Router();

  router.get('/summary', requireAdmin, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await getAdminNotificationSummary(req.adminId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/', requireAdmin, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await listAdminNotifications(req.adminId, req.query || {}));
    } catch (error) {
      next(error);
    }
  });

  router.post('/read-all', requireAdmin, async (req, res, next) => {
    try {
      res.json(await markAllAdminNotificationsRead(req.adminId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/read', requireAdmin, async (req, res, next) => {
    try {
      res.json(await markAdminNotificationRead(req.adminId, req.params.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
