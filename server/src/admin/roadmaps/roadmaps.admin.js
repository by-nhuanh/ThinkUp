import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';

export const ADMIN_ROADMAP_VERSIONS = 'admin_roadmap_versions';
const FAIL = (message, status = 400, code = 'ROADMAP_ADMIN_INVALID') => Object.assign(new Error(message), { status, code });
const txt = value => typeof value === 'string' ? value.trim() : '';
const toNum = (value, min, max, label) => { const n = Number(value); if (!Number.isFinite(n) || n < min || n > max) throw FAIL(`${label} không hợp lệ.`); return n; };
const versionQuery = id => {
  const value = txt(id); if (!value || value.length > 100) throw FAIL('Mã phiên bản lộ trình không hợp lệ.');
  const clauses = [{ version_id: value }, { code: value }]; if (ObjectId.isValid(value)) clauses.push({ _id: new ObjectId(value) }); return { $or: clauses };
};
function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 200) throw FAIL('Mỗi bài kiểm tra cần từ 1 đến 200 câu hỏi.');
  return questions.map((q, index) => {
    const prompt = txt(q.prompt || q.question_text), code = typeof q.code === 'string' ? q.code : '';
    if (!prompt || prompt.length > 5000 || code.length > 20000) throw FAIL(`Nội dung câu hỏi ${index + 1} không hợp lệ.`);
    if (!Array.isArray(q.answers) || q.answers.length !== 4) throw FAIL(`Câu hỏi ${index + 1} phải có đúng bốn phương án.`);
    const answers = q.answers.map((a, i) => ({ key: String(a.key || a.letter || String.fromCharCode(65 + i)).toUpperCase(), text: txt(a.text) }));
    if (answers.some(a => !/^[A-D]$/.test(a.key) || !a.text || a.text.length > 1500) || new Set(answers.map(a => a.key)).size !== 4) throw FAIL(`Phương án câu hỏi ${index + 1} không hợp lệ.`);
    const correct = q.answers.filter(a => a.correct).map(a => String(a.key || a.letter || '').toUpperCase());
    const correctKey = txt(q.correct_option || q.correctOption).toUpperCase() || correct[0];
    if (correct.length > 1 || !answers.some(a => a.key === correctKey)) throw FAIL(`Câu hỏi ${index + 1} phải có đúng một đáp án đúng.`);
    return { question_id: txt(q.id || q.question_id) || `q-${index + 1}`, question_text: prompt, code, language: txt(q.language) || 'text', options: answers, correct_option: correctKey, explanation: txt(q.explanation), skill_tag: txt(q.skill_tag) || null };
  });
}
function normalizeStages(stages, threshold = 70, allowEmpty = false) {
  if (!Array.isArray(stages) || (!allowEmpty && stages.length < 1) || stages.length > 50) throw FAIL('Lộ trình cần từ 1 đến 50 giai đoạn.');
  const ids = new Set(), nodeIds = new Set();
  return stages.map((stage, si) => {
    const stageId = txt(stage.id || stage.stage_id) || `stage-${si + 1}`;
    if (ids.has(stageId)) throw FAIL('Mã giai đoạn bị trùng.'); ids.add(stageId);
    if (!txt(stage.name || stage.title) || txt(stage.name || stage.title).length > 160) throw FAIL(`Tên giai đoạn ${si + 1} không hợp lệ.`);
    if (!Array.isArray(stage.nodes) || stage.nodes.length > 100) throw FAIL(`Danh sách node của giai đoạn ${si + 1} không hợp lệ.`);
    const nodes = stage.nodes.map((node, ni) => {
      const nodeId = txt(node.id || node.node_id) || `stage-${si + 1}-node-${ni + 1}`;
      if (nodeIds.has(nodeId)) throw FAIL('Mã node bị trùng trong lộ trình.'); nodeIds.add(nodeId);
      const tags = Array.isArray(node.tags) ? [...new Set(node.tags.map(txt).filter(Boolean))] : [];
      if (!txt(node.name || node.title) || !txt(node.description) || !txt(node.outcomes) || tags.length === 0) throw FAIL(`Node ${nodeId} cần tên, mô tả, kết quả học tập và ít nhất một sub-tag.`);
      if (tags.some(tag => tag.length > 80) || txt(node.description).length > 4000 || txt(node.outcomes).length > 2000) throw FAIL(`Thông tin node ${nodeId} vượt quá giới hạn.`);
      const minMatch = toNum(node.threshold ?? threshold, 70, 100, 'Ngưỡng S-match');
      const courses = Array.isArray(node.courses) ? node.courses.map(item => ({ course_id: txt(item.course_id || item.id) })) : [];
      if (courses.some(item => !item.course_id) || new Set(courses.map(item => item.course_id)).size !== courses.length) throw FAIL(`Danh sách khóa học của node ${nodeId} không hợp lệ.`);
      return { node_id: nodeId, title: txt(node.name || node.title), type: txt(node.type) || 'skill', level: txt(node.level) || 'beginner', icon: txt(node.icon), description: txt(node.description), outcomes: txt(node.outcomes), tags, industry: txt(node.industry), threshold: minMatch, courses };
    });
    const rawTest = stage.test || null;
    let test = null;
    if (rawTest) {
      const name = txt(rawTest.name || rawTest.title);
      if (!name || name.length > 200) throw FAIL(`Tên bài kiểm tra giai đoạn ${stageId} không hợp lệ.`);
      test = { name, duration_minutes: toNum(rawTest.duration_minutes ?? rawTest.duration, 1, 300, 'Thời lượng bài kiểm tra'), pass_score: toNum(rawTest.pass_score ?? rawTest.passScore, 0, 100, 'Điểm đạt'), questions: validateQuestions(rawTest.questions) };
    }
    return { stage_id: stageId, title: txt(stage.name || stage.title), description: txt(stage.description), order: Number.isSafeInteger(Number(stage.order ?? si + 1)) ? Number(stage.order ?? si + 1) : si + 1, nodes, test };
  });
}
const normalizedLevel = value => ({ beginner: 1, basic: 1, 'cơ bản': 1, intermediate: 2, 'trung cấp': 2, advanced: 3, 'nâng cao': 3 })[txt(value).toLocaleLowerCase()] || 0;
async function loadCourseCatalog(db, session = undefined) {
  const courses = await db.collection('courses').find({ status: 'published', admin_hidden: { $ne: true } }, { session, projection: { _id: 1, course_id: 1, title: 1, description: 1, short_description: 1, subtitle: 1, level: 1, difficulty: 1, category_id: 1, price: 1, original_price: 1, rating: 1, total_students: 1, created_at: 1 } }).toArray();
  const ids = courses.flatMap(course => [course.course_id, String(course.course_id ?? course._id)]).filter(Boolean).map(String);
  const [courseTags, lessons] = await Promise.all([
    ids.length ? db.collection('course_tags').find({ course_id: { $in: ids } }, { session }).toArray() : [],
    ids.length ? db.collection('lessons').find({ course_id: { $in: ids } }, { session, projection: { course_id: 1, title: 1 } }).toArray() : [],
  ]);
  const tagIds = [...new Set(courseTags.map(row => String(row.tag_id)).filter(Boolean))];
  const tags = tagIds.length ? await db.collection('tags').find({ $or: [{ tag_id: { $in: tagIds } }, { id: { $in: tagIds } }, { _id: { $in: tagIds.filter(ObjectId.isValid).map(x => new ObjectId(x)) } }] }, { session, projection: { tag_id: 1, id: 1, name: 1, title: 1 } }).toArray() : [];
  const tagNames = new Map(); for (const tag of tags) for (const key of [tag.tag_id, tag.id, tag._id]) if (key != null) tagNames.set(String(key), txt(tag.name || tag.title));
  const tagsByCourse = new Map(); for (const row of courseTags) { const key = String(row.course_id); tagsByCourse.set(key, [...(tagsByCourse.get(key) || []), tagNames.get(String(row.tag_id)) || '']); }
  const lessonsByCourse = new Map(); for (const lesson of lessons) { const key = String(lesson.course_id); lessonsByCourse.set(key, [...(lessonsByCourse.get(key) || []), lesson.title || '']); }
  return courses.map(course => {
    const courseId = String(course.course_id ?? course._id);
    return { course, courseId, content: [course.title, course.description, course.short_description, course.subtitle, ...(tagsByCourse.get(courseId) || []), ...(lessonsByCourse.get(courseId) || [])].join(' ').toLocaleLowerCase() };
  });
}
function scoreNodeAgainstCatalog(node, catalog, threshold) {
  const keywords = [...new Set((node.tags || []).map(txt).filter(Boolean))];
  const requiredLevel = normalizedLevel(node.level);
  return catalog.map(({ course, courseId, content }) => {
    const matched = keywords.filter(keyword => content.includes(keyword.toLocaleLowerCase()));
    const sMatch = keywords.length ? Math.round(matched.length / keywords.length * 100) : 0;
    const level = normalizedLevel(course.level || course.difficulty), levelMatch = !requiredLevel || level === requiredLevel;
    return { id: String(course._id), course_id: courseId, title: course.title || '', level: course.level || course.difficulty || '', s_match: sMatch, level_match: levelMatch, matched_keywords: matched, price: Number(course.price || 0), original_price: Number(course.original_price ?? course.price ?? 0), rating: Number(course.rating || 0), learner_count: Number(course.total_students || 0) };
  }).filter(row => row.s_match >= threshold).sort((a, b) => Number(b.level_match) - Number(a.level_match) || b.s_match - a.s_match || b.learner_count - a.learner_count);
}
export async function calculateNodeCourseSuggestions(node, options = {}) {
  const db = options.db || await getMongoDb(), threshold = Number(node.threshold ?? options.threshold ?? 70);
  return scoreNodeAgainstCatalog(node, options.catalog || await loadCourseCatalog(db), threshold);
}
async function recalculateSelectedCourses(db, stages) {
  const catalog = await loadCourseCatalog(db);
  return stages.map(stage => ({ ...stage, nodes: stage.nodes.map(node => {
    const available = scoreNodeAgainstCatalog(node, catalog, Math.max(70, node.threshold));
    const byId = new Map(available.flatMap(item => [[String(item.course_id), item], [String(item.id), item]]));
    return { ...node, courses: (node.courses || []).map(item => byId.get(String(item.course_id))).filter(Boolean) };
  }) }));
}
export async function syncApprovedCourseWithRoadmaps(db, courseId, options = {}) {
  const session = options.session, catalog = await loadCourseCatalog(db, session);
  const courseKey = String(courseId), versions = await db.collection(ADMIN_ROADMAP_VERSIONS).find({ status: { $in: ['draft', 'published'] } }, { session }).toArray();
  let changedRoadmaps = 0;
  for (const version of versions) {
    let changed = false;
    const stages = (version.stages || []).map(stage => ({ ...stage, nodes: (stage.nodes || []).map(node => {
      const candidate = scoreNodeAgainstCatalog(node, catalog, Math.max(70, Number(node.threshold ?? version.threshold ?? 70)))
        .find(item => (item.course_id === courseKey || item.id === courseKey) && item.level_match);
      if (!candidate || (node.courses || []).some(item => String(item.course_id) === courseKey || String(item.id) === courseKey)) return node;
      changed = true;
      return { ...node, courses: [...(node.courses || []), candidate] };
    }) }));
    if (!changed) continue;
    const result = await db.collection(ADMIN_ROADMAP_VERSIONS).updateOne({ _id: version._id, revision: version.revision ?? { $exists: false }, status: version.status }, { $set: { stages, derived_courses_updated_at: options.now || new Date(), updated_at: options.now || new Date() }, $inc: { revision: 1 } }, { session });
    if (!result.modifiedCount) throw FAIL('Roadmap vừa được thay đổi trong lúc đồng bộ khóa học.', 409, 'ROADMAP_SYNC_CONFLICT');
    changedRoadmaps++;
  }
  return { changedRoadmaps };
}
function snapshot(row) { return { versionId: String(row._id), categoryId: row.category_id, code: row.code, name: row.name, industry: row.industry || '', description: row.description || '', status: row.status, version: row.version, threshold: row.threshold, stages: row.stages || [], updatedAt: row.updated_at?.toISOString?.() || null, publishedAt: row.published_at?.toISOString?.() || null }; }
async function audit(db, req, action, row, before, after, metadata = {}, session = undefined) {
  const adminId = ObjectId.isValid(String(req?.adminId || '')) ? new ObjectId(String(req.adminId)) : null;
  const result = await db.collection('admin_audit_logs').insertOne({ admin_id: adminId, action, ip: req?.ip || 'unknown', user_agent: req?.headers?.['user-agent'] || 'unknown', details: { entity: { type: 'roadmap', id: String(row.category_id || row._id) }, before, after, outcome: 'success', correlation_id: randomUUID(), metadata }, created_at: new Date() }, { session });
  if (!result.acknowledged) throw FAIL('Không thể ghi audit log; thay đổi đã bị hủy.', 503, 'ROADMAP_AUDIT_UNAVAILABLE');
}
async function roadmapTransaction(db, work) {
  if (!db.client?.startSession) throw FAIL('CSDL cần hỗ trợ transaction để thay đổi lộ trình an toàn.', 503, 'ROADMAP_STORAGE_UNAVAILABLE');
  const session = db.client.startSession();
  try { return await session.withTransaction(() => work(session)); } finally { await session.endSession(); }
}

