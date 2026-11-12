import { ObjectId, Binary } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { getMongoDb, sendEmail } from '../../user/db.js';
import { createAdminRoleMiddleware } from '../auth/admin-rbac.js';
import { recordAuditLog } from '../auth/auth.admin.js';

const bad = (message, status = 400, code = 'USER_ADMIN_INVALID') => Object.assign(new Error(message), { status, code });
const asId = value => ObjectId.isValid(value) ? new ObjectId(value) : null;
const iso = value => value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
const mask = value => typeof value === 'string' && value.length > 3 ? `${'*'.repeat(value.length - 3)}${value.slice(-3)}` : value ?? null;
const formatVietnamTime = value => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
};

function page(query) {
  const p = Number(query.page || 1), size = Number(query.pageSize || 8);
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(size) || size < 1 || size > 100) throw bad('Tham số phân trang không hợp lệ.');
  return { page: p, pageSize: size };
}
function dateBound(value, upper = false) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(+d)) throw bad('Khoảng ngày không hợp lệ.');
  if (upper && /^\d{4}-\d\d-\d\d$/.test(value)) d.setUTCHours(23, 59, 59, 999);
  return d;
}
function safeText(value, min, max, field) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw bad(`${field} không hợp lệ.`);
  return value.trim();
}
function adminView(row, role) {
  const full = role === 'SA';
  return { id: String(row._id), studentId: row.student_id || null, name: row.full_name || row.name || '',
    email: row.email || '', phone: row.phone || '', status: row.status || 'active', role: row.role,
    registeredAt: iso(row.created_at), lockedUntil: iso(row.locked_until), lockLevel: row.lock_level || null,
    lockReason: row.lock_reason || null, taxCode: full ? row.tax_code || null : mask(row.tax_code),
    cccd: full ? row.cccd || null : mask(row.cccd) };
}
function filters(query, kind) {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const created = {};
  const from = dateBound(query.from), to = dateBound(query.to, true);
  if (from || to) { if (from) created.$gte = from; if (to) created.$lte = to; }
  const f = { deleted_at: { $exists: false }, ...(Object.keys(created).length ? { created_at: created } : {}) };
  if (kind === 'students') f.role = 'student';
  else { f.role = 'instructor'; }
  if (query.status) {
    if (!['active','locked','inactive','pending-review','pending-docs','pending-contract','warning','violation','frozen','rejected'].includes(query.status)) throw bad('Trạng thái lọc không hợp lệ.');
    f.status = query.status;
  }
  if (q) f.$and = [...(f.$and || []), { $or: ['student_id','instructor_id','full_name','name','email','phone','tax_code','cccd'].map(k => ({ [k]: { $regex: escapeRegex(q), $options: 'i' } })) }];
  return f;
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function userLookup(id) { return { $or: [{ _id: asId(id) }, { student_id: id }, { instructor_id: id }] }; }
function cleanEvidence(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5 || value.some(x => typeof x !== 'string' || !/^uev_[a-f0-9]{32}$/.test(x))) throw bad('Danh sách bằng chứng không hợp lệ.');
  return [...new Set(value)];
}
async function writeAudit(db, req, action, targetId, details) {
  const result = await recordAuditLog(db, { adminId: req.adminId, ip: req.ip, userAgent: req.headers['user-agent'], action,
    details: { entity: { type: 'user', id: String(targetId) }, ...details } });
  if (!result) throw bad('Không ghi được nhật ký kiểm toán; thao tác cần được đối soát.', 503, 'AUDIT_UNAVAILABLE');
}
async function readUser(db, id) {
  const user = await db.collection('users').findOne({ ...userLookup(id), deleted_at: { $exists: false } });
  if (!user) throw bad('Không tìm thấy tài khoản.', 404, 'USER_NOT_FOUND');
  return user;
}
function assertReviewLease(user, adminId, now = new Date()) {
  if(user.admin_review_lease_until && +new Date(user.admin_review_lease_until)>+now && String(user.admin_review_lease_admin)!==String(adminId)) {
    throw bad('Hồ sơ đang được xử lý bởi Admin khác.',409,'PROFILE_BUSY');
  }
}
async function verifyEvidence(db, ids, ownerId) {
  if (!ids.length) return [];
  const files = await db.collection('admin_user_evidence').find({ _id: { $in: ids }, owner_user_id: String(ownerId), linked_at: null }).toArray();
  if (files.length !== ids.length) throw bad('Có bằng chứng không tồn tại, đã dùng hoặc không thuộc hồ sơ này.', 400, 'EVIDENCE_INVALID');
  return files;
}
const STATUS_LABEL = { 1: 'Cảnh cáo · Mức 1', 2: 'Đình chỉ · Mức 2', 3: 'Đóng băng · Mức 3' };

export async function expireStudentLocks(options = {}) {
  const db = options.db || await getMongoDb(), now = options.now || new Date();
  const due = await db.collection('users').find({ role: 'student', status: 'locked', lock_level: { $in: [1,2] }, locked_until: { $lte: now }, deleted_at: { $exists: false } }).limit(100).toArray();
  let released = 0;
  for (const user of due) {
    const result = await db.collection('users').updateOne({ _id: user._id, status: 'locked', lock_level: user.lock_level, locked_at: user.locked_at, locked_until: { $lte: now } },
      { $set: { status: 'active', is_active: true, unlocked_at: now, unlock_reason: 'Hết thời hạn xử lý kỷ luật', updated_at: now }, $unset: { locked_until: '', lock_level: '', lock_reason: '' } });
    if (result.modifiedCount) {
      released++;
      await recordAuditLog(db, { adminId: user.locked_by, action: 'USER_STUDENT_AUTO_UNLOCK', details: { entity: { type: 'user', id: String(user._id) }, metadata: { level: user.lock_level, reason: 'Hết thời hạn xử lý kỷ luật' } } });
    }
  }
  return { released };
}

async function deliverOrQueueUserMail(db, user, payload, options = {}) {
  const now = new Date(options.now || Date.now()), id=`user-mail-${randomBytes(16).toString('hex')}`;
  const job={_id:id,user_id:String(user._id),to:user.email,subject:payload.subject,text:payload.text,status:'pending',attempts:0,next_attempt_at:now,created_at:now};
  await db.collection('admin_user_email_outbox').insertOne(job);
  return attemptUserMail(db,job,options);
}
async function attemptUserMail(db, job, options = {}) {
  try {
    const sent=await (options.sendEmail||sendEmail)({to:job.to,subject:job.subject,text:job.text});
    if(!sent?.accepted?.length||sent.sent===false) throw new Error('Email delivery unavailable');
    await db.collection('admin_user_email_outbox').updateOne({_id:job._id,status:'pending'},{$set:{status:'sent',sent_at:new Date(),last_error:null}});
    return true;
  } catch(error) {
    const attempts=(job.attempts||0)+1;
    await db.collection('admin_user_email_outbox').updateOne({_id:job._id,status:'pending'},{$inc:{attempts:1},$set:{status:attempts>=8?'failed':'pending',last_error:String(error.message||'Email failed').slice(0,200),next_attempt_at:new Date(Date.now()+Math.min(3600000,60000*2**attempts)),lease_until:null}});
    return false;
  }
}
export async function retryAdminUserEmails(options = {}) {
  const db=options.db||await getMongoDb(),now=options.now||new Date(),jobs=await db.collection('admin_user_email_outbox').find({status:'pending',next_attempt_at:{$lte:now},attempts:{$lt:8}}).limit(30).toArray();
  for(const job of jobs){const lease=randomBytes(8).toString('hex');const claimed=await db.collection('admin_user_email_outbox').updateOne({_id:job._id,status:'pending',next_attempt_at:{$lte:now},$or:[{lease_until:null},{lease_until:{$lte:now}},{lease_until:{$exists:false}}]},{$set:{lease_id:lease,lease_until:new Date(+now+30000)}});if(claimed.modifiedCount) await attemptUserMail(db,job,options);}
  return {attempted:jobs.length};
}

