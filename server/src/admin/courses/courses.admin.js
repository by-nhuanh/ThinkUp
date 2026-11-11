import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { getMongoDb } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';
import { syncApprovedCourseWithRoadmaps } from '../roadmaps/roadmaps.admin.js';

const FAIL = (message, status = 400, code = 'COURSE_ADMIN_INVALID') => Object.assign(new Error(message), { status, code });
const REVIEW = new Set(['pending_review', 'in_review', 'changes_requested', 'approved', 'rejected']);
const BUSINESS = new Set(['published', 'hidden', 'archived', 'unpublished']);
const text = value => String(value ?? '').trim();
const date = value => value instanceof Date ? value : value ? new Date(value) : null;
const iso = value => date(value)?.toISOString() || null;
const esc = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const courseQuery = id => {
  const value = text(id);
  if (!value || value.length > 100) throw FAIL('Mã khóa học không hợp lệ.');
  const clauses = [{ course_id: value }, { id: value }];
  if (ObjectId.isValid(value)) clauses.push({ _id: new ObjectId(value) });
  return { $or: clauses };
};
function statusOf(doc) {
  const businessStatus = doc.business_status || (doc.status === 'published' ? 'published' : doc.status === 'archived' ? 'archived' : doc.status === 'hidden' || doc.admin_hidden ? 'hidden' : 'unpublished');
  const reviewStatus = doc.review_status || (doc.status === 'pending_review' ? 'pending_review' : doc.status === 'published' || doc.business_status === 'published' ? 'approved' : null);
  return { businessStatus, reviewStatus };
}
function validatePage(query) {
  const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw FAIL('Phân trang không hợp lệ.');
  return { page, pageSize };
}
function viewCourse(row, instructor = null) {
  const status = statusOf(row);
  const submittedAt = date(row.review_submitted_at || row.submitted_at || (row.status === 'pending_review' ? row.created_at || row.createdAt : null));
  const elapsedHours = submittedAt ? Math.max(0, (Date.now() - Number(submittedAt)) / 3600000) : null;
  return {
    id: String(row._id), courseId: String(row.course_id ?? row.id ?? row._id),
    title: row.title || '', slug: row.slug || '', categoryId: row.category_id ?? null,
    category: row.category_name || row.category || '', level: row.level || row.difficulty || '',
    instructorId: String(row.instructor_id ?? row.instructorId ?? ''), instructorName: instructor?.full_name || instructor?.name || row.instructor_name || row.instructor?.name || '',
    status: status.businessStatus, reviewStatus: status.reviewStatus,
    price: Number(row.price ?? 0), originalPrice: Number(row.original_price ?? row.price ?? 0),
    rating: Number(row.rating ?? row.average_rating ?? 0), ratingCount: Number(row.total_reviews ?? row.rating_count ?? 0),
    learnerCount: Number(row.total_students ?? row.student_count ?? 0), createdAt: iso(row.created_at || row.createdAt), updatedAt: iso(row.updated_at || row.updatedAt),
    thumbnailUrl: row.thumbnail_url || '', archivedAt: iso(row.archived_at), hidden: status.businessStatus === 'hidden',
    reviewSubmittedAt: iso(submittedAt), reviewStartedAt: iso(row.review_started_at),
    reviewDueAt: submittedAt ? new Date(Number(submittedAt) + 48 * 3600000).toISOString() : null,
    reviewHoursRemaining: elapsedHours === null ? null : Number((48 - elapsedHours).toFixed(1)),
    reviewOverdueHours: elapsedHours === null || elapsedHours <= 48 ? 0 : Number((elapsedHours - 48).toFixed(1)),
  };
}
async function enrichInstructors(db, rows) {
  const ids = [...new Set(rows.flatMap(row => [row.instructor_id, row.instructorId]).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const [profiles, users] = await Promise.all([
    db.collection('instructor_profiles').find({ $or: [{ instructor_id: { $in: ids } }, { user_id: { $in: ids } }, { _id: { $in: ids.filter(ObjectId.isValid).map(id => new ObjectId(id)) } }] }, { projection: { instructor_id: 1, user_id: 1, full_name: 1, name: 1 } }).toArray(),
    db.collection('users').find({ $or: [{ id: { $in: ids } }, { instructor_id: { $in: ids } }, { _id: { $in: ids.filter(ObjectId.isValid).map(id => new ObjectId(id)) } }] }, { projection: { id: 1, instructor_id: 1, full_name: 1, name: 1 } }).toArray(),
  ]);
  const map = new Map();
  for (const row of [...profiles, ...users]) for (const id of [row.instructor_id, row.user_id, row.id, row._id]) if (id != null) map.set(String(id), row);
  return map;
}
function filterCourse(row, query) {
  const { businessStatus, reviewStatus } = statusOf(row);
  if (query.status && query.status !== 'all') {
    const status = query.status === 'pending' ? 'pending_review' : query.status;
    if (status === 'archived' ? businessStatus !== 'archived' && businessStatus !== 'hidden' : status === 'pending_review' ? reviewStatus !== 'pending_review' && reviewStatus !== 'in_review' && reviewStatus !== 'changes_requested' : businessStatus !== status && reviewStatus !== status) return false;
  }
  if (query.category && String(row.category_id ?? row.category ?? '') !== String(query.category)) return false;
  if (query.level && String(row.level ?? row.difficulty ?? '').toLowerCase() !== String(query.level).toLowerCase()) return false;
  if (query.startDate || query.endDate) {
    const created = date(row.created_at || row.createdAt); if (!created) return false;
    const start = query.startDate ? new Date(query.startDate) : null, end = query.endDate ? new Date(query.endDate) : null;
    if ((start && !Number.isFinite(+start)) || (end && !Number.isFinite(+end))) throw FAIL('Khoảng ngày không hợp lệ.');
    if (start && created < start || end && created > end) return false;
  }
  return true;
}
function searchMatch(row, instructor, term) {
  if (!term) return true;
  const needle = term.toLocaleLowerCase();
  return [row.course_id, row.id, row.title, instructor?.full_name, instructor?.name, row.instructor_name, row.instructor?.name]
    .some(value => String(value || '').toLocaleLowerCase().includes(needle));
}

export async function getAdminCourseSummary(query = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const now = options.now || new Date(), currentStart = new Date(+now - 30 * 86400000), priorStart = new Date(+now - 60 * 86400000);
  const rows = await db.collection('courses').find({}).toArray();
  const states = rows.map(statusOf);
  const total = rows.length;
  const published = states.filter(x => x.businessStatus === 'published').length;
  const pending = states.filter(x => ['pending_review', 'in_review', 'changes_requested'].includes(x.reviewStatus)).length;
  const hidden = states.filter(x => ['hidden', 'archived'].includes(x.businessStatus)).length;
  const currentNew = rows.filter(row => { const d = date(row.created_at || row.createdAt); return d && d >= currentStart && d <= now; }).length;
  const previousNew = rows.filter(row => { const d = date(row.created_at || row.createdAt); return d && d >= priorStart && d < currentStart; }).length;
  return { success: true, period: { start: currentStart.toISOString(), end: now.toISOString(), previousStart: priorStart.toISOString(), previousEnd: currentStart.toISOString() }, total, published, pending, hidden, totalChangePercent: previousNew ? Number(((currentNew - previousNew) / previousNew * 100).toFixed(1)) : null, publishedPercent: total ? Number((published / total * 100).toFixed(1)) : 0 };
}
export async function getAdminCourseApprovalSummary(options = {}) {
  const db = options.db || await getMongoDb(), now = options.now || new Date();
  const currentStart = new Date(+now - 30 * 86400000), priorStart = new Date(+now - 60 * 86400000);
  const rows = await db.collection('courses').find({}).toArray();
  const submittedAt = row => date(row.review_submitted_at || row.submitted_at || (row.status === 'pending_review' ? row.created_at || row.createdAt : null));
  const inRange = (row, start, end) => { const at = submittedAt(row); return at && at >= start && at < end; };
  const totalSubmitted = rows.filter(row => inRange(row, currentStart, new Date(+now + 1))).length;
  const previousTotal = rows.filter(row => inRange(row, priorStart, currentStart)).length;
  const pending = rows.filter(row => statusOf(row).reviewStatus === 'pending_review');
  const changesRequested = rows.filter(row => statusOf(row).reviewStatus === 'changes_requested').length;
  const dueState = pending.reduce((result, row) => {
    const at = submittedAt(row); if (!at) return result;
    const hours = (+now - +at) / 3600000;
    if (hours >= 48) result.overdue++;
    else if (hours >= 36) result.approaching++;
    return result;
  }, { approaching: 0, overdue: 0 });
  return { success: true, periodDays: 30, totalSubmitted, changePercent: previousTotal ? Number(((totalSubmitted - previousTotal) / previousTotal * 100).toFixed(1)) : null, waitingReview: pending.length, approachingDue: dueState.approaching, overdue: dueState.overdue, changesRequested, changesRequestedPercent: totalSubmitted ? Number((changesRequested / totalSubmitted * 100).toFixed(1)) : 0 };
}

export async function listAdminCourses(query = {}, options = {}) {
  const db = options.db || await getMongoDb(), { page, pageSize } = validatePage(query);
  const term = text(query.search || query.q);
  if (term.length > 120) throw FAIL('Từ khóa tìm kiếm quá dài.');
  const rows = await db.collection('courses').find({}).sort({ created_at: -1, _id: -1 }).toArray();
  const instructors = await enrichInstructors(db, rows);
  const filteredRows = rows.filter(row => filterCourse(row, query) && searchMatch(row, instructors.get(String(row.instructor_id ?? row.instructorId)), term));
  const items = filteredRows.slice((page - 1) * pageSize, page * pageSize).map(row => viewCourse(row, instructors.get(String(row.instructor_id ?? row.instructorId))));
  return { success: true, items, pagination: { page, pageSize, total: filteredRows.length, pages: Math.ceil(filteredRows.length / pageSize) } };
}

export async function getAdminCourse(id, options = {}) {
  const db = options.db || await getMongoDb(), course = await db.collection('courses').findOne(courseQuery(id));
  if (!course) throw FAIL('Không tìm thấy khóa học.', 404, 'COURSE_NOT_FOUND');
  const courseId = String(course.course_id ?? course._id);
  const [instructors, sections, lessons, documents] = await Promise.all([
    enrichInstructors(db, [course]),
    db.collection('course_sections').find({ course_id: courseId }).sort({ order_index: 1, _id: 1 }).toArray(),
    db.collection('lessons').find({ course_id: courseId }).sort({ order_index: 1, _id: 1 }).toArray(),
    db.collection('course_documents').find({ course_id: courseId }).toArray(),
  ]);
  const lessonIds = lessons.map(lesson => String(lesson.lesson_id || lesson._id));
  const videos = lessonIds.length ? await db.collection('lesson_videos').find({ lesson_id: { $in: lessonIds } }).toArray() : [];
  const videoByLesson = new Map(videos.map(video => [String(video.lesson_id), video]));
  const documentsByLesson = new Map();
  for (const doc of documents) { const key = String(doc.lesson_id || ''); documentsByLesson.set(key, [...(documentsByLesson.get(key) || []), { id: String(doc._id), name: doc.name || doc.file_name || '', type: doc.mime_type || doc.file_type || '', url: doc.download_url || doc.file_url || null }]); }
  const lessonViews = lessons.map(lesson => ({ id: String(lesson.lesson_id || lesson._id), sectionId: String(lesson.section_id || ''), title: lesson.title || '', type: lesson.lesson_type || 'video', durationMinutes: Number(lesson.duration_minutes || 0), video: videoByLesson.has(String(lesson.lesson_id || lesson._id)) ? { title: videoByLesson.get(String(lesson.lesson_id || lesson._id)).title || lesson.title || '', duration: videoByLesson.get(String(lesson.lesson_id || lesson._id)).duration || null } : null, documents: documentsByLesson.get(String(lesson.lesson_id || lesson._id)) || [] }));
  const category = await db.collection('course_categories').findOne({ category_id: course.category_id });
  const types = lessons.reduce((counts, lesson) => { const type = String(lesson.lesson_type || 'video').toLowerCase(); const normalized = ['article','reading','doc','text'].includes(type) ? 'article' : ['quiz','test','exam','assessment'].includes(type) ? 'quiz' : ['lab','coding','practice'].includes(type) ? 'lab' : 'video'; counts[normalized]++; return counts; }, { video: 0, article: 0, quiz: 0, lab: 0 });
  return { success: true, course: { ...viewCourse(course, instructors.get(String(course.instructor_id ?? course.instructorId))), description: course.description || '', shortDescription: course.short_description || course.subtitle || '', language: course.language || '', tags: course.tags || [], category: category?.name || course.category_name || course.category || '', curriculumSummary: { sectionCount: sections.length, lessonCount: lessons.length, ...types }, sections: sections.map(section => ({ id: String(section.section_id || section._id), title: section.title || '', order: section.order_index ?? null })), lessons: lessonViews, instructor: { id: String(course.instructor_id ?? ''), name: instructors.get(String(course.instructor_id ?? course.instructorId))?.full_name || course.instructor_name || '', email: instructors.get(String(course.instructor_id ?? course.instructorId))?.email || null } } };
}

export async function listAdminCourseLearners(id, query = {}, options = {}) {
  const db = options.db || await getMongoDb(), { page, pageSize } = validatePage(query);
  const course = await db.collection('courses').findOne(courseQuery(id));
  if (!course) throw FAIL('Không tìm thấy khóa học.', 404, 'COURSE_NOT_FOUND');
  const aliases = [...new Set([course.course_id, course.id, course._id].filter(Boolean).map(String))];
  const relation = { $or: aliases.flatMap(courseId => [{ course_id: courseId }, { courseId }]) };
  const [enrollments, owned, progresses] = await Promise.all([
    db.collection('user_enrollments').find(relation).toArray(),
    db.collection('user_courses').find(relation).toArray(),
    db.collection('user_course_progress').find(relation).toArray(),
  ]);
  const progressByUser = new Map();
  for (const row of progresses) for (const key of [row.user_id, row.userId]) if (key != null) progressByUser.set(String(key), row);
  const unique = new Map();
  for (const row of [...enrollments, ...owned]) {
    const userId = String(row.user_id ?? row.userId ?? ''); if (!userId) continue;
    const prior = unique.get(userId) || {};
    unique.set(userId, { ...prior, ...row, userId, progress: progressByUser.get(userId) || prior.progress });
  }
  const records = [...unique.values()].sort((a,b) => new Date(b.purchased_at || b.enrolled_at || b.created_at || 0) - new Date(a.purchased_at || a.enrolled_at || a.created_at || 0));
  const ids = [...new Set(records.map(row => row.userId))];
  const objectIds = ids.filter(ObjectId.isValid).map(value => new ObjectId(value));
  const users = ids.length ? await db.collection('users').find({ $or: [{ user_id: { $in: ids } }, { id: { $in: ids } }, ...(objectIds.length ? [{ _id: { $in: objectIds } }] : [])] }, { projection: { user_id: 1, id: 1, full_name: 1, name: 1, email: 1 } }).toArray() : [];
  const userMap = new Map(users.flatMap(user => [[String(user.user_id || user._id), user], [String(user.id || user._id), user]]));
  const items = records.slice((page - 1) * pageSize, page * pageSize).map(row => { const user = userMap.get(row.userId) || {}; const progress = row.progress || {}; return { userId: row.userId, fullName: user.full_name || user.name || '', email: user.email || '', purchasedAt: iso(row.purchased_at || row.paid_at || row.enrolled_at || row.created_at), progress: Number(progress.progress_percentage ?? progress.progress ?? row.progress_percentage ?? 0), completed: Boolean(progress.is_completed || progress.completed) }; });
  return { success: true, items, pagination: { page, pageSize, total: records.length, pages: Math.ceil(records.length / pageSize) } };
}

function orderSummary(transaction) { try { return typeof transaction.order_summary === 'string' ? JSON.parse(transaction.order_summary) : transaction.order_summary || {}; } catch { return {}; } }
export async function getAdminCourseFinance(id, query = {}, options = {}) {
  const db = options.db || await getMongoDb(), course = await db.collection('courses').findOne(courseQuery(id));
  if (!course) throw FAIL('Không tìm thấy khóa học.', 404, 'COURSE_NOT_FOUND');
  const { businessStatus, reviewStatus } = statusOf(course);
  if (reviewStatus !== 'approved' || !['published', 'hidden'].includes(businessStatus)) throw FAIL('Chỉ khóa đã duyệt, đang bán hoặc tạm ẩn mới có báo cáo tài chính.', 409, 'COURSE_FINANCE_UNAVAILABLE');
  const start = query.startDate ? new Date(query.startDate) : null, end = query.endDate ? new Date(query.endDate) : null;
  if (start && !Number.isFinite(+start) || end && !Number.isFinite(+end) || start && end && start > end) throw FAIL('Khoảng ngày không hợp lệ.');
  const txs = await db.collection('payment_transactions').find({ record_type: { $ne: 'gateway_receipt' }, status: { $in: ['paid','success','completed'] } }).toArray();
  const courseIds = new Set([String(course.course_id ?? course._id), String(course._id)]);
  const rows = [];
  for (const tx of txs) {
    const summary = orderSummary(tx), item = (summary.courses || []).find(row => courseIds.has(String(row.id || row.course_id)));
    if (!item) continue;
    const at = date(tx.paid_at || tx.created_at); if (!at || start && at < start || end && at > end) continue;
    const allocation = (summary.voucher_allocations || []).find(row => courseIds.has(String(row.courseId || row.course_id || row.id)));
    const discount = Number(allocation?.discount ?? (summary.voucher_sponsor === 'instructor' && String(summary.voucher_instructor_id) === String(course.instructor_id) ? summary.voucher_discount : 0)) || 0;
    const original = Number(item.original_price ?? item.price ?? 0), gross = Number(item.price ?? 0), paid = Math.max(0, gross - discount);
    const instructorVoucher = summary.voucher_sponsor === 'instructor' && String(summary.voucher_instructor_id) === String(course.instructor_id);
    rows.push({ transactionId: tx.transaction_id || String(tx._id), orderId: tx.order_id || null, date: at.toISOString(), status: tx.status, simulated: Boolean(tx.is_simulated || tx.execution_mode === 'simulation'), listedPrice: original, grossRevenue: gross, voucherDiscount: discount, voucherSponsor: summary.voucher_sponsor || null, actualPaid: paid, instructorShare: Math.round((instructorVoucher ? gross : paid) * 0.4), platformShare: Math.round((instructorVoucher ? 0 : paid) * 0.6), refundAmount: 0, instructorRefundShare: 0, platformRefundShare: 0, unallocatedRefund: 0 });
  }
  const complaints = await db.collection('support_complaints').find({ course_id: { $in: [...courseIds] }, status: 'resolved', 'resolution.type': 'refund' }).toArray();
  let refundTotal = 0, instructorRefundShare = 0, platformRefundShare = 0, unallocatedRefund = 0;
  for (const complaint of complaints) {
    const refunded = Number(complaint.resolution?.refundAmount || 0); if (!refunded) continue;
    refundTotal += refunded;
    if (complaint.order_id && complaint.resolution?.instructorDeduction != null && complaint.resolution?.platformDeduction != null) {
      instructorRefundShare += Number(complaint.resolution.instructorDeduction); platformRefundShare += Number(complaint.resolution.platformDeduction);
      const matching = rows.find(row => String(row.orderId) === String(complaint.order_id));
      if (matching) { matching.refundAmount += refunded; matching.instructorRefundShare += Number(complaint.resolution.instructorDeduction); matching.platformRefundShare += Number(complaint.resolution.platformDeduction); }
    } else unallocatedRefund += refunded;
  }
  const totals = rows.reduce((sum,row) => { for (const key of ['listedPrice','grossRevenue','voucherDiscount','actualPaid','instructorShare','platformShare']) sum[key] += row[key]; return sum; }, { listedPrice:0,grossRevenue:0,voucherDiscount:0,actualPaid:0,instructorShare:0,platformShare:0 });
  return { success:true, courseId:String(course.course_id || course._id), period:{start:start?.toISOString() || null,end:end?.toISOString() || null}, totals:{...totals,orderCount:rows.length,refundTotal,instructorRefundShare,platformRefundShare,unallocatedRefund,netAfterRefund:totals.actualPaid-refundTotal}, orders:rows.sort((a,b)=>b.date.localeCompare(a.date)) };
}

async function logCourseAction(db, req, action, courseId, before, after, metadata = {}) {
  const correlationId = randomUUID(), adminId = ObjectId.isValid(String(req.adminId || '')) ? new ObjectId(String(req.adminId)) : null;
  const result = await db.collection('admin_audit_logs').insertOne({ admin_id: adminId, action, ip: req.ip || 'unknown', user_agent: req.headers['user-agent'] || 'unknown', details: { entity: { type: 'course', id: String(courseId) }, before, after, outcome: 'success', correlation_id: correlationId, metadata }, created_at: new Date() }, { session: req.auditSession });
  if (!result.acknowledged) throw FAIL('Không thể ghi audit log; thay đổi đã bị hủy.', 503, 'COURSE_AUDIT_UNAVAILABLE');
}
async function courseTransaction(db, work) {
  if (!db.client?.startSession) throw FAIL('CSDL cần hỗ trợ transaction để thay đổi khóa học an toàn.', 503, 'COURSE_STORAGE_UNAVAILABLE');
  const session = db.client.startSession();
  try { return await session.withTransaction(() => work(session)); } finally { await session.endSession(); }
}
export async function changeCourseStatus(id, { businessStatus, reason, explanation, evidence }, req, options = {}) {
  const evidenceRows = typeof evidence === 'string' && evidence.trim() ? [evidence.trim()] : evidence ?? [];
  if (!BUSINESS.has(businessStatus)) throw FAIL('Trạng thái kinh doanh không hợp lệ.');
  if (businessStatus === 'archived' && (text(reason).length < 2 || text(reason).length > 120 || text(explanation).length < 10 || text(explanation).length > 2000)) throw FAIL('Cần chọn lý do và nhập giải thích lưu trữ hợp lệ.');
  if (!Array.isArray(evidenceRows) || evidenceRows.length > 10 || evidenceRows.some(x => typeof x !== 'string' || x.length > 1000 || (x && !/^https:\/\//i.test(x)))) throw FAIL('Minh chứng phải là đường dẫn HTTPS hợp lệ.');
  const db = options.db || await getMongoDb();
  return courseTransaction(db, async session => {
  const current = await db.collection('courses').findOne(courseQuery(id), { session });
  if (!current) throw FAIL('Không tìm thấy khóa học.', 404, 'COURSE_NOT_FOUND');
  const statuses = statusOf(current);
  if (businessStatus === 'published' && statuses.reviewStatus !== 'approved') throw FAIL('Chỉ khóa học đã được duyệt mới có thể xuất bản.', 409, 'COURSE_REVIEW_REQUIRED');
  if (statuses.businessStatus === 'archived' && businessStatus !== 'archived') throw FAIL('Khóa học đã lưu trữ không thể mở lại bằng thao tác trạng thái thông thường.', 409, 'COURSE_ARCHIVED');
  const now = options.now || new Date(), patch = { business_status: businessStatus, updated_at: now };
  if (businessStatus === 'published') { patch.status = 'published'; patch.admin_hidden = false; }
  else if (businessStatus === 'hidden') { patch.status = 'hidden'; patch.admin_hidden = true; }
  else if (businessStatus === 'archived') { patch.status = 'archived'; patch.admin_hidden = true; patch.archived_at = now; patch.archived_by = String(req.adminId); patch.archive_reason = text(reason); patch.archive_explanation = text(explanation); patch.archive_evidence = evidenceRows; }
  else { patch.status = 'draft'; patch.admin_hidden = true; }
  const updated = await db.collection('courses').findOneAndUpdate({ _id: current._id, status: current.status, updated_at: current.updated_at ?? { $exists: false } }, { $set: patch, $inc: { admin_version: 1 } }, { returnDocument: 'after', session });
  if (!updated) throw FAIL('Khóa học vừa được cập nhật. Tải lại rồi thử tiếp.', 409, 'COURSE_UPDATE_CONFLICT');
  await logCourseAction(db, { ...req, auditSession: session }, businessStatus === 'archived' ? 'COURSE_ARCHIVED' : 'COURSE_BUSINESS_STATUS_CHANGED', current.course_id || current._id, { status: statuses.businessStatus }, { status: businessStatus }, { reason: text(reason), explanation: text(explanation), evidence: evidenceRows });
  return { success: true, course: viewCourse(updated) };
  });
}
export async function decideCourseReview(id, body, req, options = {}) {
  const rawDecision = text(body?.decision);
  const decision = rawDecision === 'supplement' || rawDecision === 'request_supplement' ? 'request_changes' : rawDecision;
  const reason = text(body?.reason || body?.issueType), details = text(body?.details || body?.detail);
  if (!['approve', 'reject', 'request_changes'].includes(decision)) throw FAIL('Quyết định kiểm duyệt không hợp lệ.');
  if (decision !== 'approve' && (reason.length < 2 || reason.length > 120 || details.length < 10 || details.length > 2000)) throw FAIL('Cần ghi lý do và nội dung xử lý chi tiết.');
  const db = options.db || await getMongoDb();
  return courseTransaction(db, async session => {
  const coll = db.collection('courses'), current = await coll.findOne(courseQuery(id), { session });
  if (!current) throw FAIL('Không tìm thấy khóa học.', 404, 'COURSE_NOT_FOUND');
  const { reviewStatus } = statusOf(current);
  if (!['pending_review', 'in_review', 'changes_requested'].includes(reviewStatus)) throw FAIL('Khóa học không ở trạng thái có thể thẩm định.', 409, 'COURSE_REVIEW_STATE_CONFLICT');
  const now = options.now || new Date(), nextReview = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'changes_requested';
  const patch = { review_status: nextReview, review_decision: decision, review_decision_at: now, review_decision_by: String(req.adminId), review_reason: reason || null, review_details: details || null, updated_at: now };
  if (decision === 'approve') { patch.business_status = 'published'; patch.status = 'published'; patch.admin_hidden = false; patch.published_at = now; }
  const result = await coll.updateOne({ _id: current._id, review_status: current.review_status ?? { $exists: false }, status: current.status }, { $set: patch, $inc: { admin_version: 1 }, $push: { admin_review_history: { action: decision, from: reviewStatus, to: nextReview, actor_id: String(req.adminId), reason, details, created_at: now } } }, { session });
  if (!result.modifiedCount) throw FAIL('Khóa học vừa được cập nhật. Tải lại rồi thử tiếp.', 409, 'COURSE_REVIEW_CONFLICT');
  const roadmaps = decision === 'approve' ? await syncApprovedCourseWithRoadmaps(db, current.course_id || current._id, { session, now }) : { changedRoadmaps: 0 };
  await logCourseAction(db, { ...req, auditSession: session }, `COURSE_REVIEW_${decision.toUpperCase()}`, current.course_id || current._id, { reviewStatus }, { reviewStatus: nextReview, businessStatus: decision === 'approve' ? 'published' : statusOf(current).businessStatus }, { reason, details, roadmapsUpdated: roadmaps.changedRoadmaps });
  return { success: true, courseId: String(current.course_id || current._id), reviewStatus: nextReview, businessStatus: decision === 'approve' ? 'published' : statusOf(current).businessStatus };
  });
}

export async function claimCourseReview(id, req, options = {}) {
  const db = options.db || await getMongoDb();
  return courseTransaction(db, async session => {
    const current = await db.collection('courses').findOne(courseQuery(id), { session });
    if (!current) throw FAIL('Không tìm thấy khóa học.',404,'COURSE_NOT_FOUND');
    if (statusOf(current).reviewStatus !== 'pending_review') throw FAIL('Khóa học không còn chờ tiếp nhận.',409,'COURSE_REVIEW_STATE_CONFLICT');
    const now = options.now || new Date();
    const changed = await db.collection('courses').updateOne({ _id: current._id, status: current.status, review_status: current.review_status ?? { $exists: false } }, { $set: { review_status: 'in_review', review_started_at: now, review_assignee_admin_id: String(req.adminId), updated_at: now }, $inc: { admin_version: 1 }, $push: { admin_review_history: { action: 'claim', from: 'pending_review', to: 'in_review', actor_id: String(req.adminId), created_at: now } } }, { session });
    if (!changed.modifiedCount) throw FAIL('Hồ sơ vừa được tiếp nhận bởi Admin khác.',409,'COURSE_REVIEW_CONFLICT');
    await logCourseAction(db, { ...req, auditSession: session }, 'COURSE_REVIEW_CLAIMED', current.course_id || current._id, { reviewStatus: 'pending_review' }, { reviewStatus: 'in_review', assignedTo: String(req.adminId) });
    return { success: true, courseId: String(current.course_id || current._id), reviewStatus: 'in_review', reviewStartedAt: now.toISOString() };
  });
}

export function createAdminCoursesRouter(express, requireAdmin) {
  const router = express.Router();
  router.use(requireAdmin);
  router.get('/summary', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await getAdminCourseSummary(req.query)); } catch (error) { next(error); } });
  router.get('/approvals/summary', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await getAdminCourseApprovalSummary()); } catch (error) { next(error); } });
  router.get('/approvals', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await listAdminCourses({ ...req.query, status: req.query.status || 'pending_review' })); } catch (error) { next(error); } });
  router.get('/approvals/:id', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await getAdminCourse(req.params.id)); } catch (error) { next(error); } });
  router.post('/approvals/:id/claim', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await claimCourseReview(req.params.id, req)); } catch (error) { next(error); } });
  router.post('/approvals/:id/decision', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await decideCourseReview(req.params.id, req.body || {}, req)); } catch (error) { next(error); } });
  router.get('/export', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { const pageSize = 100; const first = await listAdminCourses({ ...req.query, page: 1, pageSize }); const all = [...first.items]; for (let page = 2; page <= Math.ceil(first.pagination.total / pageSize); page++) all.push(...(await listAdminCourses({ ...req.query, page, pageSize })).items); const columns = ['Mã khóa học','Tên khóa học','Danh mục','Giảng viên','Học viên','Giá','Đánh giá','Trạng thái','Ngày tạo']; const values = all.map(x => [x.courseId,x.title,x.category,x.instructorName,x.learnerCount,x.price,x.rating,x.status,x.createdAt]); const safe = value => String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&"); if (req.query.format === 'excel') { const xml = value => safe(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); const body = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Courses"><Table>${[columns,...values].map(row => `<Row>${row.map(value => `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`; res.type('application/vnd.ms-excel; charset=utf-8').attachment('thinkup-courses.xls').send(body); return; } const csv = '\uFEFF' + [columns,...values].map(row => row.map(x => `"${safe(x).replaceAll('"','""')}"`).join(',')).join('\r\n'); res.type('text/csv; charset=utf-8').attachment('thinkup-courses.csv').send(csv); } catch (error) { next(error); } });
  router.get('/', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await listAdminCourses(req.query)); } catch (error) { next(error); } });
  router.get('/:id', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await getAdminCourse(req.params.id)); } catch (error) { next(error); } });
  router.get('/:id/learners', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await listAdminCourseLearners(req.params.id, req.query)); } catch (error) { next(error); } });
  router.get('/:id/finance', createAdminRoleMiddleware(['SA', 'FA']), async (req, res, next) => { try { res.json(await getAdminCourseFinance(req.params.id, req.query)); } catch (error) { next(error); } });
  router.patch('/:id/business-status', createAdminRoleMiddleware(['SA']), async (req, res, next) => { try { res.json(await changeCourseStatus(req.params.id, req.body || {}, req)); } catch (error) { next(error); } });
  router.patch('/:id/pricing', createAdminRoleMiddleware(['SA']), async (req, res, next) => { try { const price = Number(req.body?.price), originalPrice = Number(req.body?.originalPrice); if (!Number.isSafeInteger(price) || price < 0 || price > 1000000000 || !Number.isSafeInteger(originalPrice) || originalPrice < price || originalPrice > 1000000000) throw FAIL('Giá bán/giá niêm yết không hợp lệ.'); const db = await getMongoDb(); const result = await courseTransaction(db, async session => { const course = await db.collection('courses').findOne(courseQuery(req.params.id), { session }); if (!course) throw FAIL('Không tìm thấy khóa học.',404,'COURSE_NOT_FOUND'); const now = new Date(); const changed = await db.collection('courses').updateOne({ _id: course._id, updated_at: course.updated_at ?? { $exists: false } }, { $set: { price, original_price: originalPrice, updated_at: now }, $inc: { admin_version: 1 } }, { session }); if (!changed.modifiedCount) throw FAIL('Khóa học vừa được cập nhật. Tải lại rồi thử tiếp.',409,'COURSE_UPDATE_CONFLICT'); await logCourseAction(db, { ...req, auditSession: session }, 'COURSE_PRICE_CHANGED', course.course_id || course._id, { price: course.price, originalPrice: course.original_price }, { price, originalPrice }); return { courseId: String(course.course_id || course._id), price, originalPrice }; }); res.json({ success: true, ...result }); } catch (error) { next(error); } });
  router.post('/:id/review-decision', createAdminRoleMiddleware(['SA', 'CA']), async (req, res, next) => { try { res.json(await decideCourseReview(req.params.id, req.body || {}, req)); } catch (error) { next(error); } });
  return router;
}
