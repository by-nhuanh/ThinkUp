import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { setupAdminPassword } from '../auth.admin.js';
import { publishAdminSecurityNotification } from '../auth.admin.js';
import {
  ADMIN_NOTIFICATIONS_COLLECTION,
  ensureAdminNotificationIndexes,
} from '../../notifications/notifications.admin.js';

const ADMIN_ID = '65f123456789abcdef012345';

function sameValue(actual, expected) {
  if (expected instanceof ObjectId) return String(actual) === String(expected);
  if (expected instanceof Date) return new Date(actual).getTime() === expected.getTime();
  return actual === expected;
}

function matches(doc, query) {
  return Object.entries(query).every(([key, expected]) => sameValue(doc[key], expected));
}

class MockCollection {
  constructor(documents = []) {
    this.documents = documents.map((doc) => ({ ...doc }));
    this.indexes = [];
  }

  async findOne(query = {}) {
    return this.documents.find((doc) => matches(doc, query)) ?? null;
  }

  async insertOne(doc) {
    const stored = { ...doc };
    if (!stored._id) stored._id = new ObjectId();
    this.documents.push(stored);
    return { insertedId: stored._id };
  }

  async updateOne(query, update, options = {}) {
    let doc = this.documents.find((item) => matches(item, query));
    if (!doc && options.upsert) {
      doc = { ...update.$setOnInsert };
      if (!doc._id) doc._id = new ObjectId();
      this.documents.push(doc);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: doc._id };
    }
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$set) Object.assign(doc, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async createIndex(spec, options) {
    this.indexes.push({ spec, options });
    return options?.name;
  }
}

class MockDb {
  constructor({ notificationsFail = false } = {}) {
    this.collections = new Map();
    this.notificationsFail = notificationsFail;
  }

  collection(name) {
    if (name === ADMIN_NOTIFICATIONS_COLLECTION && this.notificationsFail) {
      throw new Error('notifications collection unavailable');
    }
    if (!this.collections.has(name)) this.collections.set(name, new MockCollection());
    return this.collections.get(name);
  }
}

function adminDocument() {
  return {
    _id: ADMIN_ID,
    email: 'admin.lead@thinkup.vn',
    full_name: 'Lead Admin',
    role: 'SUPER_ADMIN',
    status: 'INVITED',
    invite_token: 'valid_invite_token_123',
    invite_expires_at: new Date(Date.now() + 24 * 3600 * 1000),
  };
}

test('P4 producer: sự kiện bảo mật tạo thông báo đúng schema và href nội bộ', async () => {
  const db = new MockDb();
  const result = await publishAdminSecurityNotification(db, ADMIN_ID, {
    type: 'security',
    severity: 'critical',
    title: 'Tài khoản quản trị bị khóa tạm thời',
    message: 'Phát hiện 5 lần đăng nhập sai liên tiếp.',
    href: '/auth/change-password',
    eventKey: 'admin.security.account-locked',
    dedupeKey: `admin.security.account-locked:${ADMIN_ID}:2026-11-03T07:00:00.000Z`,
  });

  assert.equal(result.created, true);
  const stored = db.collection(ADMIN_NOTIFICATIONS_COLLECTION).documents[0];
  assert.equal(String(stored.admin_id), ADMIN_ID);
  assert.equal(stored.type, 'security');
  assert.equal(stored.severity, 'critical');
  assert.equal(stored.href, '/auth/change-password');
  assert.equal(stored.event_key, 'admin.security.account-locked');
  assert.equal(stored.dedupe_key, `admin.security.account-locked:${ADMIN_ID}:2026-11-03T07:00:00.000Z`);
  assert.equal(stored.read_at, null);
  assert.ok(stored.created_at instanceof Date);
});

test('P4 producer: cùng dedupe key không nhân đôi thông báo', async () => {
  const db = new MockDb();
  const payload = {
    type: 'security',
    severity: 'info',
    title: 'Xác thực hai lớp đã được bật',
    message: 'Tài khoản đã bật 2FA.',
    href: '/auth/backup-codes',
    eventKey: 'admin.security.2fa-enabled',
    dedupeKey: `admin.security.2fa-enabled:${ADMIN_ID}`,
  };

  assert.equal((await publishAdminSecurityNotification(db, ADMIN_ID, payload)).created, true);
  assert.equal((await publishAdminSecurityNotification(db, ADMIN_ID, payload)).created, false);
  assert.equal(db.collection(ADMIN_NOTIFICATIONS_COLLECTION).documents.length, 1);
});

test('P4 producer: lỗi collection/index không làm hỏng luồng xác thực', async () => {
  const db = new MockDb({ notificationsFail: true });
  const result = await publishAdminSecurityNotification(db, ADMIN_ID, {
    type: 'security',
    severity: 'warning',
    title: 'Mật khẩu quản trị vừa được đổi',
    message: 'Mật khẩu đã được đổi.',
    href: '/auth/change-password',
    eventKey: 'admin.security.password-rotated',
    dedupeKey: 'rotate-1',
  });

  assert.deepEqual(result, { created: false, id: null });

  // Admin id sai cũng bị nuốt lỗi thay vì ném ra ngoài.
  const invalid = await publishAdminSecurityNotification(new MockDb(), 'not-an-id', {
    type: 'security',
    severity: 'info',
    title: 'Sự kiện',
    message: 'Nội dung',
    eventKey: 'admin.security.event',
    dedupeKey: 'event-1',
  });
  assert.deepEqual(invalid, { created: false, id: null });
});

test('P4 producer: thiết lập mật khẩu lần đầu phát thông báo bảo mật thật', async () => {
  const db = new MockDb();
  const admins = db.collection('admins');
  await admins.insertOne(adminDocument());

  const response = await setupAdminPassword(
    {
      inviteToken: 'valid_invite_token_123',
      newPassword: 'StrongAdminPassword@2026',
      confirmPassword: 'StrongAdminPassword@2026',
    },
    { db },
  );

  assert.equal(response.success, true);
  const notifications = db.collection(ADMIN_NOTIFICATIONS_COLLECTION).documents;
  assert.equal(notifications.length, 1);
  const notification = notifications[0];
  assert.equal(String(notification.admin_id), ADMIN_ID);
  assert.equal(notification.event_key, 'admin.security.password-initialized');
  assert.equal(notification.href, '/auth/setup-2fa');
  assert.equal(notification.dedupe_key, `admin.security.password-initialized:${ADMIN_ID}`);
  assert.match(notification.message, /admin\.lead@thinkup\.vn/);

  // Hai lần gọi cùng sự kiện chỉ tạo một bản ghi.
  await publishAdminSecurityNotification(db, ADMIN_ID, {
    type: 'security',
    severity: 'info',
    title: notification.title,
    message: notification.message,
    href: notification.href,
    eventKey: notification.event_key,
    dedupeKey: notification.dedupe_key,
  });
  assert.equal(db.collection(ADMIN_NOTIFICATIONS_COLLECTION).documents.length, 1);
});

test('P4 producer: index thông báo vẫn tạo được cho collection mới', async () => {
  const db = new MockDb();
  await ensureAdminNotificationIndexes(db);
  const names = db.collection(ADMIN_NOTIFICATIONS_COLLECTION).indexes.map((entry) => entry.options.name);
  assert.deepEqual(names, ['admin_created', 'admin_unread', 'admin_dedupe']);
});
