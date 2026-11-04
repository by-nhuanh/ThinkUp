import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import {
  ADMIN_PREFERENCES_COLLECTION,
  DEFAULT_ADMIN_PREFERENCES,
  ensureAdminPreferencesIndexes,
  getAdminPreferences,
  isValidIanaTimezone,
  normalizePreferences,
  saveAdminPreferences,
} from '../preferences.admin.js';

const ADMIN_ID = '65f123456789abcdef012345';
const OTHER_ADMIN_ID = '65f123456789abcdef012346';

function sameValue(left, right) {
  if (right instanceof ObjectId) return String(left) === String(right);
  if (right instanceof Date) return new Date(left).getTime() === right.getTime();
  return left === right;
}

function matches(doc, query) {
  return Object.entries(query).every(([key, expected]) => sameValue(doc[key], expected));
}

class MockCollection {
  constructor(documents = []) {
    this.documents = documents.map((doc) => ({ ...doc }));
    this.indexes = [];
    this.updates = [];
  }

  async findOne(query = {}) {
    return this.documents.find((doc) => matches(doc, query)) ?? null;
  }

  async insertOne(doc) {
    if (this.documents.some((item) => item.admin_id === doc.admin_id)) {
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    }
    this.documents.push(doc);
    return { insertedId: doc._id };
  }

  async updateOne(query, update) {
    this.updates.push({ query, update });
    const doc = this.documents.find((item) => matches(item, query));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) {
      for (const [key, amount] of Object.entries(update.$inc)) {
        doc[key] = (doc[key] || 0) + amount;
      }
    }
    return { matchedCount: 1, modifiedCount: 1 };
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
    assert.equal(name, ADMIN_PREFERENCES_COLLECTION);
    return this.collectionInstance;
  }
}

test('P2 GET: chưa có bản ghi trả mặc định, revision 0, isDefault true', async () => {
  const db = new MockDb();
  const result = await getAdminPreferences(ADMIN_ID, { db });

  assert.equal(result.success, true);
  assert.deepEqual(result.preferences, DEFAULT_ADMIN_PREFERENCES);
  assert.equal(result.revision, 0);
  assert.equal(result.isDefault, true);
});

test('P2 GET: bản ghi của admin khác không bị đọc nhầm', async () => {
  const db = new MockDb([
    {
      admin_id: OTHER_ADMIN_ID,
      preferences: { ...DEFAULT_ADMIN_PREFERENCES, theme: 'dark' },
      revision: 4,
    },
  ]);
  const result = await getAdminPreferences(ADMIN_ID, { db });

  assert.equal(result.revision, 0);
  assert.equal(result.preferences.theme, 'light');
});

test('P2 PUT: lưu lần đầu tạo revision 1 và giữ nguyên timestamp UTC dạng Date', async () => {
  const db = new MockDb();
  const now = new Date('2026-11-02T08:00:00.000Z');
  const result = await saveAdminPreferences(
    ADMIN_ID,
    {
      revision: 0,
      preferences: {
        ...DEFAULT_ADMIN_PREFERENCES,
        breadcrumbsVisible: true,
        statusBarEnabled: true,
      },
    },
    { db, now },
  );

  assert.equal(result.revision, 1);
  assert.equal(result.preferences.breadcrumbsVisible, true);
  const stored = db.collectionInstance.documents[0];
  assert.equal(stored.admin_id, ADMIN_ID);
  assert.ok(stored.created_at instanceof Date);
  assert.equal(stored.created_at.toISOString(), now.toISOString());
});

test('P2 PUT: revision cũ trả 409 PREFERENCES_CONFLICT kèm current', async () => {
  const db = new MockDb([
    {
      _id: new ObjectId(),
      admin_id: ADMIN_ID,
      preferences: { ...DEFAULT_ADMIN_PREFERENCES, theme: 'dark' },
      revision: 3,
    },
  ]);

  await assert.rejects(
    () => saveAdminPreferences(ADMIN_ID, {
      revision: 2,
      preferences: DEFAULT_ADMIN_PREFERENCES,
    }, { db }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'PREFERENCES_CONFLICT');
      assert.equal(error.current.revision, 3);
      assert.equal(error.current.preferences.theme, 'dark');
      return true;
    },
  );
});

