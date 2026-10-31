import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  COLLECTION_NOTIFICATIONS, COLLECTION_NOTIFICATION_PREFS, NOTIFICATION_KINDS,
  createNotificationForEvent, getUserNotifications, getNotificationSummary,
  markNotificationRead, markAllNotificationsRead, deleteNotification, restoreNotification,
  getNotificationPreferences, updateNotificationPreferences, createNotificationRouter,
  getNotificationDeliveryPolicy,
} from '../notification.user.js';

// Isolated storage double: no connection to the project's live MongoDB or user records.
// It supports only the Mongo operations exercised here; unsupported queries fail loudly.
function storage() {
  const tables = new Map();
  function matches(doc, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (value instanceof Date) return doc[key] instanceof Date && +doc[key] === +value;
      if (value && typeof value === 'object') {
        return Object.entries(value).every(([operator, expected]) => {
          if (operator === '$exists') return Object.hasOwn(doc, key) === expected;
          throw new Error(`Unsupported filter ${operator}`);
        });
      }
      return value === null ? doc[key] == null : doc[key] === value;
    });
  }
  return { tables, collection(name) {
    if (!tables.has(name)) tables.set(name, []);
    const rows = tables.get(name);
    return {
      async insertOne(doc) {
        if (rows.some(row => row._id === doc._id)) throw Object.assign(new Error('Duplicate key'), { code: 11000 });
        rows.push(structuredClone(doc));
        return { insertedId: doc._id };
      },
      async findOne(filter) { return structuredClone(rows.find(row => matches(row, filter)) ?? null); },
      async countDocuments(filter) { return rows.filter(row => matches(row, filter)).length; },
      find(filter) {
        let result = rows.filter(row => matches(row, filter));
        const cursor = {
          sort(order) { result.sort((a, b) => {
            for (const [key, direction] of Object.entries(order)) {
              if (a[key] < b[key]) return -direction;
              if (a[key] > b[key]) return direction;
            }
            return 0;
          }); return cursor; },
          skip(count) { result = result.slice(count); return cursor; },
          limit(count) { result = result.slice(0, count); return cursor; },
          async toArray() { return structuredClone(result); },
        };
        return cursor;
      },
      async updateOne(filter, update, options = {}) {
        let row = rows.find(row => matches(row, filter));
        const existing = Boolean(row);
        if (!row && options.upsert) {
          row = { ...structuredClone(filter), ...structuredClone(update.$setOnInsert || {}) };
          rows.push(row);
        }
        if (!row) return { matchedCount: 0, modifiedCount: 0 };
        const previous = JSON.stringify(row);
        Object.assign(row, structuredClone(update.$set || {}));
        for (const key of Object.keys(update.$unset || {})) delete row[key];
        return { matchedCount: existing ? 1 : 0, modifiedCount: previous === JSON.stringify(row) ? 0 : 1 };
      },
      async updateMany(filter, update) {
        let modifiedCount = 0;
        for (const row of rows.filter(row => matches(row, filter))) {
          Object.assign(row, structuredClone(update.$set));
          modifiedCount++;
        }
        return { modifiedCount };
      },
      aggregate(pipeline) {
        assert.deepEqual(Object.keys(pipeline[0]), ['$match']);
        assert.equal(pipeline[1].$group._id, '$category');
        assert.deepEqual(pipeline[1].$group.unread, {
          $sum: { $cond: [{ $eq: [{ $ifNull: ['$read_at', null] }, null] }, 1, 0] },
        });
        const grouped = new Map();
        for (const row of rows.filter(row => matches(row, pipeline[0].$match))) {
          const item = grouped.get(row.category) || { _id: row.category, total: 0, unread: 0 };
          item.total++;
          if (row.read_at == null) item.unread++;
          grouped.set(row.category, item);
        }
        return { async toArray() { return [...grouped.values()]; } };
      },
    };
  } };
}
const instant = Date.parse('2026-10-31T08:00:00Z');
function event(overrides = {}) {
  return { eventKey: 'payment:order-1', category: 'transactions', kind: 'payment',
    title: 'Thanh toán thành công', message: 'ThinkUp đã xác nhận thanh toán.',
    sourceType: 'order', sourceId: 'order-1', href: '/main/purchase', ...overrides };
}
function fixture() { return { db: storage(), now: instant }; }
const errorCode = (code) => error => error.code === code;