export async function listAdminUsers(kind, query = {}, options = {}) {
  const db = options.db || await getMongoDb();
  const { page: p, pageSize } = page(query);
  const filter = filters(query, kind);
  let profileByUser = new Map();
  let applicationByUser = new Map();
  let lecturerIds = [];
  if (kind === 'lecturers') {
    const profileFilter={deleted_at:{$exists:false}};
    if(query.status) profileFilter.status=query.status;
    if(query.field) profileFilter.$or=[{field:query.field},{specialty:query.field},{specialization:query.field}];
    if(query.q){const rx={$regex:escapeRegex(String(query.q).slice(0,100)),$options:'i'};profileFilter.$and=[...(profileFilter.$and||[]),{$or:[{title:rx},{field:rx},{specialty:rx},{tax_code:rx},{cccd:rx}]}];}
    if(query.legalStatus==='signed') profileFilter.legal_status='signed';
    if(query.legalStatus==='incomplete') profileFilter.legal_status={$ne:'signed'};
    if(query.legalStatus && !['signed','incomplete'].includes(query.legalStatus)) throw bad('Bộ lọc pháp lý không hợp lệ.');
    const applicationFilter={deleted_at:{$exists:false}};
    if(query.status) applicationFilter.status=query.status;
    if(query.legalStatus==='signed') applicationFilter.legal_status='signed';
    if(query.legalStatus==='incomplete') applicationFilter.legal_status={$ne:'signed'};
    if(query.field) applicationFilter['profile_snapshot.field']=query.field;
    if(query.q){const rx={$regex:escapeRegex(String(query.q).slice(0,100)),$options:'i'};applicationFilter.$or=[{'profile_snapshot.title':rx},{'profile_snapshot.field':rx},{'profile_snapshot.specialty':rx}];}
    const [profiles,applications] = await Promise.all([
      db.collection('instructor_profiles').find(profileFilter).toArray(),
      db.collection('instructor_applications').find(applicationFilter).toArray(),
    ]);
    profileByUser=new Map(profiles.flatMap(profile=>[profile.user_id,profile.instructor_id].filter(Boolean).map(id=>[String(id),profile])));
    applicationByUser=new Map(applications.flatMap(application=>[application.user_id].filter(Boolean).map(id=>[String(id),application])));
    lecturerIds = [...new Set([...profiles.flatMap(x=>[x.user_id,x.instructor_id]),...applications.map(x=>x.user_id)].filter(Boolean).map(String))];
    delete filter.status;
    delete filter.role;
    filter.$and = [...(filter.$and || []), { $or: [{ _id: { $in: lecturerIds.filter(asId).map(asId) } }, { instructor_id: { $in: lecturerIds.map(String) } }] }];
  }
  let rows,total;
  if(kind==='students'&&query.courseCount){
    if(!['none','1-3','more'].includes(query.courseCount)) throw bad('Bộ lọc số khóa học không hợp lệ.');
    const all=await db.collection('users').find(filter,{projection:{password_hash:0,refresh_token:0,security_secret:0}}).sort({created_at:-1,_id:-1}).limit(10000).toArray();
    const {getUserEnrolledCourses}=await import('../../user/course/course.user.js');
    const matches=[];
    for(const row of all){const count=(await getUserEnrolledCourses(String(row._id),{db})).length;const match=query.courseCount==='none'?count===0:query.courseCount==='1-3'?count>=1&&count<=3:count>3;if(match) matches.push(row);}
    total=matches.length; rows=matches.slice((p-1)*pageSize,p*pageSize);
  } else {
    [rows,total]=await Promise.all([
      db.collection('users').find(filter,{projection:{password_hash:0,refresh_token:0,security_secret:0}}).sort({created_at:-1,_id:-1}).skip((p-1)*pageSize).limit(pageSize).toArray(),
      db.collection('users').countDocuments(filter),
    ]);
  }
  let items=rows.map(row => {
    const profile=profileByUser.get(String(row._id))||profileByUser.get(String(row.instructor_id));
    const application=applicationByUser.get(String(row._id));
    const snapshot=application?.profile_snapshot||{};
    const status=application?.status||profile?.status||row.status;
    const legalStatus=application?.legal_status||profile?.legal_status;
    const taxCode=profile?.kyc?.taxCode||profile?.tax_code||row.tax_code;
    const cccd=profile?.kyc?.cccd||profile?.cccd||row.cccd;
    return {...adminView(row,options.role),...(profile||application?{
      status,legalStatus:legalStatus==='signed'?'signed':'incomplete',specialty:profile?.specialty||profile?.field||snapshot.specialty||snapshot.field||'',
      title:profile?.title||snapshot.title||'',field:profile?.field||snapshot.field||'',courses:profile?.course_count||0,learners:profile?.total_students||0,revenue:profile?.total_revenue||0,
      taxCode:options.role==='SA'?taxCode||null:mask(taxCode),cccd:options.role==='SA'?cccd||null:mask(cccd),profileId:profile?String(profile._id):application.profile_id||null,
    }: {})};
  });
  if(kind==='students'){
    const { getUserEnrolledCourses } = await import('../../user/course/course.user.js');
    items=await Promise.all(rows.map(async row=>{const view=adminView(row,options.role); const [courses,orders]=await Promise.all([
      getUserEnrolledCourses(String(row._id),{db}), db.collection('payment_transactions').countDocuments({$or:[{user_id:String(row._id)},{user_id:row._id},{userId:String(row._id)}]}),
    ]); return {...view,courseCount:courses.length,orders};}));
  }
  const lockedAdminIds=[...new Set(rows.filter(row=>row.admin_review_lease_until&&+new Date(row.admin_review_lease_until)>Date.now()).map(row=>String(row.admin_review_lease_admin)))];
  const admins=lockedAdminIds.length?await db.collection('admins').find({_id:{$in:lockedAdminIds.map(asId).filter(Boolean)}},{projection:{full_name:1,email:1}}).toArray():[];
  const adminNames=new Map(admins.map(a=>[String(a._id),a.full_name||a.email||'Admin']));
  items=items.map((item,index)=>({...item,reviewLock:rows[index]?.admin_review_lease_until&&+new Date(rows[index].admin_review_lease_until)>Date.now()?{held:true,adminId:String(rows[index].admin_review_lease_admin),adminName:adminNames.get(String(rows[index].admin_review_lease_admin))||'Admin'}:{held:false}}));
  return { success: true, items, pagination: { page: p, pageSize, total, pages: Math.ceil(total / pageSize) } };
}

