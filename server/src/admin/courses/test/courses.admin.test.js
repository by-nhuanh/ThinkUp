import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { getAdminCourseSummary, listAdminCourses, getAdminCourseApprovalSummary, claimCourseReview, decideCourseReview, changeCourseStatus } from '../courses.admin.js';

function matches(row, query = {}) {
  for (const [key, condition] of Object.entries(query)) {
    if (key === '$or') { if (!condition.some(item => matches(row, item))) return false; continue; }
    if (key === '$and') { if (!condition.every(item => matches(row, item))) return false; continue; }
    const value = row[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
      if ('$in' in condition && !condition.$in.some(item => String(item) === String(value))) return false;
      if ('$ne' in condition && value === condition.$ne) return false;
      if ('$exists' in condition && Boolean(value !== undefined) !== condition.$exists) return false;
      if ('$gt' in condition && !(value > condition.$gt)) return false;
      if ('$gte' in condition && !(value >= condition.$gte)) return false;
      if ('$lt' in condition && !(value < condition.$lt)) return false;
      if ('$lte' in condition && !(value <= condition.$lte)) return false;
    } else if (String(value) !== String(condition)) return false;
  }
  return true;
}
class MemoryCollection {
  constructor(rows = []) { this.rows = rows; }
  find(query = {}) { let rows = this.rows.filter(row => matches(row, query)); const cursor = { sort(spec) { rows.sort((a,b) => { for (const [key, direction] of Object.entries(spec)) if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * direction; return 0; }); return cursor; }, skip(n) { rows = rows.slice(n); return cursor; }, limit(n) { rows = rows.slice(0,n); return cursor; }, toArray: async () => rows }; return cursor; }
  async findOne(query = {}) { return this.rows.find(row => matches(row, query)) || null; }
  async countDocuments(query = {}) { return this.rows.filter(row => matches(row, query)).length; }
  async insertOne(doc) { this.rows.push({ ...doc, _id: doc._id || new ObjectId() }); return { acknowledged: true, insertedId: this.rows.at(-1)._id }; }
  async updateOne(query, update) { const row = this.rows.find(item => matches(item, query)); if (!row) return { matchedCount: 0, modifiedCount: 0 }; this.apply(row, update); return { matchedCount: 1, modifiedCount: 1 }; }
  async updateMany(query, update) { const rows = this.rows.filter(item => matches(item, query)); rows.forEach(row => this.apply(row, update)); return { matchedCount: rows.length, modifiedCount: rows.length }; }
  async findOneAndUpdate(query, update) { const row = this.rows.find(item => matches(item, query)); if (!row) return null; this.apply(row, update); return row; }
  async distinct(field, query = {}) { return [...new Set(this.rows.filter(row => matches(row, query)).map(row => row[field]))]; }
  apply(row, update) { Object.assign(row, update.$set || {}); for (const [key, val] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + val; for (const [key, val] of Object.entries(update.$push || {})) (row[key] ||= []).push(val); for (const [key, val] of Object.entries(update.$addToSet || {})) { const arr = row[key] ||= []; if (!arr.includes(val)) arr.push(val); } }
}
function dbOf(data = {}) {
  const tables = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, new MemoryCollection(rows)]));
  return { tables, collection(name) { return tables[name] ||= new MemoryCollection(); }, client: { startSession() { return { async withTransaction(work) { return work(); }, async endSession() {} }; } } };
}
const req = { adminId: new ObjectId().toString(), ip: '203.0.113.9', headers: { 'user-agent': 'admin-test' } };

test('course summary counts real states and returns null when no comparison baseline exists', async () => {
  const now = new Date('2026-11-11T00:00:00Z');
  const db = dbOf({ courses: [
    { status: 'published', business_status: 'published', created_at: now },
    { status: 'pending_review', review_status: 'pending_review', created_at: now },
    { status: 'archived', business_status: 'archived', created_at: now },
  ] });
  const summary = await getAdminCourseSummary({}, { db, now });
  assert.deepEqual([summary.total, summary.published, summary.pending, summary.hidden, summary.totalChangePercent], [3,1,1,1,null]);
});

test('course list filters status, category and search without trusting frontend totals', async () => {
  const db = dbOf({ courses: [
    { _id: new ObjectId(), course_id: 'c1', title: 'React Basics', category_id: 4, status: 'published', instructor_id: 'u1' },
    { _id: new ObjectId(), course_id: 'c2', title: 'SQL', category_id: 5, status: 'pending_review', instructor_id: 'u2' },
  ], instructor_profiles: [{ user_id: 'u1', full_name: 'Ada Nguyen' }, { user_id: 'u2', full_name: 'Binh Tran' }] });
  const result = await listAdminCourses({ search: 'Ada', status: 'published', category: '4', page: '1', pageSize: '10' }, { db });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0].instructorName, 'Ada Nguyen');
  await assert.rejects(() => listAdminCourses({ pageSize: '1000' }, { db }), { code: 'COURSE_ADMIN_INVALID' });
});

test('approval summary uses submitted timestamps and 36/48 hour queue thresholds', async () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const db = dbOf({ courses: [
    { status: 'pending_review', review_status: 'pending_review', review_submitted_at: new Date(+now - 49 * 3600000) },
    { status: 'pending_review', review_status: 'pending_review', review_submitted_at: new Date(+now - 40 * 3600000) },
    { status: 'pending_review', review_status: 'pending_review', review_submitted_at: new Date(+now - 3 * 86400000) },
    { status: 'draft', review_status: 'changes_requested' },
  ] });
  const summary = await getAdminCourseApprovalSummary({ db, now });
  assert.equal(summary.waitingReview, 3);
  assert.equal(summary.overdue, 2);
  assert.equal(summary.approachingDue, 1);
  assert.equal(summary.changesRequested, 1);
});

test('claim and approve use guarded states, update both publication fields, and audit', async () => {
  const id = new ObjectId(), db = dbOf({ courses: [{ _id: id, course_id: 'c9', status: 'pending_review', review_submitted_at: new Date() }] });
  const claim = await claimCourseReview('c9', req, { db, now: new Date('2026-11-11T10:00:00Z') });
  assert.equal(claim.reviewStatus, 'in_review');
  const approved = await decideCourseReview('c9', { decision: 'approve' }, req, { db, now: new Date('2026-11-11T11:00:00Z') });
  assert.deepEqual([approved.reviewStatus, approved.businessStatus], ['approved', 'published']);
  assert.deepEqual([db.tables.courses.rows[0].status, db.tables.courses.rows[0].business_status], ['published', 'published']);
  assert.equal(db.tables.admin_audit_logs.rows.length, 2);
});

test('course status cannot publish an unapproved course and archive requires evidence links to be HTTPS', async () => {
  const id = new ObjectId(), db = dbOf({ courses: [{ _id: id, course_id: 'c10', status: 'draft', review_status: 'pending_review', business_status: 'unpublished' }] });
  await assert.rejects(() => changeCourseStatus('c10', { businessStatus: 'published' }, req, { db }), { code: 'COURSE_REVIEW_REQUIRED' });
  await assert.rejects(() => changeCourseStatus('c10', { businessStatus: 'archived', reason: 'policy', explanation: 'This is a sufficiently detailed explanation.', evidence: 'file.pdf' }, req, { db }), { code: 'COURSE_ADMIN_INVALID' });
  assert.equal(db.tables.courses.rows[0].status, 'draft');
});