test('supports all kinds including community invitations, rejects category/kind mismatch and missing required event data', async () => {
  const options = fixture();
  for (const [category, kinds] of Object.entries(NOTIFICATION_KINDS)) {
    for (const kind of kinds) {
      const item = await createNotificationForEvent('alice', event({ category, kind, eventKey: kind }), options);
      assert.equal(item.category, category);
      assert.equal(item.kind, kind);
      assert.equal(item.readAt, null);
    }
  }
  assert.equal((await getNotificationSummary('alice', options)).totalCount, Object.values(NOTIFICATION_KINDS).flat().length);
  assert.equal((await getNotificationSummary('alice', options)).countsByCategory.community, 1);
  for (const patch of [{ category: 'invalid' }, { kind: 'quiz' }, { eventKey: '' },
    { title: '' }, { message: {} }, { sourceType: undefined }, { sourceId: undefined },
    { title: 'x'.repeat(201) }, { href: '//evil.example' }, { href: '/\\evil' },
    { href: 'https://evil.example' }, { href: '/%5cevil' }]) {
    await assert.rejects(createNotificationForEvent('alice', event(patch), options), errorCode('NOTIFICATION_INVALID'));
  }
  await assert.rejects(createNotificationForEvent('alice', null, options));
});

test('replayed events retain read/deleted state; event ID is unique per recipient', async () => {
  const options = fixture();
  const first = await createNotificationForEvent('alice', event(), options);
  await markNotificationRead('alice', first.id, options);
  await deleteNotification('alice', first.id, options);
  const retry = await createNotificationForEvent('alice', event({ title: 'retry' }), options);
  assert.equal(retry.id, first.id);
  assert.equal(retry.title, first.title);
  assert.ok(retry.readAt);
  assert.equal((await getUserNotifications('alice', {}, options)).items.length, 0);
  const other = await createNotificationForEvent('bob', event(), options);
  assert.notEqual(other.id, first.id);
  assert.equal(options.db.tables.get(COLLECTION_NOTIFICATIONS).length, 2);
});

test('filters, sorting, pagination, newest five, and global category counters', async () => {
  const options = fixture();
  for (let i = 0; i < 8; i++) {
    await createNotificationForEvent('alice', event({ eventKey: `order:${i}` }), { ...options, now: instant + i });
  }
  await createNotificationForEvent('alice', event({ eventKey: 'quiz', category: 'learning', kind: 'quiz' }), options);
  await createNotificationForEvent('bob', event(), options);
  const first = await getUserNotifications('alice', { limit: 5 }, options);
  assert.equal(first.items.length, 5);
  assert.equal(first.pagination.total, 9);
  assert.equal(first.pagination.hasMore, true);
  assert.ok(first.items[0].createdAt > first.items[1].createdAt);
  const next = await getUserNotifications('alice', { limit: 5, page: 2 }, options);
  assert.equal(next.items.length, 4);
  assert.equal(next.pagination.hasMore, false);
  assert.equal(new Set([...first.items, ...next.items].map(item => item.id)).size, 9);
  const oldest = await getUserNotifications('alice', { sort: 'oldest' }, options);
  assert.ok(oldest.items[0].createdAt <= oldest.items.at(-1).createdAt);
  await markNotificationRead('alice', first.items[0].id, options);
  assert.equal((await getUserNotifications('alice', { sort: 'unread' }, options)).pagination.total, 8);
  assert.equal((await getUserNotifications('alice', { unread: 'true', category: 'transactions' }, options)).pagination.total, 7);
  assert.equal((await getUserNotifications('alice', { category: 'security' }, options)).items.length, 0);
  assert.deepEqual(await getNotificationSummary('alice', options), {
    totalCount: 9, unreadCount: 8, readCount: 1,
    countsByCategory: { learning: 1, transactions: 8, security: 0, community: 0 },
    unreadCountsByCategory: { learning: 1, transactions: 7, security: 0, community: 0 },
  });
});