test('P2 PUT: revision đúng tăng bộ đếm và chỉ cập nhật đúng document', async () => {
  const db = new MockDb([
    {
      _id: new ObjectId(),
      admin_id: ADMIN_ID,
      preferences: DEFAULT_ADMIN_PREFERENCES,
      revision: 1,
    },
    {
      _id: new ObjectId(),
      admin_id: OTHER_ADMIN_ID,
      preferences: DEFAULT_ADMIN_PREFERENCES,
      revision: 9,
    },
  ]);

  const result = await saveAdminPreferences(ADMIN_ID, {
    revision: 1,
    preferences: { ...DEFAULT_ADMIN_PREFERENCES, density: 'compact' },
  }, { db });

  assert.equal(result.revision, 2);
  assert.equal(result.preferences.density, 'compact');
  const other = db.collectionInstance.documents.find((doc) => doc.admin_id === OTHER_ADMIN_ID);
  assert.equal(other.revision, 9);
});

test('P2 validation: theme, density, boolean và revision sai đều bị từ chối', async () => {
  assert.throws(() => normalizePreferences({ theme: 'sepia' }), /Chủ đề/);
  assert.throws(() => normalizePreferences({ density: 'huge' }), /Mật độ/);
  assert.throws(() => normalizePreferences({ breadcrumbsVisible: 'yes' }), /boolean/);
  assert.throws(() => normalizePreferences(null), /không hợp lệ/);

  const db = new MockDb();
  await assert.rejects(
    () => saveAdminPreferences(ADMIN_ID, { revision: -1, preferences: {} }, { db }),
    (error) => error.code === 'PREFERENCES_REVISION_INVALID',
  );
  await assert.rejects(
    () => saveAdminPreferences(ADMIN_ID, { revision: 1.5, preferences: {} }, { db }),
    (error) => error.code === 'PREFERENCES_REVISION_INVALID',
  );
});

test('P2 validation: IANA timezone chấp nhận DST và từ chối chuỗi rác', () => {
  assert.equal(isValidIanaTimezone('Asia/Ho_Chi_Minh'), true);
  assert.equal(isValidIanaTimezone('America/New_York'), true);
  assert.equal(isValidIanaTimezone('Europe/Berlin'), true);
  assert.equal(isValidIanaTimezone('UTC'), true);
  assert.equal(isValidIanaTimezone('Asia/Not_A_City'), false);
  assert.equal(isValidIanaTimezone('+07:00'), false);
  assert.equal(isValidIanaTimezone(''), false);
  assert.equal(isValidIanaTimezone('x'.repeat(65)), false);
  assert.equal(isValidIanaTimezone(null), false);

  // DST thực tế: New York đổi offset giữa mùa đông và mùa hè.
  const winter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .format(new Date('2026-01-15T12:00:00Z'));
  const summer = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .format(new Date('2026-07-15T12:00:00Z'));
  assert.notEqual(winter, summer);
});

test('P2 security: thiếu adminId bị chặn 401 ở cả đọc và ghi', async () => {
  const db = new MockDb();
  await assert.rejects(() => getAdminPreferences('', { db }), (error) => error.status === 401);
  await assert.rejects(
    () => saveAdminPreferences(null, { revision: 0, preferences: {} }, { db }),
    (error) => error.status === 401,
  );
});

test('P2 index: tạo unique index theo admin_id', async () => {
  const db = new MockDb();
  await ensureAdminPreferencesIndexes(db);
  assert.deepEqual(db.collectionInstance.indexes[0], {
    spec: { admin_id: 1 },
    options: { name: 'admin_unique', unique: true },
  });
});
