import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import {
  ADMIN_NOTIFICATIONS_COLLECTION,
  createAdminNotification,
  ensureAdminNotificationIndexes,
  getAdminNotificationSummary,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from '../notifications.admin.js';

const ADMIN_ID = '65f123456789abcdef012345';
const OTHER_ADMIN_ID = '65f123456789abcdef012346';

function normalize(value) {
  if (value instanceof ObjectId) return String(value);
  if (value instanceof Date) return value.getTime();
  return value;
}

function compare(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sameValue(actual, expected) {
  if (expected === null) return actual === null || actual === undefined;
  return normalize(actual) === normalize(expected);
}

function matchesValue(actual, expected) {
  if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
    if ('$lt' in expected) return compare(actual, expected.$lt) < 0;
    if ('$ne' in expected) return !sameValue(actual, expected.$ne);
  }
  return sameValue(actual, expected);
}

function matches(doc, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((clause) => matches(doc, clause));
    return matchesValue(doc[key], expected);
  });
}

class MockCollection {
  constructor(documents = []) {
    this.documents = documents.map((doc) => ({ ...doc }));
    this.indexes = [];
  }

  async findOne(query = {}) {
    return this.documents.find((doc) => matches(doc, query)) ?? null;
  }

  async updateOne(query, update, options = {}) {
    let doc = this.documents.find((item) => matches(item, query));
    if (!doc && options.upsert) {
      doc = { ...update.$setOnInsert };
      doc._id = `anf_${'0'.repeat(64)}`.slice(0, 68);
      const { randomUUID } = await import('node:crypto');
      doc._id = `anf_${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
      this.documents.push(doc);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: doc._id };
    }
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$set) Object.assign(doc, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(query, update) {
    const targets = this.documents.filter((doc) => matches(doc, query));
    for (const doc of targets) {
      if (update.$set) Object.assign(doc, update.$set);
    }
    return { matchedCount: targets.length, modifiedCount: targets.length };
  }

  find(query = {}) {
    const matched = this.documents.filter((doc) => matches(doc, query));
    const chain = {
      sort: (spec) => {
        const [[field, direction]] = Object.entries(spec);
        matched.sort((left, right) => compare(left[field], right[field]) * direction);
        return chain;
      },
      limit: (count) => {
        matched.length = Math.min(matched.length, count);
        return chain;
      },
      toArray: async () => matched,
    };
    return chain;
  }

  aggregate(pipeline) {
    const match = pipeline.find((stage) => stage.$match)?.$match ?? {};
    const matched = this.documents.filter((doc) => matches(doc, match));
    const groups = new Map();
    for (const doc of matched) {
      const row = groups.get(doc.type) ?? { _id: doc.type, total: 0, unread: 0 };
      row.total += 1;
      if (doc.read_at === null || doc.read_at === undefined) row.unread += 1;
      groups.set(doc.type, row);
    }
    return { toArray: async () => [...groups.values()] };
  }

  async createIndex(spec, options) {
    this.indexes.push({ spec, options });
    return options?.name;
  }
}

class MockDb {
  constructor(documents = []) {
    this.collectionInstance = new MockCollection(documents);
  }

  collection(name) {
    assert.equal(name, ADMIN_NOTIFICATIONS_COLLECTION);
    return this.collectionInstance;
  }
}

function notification(id, type, createdAt, readAt = null, adminId = ADMIN_ID) {
  return {
    _id: id,
    admin_id: new ObjectId(adminId),
    type,
    severity: 'info',
    title: `Thông báo ${type}`,
    message: 'Nội dung',
    href: '/',
    event_key: `${type}.event`,
    dedupe_key: `dedupe-${id}`,
    created_at: new Date(createdAt),
    read_at: readAt ? new Date(readAt) : null,
  };
}

const ID_A = `anf_${'a'.repeat(64)}`;
const ID_B = `anf_${'b'.repeat(64)}`;
const ID_C = `anf_${'c'.repeat(64)}`;
const ID_OTHER = `anf_${'d'.repeat(64)}`;

test('P3 list: chỉ trả thông báo của admin hiện tại, mới nhất trước', async () => {
  const db = new MockDb([
    notification(ID_A, 'security', '2026-11-01T08:00:00Z'),
    notification(ID_B, 'order', '2026-11-02T08:00:00Z'),
    notification(ID_OTHER, 'order', '2026-11-03T08:00:00Z', null, OTHER_ADMIN_ID),
  ]);

  const page = await listAdminNotifications(ADMIN_ID, {}, { db });
  assert.deepEqual(page.items.map((item) => item.id), [ID_B, ID_A]);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
});

test('P3 list: cursor phân trang ổn định và báo hasMore đúng', async () => {
  const db = new MockDb([
    notification(ID_A, 'security', '2026-11-01T08:00:00Z'),
    notification(ID_B, 'order', '2026-11-02T08:00:00Z'),
    notification(ID_C, 'ticket', '2026-11-03T08:00:00Z'),
  ]);

  const first = await listAdminNotifications(ADMIN_ID, { limit: '2' }, { db });
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);

  const second = await listAdminNotifications(ADMIN_ID, { limit: '2', cursor: first.nextCursor }, { db });
  assert.equal(second.items.length, 1);
  assert.equal(second.hasMore, false);
  assert.equal(second.items[0].id, ID_A);
});

test('P3 list: lọc chưa đọc và loại thông báo, cursor hỏng bị từ chối', async () => {
  const db = new MockDb([
    notification(ID_A, 'security', '2026-11-01T08:00:00Z', '2026-11-01T09:00:00Z'),
    notification(ID_B, 'order', '2026-11-02T08:00:00Z'),
  ]);

  const unread = await listAdminNotifications(ADMIN_ID, { unread: 'true' }, { db });
  assert.deepEqual(unread.items.map((item) => item.id), [ID_B]);

  const orders = await listAdminNotifications(ADMIN_ID, { type: 'order' }, { db });
  assert.deepEqual(orders.items.map((item) => item.id), [ID_B]);

  await assert.rejects(
    () => listAdminNotifications(ADMIN_ID, { cursor: 'not-a-cursor' }, { db }),
    (error) => error.code === 'NOTIFICATION_CURSOR_INVALID',
  );
  await assert.rejects(
    () => listAdminNotifications(ADMIN_ID, { type: 'unknown' }, { db }),
    (error) => error.code === 'NOTIFICATION_TYPE_INVALID',
  );
  await assert.rejects(
    () => listAdminNotifications(ADMIN_ID, { limit: '999' }, { db }),
    /giới hạn/,
  );
});

test('P3 summary: đếm tổng/chưa đọc/đã đọc theo loại và bỏ qua admin khác', async () => {
  const db = new MockDb([
    notification(ID_A, 'security', '2026-11-01T08:00:00Z'),
    notification(ID_B, 'security', '2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z'),
    notification(ID_C, 'order', '2026-11-03T08:00:00Z'),
    notification(ID_OTHER, 'order', '2026-11-04T08:00:00Z', null, OTHER_ADMIN_ID),
  ]);

  const summary = await getAdminNotificationSummary(ADMIN_ID, { db });
  assert.equal(summary.total, 3);
  assert.equal(summary.unread, 2);
  assert.equal(summary.read, 1);
  assert.deepEqual(summary.byType.security, { total: 2, unread: 1 });
  assert.deepEqual(summary.byType.order, { total: 1, unread: 1 });
  assert.deepEqual(summary.byType.payout, { total: 0, unread: 0 });
});

test('P3 read: đánh dấu đã đọc đúng id và chặn đọc chéo admin', async () => {
  const db = new MockDb([
    notification(ID_A, 'security', '2026-11-01T08:00:00Z'),
    notification(ID_OTHER, 'security', '2026-11-02T08:00:00Z', null, OTHER_ADMIN_ID),
  ]);

  const result = await markAdminNotificationRead(ADMIN_ID, ID_A, { db, now: '2026-11-05T10:00:00Z' });
  assert.equal(result.notification.readAt, '2026-11-05T10:00:00.000Z');

  await assert.rejects(
    () => markAdminNotificationRead(ADMIN_ID, ID_OTHER, { db }),
    (error) => error.code === 'NOTIFICATION_NOT_FOUND',
  );
  await assert.rejects(
    () => markAdminNotificationRead(ADMIN_ID, 'bad-id', { db }),
    (error) => error.code === 'NOTIFICATION_ID_INVALID',
  );
});

test('P3 read-all: chỉ cập nhật hộp thư của admin hiện tại', async () => {
  const db = new MockDb([
    notification(ID_A, 'security', '2026-11-01T08:00:00Z'),
    notification(ID_B, 'order', '2026-11-02T08:00:00Z'),
    notification(ID_OTHER, 'order', '2026-11-03T08:00:00Z', null, OTHER_ADMIN_ID),
  ]);

  const result = await markAllAdminNotificationsRead(ADMIN_ID, { db });
  assert.equal(result.changed, 2);
  const other = db.collectionInstance.documents.find((doc) => String(doc.admin_id) === OTHER_ADMIN_ID);
  assert.equal(other.read_at, null);
});

test('P3 dedupe: cùng dedupe key chỉ tạo một bản ghi và trả created=false lần sau', async () => {
  const db = new MockDb();
  const input = {
    type: 'security',
    severity: 'warning',
    title: 'Đăng nhập thất bại',
    message: 'Có 5 lần đăng nhập sai liên tiếp.',
    href: '/users/students',
    eventKey: 'admin.security.bruteforce',
    dedupeKey: `admin:${ADMIN_ID}:bruteforce:2026-11-02`,
  };

  const first = await createAdminNotification(ADMIN_ID, input, { db });
  assert.equal(first.created, true);
  const second = await createAdminNotification(ADMIN_ID, input, { db });
  assert.equal(second.created, false);
  assert.equal(db.collectionInstance.documents.length, 1);
  assert.equal(db.collectionInstance.documents[0].read_at, null);
});

test('P3 dedupe: hai admin khác nhau có thể nhận cùng event key', async () => {
  const db = new MockDb();
  const input = {
    type: 'security',
    title: 'Sự kiện bảo mật',
    message: 'Mô tả',
    eventKey: 'admin.security.event',
    dedupeKey: 'shared-dedupe',
  };

  assert.equal((await createAdminNotification(ADMIN_ID, input, { db })).created, true);
  assert.equal((await createAdminNotification(OTHER_ADMIN_ID, input, { db })).created, true);
  assert.equal(db.collectionInstance.documents.length, 2);
});

test('P3 validation: loại, href ngoài hệ thống và nội dung quá dài bị từ chối', async () => {
  const db = new MockDb();
  const base = {
    type: 'order',
    title: 'Đơn hàng mới',
    message: 'Có đơn hàng cần xử lý.',
    eventKey: 'admin.order.created',
    dedupeKey: 'order-1',
  };

  await assert.rejects(
    () => createAdminNotification(ADMIN_ID, { ...base, type: 'promo' }, { db }),
    (error) => error.code === 'NOTIFICATION_TYPE_INVALID',
  );
  await assert.rejects(
    () => createAdminNotification(ADMIN_ID, { ...base, href: 'https://evil.example' }, { db }),
    /Đường dẫn/,
  );
  await assert.rejects(
    () => createAdminNotification(ADMIN_ID, { ...base, title: 'x'.repeat(161) }, { db }),
    /Tiêu đề/,
  );
  await assert.rejects(
    () => createAdminNotification(ADMIN_ID, { ...base, dedupeKey: '' }, { db }),
    /Dedupe key/,
  );
  await assert.rejects(
    () => createAdminNotification('not-an-object-id', base, { db }),
    (error) => error.status === 401,
  );
});

test('P3 index: tạo index hộp thư, chưa đọc và dedupe duy nhất', async () => {
  const db = new MockDb();
  await ensureAdminNotificationIndexes(db);

  const names = db.collectionInstance.indexes.map((entry) => entry.options.name);
  assert.deepEqual(names, ['admin_created', 'admin_unread', 'admin_dedupe']);
  const dedupe = db.collectionInstance.indexes.find((entry) => entry.options.name === 'admin_dedupe');
  assert.equal(dedupe.options.unique, true);
});