test('query validation prevents operator injection and excessive pagination', async () => {
  const options = fixture();
  for (const query of [{ category: { $ne: 'security' } }, { category: 'bad' }, { sort: 'bad' },
    { unread: {} }, { unread: 'yes' }, { page: 0 }, { page: [] }, { page: 1.5 },
    { limit: '2e1' }, { limit: 101 }, { page: '9007199254740993' }]) {
    await assert.rejects(getUserNotifications('alice', query, options), errorCode('NOTIFICATION_INVALID'));
  }
});

test('owner isolation applies to reading, deletion, restoration and mark-all', async () => {
  const options = fixture();
  const alice = await createNotificationForEvent('alice', event(), options);
  const bob = await createNotificationForEvent('bob', event(), options);
  for (const operation of [markNotificationRead, deleteNotification, restoreNotification]) {
    await assert.rejects(operation('bob', alice.id, options), errorCode('NOTIFICATION_NOT_FOUND'));
    await assert.rejects(operation('alice', 'invalid-id', options), errorCode('NOTIFICATION_INVALID'));
    await assert.rejects(operation('alice', `ntf_${'0'.repeat(64)}`, options), errorCode('NOTIFICATION_NOT_FOUND'));
  }
  assert.equal((await markAllNotificationsRead('alice', options)).changed, 1);
  assert.equal((await markAllNotificationsRead('alice', options)).changed, 0);
  assert.equal((await markNotificationRead('bob', bob.id, options)).readAt, new Date(instant).toISOString());
  const again = await markNotificationRead('bob', bob.id, { ...options, now: instant + 1000 });
  assert.equal(again.readAt, new Date(instant).toISOString());
  await assert.rejects(getUserNotifications(null, {}, options), errorCode('NOTIFICATION_AUTH_REQUIRED'));
  for (const operation of [getNotificationSummary, markAllNotificationsRead, getNotificationPreferences]) {
    await assert.rejects(operation(null, options), errorCode('NOTIFICATION_AUTH_REQUIRED'));
  }
});

test('soft deletion changes the correct counters; undo preserves the original read state', async () => {
  const options = fixture();
  const unread = await createNotificationForEvent('alice', event(), options);
  const read = await createNotificationForEvent('alice', event({ eventKey: 'other' }), options);
  await markNotificationRead('alice', read.id, options);
  const deletion = await deleteNotification('alice', unread.id, options);
  assert.equal(deletion.undoUntil, new Date(instant + 3000).toISOString());
  let summary = await getNotificationSummary('alice', options);
  assert.deepEqual([summary.totalCount, summary.unreadCount, summary.readCount], [1, 0, 1]);
  const retry = await deleteNotification('alice', unread.id, { ...options, now: instant + 2000 });
  assert.equal(retry.undoUntil, deletion.undoUntil);
  await assert.rejects(markNotificationRead('alice', unread.id, options), errorCode('NOTIFICATION_NOT_FOUND'));
  await markAllNotificationsRead('alice', options);
  const restored = await restoreNotification('alice', unread.id, { ...options, now: instant + 2999 });
  assert.equal(restored.readAt, null);
  assert.equal(restored.createdAt, unread.createdAt);
  await deleteNotification('alice', read.id, options);
  summary = await getNotificationSummary('alice', options);
  assert.deepEqual([summary.totalCount, summary.unreadCount, summary.readCount], [1, 1, 0]);
  assert.ok((await restoreNotification('alice', read.id, options)).readAt);
  await deleteNotification('alice', read.id, options);
  await assert.rejects(restoreNotification('alice', read.id, { ...options, now: instant + 3000 }),
    errorCode('NOTIFICATION_UNDO_EXPIRED'));
});

test('preferences are per-user, partial updates persist and security cannot be muted', async () => {
  const options = fixture();
  assert.equal((await getNotificationPreferences('alice', options)).security, true);
  const updated = await updateNotificationPreferences('alice', {
    learning: false, dndUntil: new Date(instant + 60000).toISOString(),
  }, options);
  assert.equal(updated.learning, false);
  assert.equal(updated.security, true);
  assert.equal((await getNotificationPreferences('bob', options)).learning, true);
  await updateNotificationPreferences('alice', { email: false }, options);
  assert.equal((await getNotificationPreferences('alice', options)).learning, false);
  await assert.rejects(updateNotificationPreferences('alice', { security: false }, options),
    errorCode('NOTIFICATION_SECURITY_REQUIRED'));
  for (const payload of [null, [], {}, { user_id: 'bob' }, { web: 'false' },
    { dndUntil: 'invalid' }, { dndUntil: new Date(instant).toISOString() }]) {
    await assert.rejects(updateNotificationPreferences('alice', payload, options));
  }
  assert.equal(options.db.tables.get(COLLECTION_NOTIFICATION_PREFS).length, 1);
});