export async function getAdminUserSummary(kind, options = {}) {
  const db = options.db || await getMongoDb(), users = db.collection('users'), now = options.now || new Date();
  if(kind==='lecturers'){
    const profiles=db.collection('instructor_profiles'),base={deleted_at:{$exists:false}};
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const [total,fresh,active,locked,pending]=await Promise.all([
      profiles.countDocuments(base),profiles.countDocuments({...base,created_at:{$gte:new Date(+now-30*86400000)}}),
      profiles.countDocuments({...base,legal_status:'signed',status:'active'}),
      profiles.countDocuments({...base,status:{$in:['warning','violation','frozen']}}),
      profiles.countDocuments({...base,status:{$in:['pending-review','pending-docs','pending-contract']}}),
    ]);
    const prior=await profiles.countDocuments({...base,created_at:{$lt:monthStart}});
    const [publishedCourses,openTickets]=await Promise.all([
      db.collection('courses').countDocuments({status:'published',admin_hidden:{$ne:true}}),
      db.collection('support_tickets').countDocuments({status:{$in:['unassigned','processing','waiting','reopened']}}),
    ]);
    return {success:true,total,fresh,active,locked,pending,totalChangePercent:prior?Number(((total-prior)/prior*100).toFixed(1)):null,quickStats:{publishedCourses,openTickets}};
  }
  const base = { role: 'student' };
  const active = { ...base, status: 'active', deleted_at: { $exists: false } };
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const [total, fresh, activeCount, locked, prior] = await Promise.all([
    users.countDocuments({ ...base, deleted_at: { $exists: false } }),
    users.countDocuments({ ...base, deleted_at: { $exists: false }, created_at: { $gte: new Date(+now - 30 * 86400000) } }),
    users.countDocuments(active),
    users.countDocuments({ ...base, status: 'locked', deleted_at: { $exists: false } }),
    users.countDocuments({...base,deleted_at:{$exists:false},created_at:{$lt:monthStart}}),
  ]);
  return { success: true, total, fresh, active: activeCount, locked,totalChangePercent:prior?Number(((total-prior)/prior*100).toFixed(1)):null };
}

export function instructorDocumentView(document, userId, canDownload) {
  const id = String(document.id || '');
  const view = {
    id,
    type: document.type || 'document',
    title: document.title || document.filename || 'Tài liệu hồ sơ',
    filename: document.filename || 'document',
    mimeType: document.mime_type || 'application/octet-stream',
    status: document.status || 'uploaded',
    isSample: document.is_sample === true,
  };
  if (canDownload && /^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    view.downloadUrl = `/api/admin/users/lecturers/${encodeURIComponent(userId)}/documents/${encodeURIComponent(id)}/download`;
  }
  return view;
}

