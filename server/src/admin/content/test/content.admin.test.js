import test from 'node:test';
import assert from 'node:assert/strict';
import { listContentComments, moderateContentComment } from '../content.admin.js';

function makeCommentDb(comment) {
  const writes = [];
  const db = {
    collection(name) {
      if (name === 'admin_audit_logs') return { async insertOne(row) { writes.push({ name, row }); return { acknowledged: true }; } };
      return {
        async findOne() { return comment; },
        async updateOne(filter, update) { writes.push({ name, filter, update }); return { modifiedCount: 1 }; },
        find() { return { sort() { return this; }, limit() { return this; }, async toArray() { return []; } }; },
      };
    },
  };
  return { db, writes };
}

test('comment reply is stored as an Admin reply and audited without changing visibility', async () => {
  const comment = { _id: 'comment-1', status: 'visible', content: 'Nội dung bình luận đủ dài.' };
  const { db, writes } = makeCommentDb(comment);
  const result = await moderateContentComment('comment-1', 'blog', 'reply', { content: 'Phản hồi từ bộ phận quản trị.' }, {
    adminId: '507f1f77bcf86cd799439011', ip: '127.0.0.1', get: () => 'test-agent',
  }, { db, now: new Date('2026-01-01T00:00:00Z') });

  assert.equal(result.status, 'visible');
  assert.equal(writes[0].update.$set.admin_reply.role, 'admin');
  assert.equal(writes[0].update.$set.status, undefined);
  assert.equal(writes.some(write => write.name === 'admin_audit_logs'), true);
});

test('comment list combines both configured sources and excludes hard-deleted rows', async () => {
  const sources = [];
  const db = { collection(name) { sources.push(name); return { find() { return { sort() { return this; }, limit() { return this; }, async toArray() { return []; } }; } }; } };
  const result = await listContentComments({ page: 1, pageSize: 10 }, { db });

  assert.deepEqual(sources, ['blog_comments', 'course_comments']);
  assert.equal(result.pagination.total, 0);
});