test('database failures propagate and session is forwarded for transactional producers', async () => {
  const options = fixture();
  const original = options.db.collection.bind(options.db);
  const session = {};
  const observed = [];
  options.db.collection = name => {
    const collection = original(name);
    for (const key of ['updateOne', 'findOne']) {
      const operation = collection[key].bind(collection);
      collection[key] = async (...args) => { observed.push(args.at(-1).session); return operation(...args); };
    }
    return collection;
  };
  await createNotificationForEvent('alice', event(), { ...options, session });
  assert.deepEqual(observed, [session, session]);
  const broken = { db: { collection() { throw new Error('storage offline'); } } };
  await assert.rejects(getUserNotifications('alice', {}, broken), /storage offline/);
  await assert.rejects(getNotificationSummary('alice', broken), /storage offline/);
  await assert.rejects(createNotificationForEvent('alice', event(), broken), /storage offline/);
});

test('settings defaults have DND off, mandatory security, synchronized marketing and do not write on GET', async () => {
  const options = fixture();
  const prefs = await getNotificationPreferences('alice', options);
  assert.equal(prefs.revision, 0);
  assert.equal(prefs.security, true);
  assert.equal(prefs.marketingOptIn, false);
  assert.equal(prefs.newsletter, prefs.marketing);
  assert.deepEqual(prefs.dnd, { mode: 'off', durationMinutes: null, startedAt: null, endsAt: null, active: false });
  assert.equal(prefs.dndUntil, null);
  assert.equal(prefs.serverTime, new Date(instant).toISOString());
  assert.equal(options.db.tables.get(COLLECTION_NOTIFICATION_PREFS).length, 0);
});

test('marketing aliases share one stored field; conflicting values reject the whole request without partial writes', async () => {
  const options = fixture();
  let prefs = await updateNotificationPreferences('alice', { newsletter: true }, options);
  assert.equal(prefs.marketingOptIn, true);
  assert.equal(prefs.marketing, true);
  assert.equal(prefs.revision, 1);
  prefs = await updateNotificationPreferences('alice', { marketing: false, expectedRevision: 1 }, options);
  assert.equal(prefs.newsletter, false);
  assert.equal(prefs.marketingOptIn, false);
  await assert.rejects(updateNotificationPreferences('alice', { email: false, newsletter: false, marketing: true }, options),
    errorCode('NOTIFICATION_PREFERENCE_CONFLICT'));
  assert.equal((await getNotificationPreferences('alice', options)).email, true);
  prefs = await updateNotificationPreferences('alice', { marketingOptIn: true, newsletter: true, marketing: true }, options);
  assert.equal(prefs.newsletter, true);
  const stored = options.db.tables.get(COLLECTION_NOTIFICATION_PREFS)[0];
  assert.equal(stored.marketingOptIn, true);
  assert.equal(Object.hasOwn(stored, 'newsletter'), false);
  assert.equal(Object.hasOwn(stored, 'marketing'), false);
  assert.equal((await getNotificationPreferences('bob', options)).marketingOptIn, false);
});