export async function downloadInstructorDocumentFile(userId, documentId, options = {}) {
  if (typeof documentId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(documentId)) {
    throw bad('Mã tài liệu không hợp lệ.', 400, 'LECTURER_DOCUMENT_ID_INVALID');
  }
  const db = options.db || await getMongoDb();
  const user = await readUser(db, userId);
  const [profile, application] = await Promise.all([
    db.collection('instructor_profiles').findOne({
      $or: [{ user_id: String(user._id) }, { instructor_id: String(user._id) }],
      deleted_at: { $exists: false },
    }),
    db.collection('instructor_applications').findOne({ user_id: String(user._id), deleted_at: { $exists: false } }, { sort: { created_at: -1 } }),
  ]);
  const document = [...(profile?.documents || []), ...(application?.documents || [])]
    .find(item => item.id === documentId && item.storage === 'cloudinary');
  if (!document) throw bad('Không tìm thấy tài liệu thuộc hồ sơ này.', 404, 'LECTURER_DOCUMENT_NOT_FOUND');
  if (typeof document.asset_id !== 'string' || !/^[a-f\d]{32}$/i.test(document.asset_id)) {
    throw bad('Tài liệu chưa có định danh Cloudinary hợp lệ.', 409, 'LECTURER_DOCUMENT_UNAVAILABLE');
  }
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = options.cloudinary || process.env;
  if (!cloudName || !apiKey || !apiSecret) throw bad('Dịch vụ lưu trữ tài liệu chưa được cấu hình.', 503, 'DOCUMENT_STORAGE_UNAVAILABLE');
  const filename = String(document.filename || 'document').replace(/[\\/\r\n"\0]/g, '_').slice(0, 150);
  const params = new URLSearchParams({ asset_id: document.asset_id, attachment: 'true', target_filename: filename });
  let response;
  try {
    response = await (options.fetchImpl || fetch)(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/asset/download?${params}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` } },
    );
  } catch {
    throw bad('Không kết nối được kho tài liệu.', 502, 'DOCUMENT_STORAGE_FAILED');
  }
  if (!response.ok) throw bad('Kho tài liệu không trả được tệp.', 502, 'DOCUMENT_STORAGE_FAILED');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw bad('Kích thước tài liệu không hợp lệ.', 502, 'DOCUMENT_STORAGE_INVALID');
  const mimeType = document.mime_type === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-'
    ? 'application/pdf'
    : document.mime_type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      ? 'image/png'
      : document.mime_type === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        ? 'image/jpeg' : null;
  if (!mimeType) throw bad('Nội dung tài liệu không khớp định dạng đã lưu.', 502, 'DOCUMENT_STORAGE_INVALID');
  return { bytes, filename, mimeType };
}

export function createAdminUsersRouter(express, requireAdmin) {
  const router = express.Router();
  router.use(requireAdmin);
  const read = createAdminRoleMiddleware(['SA','CA','FA','CS']);
  const assess = createAdminRoleMiddleware(['SA','CA']);
  const support = createAdminRoleMiddleware(['SA','CS']);
  const sa = createAdminRoleMiddleware(['SA']);
  const instructorDiscipline = createAdminRoleMiddleware(['SA','CA']);
  const evidenceRead = createAdminRoleMiddleware(['SA','CA']);
  router.get('/students', read, async (req,res,next) => { try { res.json(await listAdminUsers('students', req.query, { role:req.adminRole })); } catch(e) { next(e); } });
  router.get('/students/summary', read, async (req,res,next) => { try { res.json(await getAdminUserSummary('students',{role:req.adminRole})); } catch(e) { next(e); } });
  router.get('/lecturers', read, async (req,res,next) => { try { res.json(await listAdminUsers('lecturers', req.query, { role:req.adminRole })); } catch(e) { next(e); } });
  router.get('/lecturers/summary', read, async (req,res,next) => { try { res.json(await getAdminUserSummary('lecturers')); } catch(e) { next(e); } });
  router.get('/students/:id', read, async (req,res,next) => {
    try {
      const db=await getMongoDb(), user=await readUser(db,req.params.id), uid=String(user._id); if(user.role!=='student') throw bad('Tài khoản không thuộc danh sách học viên.',404,'STUDENT_NOT_FOUND');
      const { getUserEnrolledCourses } = await import('../../user/course/course.user.js');
      const [courses, orders, history] = await Promise.all([
        getUserEnrolledCourses(uid,{db}),
        db.collection('payment_transactions').find({ $or:[{user_id:uid},{user_id:user._id},{userId:uid}] }).sort({created_at:-1}).limit(20).toArray(),
        db.collection('admin_audit_logs').find({ 'details.entity.type':'user','details.entity.id':uid, action:/USER_STUDENT_/ }).sort({created_at:-1}).limit(50).toArray(),
      ]);
      res.json({success:true,user:adminView(user,req.adminRole),courses,orders:orders.map(o=>({id:o.order_id||o.transaction_id||String(o._id),amount:o.amount??o.actual_paid_amount??null,paidAt:iso(o.paid_at||o.created_at),status:o.status})),disciplineHistory:history.map(x=>({action:x.action,at:iso(x.created_at),...x.details.metadata}))});
    } catch(e) { next(e); }
  });
  router.get('/lecturers/:id', read, async (req,res,next) => {
    try { const db=await getMongoDb(), user=await readUser(db,req.params.id), [profile,application]=await Promise.all([
        db.collection('instructor_profiles').findOne({$or:[{user_id:String(user._id)},{instructor_id:String(user._id)}],deleted_at:{$exists:false}}),
        db.collection('instructor_applications').findOne({user_id:String(user._id),deleted_at:{$exists:false}},{sort:{created_at:-1}}),
      ]); if(!profile&&!application) throw bad('Không tìm thấy hồ sơ giảng viên.',404,'LECTURER_PROFILE_NOT_FOUND');
      const full=req.adminRole==='SA', canDownload=['SA','CA'].includes(req.adminRole), snapshot=application?.profile_snapshot||{};
      const publicProfile=profile ? {id:String(profile._id),title:profile.title||profile.headline||'',field:profile.field||profile.specialization||'',stack:profile.stack||[],bio:profile.bio||'',links:profile.links||{portfolio:profile.portfolio,linkedin:profile.linkedin,gsahub:profile.gsahub},documents:(profile.documents||[]).map(doc=>instructorDocumentView(doc,String(user._id),canDownload)),status:application?.status||profile.status||user.status} : {id:application.profile_id||null,title:snapshot.title||'',field:snapshot.field||'',stack:snapshot.stack||[],bio:snapshot.bio||'',links:snapshot.links||{},documents:(application.documents||[]).map(doc=>instructorDocumentView(doc,String(user._id),canDownload)),status:application.status};
      const privateData=full?{kyc:profile?.kyc||null,taxCode:profile?.kyc?.taxCode||profile?.tax_code||user.tax_code||null,cccd:profile?.kyc?.cccd||profile?.cccd||user.cccd||null,address:profile?.kyc?.address||user.address||null,bankAccount:profile?.kyc?.bankAccount||user.bank_account||null}: {taxCode:mask(profile?.kyc?.taxCode||profile?.tax_code||user.tax_code),cccd:mask(profile?.kyc?.cccd||profile?.cccd||user.cccd)};
      res.json({success:true,user:adminView(user,req.adminRole),profile:publicProfile,application:application?{id:String(application._id),status:application.status,phase:application.phase,legalStatus:application.legal_status||'incomplete',kyc:full?application.kyc||null:undefined,taxVerified:Boolean(application.tax_verified),documentsRequest:application.documents_request||null,submittedAt:iso(application.submitted_at||application.created_at),reviewedAt:iso(application.reviewed_at||null)}:null,privateData});
    } catch(e) { next(e); }
  });
  router.get('/lecturers/:id/documents/:documentId/download', evidenceRead, async (req,res,next) => {
    try {
      const db=await getMongoDb(),user=await readUser(db,req.params.id);
      const file=await downloadInstructorDocumentFile(String(user._id),req.params.documentId,{db});
      await writeAudit(db,req,'USER_LECTURER_DOCUMENT_DOWNLOAD',user._id,{metadata:{documentId:req.params.documentId,mimeType:file.mimeType}});
      res.set({ 'Content-Type':file.mimeType,'Content-Disposition':`attachment; filename="${file.filename.replace(/["\r\n]/g,'_')}"`, 'Content-Length':String(file.bytes.length), 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' });
      res.send(file.bytes);
    } catch(e) { next(e); }
  });
  router.get('/lecturers/:id/courses', read, async (req,res,next) => {
    try { const db=await getMongoDb(), user=await readUser(db,req.params.id), aliases=[String(user._id),user.instructor_id].filter(Boolean);
      const rows=await db.collection('courses').find({$or:[{instructor_id:{$in:aliases}},{instructorId:{$in:aliases}}]}).sort({updated_at:-1}).limit(200).toArray();
      res.json({success:true,items:rows.map(c=>({id:String(c._id),name:c.title||c.name||'',status:c.status||'draft',learners:c.total_students||c.students_count||0,revenue:c.total_revenue||0,updatedAt:iso(c.updated_at||c.created_at)}))});
    } catch(e) { next(e); }
  });
  router.post('/lecturers/:id/decision', assess, async (req,res,next) => {
    try {
      const db=await getMongoDb(), user=await readUser(db,req.params.id), [profile,application]=await Promise.all([
        db.collection('instructor_profiles').findOne({$or:[{user_id:String(user._id)},{instructor_id:String(user._id)}],deleted_at:{$exists:false}}),
        db.collection('instructor_applications').findOne({user_id:String(user._id),deleted_at:{$exists:false}},{sort:{created_at:-1}}),
      ]);
      assertReviewLease(user,req.adminId);
      if(!profile&&!application) throw bad('Không tìm thấy hồ sơ giảng viên.',404,'LECTURER_PROFILE_NOT_FOUND');
      const action=req.body?.action, now=new Date(), current=application?.status||profile?.status||user.instructor_application_status;
      if(!['approve','reject','request-documents'].includes(action)) throw bad('Quyết định không hợp lệ.');
      if(!['pending-review','pending-docs','pending-contract'].includes(current)) throw bad('Hồ sơ không ở trạng thái có thể thẩm định.',409,'LECTURER_STATE_CONFLICT');
      const patch={updated_at:now,reviewed_by:req.adminId,reviewed_at:now};
      if(action==='approve') { if(current==='pending-contract') throw bad('Chuyên môn đã được duyệt; hồ sơ đang ở bước pháp lý.',409,'LECTURER_ALREADY_APPROVED'); patch.status='pending-contract'; patch.professional_approved_at=now; }
      if(action==='reject') { patch.status='rejected'; patch.rejection={reason:safeText(req.body.reason,20,2000,'Lý do'),decided_at:now}; }
      if(action==='request-documents') { const keys=req.body.documentKeys; if(!Array.isArray(keys)||!keys.length||keys.length>20||keys.some(k=>typeof k!=='string'||k.length>80)) throw bad('Danh sách giấy tờ cần bổ sung không hợp lệ.');
        const guidance=safeText(req.body.guidance,20,2000,'Hướng dẫn'), days=Number(req.body.deadlineDays); if(![3,7,14].includes(days)) throw bad('Thời hạn bổ sung không hợp lệ.');
        patch.documents_request={keys:[...new Set(keys)],guidance,deadline:new Date(+now+days*86400000),phase:current==='pending-contract'?'legal':'professional',created_at:now};
        patch.status=current==='pending-contract'?'pending-contract':'pending-docs'; }
      if(profile){
        const changed=await db.collection('instructor_profiles').updateOne({_id:profile._id,status:profile.status||current},{$set:patch});
        if(!changed.matchedCount) throw bad('Hồ sơ đã được cập nhật bởi Admin khác.',409,'LECTURER_STATE_CONFLICT');
      }
      const applicationPatch={
        user_id:String(user._id),profile_id:profile?String(profile._id):application?.profile_id||null,
        status:patch.status||current,phase:patch.status==='pending-contract'?'legal':patch.status==='rejected'?'closed':application?.phase||'professional',
        legal_status:application?.legal_status||profile?.legal_status||'incomplete',
        kyc:application?.kyc||profile?.kyc||{verified:false},tax_verified:application?.tax_verified??profile?.tax_verified??false,
        profile_snapshot:application?.profile_snapshot||{title:profile?.title||profile?.headline||'',field:profile?.field||profile?.specialization||'',stack:profile?.stack||profile?.skills||[],bio:profile?.bio||'',specialty:profile?.specialty||profile?.specialization||''},
        reviewed_by:req.adminId,reviewed_at:now,updated_at:now,version:(application?.version||0)+1,
        ...(patch.rejection?{rejection:patch.rejection}:{}),...(patch.documents_request?{documents_request:patch.documents_request}:{}),
      };
      if(application){
        const changed=await db.collection('instructor_applications').updateOne({_id:application._id,status:current,$or:[{version:application.version||0},{version:{$exists:false}}]},{$set:applicationPatch});
        if(!changed.matchedCount) throw bad('Đơn ứng tuyển đã được cập nhật bởi Admin khác.',409,'LECTURER_STATE_CONFLICT');
      } else await db.collection('instructor_applications').insertOne({...applicationPatch,created_at:profile?.created_at||now,submitted_at:profile?.created_at||now});
      await writeAudit(db,req,`LECTURER_${action.replaceAll('-','_').toUpperCase()}`,user._id,{metadata:{from:current,to:patch.status||current,reason:patch.rejection?.reason||patch.documents_request?.guidance||null,phase:patch.documents_request?.phase||null}});
      const nonDeliverableEmail=typeof user.email==='string'&&user.email.toLowerCase().endsWith('.invalid');
      const emailSent=req.body.sendEmail===false||nonDeliverableEmail?null:await deliverOrQueueUserMail(db,user,{subject:action==='approve'?'Hồ sơ giảng viên đã duyệt chuyên môn':'Cập nhật hồ sơ giảng viên',text:action==='approve'?'Hồ sơ chuyên môn đã được duyệt. Vui lòng đăng nhập để hoàn tất hồ sơ pháp lý và hợp đồng.':action==='reject'?`Hồ sơ chưa được chấp thuận: ${patch.rejection.reason}`:`Vui lòng bổ sung hồ sơ: ${patch.documents_request.guidance}`});
      res.json({success:true,status:patch.status||current,emailSent});
    } catch(e) { next(e); }
  });
  router.post('/lecturers/:id/activate', assess, async (req,res,next) => {
    try { const db=await getMongoDb(),user=await readUser(db,req.params.id),[profile,application]=await Promise.all([
        db.collection('instructor_profiles').findOne({$or:[{user_id:String(user._id)},{instructor_id:String(user._id)}],deleted_at:{$exists:false}}),
        db.collection('instructor_applications').findOne({user_id:String(user._id),deleted_at:{$exists:false}},{sort:{created_at:-1}}),
      ]);assertReviewLease(user,req.adminId);
      const status=application?.status||profile?.status||user.instructor_application_status;
      if(status!=='pending-contract') throw bad('Hồ sơ chưa ở trạng thái chờ hoàn tất pháp lý.',409,'LECTURER_STATE_CONFLICT');
      const legalStatus=application?.legal_status||profile?.legal_status, kycVerified=application?.kyc?.verified??profile?.kyc?.verified, taxVerified=application?.tax_verified??profile?.tax_verified;
      if(legalStatus!=='signed'||kycVerified!==true||taxVerified!==true) throw bad('Chưa hoàn tất xác minh KYC, thuế và hợp đồng.',409,'LEGAL_REQUIREMENTS_INCOMPLETE');
      const now=new Date();
      const snapshot=application?.profile_snapshot||{};
      const publicProfile={user_id:String(user._id),instructor_id:user.instructor_id||String(user._id),full_name:user.full_name||user.name||'',avatar_url:user.avatar_url||null,
        title:profile?.title||profile?.headline||snapshot.title||'',field:profile?.field||profile?.specialization||snapshot.field||'',stack:profile?.stack||profile?.skills||snapshot.stack||[],bio:profile?.bio||snapshot.bio||'',portfolio:profile?.portfolio||snapshot.portfolio||'',linkedin:profile?.linkedin||snapshot.linkedin||'',gsahub:profile?.gsahub||snapshot.gsahub||'',status:'active',is_public:true,updated_at:now,created_at:profile?.created_at||now};
      const userUpdate=await db.collection('users').updateOne({_id:user._id,role:'student',status:'active',is_active:{$ne:false},deleted_at:{$exists:false}},{$set:{role:'instructor',instructor_activated_at:now,updated_at:now}});
      if(!userUpdate.modifiedCount) throw bad('Không thể chuyển tài khoản sang giảng viên; tài khoản đã đổi trạng thái hoặc vai trò.',409,'LECTURER_ACTIVATION_CONFLICT');
      let profileId;
      if(profile){profileId=profile._id;await db.collection('instructor_profiles').updateOne({_id:profile._id},{$set:{...publicProfile,legal_status:'signed',activated_at:now}});}
      else {profileId=new ObjectId();await db.collection('instructor_profiles').insertOne({...publicProfile,_id:profileId});}
      if(application) await db.collection('instructor_applications').updateOne({_id:application._id,status:'pending-contract'},{$set:{profile_id:String(profileId),status:'active',phase:'complete',activated_at:now,updated_at:now},$inc:{version:1}});
      else await db.collection('instructor_applications').insertOne({user_id:String(user._id),profile_id:String(profileId),status:'active',phase:'complete',legal_status:'signed',kyc:{verified:true},tax_verified:true,created_at:profile?.created_at||now,submitted_at:profile?.created_at||now,activated_at:now,updated_at:now,version:1});
      await writeAudit(db,req,'LECTURER_ACTIVATE',user._id,{metadata:{role:'instructor',profileId:String(profile._id)}});
      res.json({success:true,id:String(user._id),role:'instructor',status:'active',publicProfile});
    } catch(e) { next(e); }
  });
  router.post('/lecturers/:id/discipline', instructorDiscipline, async (req,res,next) => {
    try { const db=await getMongoDb(),user=await readUser(db,req.params.id),profile=await db.collection('instructor_profiles').findOne({$or:[{user_id:String(user._id)},{instructor_id:String(user._id)}]});
      if(user.role!=='instructor'||profile?.status!=='active') throw bad('Chỉ giảng viên đang hoạt động mới thuộc diện xử lý kỷ luật.',409,'LECTURER_STATE_CONFLICT');
      const level=Number(req.body?.level); if(![1,2,3].includes(level)) throw bad('Mức kỷ luật không hợp lệ.');
      const reason=safeText(req.body.reason,15,2000,'Lý do'), evidence=cleanEvidence(req.body.evidence), files=await verifyEvidence(db,evidence,user._id);
      if(!evidence.length) throw bad('Cần tải lên bằng chứng.');
      const now=new Date(), courseIds=req.body.courseIds||[];
      if(level===2&&(!Array.isArray(courseIds)||!courseIds.length||courseIds.some(id=>!asId(id)))) throw bad('Mức 2 cần chọn khóa học hợp lệ.');
      const instructorAliases=[String(user._id),...(user.instructor_id?[String(user.instructor_id)]:[])];
      let courses=[];
      if(level===2){ courses=await db.collection('courses').find({_id:{$in:courseIds.map(asId)},$or:[{instructor_id:{$in:instructorAliases}},{instructorId:{$in:instructorAliases}}]}).toArray(); if(courses.length!==new Set(courseIds).size) throw bad('Khóa học không tồn tại hoặc không thuộc giảng viên.',403,'COURSE_SCOPE_INVALID'); }
      if(!profile) throw bad('Không tìm thấy hồ sơ giảng viên.',404,'LECTURER_PROFILE_NOT_FOUND');
      const entry={level,label:STATUS_LABEL[level],reason,evidence,courseIds:level===2?courses.map(c=>String(c._id)):[],created_at:now,admin_id:req.adminId};
      const status=level===1?'warning':level===2?'violation':'frozen';
      await db.collection('instructor_profiles').updateOne({_id:profile._id},{$set:{pre_discipline_status:profile.status||'active',status,discipline_status:status,updated_at:now},$push:{discipline_history:entry}});
      if(level===3){await db.collection('users').updateOne({_id:user._id},{$set:{status:'locked',is_active:false,instructor_frozen:true,updated_at:now}}); await db.collection('user_sessions').updateMany({user_id:String(user._id),revoked_at:null},{$set:{revoked_at:now,revoke_reason:'admin_instructor_freeze',updated_at:now}}); await db.collection('courses').updateMany({$or:[{instructor_id:{$in:instructorAliases}},{instructorId:{$in:instructorAliases}}]},{$set:{admin_hidden:true,admin_hidden_by:String(user._id),admin_hidden_case:String(profile._id),updated_at:now}});}
      if(level===2) await db.collection('courses').updateMany({_id:{$in:courses.map(c=>c._id)}},{$set:{admin_hidden:true,admin_hidden_by:String(user._id),admin_hidden_case:String(profile._id),updated_at:now}});
      for(const file of files) await db.collection('admin_user_evidence').updateOne({_id:file._id,linked_at:null},{$set:{linked_at:now,linked_entity:{type:'lecturer_discipline',id:String(user._id)}}});
      await writeAudit(db,req,'LECTURER_DISCIPLINE',user._id,{metadata:{level,reason,courseIds:entry.courseIds,evidence}});
      const emailSent=await deliverOrQueueUserMail(db,user,{subject:'Thông báo xử lý tài khoản giảng viên',text:`Tài khoản giảng viên được áp dụng ${STATUS_LABEL[level]}. Lý do: ${reason}`});
      res.json({success:true,status,level,courseIds:entry.courseIds,emailSent});
    } catch(e) { next(e); }
  });
  router.post('/lecturers/:id/unlock', support, async (req,res,next) => {
    try { const db=await getMongoDb(),user=await readUser(db,req.params.id),reason=safeText(req.body?.reason,10,2000,'Lý do mở khóa'),now=new Date();
      const profile=await db.collection('instructor_profiles').findOne({$or:[{user_id:String(user._id)},{instructor_id:String(user._id)}]}); if(!profile) throw bad('Không tìm thấy hồ sơ giảng viên.',404,'LECTURER_PROFILE_NOT_FOUND');
      if(user.role!=='instructor'||!['warning','violation','frozen'].includes(profile.status)) throw bad('Chỉ mở khóa được hồ sơ giảng viên đang bị kỷ luật.',409,'LECTURER_STATE_CONFLICT');
      const restoredStatus=profile.pre_discipline_status||'active';
      await db.collection('instructor_profiles').updateOne({_id:profile._id},{$set:{status:restoredStatus,discipline_status:null,updated_at:now},$unset:{pre_discipline_status:''},$push:{discipline_history:{action:'unlock',reason,created_at:now,admin_id:req.adminId}}});
      await db.collection('users').updateOne({_id:user._id},{$set:{status:'active',is_active:true,instructor_frozen:false,updated_at:now}});
      await db.collection('courses').updateMany({admin_hidden_case:String(profile._id)},{$unset:{admin_hidden:'',admin_hidden_by:'',admin_hidden_case:''},$set:{updated_at:now}});
      await writeAudit(db,req,'LECTURER_UNLOCK',user._id,{metadata:{reason,restoredStatus}});
      const emailSent=await deliverOrQueueUserMail(db,user,{subject:'Tài khoản giảng viên đã được mở khóa',text:`Tài khoản đã được mở khóa. Lý do: ${reason}`}); res.json({success:true,status:restoredStatus,emailSent});
    } catch(e) { next(e); }
  });
  router.post('/:id/claim', assess, async (req,res,next) => {
    try { const db=await getMongoDb(),user=await readUser(db,req.params.id),now=new Date(),leaseId=`${req.adminId}:${Date.now()}`; const result=await db.collection('users').findOneAndUpdate({_id:user._id,$or:[{admin_review_lease_until:null},{admin_review_lease_until:{$exists:false}},{admin_review_lease_until:{$lte:now}},{admin_review_lease_admin:req.adminId}]},{$set:{admin_review_lease_admin:req.adminId,admin_review_lease_id:leaseId,admin_review_lease_until:new Date(+now+90000)}},{returnDocument:'after'}); if(!result){const owner=await db.collection('admins').findOne({_id:asId(user.admin_review_lease_admin)},{projection:{full_name:1,email:1}});return res.status(409).json({success:false,code:'PROFILE_BUSY',message:'Hồ sơ đang được xử lý bởi Admin khác.',holder:{id:user.admin_review_lease_admin,name:owner?.full_name||owner?.email||'Admin'}});} res.json({success:true,leaseId,expiresAt:result.admin_review_lease_until.toISOString()}); } catch(e){next(e);}
  });
  router.post('/:id/heartbeat', assess, async (req,res,next) => { try { const db=await getMongoDb(),now=new Date(),result=await db.collection('users').updateOne({...userLookup(req.params.id),admin_review_lease_admin:req.adminId,admin_review_lease_id:req.body?.leaseId,admin_review_lease_until:{$gt:now}},{$set:{admin_review_lease_until:new Date(+now+90000)}}); if(!result.matchedCount) throw bad('Phiên giữ hồ sơ đã hết hạn hoặc không hợp lệ.',409,'PROFILE_LEASE_EXPIRED'); res.json({success:true,expiresAt:new Date(+now+90000).toISOString()});}catch(e){next(e);} });
  router.delete('/:id/claim', assess, async (req,res,next) => { try { const db=await getMongoDb(); await db.collection('users').updateOne({...userLookup(req.params.id),admin_review_lease_admin:req.adminId,admin_review_lease_id:req.body?.leaseId},{$unset:{admin_review_lease_admin:'',admin_review_lease_id:'',admin_review_lease_until:''}}); res.json({success:true});}catch(e){next(e);} });
  router.post('/evidence/:userId', support, express.raw({type:['application/octet-stream','image/jpeg','image/png','application/pdf'],limit:'20mb'}), async (req,res,next) => {
    try {
      const db=await getMongoDb(),user=await readUser(db,req.params.userId),bytes=req.body;
      const filename=String(req.headers['x-file-name']||'evidence').slice(0,150),mime=req.headers['content-type'];
      if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>20*1024*1024) throw bad('Tệp phải từ 1 byte đến 20 MB.',413,'EVIDENCE_TOO_LARGE');
      const valid=(mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))||(mime==='image/jpeg'&&bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))||(mime==='application/pdf'&&bytes.subarray(0,5).toString()==='%PDF-');
      if(!valid) throw bad('Nội dung tệp không khớp với PNG, JPG hoặc PDF.',400,'EVIDENCE_INVALID');
      const id=`uev_${randomBytes(16).toString('hex')}`,now=new Date();
      await db.collection('admin_user_evidence').insertOne({_id:id,owner_user_id:String(user._id),filename:filename.replace(/[\\/\r\n\0]/g,''),mime_type:mime,size_bytes:bytes.length,bytes:new Binary(bytes),uploaded_by:req.adminId,uploaded_at:now,linked_at:null});
      res.status(201).json({success:true,evidence:{id,filename,mimeType:mime,sizeBytes:bytes.length}});
    }catch(e){next(e);}
  });
  router.get('/evidence/:id', evidenceRead, async (req,res,next) => {
    try { const db=await getMongoDb(),id=req.params.id; if(!/^uev_[a-f0-9]{32}$/.test(id)) throw bad('Mã bằng chứng không hợp lệ.');
      const file=await db.collection('admin_user_evidence').findOne({_id:id}); if(!file) throw bad('Không tìm thấy bằng chứng.',404,'EVIDENCE_NOT_FOUND');
      res.set('Content-Type','application/octet-stream'); res.set('Content-Disposition',`attachment; filename="${file.filename.replace(/["\r\n]/g,'_')}"`); res.send(Buffer.from(file.bytes.buffer).subarray(0,file.bytes.position));
    }catch(e){next(e);}
  });
  router.get('/students/export', read, async (req,res,next) => {
    try { const db=await getMongoDb(),first=await listAdminUsers('students',{...req.query,page:1,pageSize:100},{role:req.adminRole}),items=[...first.items];
      for(let p=2;p<=first.pagination.pages;p++) items.push(...(await listAdminUsers('students',{...req.query,page:p,pageSize:100},{role:req.adminRole})).items);
      const rows=items.slice(0,10000),headers=['Mã học viên','Họ tên','Email','Số điện thoại','Số khóa học','Ngày đăng ký','Trạng thái'];
      const cell=value=>`"${String(value??'').replace(/[\r\n]+/g,' ').replace(/"/g,'""').replace(/^([=+@-])/,' $1')}"`;
      const lines=[headers,...rows.map(r=>[r.studentId||r.id,r.name,r.email,r.phone,r.courseCount,r.registeredAt,r.status])].map(row=>row.map(cell).join(','));
      await writeAudit(db,req,'USER_STUDENTS_EXPORT','filtered-set',{metadata:{records:rows.length,filters:{q:req.query.q||null,status:req.query.status||null,courseCount:req.query.courseCount||null,from:req.query.from||null,to:req.query.to||null}}});
      res.type('text/csv; charset=utf-8').attachment('thinkup-students.csv').send(`\uFEFF${lines.join('\r\n')}`);
    }catch(e){next(e);}
  });
  router.get('/lecturers/export', read, async (req,res,next) => {
    try { const result=await listAdminUsers('lecturers',{...req.query,page:1,pageSize:100}, {role:req.adminRole}),items=[...result.items];
      for(let p=2;p<=result.pagination.pages;p++) items.push(...(await listAdminUsers('lecturers',{...req.query,page:p,pageSize:100},{role:req.adminRole})).items);
      const headers=['Mã giảng viên','Họ tên','Email','Điện thoại','Lĩnh vực','Số khóa học','Học viên','Doanh thu','Pháp lý','Mã số thuế','Trạng thái'];
      const cell=value=>`"${String(value??'').replace(/[\r\n]+/g,' ').replace(/"/g,'""').replace(/^([=+@-])/,' $1')}"`;
      const rows=items.slice(0,10000).map(x=>[x.id,x.name,x.email,x.phone,x.field,x.courses,x.learners,x.revenue,x.legalStatus,x.taxCode,x.status]);
      const csv=[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
      const db=await getMongoDb(); await writeAudit(db,req,'USER_LECTURERS_EXPORT','filtered-set',{metadata:{records:rows.length,filters:{q:req.query.q||null,status:req.query.status||null,legalStatus:req.query.legalStatus||null,from:req.query.from||null,to:req.query.to||null}}});
      res.type('text/csv; charset=utf-8').attachment('thinkup-lecturers.csv').send(`\uFEFF${csv}`);
    }catch(e){next(e);}
  });
  router.put('/:id', sa, async (req,res,next) => {
    try { const db=await getMongoDb(),user=await readUser(db,req.params.id),input=req.body||{},allowed=['full_name','phone','title','field','stack','bio','portfolio','linkedin','gsahub'];
      if(!['student','instructor'].includes(user.role)) throw bad('Tài khoản ngoài phạm vi quản lý người dùng.',404,'USER_NOT_FOUND');
      const unknown=Object.keys(input).filter(k=>!allowed.includes(k)); if(unknown.length) throw bad('Có trường không được phép cập nhật.');
      const set={updated_at:new Date()}; if(input.full_name!==undefined) set.full_name=safeText(input.full_name,1,120,'Họ tên');
      if(input.phone!==undefined){if(typeof input.phone!=='string'||input.phone.length>32) throw bad('Số điện thoại không hợp lệ.');set.phone=input.phone.trim();}
      const profilePatch={updated_at:set.updated_at};
      for(const key of ['title','field','bio','portfolio','linkedin','gsahub']) if(input[key]!==undefined) profilePatch[key]=safeText(input[key],key==='bio'?0:0, key==='bio'?5000:500,key);
      if(input.stack!==undefined){if(!Array.isArray(input.stack)||input.stack.length>30||input.stack.some(x=>typeof x!=='string'||x.length>80)) throw bad('Danh sách chuyên môn không hợp lệ.');profilePatch.stack=input.stack.map(x=>x.trim());}
      if(user.role==='instructor'&&set.full_name!==undefined) profilePatch.full_name=set.full_name;
      const profileFields=Object.keys(profilePatch).filter(k=>k!=='updated_at');
      const profile=profileFields.length?await db.collection('instructor_profiles').findOne({$or:[{user_id:String(user._id)},{instructor_id:String(user._id)}],deleted_at:{$exists:false}}):null;
      if(profileFields.length&&!profile) throw bad('Không tìm thấy hồ sơ giảng viên.',404,'LECTURER_PROFILE_NOT_FOUND');
      const updated=await db.collection('users').findOneAndUpdate({_id:user._id,deleted_at:{$exists:false}},{$set:set},{returnDocument:'after'});
      if(profile) await db.collection('instructor_profiles').updateOne({_id:profile._id},{$set:profilePatch});
      await writeAudit(db,req,'USER_UPDATE',user._id,{metadata:{fields:[...Object.keys(set).filter(k=>k!=='updated_at'),...profileFields]}});res.json({success:true,user:adminView(updated,req.adminRole),profileFields});
    }catch(e){next(e);}
  });
  router.post('/students/lock', support, async (req,res,next) => {
    try {
      const { ids, level } = req.body || {};
      if (!Array.isArray(ids) || !ids.length || ids.length>100 || ids.some(id => !asId(id)) || ![1,2,3].includes(level)) throw bad('Danh sách học viên hoặc mức khóa không hợp lệ (tối đa 100).');
      const reason = safeText(req.body.reason, 10, 2000, 'Lý do');
      const targets = [...new Set(ids)].map(asId), now = new Date(), until = level === 1 ? new Date(+now + 7*86400000) : level === 2 ? new Date(+now + 30*86400000) : null;
      const db = await getMongoDb();
      const evidenceByTarget = req.body.evidenceByTarget || (targets.length === 1 ? { [String(targets[0])]: req.body.evidence } : null);
      if(!evidenceByTarget || typeof evidenceByTarget !== 'object' || Array.isArray(evidenceByTarget)
        || Object.keys(evidenceByTarget).length !== targets.length
        || targets.some(target => !Object.prototype.hasOwnProperty.call(evidenceByTarget, String(target)))) {
        throw bad('Cần cung cấp bộ bằng chứng riêng cho từng học viên.');
      }
      const evidenceForTarget = new Map();
      for(const target of targets){
        const refs=cleanEvidence(evidenceByTarget[String(target)]);
        if(!refs.length) throw bad('Mỗi học viên cần ít nhất một bằng chứng.');
        await verifyEvidence(db,refs,target);
        evidenceForTarget.set(String(target),refs);
      }
      const users = db.collection('users');
      const result = await users.updateMany({ _id: { $in: targets }, role: 'student', status: { $in:['active','locked'] }, deleted_at: { $exists:false } },
        { $set: { status:'locked', is_active:false, lock_level:level, locked_until:until, lock_reason:reason, locked_at:now, locked_by:req.adminId, updated_at:now } });
      const updatedIds = (await users.find({ _id:{ $in:targets }, status:'locked', locked_at:now, locked_by:req.adminId }, { projection:{_id:1} }).toArray()).map(x => String(x._id));
      if (updatedIds.length) await db.collection('user_sessions').updateMany({ user_id:{ $in:updatedIds }, revoked_at:null }, { $set:{ revoked_at:now, revoke_reason:'admin_account_lock', updated_at:now } });
      for(const targetId of updatedIds) await writeAudit(db, req, 'USER_STUDENT_LOCK', targetId, { metadata:{ level, reason, evidence:evidenceForTarget.get(targetId), lockedUntil:until?.toISOString() || null } });
      let mailFailed=0;
      for(const target of targets){
        const user=await users.findOne({_id:target});
        if(!user||user.status!=='locked'||user.locked_at?.getTime?.()!==now.getTime()) continue;
        const targetEvidence=evidenceForTarget.get(String(target));
        for(const file of await verifyEvidence(db,targetEvidence,target)) await db.collection('admin_user_evidence').updateOne({_id:file._id,linked_at:null},{$set:{linked_at:now,linked_entity:{type:'student_discipline',id:String(target)}}});
        const sent=await deliverOrQueueUserMail(db,user,{subject:'Thông báo xử lý tài khoản ThinkUp',text:`Tài khoản của bạn đã bị khóa mức ${level}. Lý do: ${reason}. ${until?`Thời điểm mở khóa dự kiến: ${formatVietnamTime(until)} GMT+7.`:'Thời hạn: vô thời hạn.'}`});
        if(!sent) mailFailed++;
      }
      const local=until?`${formatVietnamTime(until)} GMT+7`:null;
      res.json({ success:true, affected:result.modifiedCount, lockedUntil:until?.toISOString() || null, lockedUntilLocal:local, mailFailed });
    } catch(e) { next(e); }
  });
  router.post('/students/:id/unlock', support, async (req,res,next) => {
    try {
      const id=asId(req.params.id); if(!id) throw bad('Mã học viên không hợp lệ.');
      const reason=safeText(req.body?.reason,10,2000,'Lý do mở khóa'), db=await getMongoDb(), now=new Date();
      const result=await db.collection('users').updateOne({ _id:id, role:'student', status:'locked', deleted_at:{ $exists:false } }, { $set:{ status:'active', is_active:true, unlocked_at:now, unlocked_by:req.adminId, unlock_reason:reason, updated_at:now }, $unset:{ locked_until:'', lock_level:'', lock_reason:'' } });
      if(!result.matchedCount) throw bad('Không tìm thấy tài khoản đang bị khóa.',404,'USER_NOT_LOCKED');
      await writeAudit(db,req,'USER_STUDENT_UNLOCK',id,{metadata:{reason}});
      res.json({success:true,id:String(id),status:'active'});
    } catch(e) { next(e); }
  });
  router.delete('/:id', sa, async (req,res,next) => {
    try { const id=asId(req.params.id); if(!id) throw bad('Mã tài khoản không hợp lệ.'); const db=await getMongoDb(), now=new Date(),target=await readUser(db,String(id));
      if(!['student','instructor'].includes(target.role)) throw bad('Tài khoản ngoài phạm vi quản lý người dùng.',404,'USER_NOT_FOUND');
      const result=await db.collection('users').updateOne({_id:id,deleted_at:{$exists:false}},{$set:{deleted_at:now,deleted_by:req.adminId,updated_at:now}});
      if(!result.matchedCount) throw bad('Không tìm thấy tài khoản.',404,'USER_NOT_FOUND');
      await db.collection('user_sessions').updateMany({user_id:String(id),revoked_at:null},{$set:{revoked_at:now,revoke_reason:'admin_soft_delete',updated_at:now}});
      await db.collection('instructor_profiles').updateMany({$or:[{user_id:String(id)},{instructor_id:String(id)}],deleted_at:{$exists:false}},{$set:{deleted_at:now,deleted_by:req.adminId,is_public:false,updated_at:now}});
      await writeAudit(db,req,'USER_SOFT_DELETE',id,{metadata:{deletedAt:now.toISOString()}}); res.json({success:true,id:String(id),deletedAt:now.toISOString()});
    } catch(e) { next(e); }
  });
  return router;
}
