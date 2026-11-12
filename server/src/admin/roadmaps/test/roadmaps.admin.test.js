import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { calculateNodeCourseSuggestions, createAdminRoadmap, saveAdminRoadmap, publishAdminRoadmap, listAdminRoadmaps } from '../roadmaps.admin.js';

function matches(row, query = {}) {
  for (const [key, condition] of Object.entries(query)) {
    if (key === '$or') { if (!condition.some(item => matches(row, item))) return false; continue; }
    if (key === '$and') { if (!condition.every(item => matches(row, item))) return false; continue; }
    const value = row[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
      if ('$in' in condition && !condition.$in.some(item => String(item) === String(value))) return false;
      if ('$ne' in condition && String(value) === String(condition.$ne)) return false;
      if ('$exists' in condition && Boolean(value !== undefined) !== condition.$exists) return false;
      if ('$gt' in condition && !(value > condition.$gt)) return false;
      if ('$lte' in condition && !(value <= condition.$lte)) return false;
    } else if (String(value) !== String(condition)) return false;
  }
  return true;
}
class Collection {
  constructor(rows = []) { this.rows = rows; }
  find(query = {}) { let rows = this.rows.filter(row => matches(row, query)); const cursor = { sort(spec) { rows.sort((a,b) => { for (const [k,d] of Object.entries(spec)) if (a[k] !== b[k]) return (a[k] > b[k] ? 1 : -1) * d; return 0; }); return cursor; }, limit(n) { rows = rows.slice(0,n); return cursor; }, skip(n) { rows = rows.slice(n); return cursor; }, toArray: async () => rows }; return cursor; }
  async findOne(query = {}) { return this.rows.find(row => matches(row, query)) || null; }
  async distinct(field, query = {}) { return [...new Set(this.rows.filter(row => matches(row, query)).map(row => row[field]))]; }
  async insertOne(row) { const item = { ...row, _id: row._id || new ObjectId() }; this.rows.push(item); return { acknowledged: true, insertedId: item._id }; }
  async updateOne(query, update) { const row = this.rows.find(item => matches(item, query)); if (!row) return { matchedCount: 0, modifiedCount: 0 }; this.apply(row, update); return { matchedCount: 1, modifiedCount: 1 }; }
  async updateMany(query, update) { const rows = this.rows.filter(item => matches(item, query)); rows.forEach(row => this.apply(row, update)); return { matchedCount: rows.length, modifiedCount: rows.length }; }
  apply(row, update) { Object.assign(row, update.$set || {}); for (const [key,val] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + val; }
}
function makeDb(data = {}) { const tables = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, new Collection(rows)])); return { tables, collection(name) { return tables[name] ||= new Collection(); }, client: { startSession() { return { async withTransaction(fn) { return fn(); }, async endSession() {} }; } } }; }
const actor = new ObjectId().toString();
const node = { id: 'react-core', name: 'React Core', type: 'framework', level: 'intermediate', description: 'React component knowledge', outcomes: 'Build React components', tags: ['react', 'hooks'], industry: 'Web', threshold: 70, courses: [] };
const question = { id: 'q1', prompt: 'What is a hook?', code: '', language: 'text', answers: [{ letter: 'A', text: 'useState', correct: true }, { letter: 'B', text: 'div' }, { letter: 'C', text: 'class' }, { letter: 'D', text: 'loop' }] };
const stage = { id: 'stage-1', name: 'React Core', nodes: [node], test: { name: 'React test', duration: 15, passScore: 80, questions: [question] } };

test('S-match uses node sub-tags against published course and lesson text, then ranks matching level first', async () => {
  const db = makeDb({
    courses: [
      { _id: new ObjectId(), course_id: 'c-fit', title: 'React hooks', level: 'intermediate', status: 'published', price: 1 },
      { _id: new ObjectId(), course_id: 'c-level', title: 'React hooks', level: 'beginner', status: 'published', price: 2 },
      { _id: new ObjectId(), course_id: 'c-hidden', title: 'React hooks', level: 'intermediate', status: 'hidden' },
    ], course_tags: [], lessons: [{ course_id: 'c-fit', title: 'useState custom hooks' }], tags: []
  });
  const suggestions = await calculateNodeCourseSuggestions(node, { db });
  assert.deepEqual(suggestions.map(item => item.course_id), ['c-fit', 'c-level']);
  assert.equal(suggestions[0].s_match, 100);
  assert.equal(suggestions[0].level_match, true);
  assert.equal(suggestions[1].level_match, false);
});

test('roadmap draft validates and stores stages, node settings and stage-level test', async () => {
  const db = makeDb({ course_categories: [{ category_id: 9, name: 'Web Engineer' }] });
  const created = await createAdminRoadmap({ categoryId: 9, name: 'Web Engineer', stages: [stage] }, { db, adminId: actor, req: { adminId: actor } });
  assert.equal(created.roadmap.status, 'draft');
  assert.equal(created.roadmap.stages[0].test.name, 'React test');
  const updated = await saveAdminRoadmap(created.roadmap.versionId, { name: 'Web Engineer v1', stages: [stage] }, { db, adminId: actor, req: { adminId: actor } });
  assert.equal(updated.roadmap.name, 'Web Engineer v1');
  await assert.rejects(() => saveAdminRoadmap(created.roadmap.versionId, { stages: [{ ...stage, nodes: [{ ...node, description: '' }] }] }, { db, adminId: actor, req: { adminId: actor } }), { code: 'ROADMAP_ADMIN_INVALID' });
});

test('publishing requires an approved matching course and namespaces stage/node ids for learner snapshots', async () => {
  const db = makeDb({
    course_categories: [{ category_id: 9, name: 'Web Engineer' }],
    courses: [{ _id: new ObjectId(), course_id: 'c-fit', title: 'React hooks', level: 'intermediate', status: 'published' }],
    course_tags: [], lessons: [], tags: []
  });
  const created = await createAdminRoadmap({ categoryId: 9, stages: [stage] }, { db, adminId: actor, req: { adminId: actor } });
  await assert.rejects(() => publishAdminRoadmap(created.roadmap.versionId, { db, adminId: actor, req: { adminId: actor } }), { code: 'ROADMAP_PUBLISH_INVALID' });
  await saveAdminRoadmap(created.roadmap.versionId, { stages: [{ ...stage, nodes: [{ ...node, courses: [{ course_id: 'c-fit' }] }] }] }, { db, adminId: actor, req: { adminId: actor } });
  const published = await publishAdminRoadmap(created.roadmap.versionId, { db, adminId: actor, req: { adminId: actor } });
  assert.equal(published.roadmap.status, 'published');
  assert.match(published.roadmap.stages[0].stage_id, /__/);
  assert.match(published.roadmap.stages[0].nodes[0].node_id, /__/);
  assert.equal(db.tables.admin_audit_logs.rows.length, 3);
});

test('roadmap list derives node coverage and ignores fabricated UI KPI values', async () => {
  const db = makeDb({ admin_roadmap_versions: [{ _id: new ObjectId(), version_id: 'v1', category_id: 9, name: 'Web Engineer', code: 'WEB', status: 'draft', version: 1, threshold: 70, stages: [{ stage_id: 's1', nodes: [{ node_id: 'n1', title: 'React', threshold: 70, courses: [{ course_id: 'c1', s_match: 80, level_match: true }] }] }] }], course_categories: [{ category_id: 9, name: 'Web' }] });
  const result = await listAdminRoadmaps({}, { db });
  assert.equal(result.items[0].coverage, 100);
  assert.equal(result.items[0].missingCourses, 0);
});