export async function listAdminRoadmaps(query = {}, options = {}) {
  const db = options.db || await getMongoDb(), page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw FAIL('Phân trang không hợp lệ.');
  const versions = await db.collection(ADMIN_ROADMAP_VERSIONS).find({}).sort({ category_id: 1, version: -1, updated_at: -1 }).toArray();
  const templates = await db.collection('roadmap_templates').find({}).toArray();
  const chosen = new Map();
  for (const row of versions) if (!chosen.has(Number(row.category_id))) chosen.set(Number(row.category_id), row);
  for (const row of templates) if (!chosen.has(Number(row.category_id))) chosen.set(Number(row.category_id), { ...row, status: 'legacy', version: 0, stages: row.stages || [] });
  const categories = await db.collection('course_categories').find({}).toArray(), categoryMap = new Map(categories.map(x => [Number(x.category_id), x]));
  let rows = [...chosen.values()].map(row => {
    const stages = row.stages || [], nodes = stages.flatMap(stage => stage.nodes || []), missingTests = stages.filter(stage => !stage.test).length;
    const nodesCovered = nodes.filter(node => (node.courses || []).some(course => Number(course.s_match ?? course.match ?? 0) >= Math.max(70, Number(node.threshold ?? row.threshold ?? 70)) && course.level_match === true)).length;
    const coverage = nodes.length ? Number((nodesCovered / nodes.length * 100).toFixed(1)) : 0;
    const category = categoryMap.get(Number(row.category_id));
    return { ...snapshot(row), name: row.name || row.career_name || category?.name || '', code: row.code || row.short_code || category?.roadmap_short_code || String(row.category_id), industry: row.industry || category?.industry || category?.name || '', stages: stages.length, nodes: nodes.length, coverage, missingTests, learnerCount: row.learner_count || 0, missingCourses: nodes.length - nodesCovered, searchableNodeText: nodes.map(node => node.title || node.name || '').join(' ') };
  });
  const q = txt(query.search || query.q).toLocaleLowerCase();
  rows = rows.filter(row => (!q || row.name.toLocaleLowerCase().includes(q) || row.code.toLocaleLowerCase().includes(q) || row.searchableNodeText.toLocaleLowerCase().includes(q))
    && (!query.industry || row.industry === query.industry)
    && (!query.visibility || query.visibility === 'all' || (query.visibility === 'visible' ? row.status === 'published' || row.status === 'legacy' : row.status === 'hidden'))
    && (!query.coverage || query.coverage === 'all' || (query.coverage === 'full' ? row.coverage === 100 : row.coverage < 100))
    && (!query.testState || query.testState === 'all' || (query.testState === 'complete' ? row.missingTests === 0 : row.missingTests > 0)));
  const total = rows.length, items = rows.slice((page - 1) * pageSize, page * pageSize);
  return { success: true, items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
}
export async function getAdminRoadmapSummary(options = {}) {
  const db = options.db || await getMongoDb(), result = await listAdminRoadmaps({ page: 1, pageSize: 100 }, { db }), rows = [...result.items];
  for (let page = 2; page <= result.pagination.pages; page++) rows.push(...(await listAdminRoadmaps({ page, pageSize: 100 }, { db })).items);
  const learnerIds = await db.collection('user_roadmaps').distinct('user_id');
  const nodes = rows.reduce((sum, row) => sum + row.nodes, 0), covered = rows.reduce((sum, row) => sum + Math.round(row.nodes * row.coverage / 100), 0);
  return { success: true, total: rows.length, active: rows.filter(row => row.status === 'published' || row.status === 'legacy').length, learners: learnerIds.length, coverage: nodes ? Number((covered / nodes * 100).toFixed(1)) : 0, missingNodes: rows.reduce((sum, row) => sum + row.missingCourses, 0) };
}
export async function getAdminRoadmap(id, options = {}) {
  const db = options.db || await getMongoDb(), row = await db.collection(ADMIN_ROADMAP_VERSIONS).findOne(versionQuery(id));
  if (row) return { success: true, roadmap: snapshot(row) };
  const categoryId = Number(id), legacy = Number.isSafeInteger(categoryId) ? await db.collection('roadmap_templates').findOne({ category_id: categoryId }) : null;
  if (!legacy) throw FAIL('Không tìm thấy lộ trình.', 404, 'ROADMAP_NOT_FOUND');
  return { success: true, roadmap: { versionId: null, categoryId: legacy.category_id, code: legacy.short_code || String(legacy.category_id), name: legacy.career_name, industry: '', description: legacy.description || '', status: 'legacy', version: 0, threshold: 70, stages: (legacy.stages || []).map(s => ({ ...s, nodes: (s.nodes || []).map(n => ({ ...n, description: n.description || '', outcomes: (n.outcomes || n.topics || []).join?.('\n') || '', courses: [] })) })) } };
}
export async function createAdminRoadmap(body = {}, options = {}) {
  const db = options.db || await getMongoDb(), categoryId = Number(body.categoryId);
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) throw FAIL('Mã ngành/lộ trình không hợp lệ.');
  return roadmapTransaction(db, async session => {
  const category = await db.collection('course_categories').findOne({ category_id: categoryId }, { session });
  if (!category) throw FAIL('Không tìm thấy nhóm ngành.', 404, 'CATEGORY_NOT_FOUND');
  const existing = await db.collection(ADMIN_ROADMAP_VERSIONS).findOne({ category_id: categoryId, status: 'draft' }, { session });
  if (existing) return { success: true, roadmap: snapshot(existing) };
  const legacy = await db.collection('roadmap_templates').findOne({ category_id: categoryId }, { session });
  const prior = await db.collection(ADMIN_ROADMAP_VERSIONS).find({ category_id: categoryId }, { session }).sort({ version: -1 }).limit(1).toArray();
  const now = options.now || new Date(), threshold = toNum(body.threshold ?? 70, 70, 100, 'Ngưỡng S-match');
  const initialStages = body.stages || (legacy?.stages || []).map(stage => ({ ...stage, nodes: (stage.nodes || []).map(node => ({ ...node, outcomes: (node.outcomes || node.topics || []).join?.('\n') || node.outcomes || '', description: node.description || '', tags: node.tags || [] })) }));
  const row = { category_id: categoryId, code: txt(body.code) || category.roadmap_short_code || `RM-${categoryId}`, name: txt(body.name) || legacy?.career_name || category.name, career_name: txt(body.name) || legacy?.career_name || category.name, industry: txt(body.industry) || category.name, description: txt(body.description) || legacy?.description || '', status: 'draft', version: Number(prior[0]?.version || 0) + 1, threshold, stages: normalizeStages(initialStages, threshold, true), created_by: String(options.adminId), created_at: now, updated_at: now, version_id: randomUUID() };
  const result = await db.collection(ADMIN_ROADMAP_VERSIONS).insertOne(row, { session }); row._id = result.insertedId;
  await audit(db, options.req, 'ROADMAP_DRAFT_CREATED', row, null, { status: 'draft', version: row.version }, {}, session);
  return { success: true, roadmap: snapshot(row) };
  });
}
export async function saveAdminRoadmap(id, body = {}, options = {}) {
  const db = options.db || await getMongoDb();
  return roadmapTransaction(db, async session => {
  const row = await db.collection(ADMIN_ROADMAP_VERSIONS).findOne(versionQuery(id), { session });
  if (!row) throw FAIL('Không tìm thấy bản nháp lộ trình.', 404, 'ROADMAP_NOT_FOUND');
  if (row.status !== 'draft') throw FAIL('Chỉ được chỉnh sửa bản nháp.', 409, 'ROADMAP_NOT_DRAFT');
  const rawStages = normalizeStages(body.stages, body.threshold ?? row.threshold, true), stages = await recalculateSelectedCourses(db, rawStages), name = txt(body.name ?? row.name), description = txt(body.description ?? row.description);
  if (!name || name.length > 200 || description.length > 5000) throw FAIL('Thông tin lộ trình không hợp lệ.');
  const now = options.now || new Date(), result = await db.collection(ADMIN_ROADMAP_VERSIONS).updateOne({ _id: row._id, status: 'draft', updated_at: row.updated_at }, { $set: { name, description, industry: txt(body.industry ?? row.industry), threshold: toNum(body.threshold ?? row.threshold, 70, 100, 'Ngưỡng S-match'), stages, updated_at: now }, $inc: { revision: 1 } }, { session });
  if (!result.modifiedCount) throw FAIL('Bản nháp vừa được thay đổi. Tải lại trước khi lưu.', 409, 'ROADMAP_UPDATE_CONFLICT');
  const updated = await db.collection(ADMIN_ROADMAP_VERSIONS).findOne({ _id: row._id }, { session });
  await audit(db, options.req, 'ROADMAP_DRAFT_SAVED', row, { revision: row.revision || 0 }, { revision: updated.revision }, {}, session);
  return { success: true, roadmap: snapshot(updated) };
  });
}
export async function publishAdminRoadmap(id, options = {}) {
  const db = options.db || await getMongoDb();
  return roadmapTransaction(db, async session => {
  const row = await db.collection(ADMIN_ROADMAP_VERSIONS).findOne(versionQuery(id), { session });
  if (!row) throw FAIL('Không tìm thấy bản nháp lộ trình.', 404, 'ROADMAP_NOT_FOUND');
  if (row.status !== 'draft') throw FAIL('Lộ trình không ở trạng thái bản nháp.', 409, 'ROADMAP_NOT_DRAFT');
  const currentStages = await recalculateSelectedCourses(db, row.stages || []);
  const missing = [];
  for (const stage of currentStages) {
    if (!stage.test) missing.push(`Thiếu bài kiểm tra ở giai đoạn ${stage.title}`);
    for (const node of stage.nodes || []) if (!(node.courses || []).some(course => course.s_match >= Math.max(70, node.threshold || row.threshold) && course.level_match)) missing.push(`Node ${node.title} chưa có khóa học đạt S-match và cấp độ phù hợp`);
  }
  if (missing.length) throw Object.assign(FAIL('Lộ trình chưa đủ điều kiện xuất bản.', 409, 'ROADMAP_PUBLISH_INVALID'), { details: missing });
  const now = options.now || new Date(), versions = db.collection(ADMIN_ROADMAP_VERSIONS);
  const suffix = String(row.version_id).replaceAll('-', '').slice(0, 10);
  const publishedStages = currentStages.map(stage => {
    const stageId = `${stage.stage_id}__${suffix}`;
    const nodes = stage.nodes.map(node => ({ ...node, node_id: `${node.node_id}__${suffix}` }));
    const nodeIds = new Map(stage.nodes.map((node, index) => [node.node_id, nodes[index].node_id]));
    const questions = stage.test?.questions?.map((question, index) => ({ ...question, question_id: `${question.question_id}__${suffix}-${index + 1}`, node_id: nodeIds.get(question.node_id) || nodes[index % Math.max(nodes.length, 1)]?.node_id })) || [];
    return { ...stage, stage_id: stageId, nodes, test: stage.test ? { ...stage.test, questions } : null };
  });
  const result = await versions.updateOne({ _id: row._id, status: 'draft', updated_at: row.updated_at }, { $set: { status: 'published', stages: publishedStages, published_at: now, published_by: String(options.adminId), updated_at: now }, $inc: { revision: 1 } }, { session });
  if (!result.modifiedCount) throw FAIL('Bản nháp vừa được thay đổi. Tải lại trước khi xuất bản.', 409, 'ROADMAP_PUBLISH_CONFLICT');
  await versions.updateMany({ _id: { $ne: row._id }, category_id: row.category_id, status: 'published' }, { $set: { status: 'superseded', superseded_at: now, updated_at: now } }, { session });
  const updated = await versions.findOne({ _id: row._id }, { session });
  await audit(db, options.req, 'ROADMAP_PUBLISHED', row, { status: 'draft' }, { status: 'published', version: row.version }, {}, session);
  return { success: true, roadmap: snapshot(updated), publishedAt: now.toISOString() };
  });
}
export async function hideAdminRoadmap(id, options = {}) {
  const db = options.db || await getMongoDb();
  return roadmapTransaction(db, async session => {
  const row = await db.collection(ADMIN_ROADMAP_VERSIONS).findOne(versionQuery(id), { session });
  if (!row) throw FAIL('Không tìm thấy lộ trình.', 404, 'ROADMAP_NOT_FOUND');
  if (row.status !== 'published') throw FAIL('Chỉ lộ trình đang hoạt động mới có thể tạm ẩn.', 409, 'ROADMAP_STATE_CONFLICT');
  const now = options.now || new Date(), result = await db.collection(ADMIN_ROADMAP_VERSIONS).updateOne({ _id: row._id, status: 'published', updated_at: row.updated_at }, { $set: { status: 'hidden', hidden_at: now, hidden_by: String(options.adminId), updated_at: now }, $inc: { revision: 1 } }, { session });
  if (!result.modifiedCount) throw FAIL('Lộ trình vừa được thay đổi. Tải lại trước khi thử tiếp.', 409, 'ROADMAP_UPDATE_CONFLICT');
  const changed = await db.collection(ADMIN_ROADMAP_VERSIONS).findOne({ _id: row._id }, { session });
  await audit(db, options.req, 'ROADMAP_HIDDEN', row, { status: row.status }, { status: changed.status }, {}, session);
  return { success: true, roadmap: snapshot(changed) };
  });
}