test('legacy marketing opt-out wins and legacy fields are normalized lazily on save', async () => {
  const options = fixture();
  const collection = options.db.collection(COLLECTION_NOTIFICATION_PREFS);
  await collection.insertOne({ _id: 'alice', newsletter: true, marketing: false, security: false,
    dndUntil: new Date(instant + 60_000) });
  const before = await getNotificationPreferences('alice', options);
  assert.equal(before.marketingOptIn, false);
  assert.equal(before.security, true);
  assert.equal(before.dnd.active, true);
  assert.equal(before.dnd.mode, 'timed');
  assert.equal(before.revision, 0);
  const after = await updateNotificationPreferences('alice', { web: false, expectedRevision: 0 }, options);
  assert.equal(after.dnd.endsAt, before.dnd.endsAt);
  assert.equal(after.marketing, false);
  assert.equal(after.revision, 1);
  const stored = options.db.tables.get(COLLECTION_NOTIFICATION_PREFS)[0];
  assert.equal(Object.hasOwn(stored, 'dndUntil'), false);
  assert.equal(Object.hasOwn(stored, 'newsletter'), false);
  await collection.insertOne({ _id: 'bob', newsletter: true });
  assert.equal((await getNotificationPreferences('bob', options)).marketing, true);
});

test('timed DND uses server time and expires exactly at deadline without a scheduler or DB mutation', async () => {
  const options = fixture();
  for (const durationMinutes of [15, 60, 480, 1440]) {
    const revision = (await getNotificationPreferences('alice', options)).revision;
    const prefs = await updateNotificationPreferences('alice', {
      dnd: { mode: 'timed', durationMinutes }, expectedRevision: revision,
    }, options);
    assert.equal(prefs.dnd.active, true);
    assert.equal(prefs.dnd.startedAt, new Date(instant).toISOString());
    assert.equal(prefs.dnd.endsAt, new Date(instant + durationMinutes * 60_000).toISOString());
    assert.equal(prefs.dndUntil, prefs.dnd.endsAt);
    assert.equal((await getNotificationPreferences('alice', { ...options,
      now: instant + durationMinutes * 60_000 - 1 })).dnd.active, true);
    const expired = await getNotificationPreferences('alice', { ...options, now: instant + durationMinutes * 60_000 });
    assert.equal(expired.dnd.mode, 'off');
    assert.equal(expired.dndUntil, null);
    assert.equal(expired.revision, prefs.revision);
  }
});

test('indefinite DND persists until explicit off; malformed DND and ambiguous contracts cannot be stored', async () => {
  const options = fixture();
  const prefs = await updateNotificationPreferences('alice', { dnd: { mode: 'indefinite' }, expectedRevision: 0 }, options);
  assert.equal(prefs.dnd.active, true);
  assert.equal(prefs.dnd.endsAt, null);
  assert.equal((await getNotificationPreferences('alice', { ...options, now: instant + 365 * 86400_000 })).dnd.active, true);
  const off = await updateNotificationPreferences('alice', { dnd: { mode: 'off' }, expectedRevision: 1 }, options);
  assert.equal(off.dnd.active, false);
  for (const dnd of [null, [], '24', { mode: 'bad' }, { mode: 'timed', durationMinutes: '15' },
    { mode: 'timed', durationMinutes: 120 }, { mode: 'timed' }, { mode: 'off', endsAt: null },
    { mode: 'indefinite', durationMinutes: 15 }, { mode: 'timed', durationMinutes: 15, startedAt: 'forged' }]) {
    await assert.rejects(updateNotificationPreferences('alice', { dnd, expectedRevision: 2 }, options));
  }
  await assert.rejects(updateNotificationPreferences('alice', { dnd: { mode: 'timed', durationMinutes: 15 } }, options),
    errorCode('NOTIFICATION_REVISION_REQUIRED'));
  await assert.rejects(updateNotificationPreferences('alice', { dnd: { mode: 'off' }, dndUntil: null, expectedRevision: 2 }, options));
  assert.equal((await getNotificationPreferences('alice', options)).revision, 2);
});

test('old clients can clear DND by dndUntil=null, expired legacy DND reads as off, and corrupt storage fails visibly', async () => {
  const options = fixture();
  const collection = options.db.collection(COLLECTION_NOTIFICATION_PREFS);
  await collection.insertOne({ _id: 'alice', dndUntil: new Date(instant - 1) });
  assert.equal((await getNotificationPreferences('alice', options)).dnd.active, false);
  await updateNotificationPreferences('alice', { dndUntil: new Date(instant + 60_000).toISOString() }, options);
  assert.equal((await updateNotificationPreferences('alice', { dndUntil: null }, options)).dnd.mode, 'off');
  for (const [index, stored] of [{ email: 'false' }, { marketingOptIn: [] }, { revision: -1 },
    { dndUntil: 'invalid' }, { dnd: { mode: 'timed', endsAt: null } }].entries()) {
    const uid = `broken-${index}`;
    await collection.insertOne({ _id: uid, ...stored });
    await assert.rejects(getNotificationPreferences(uid, options), errorCode('NOTIFICATION_STORAGE_ERROR'));
  }
});

