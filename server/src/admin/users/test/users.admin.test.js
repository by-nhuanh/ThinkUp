import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { expireStudentLocks } from '../users.admin.js';

function matches(user, query) {
  return user.role === query.role && user.status === query.status && query.deleted_at?.$exists === false
    && query.lock_level.$in.includes(user.lock_level) && user.locked_until <= query.locked_until.$lte;
}

function fixture() {
  const now = new Date('2026-11-10T12:00:00.000Z');
  const rows = [
    { _id: new ObjectId(), role: 'student', status: 'locked', lock_level: 1, locked_at: new Date(+now - 7 * 86400000), locked_until: new Date(+now - 1), locked_by: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    { _id: new ObjectId(), role: 'student', status: 'locked', lock_level: 2, locked_at: new Date(+now - 31 * 86400000), locked_until: new Date(+now - 1), locked_by: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    { _id: new ObjectId(), role: 'student', status: 'locked', lock_level: 2, locked_at: now, locked_until: new Date(+now + 30 * 86400000), locked_by: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    { _id: new ObjectId(), role: 'student', status: 'locked', lock_level: 3, locked_at: now, locked_until: null, locked_by: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
  ];
  const audits = [];
  const db = { collection(name) {
    if (name === 'users') return {
      find(query) { return { limit() { return this; }, async toArray() { return rows.filter(row => matches(row, query)); } }; },
      async updateOne(query, update) {
        const row = rows.find(item => item._id.equals(query._id) && item.status === query.status
          && item.lock_level === query.lock_level && item.locked_at === query.locked_at
          && item.locked_until <= query.locked_until.$lte);
        if (!row) return { modifiedCount: 0 };
        Object.assign(row, update.$set);
        for (const key of Object.keys(update.$unset)) delete row[key];
        return { modifiedCount: 1 };
      },
    };
    if (name === 'admin_audit_logs') return { async insertOne(row) { audits.push(row); } };
    throw new Error(`Unexpected collection: ${name}`);
  } };
  return { db, rows, audits, now };
}

test('student lock expiry releases only due level 1/2 locks and preserves indefinite or renewed locks', async () => {
  const { db, rows, audits, now } = fixture();
  const result = await expireStudentLocks({ db, now });
  assert.deepEqual(result, { released: 2 });
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[1].status, 'active');
  assert.equal(rows[2].status, 'locked');
  assert.equal(rows[3].status, 'locked');
  assert.equal(audits.length, 2);
  assert.ok(audits.every(row => row.action === 'USER_STUDENT_AUTO_UNLOCK'));
});