export function createAdminRoadmapsRouter(express, requireAdmin) {
  const router = express.Router(); router.use(requireAdmin);
  const roles = createAdminRoleMiddleware(['SA', 'CA']), sa = createAdminRoleMiddleware(['SA']);
  router.get('/summary', roles, async (req,res,next)=>{ try { res.json(await getAdminRoadmapSummary()); } catch(e) { next(e); } });
  router.get('/', roles, async (req,res,next)=>{ try { res.json(await listAdminRoadmaps(req.query)); } catch(e) { next(e); } });
  router.post('/', roles, async (req,res,next)=>{ try { res.status(201).json(await createAdminRoadmap(req.body || {}, { adminId: req.adminId, req })); } catch(e) { next(e); } });
  router.get('/:id', roles, async (req,res,next)=>{ try { res.json(await getAdminRoadmap(req.params.id)); } catch(e) { next(e); } });
  router.get('/:id/nodes/:nodeId/suggestions', roles, async (req,res,next)=>{ try { const { roadmap } = await getAdminRoadmap(req.params.id); const node = roadmap.stages.flatMap(stage => stage.nodes || []).find(item => item.node_id === req.params.nodeId); if (!node) throw FAIL('Không tìm thấy node.',404,'ROADMAP_NODE_NOT_FOUND'); const courses = await calculateNodeCourseSuggestions(node, { threshold: Math.max(70, roadmap.threshold || node.threshold || 70) }); res.json({ success: true, threshold: Math.max(70, roadmap.threshold || node.threshold || 70), total: courses.length, courses }); } catch(e) { next(e); } });
  router.patch('/:id', roles, async (req,res,next)=>{ try { res.json(await saveAdminRoadmap(req.params.id, req.body || {}, { adminId: req.adminId, req })); } catch(e) { next(e); } });
  router.post('/:id/publish', roles, async (req,res,next)=>{ try { res.json(await publishAdminRoadmap(req.params.id, { adminId: req.adminId, req })); } catch(e) { next(e); } });
  router.post('/:id/hide', sa, async (req,res,next)=>{ try { res.json(await hideAdminRoadmap(req.params.id, { adminId: req.adminId, req })); } catch(e) { next(e); } });
  return router;
}