test('revision prevents duplicate timed requests extending deadlines and rejects stale or invalid writes', async () => {
  const options = fixture();
  const payload = { dnd: { mode: 'timed', durationMinutes: 15 }, expectedRevision: 0 };
  const first = await updateNotificationPreferences('alice', payload, options);
  await assert.rejects(updateNotificationPreferences('alice', payload, { ...options, now: instant + 60_000 }),
    errorCode('NOTIFICATION_CONFLICT'));
  assert.equal((await getNotificationPreferences('alice', options)).dnd.endsAt, first.dnd.endsAt);
  for (const expectedRevision of [-1, '1', 1.5, null, {}, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(updateNotificationPreferences('alice', { email: false, expectedRevision }, options));
  }
  await assert.rejects(updateNotificationPreferences('alice', { expectedRevision: 1 }, options));
  assert.equal((await getNotificationPreferences('alice', options)).email, true);
});

test('concurrent initial creation and subsequent saves have a single winner rather than silently losing changes', async () => {
  const options = fixture();
  for (const revision of [0, 1]) {
    const results = await Promise.allSettled([
      updateNotificationPreferences('alice', { email: false, expectedRevision: revision }, options),
      updateNotificationPreferences('alice', { learning: false, expectedRevision: revision }, options),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'NOTIFICATION_CONFLICT');
    assert.equal((await getNotificationPreferences('alice', options)).revision, revision + 1);
    assert.equal(options.db.tables.get(COLLECTION_NOTIFICATION_PREFS).length, 1);
  }
});

test('delivery policy respects channels and each topic independently; security bypasses DND and preferences outages', async () => {
  const options = fixture();
  await updateNotificationPreferences('alice', { email: false, learning: false, community: false,
    courseUpdates: true, marketingOptIn: false }, options);
  for (const topic of ['learning', 'community', 'marketing']) {
    const result = await getNotificationDeliveryPolicy('alice', topic, options);
    assert.equal(result.email, false);
    assert.equal(result.web, false);
    assert.equal(result.inbox, true);
  }
  assert.equal((await getNotificationDeliveryPolicy('alice', 'courseUpdates', options)).web, true);
  assert.equal((await getNotificationDeliveryPolicy('alice', 'transactions', options)).web, true);
  assert.equal((await getNotificationDeliveryPolicy('alice', 'transactions', options)).email, false);
  await updateNotificationPreferences('alice', { dnd: { mode: 'indefinite' }, expectedRevision: 1 }, options);
  assert.deepEqual(await getNotificationDeliveryPolicy('alice', 'security', options),
    { inbox: true, email: true, web: true, reason: 'security_required', dndEndsAt: null });
  const broken = { db: { collection() { throw new Error('private-db'); } } };
  assert.equal((await getNotificationDeliveryPolicy('alice', 'security', broken)).email, true);
  await assert.rejects(getNotificationDeliveryPolicy('alice', 'learning', broken), /private-db/);
  await assert.rejects(getNotificationDeliveryPolicy('alice', 'unknown', options));
  await assert.rejects(getNotificationDeliveryPolicy(null, 'security', options), errorCode('NOTIFICATION_AUTH_REQUIRED'));
});

test('DND suppresses active delivery but keeps new inbox history and unread badges; expiry restores delivery', async () => {
  const options = fixture();
  await updateNotificationPreferences('alice', { dnd: { mode: 'timed', durationMinutes: 15 }, expectedRevision: 0 }, options);
  const policy = await getNotificationDeliveryPolicy('alice', 'learning', options);
  assert.equal(policy.reason, 'dnd');
  assert.equal(policy.email, false);
  assert.equal(policy.web, false);
  await createNotificationForEvent('alice', event({ category: 'learning', kind: 'quiz' }), options);
  assert.equal((await getNotificationSummary('alice', options)).unreadCount, 1);
  assert.equal((await getUserNotifications('alice', {}, options)).items.length, 1);
  const expired = await getNotificationDeliveryPolicy('alice', 'learning', { ...options, now: instant + 15 * 60_000 });
  assert.equal(expired.email, true);
  assert.equal(expired.web, true);
});

test('real HTTP router enforces auth, exposes no producer and uses session owner', async (t) => {
  const options = fixture();
  const item = await createNotificationForEvent('alice', event(), options);
  for (let i = 0; i < 6; i++) await createNotificationForEvent('alice', event({ eventKey: `extra:${i}` }), options);
  const app = express();
  app.use(express.json());
  app.use('/api/user/notifications', createNotificationRouter(express, (req, res, next) => {
    if (!req.headers['x-test-user']) return res.status(401).json({ message: 'Login required' });
    req.userId = req.headers['x-test-user'];
    next();
  }, options));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ code: error.code }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/user/notifications`;
  const request = (path, method = 'GET', body, user = 'alice') => fetch(url + path, {
    method, headers: { 'x-test-user': user, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await request('', 'POST', event())).status, 404);
  const latest = await request('/latest?limit=100&userId=bob');
  assert.equal(latest.headers.get('cache-control'), 'no-store');
  assert.equal((await latest.json()).data.items.length, 5);
  assert.equal((await request(`/${item.id}/read`, 'PATCH', { userId: 'alice' }, 'bob')).status, 404);
  assert.equal((await request(`/${item.id}/read`, 'PATCH')).status, 200);
  assert.equal((await (await request('/summary')).json()).data.unreadCount, 6);
  assert.equal((await request('/read-all', 'PATCH')).status, 200);
  assert.equal((await (await request('/summary')).json()).data.unreadCount, 0);
  assert.equal((await request(`/${item.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/${item.id}/restore`, 'POST')).status, 200);
  assert.equal((await request('/preferences', 'PUT', { security: false })).status, 400);
  assert.equal((await request('/preferences', 'PUT', { marketing: true })).status, 200);
  assert.equal((await (await request('/preferences')).json()).data.marketing, true);
  const prefs = (await (await request('/preferences')).json()).data;
  assert.equal(prefs.newsletter, true);
  assert.equal((await request('/preferences', 'PUT', { dnd: { mode: 'indefinite' } })).status, 400);
  const saved = await request('/preferences', 'PUT', { dnd: { mode: 'indefinite' }, expectedRevision: prefs.revision });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).data.dnd.active, true);
  assert.equal((await request('/preferences', 'PUT', { email: false, expectedRevision: prefs.revision })).status, 409);
  assert.equal((await (await request('/preferences', 'GET', undefined, 'bob')).json()).data.dnd.active, false);
  assert.equal((await request('/preferences', 'PUT', { marketing: true, newsletter: false })).status, 400);
});

test('HTTP responses hide storage errors rather than leaking database details', async (t) => {
  const app = express();
  app.use('/notifications', createNotificationRouter(express, (req, res, next) => {
    req.userId = 'alice'; next();
  }, { db: { collection() { throw new Error('mongodb://private-host/internal-db'); } } }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message, code: error.code }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/notifications`);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'NOTIFICATION_UNAVAILABLE');
  assert.ok(!JSON.stringify(body).includes('private-host'));
});

test('Learning integration: notification list adds local dates and retains original UTC', async () => {
  const db = storage();
  await createNotificationForEvent('learner', { eventKey: 'learning-timezone', sourceType: 'lesson', sourceId: 'lesson-one', category: 'learning', kind: 'reminder', title: 'Nhắc học', message: 'Bài học', href: '/learning' }, { db, now: new Date('2026-10-30T18:00:00Z') });
  await db.collection('learning_preferences').insertOne({ _id: 'learner', timezone: 'Asia/Tokyo' });
  const result = await getUserNotifications('learner', {}, { db });
  assert.equal(result.timezone, 'Asia/Tokyo');assert.equal(result.items[0].createdAt, '2026-10-30T18:00:00.000Z');
  assert.equal(result.items[0].createdAtLocal.dateOnly, '31/10/2026');assert.equal(result.items[0].readAtLocal, null);
});
