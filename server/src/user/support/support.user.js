import { createHash, randomBytes } from 'node:crypto';
import { Binary } from 'mongodb';
import { getMongoDb, sendEmail } from '../db.js';

export const COLLECTION_TICKETS = 'support_tickets';
export const COLLECTION_ATTACHMENTS = 'support_attachments';
export const COLLECTION_COUNTERS = 'support_counters';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const UPLOAD_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const SUPPORT_TOPICS = Object.freeze([
  { code: 'quality_complaint', label: 'Khiếu nại Chất lượng & Giảng viên', priority: 'critical', teams: ['super_admin', 'cs_lead'], responseHours: 4 },
  { code: 'payment_refund', label: 'Khiếu nại Thanh toán & Hoàn tiền', priority: 'high', teams: ['customer_support', 'accounting'], responseHours: 24 },
  { code: 'technical_lab', label: 'Lỗi kỹ thuật & Coding Lab', priority: 'medium', teams: ['technical'], responseHours: 24 },
  { code: 'account_security', label: 'Tài khoản & Bảo mật', priority: 'medium', teams: ['customer_support'], responseHours: 24 },
  { code: 'learning_advice', label: 'Tư vấn Lộ trình & Khóa học', priority: 'low', teams: ['learning_advisors'], responseHours: 24 },
  { code: 'other', label: 'Góp ý & Vấn đề khác', priority: 'low', teams: ['customer_support'], responseHours: 24 },
]);
const STATUSES = ['unassigned', 'processing', 'waiting', 'reopened', 'closed'];
const hash = value => createHash('sha256').update(value).digest('hex');
const timestamp = options => new Date(options.now ?? Date.now());
const database = async options => options.db || await getMongoDb();
function fail(message, status = 400, code = 'SUPPORT_INVALID', field) {
  return Object.assign(new Error(message), { status, code, ...(field ? { field } : {}) });
}
function string(value, field, min, max) {
  if (typeof value !== 'string' || value.length > max || value.trim().length < min) {
    throw fail(`${field} không hợp lệ.`, 400, 'SUPPORT_INVALID', field);
  }
  return value.trim();
}
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !fields.includes(key))) throw fail('Dữ liệu yêu cầu không hợp lệ.');
}
function userId(value, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw fail('Yêu cầu đăng nhập.', 401, 'SUPPORT_AUTH_REQUIRED');
  }
  return value;
}
function secret(value, field = 'accessToken') {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw fail(`${field} không hợp lệ.`, 400, 'SUPPORT_INVALID', field);
  }
  return value;
}
function id(value, prefix) {
  if (typeof value !== 'string' || !(new RegExp(`^${prefix}_[a-f0-9]{64}$`)).test(value)) {
    throw fail('ID không hợp lệ.');
  }
  return value;
}
function integer(value, fallback, max) {
  if (value === undefined) return fallback;
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) || Number(value) > max) throw fail('Phân trang không hợp lệ.');
  return Number(value);
}
async function transaction(db, work) {
  if (!db.client?.startSession) throw fail('Kho hỗ trợ cần MongoDB transaction.', 503, 'SUPPORT_STORAGE_UNAVAILABLE');
  const session = db.client.startSession();
  try { return await session.withTransaction(() => work(session)); }
  catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      throw fail('Kho hỗ trợ cần MongoDB replica set.', 503, 'SUPPORT_STORAGE_UNAVAILABLE');
    }
    throw error;
  } finally { await session.endSession(); }
}

/** Signature/container checks, not malware scanning. Never render uploaded content inline. */
export function validateSupportFile(name, bytes) {
  const filename = string(name, 'filename', 1, 150);
  if (/[\\/\r\n\u0000-\u001f]/.test(filename)) throw fail('Tên tệp không hợp lệ.');
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw fail('Tệp rỗng hoặc không hợp lệ.');
  if (bytes.length > MAX_FILE_BYTES) throw fail('Tệp vượt quá dung lượng tối đa 5MB.', 413, 'SUPPORT_FILE_TOO_LARGE');
  const extension = filename.split('.').pop().toLowerCase();
  let mimeType;
  if (['jpg', 'jpeg'].includes(extension) && bytes.length >= 4 &&
    bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) && bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) mimeType = 'image/jpeg';
  if (extension === 'png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR') mimeType = 'image/png';
  if (extension === 'pdf' && bytes.subarray(0, 5).toString('ascii') === '%PDF-' &&
    bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) mimeType = 'application/pdf';
  if (extension === 'docx' && validDocxContainer(bytes)) {
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (!mimeType) throw fail('Nội dung tệp không khớp định dạng JPG, PNG, PDF hoặc DOCX.', 400, 'SUPPORT_FILE_INVALID');
  return { name: filename, mimeType, sizeBytes: bytes.length };
}
function validDocxContainer(bytes) {
  // Inspect the ZIP central directory; do not accept arbitrary ZIPs renamed to DOCX.
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) return false;
  let end = -1;
  for (let position = bytes.length - 22; position >= Math.max(0, bytes.length - 65557); position--) {
    if (bytes.readUInt32LE(position) === 0x06054b50 && position + 22 + bytes.readUInt16LE(position + 20) === bytes.length) {
      end = position; break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) return false;
  const count = bytes.readUInt16LE(end + 10);
  let position = bytes.readUInt32LE(end + 16);
  const directoryEnd = position + bytes.readUInt32LE(end + 12);
  if (!count || count > 1000 || directoryEnd !== end || bytes.readUInt16LE(end + 8) !== count) return false;
  const names = new Set();
  let expandedBytes = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || bytes.readUInt32LE(position) !== 0x02014b50) return false;
    const flags = bytes.readUInt16LE(position + 8);
    const method = bytes.readUInt16LE(position + 10);
    const compressed = bytes.readUInt32LE(position + 20);
    expandedBytes += bytes.readUInt32LE(position + 24);
    const length = bytes.readUInt16LE(position + 28);
    const entryEnd = position + 46 + length + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
    const local = bytes.readUInt32LE(position + 42);
    if ((flags & 1) || ![0, 8].includes(method) || entryEnd > end || local + 30 > position ||
      bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method ||
      (bytes.readUInt16LE(local + 6) & 1)) return false;
    const name = bytes.subarray(position + 46, position + 46 + length).toString('utf8');
    const localLength = bytes.readUInt16LE(local + 26);
    const dataStart = local + 30 + localLength + bytes.readUInt16LE(local + 28);
    if (dataStart + compressed > bytes.readUInt32LE(end + 16) ||
      bytes.subarray(local + 30, local + 30 + localLength).toString('utf8') !== name ||
      /[\\\u0000]|(^|\/)\.\.(\/|$)|^\/|vbaproject/i.test(name) || names.has(name) || expandedBytes > 50 * 1024 * 1024) return false;
    names.add(name);
    position = entryEnd;
  }
  return position === directoryEnd && names.has('[Content_Types].xml') && names.has('word/document.xml');
}

/** One raw file per upload avoids base64 inflation and the global 10MB JSON limit. */
export async function uploadSupportAttachment(actorId, filename, bytes, options = {}) {
  const owner = userId(actorId);
  const metadata = validateSupportFile(filename, bytes);
  const token = randomBytes(32).toString('hex');
  const attachmentId = `att_${randomBytes(32).toString('hex')}`;
  const created = timestamp(options);
  await (await database(options)).collection(COLLECTION_ATTACHMENTS).insertOne({
    _id: attachmentId, user_id: owner, ...metadata, bytes: new Binary(bytes),
    upload_token_hash: hash(token), ticket_id: null, created_at: created,
    expires_at: new Date(+created + UPLOAD_LIFETIME_MS),
  });
  return { id: attachmentId, ...metadata, uploadToken: token,
    expiresAt: new Date(+created + UPLOAD_LIFETIME_MS).toISOString() };
}

export async function removeSupportUpload(actorId, attachmentId, token, options = {}) {
  const filter = { _id: id(attachmentId, 'att'), user_id: userId(actorId),
    upload_token_hash: hash(secret(token, 'uploadToken')), ticket_id: null };
  const result = await (await database(options)).collection(COLLECTION_ATTACHMENTS).deleteOne(filter);
  if (!result.deletedCount) throw fail('Không tìm thấy tệp chưa gửi.', 404, 'SUPPORT_ATTACHMENT_NOT_FOUND');
  return { id: attachmentId };
}
function attachmentRefs(value = []) {
  if (!Array.isArray(value) || value.length > 3) throw fail('Tối đa 3 tệp đính kèm.', 400, 'SUPPORT_ATTACHMENTS_INVALID');
  const seen = new Set();
  return value.map(item => {
    object(item, ['id', 'uploadToken']);
    const attachmentId = id(item.id, 'att');
    if (seen.has(attachmentId)) throw fail('Tệp đính kèm bị lặp.');
    seen.add(attachmentId);
    return { id: attachmentId, tokenHash: hash(secret(item.uploadToken, 'uploadToken')) };
  });
}
function ticketView(doc, detail = true) {
  const result = { id: doc._id, ticketCode: doc.ticket_code, topic: doc.topic,
    priority: doc.priority, status: doc.status, createdAt: doc.created_at.toISOString(),
    responseDueAt: doc.response_due_at.toISOString(),
    firstRespondedAt: doc.first_responded_at?.toISOString() ?? null,
    resolvedAt: doc.resolved_at?.toISOString() ?? null,
    acknowledgementStatus: doc.acknowledgement_status };
  if (detail) Object.assign(result, { fullName: doc.full_name, email: doc.contact_email,
    message: doc.message, attachments: doc.attachments,
    thread: (doc.thread || []).filter(message => !message.internal_only).map(message => ({
      id: message.id, role: message.role, body: message.body,
      createdAt: message.created_at.toISOString(),
    })) });
  return result;
}

/** Guest callers generate and retain a random 32-byte hex accessToken; only its hash is stored. */
export async function createSupportTicket(actorId, payload, idempotencyKey, options = {}) {
  const owner = userId(actorId);
  object(payload, ['fullName', 'email', 'topic', 'message', 'attachments', 'accessToken']);
  const fullName = string(payload.fullName, 'fullName', 1, 50);
  const email = string(payload.email, 'email', 3, 100).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw fail('Email không hợp lệ.', 400, 'SUPPORT_INVALID', 'email');
  const topic = SUPPORT_TOPICS.find(item => item.code === payload.topic);
  if (!topic) throw fail('Vui lòng chọn chủ đề hợp lệ.', 400, 'SUPPORT_INVALID', 'topic');
  const message = string(payload.message, 'message', 20, 1000);
  const key = string(idempotencyKey, 'Idempotency-Key', 16, 128);
  const accessHash = owner ? null : hash(secret(payload.accessToken));
  const refs = attachmentRefs(payload.attachments);
  const ticketId = `sup_${hash(JSON.stringify([owner || accessHash, key]))}`;
  const requestHash = hash(JSON.stringify([fullName, email, topic.code, message, refs]));
  const created = timestamp(options);
  const db = await database(options);
  const work = async session => {
    const tickets = db.collection(COLLECTION_TICKETS);
    const existing = await tickets.findOne({ _id: ticketId }, { session });
    if (existing) {
      if (existing.request_hash !== requestHash) throw fail('Mã gửi đã được dùng cho nội dung khác.', 409, 'SUPPORT_IDEMPOTENCY_CONFLICT');
      return { doc: existing, replayed: true };
    }
    const attachments = [];
    for (const ref of refs) {
      const record = await db.collection(COLLECTION_ATTACHMENTS).findOneAndUpdate({
        _id: ref.id, user_id: owner, upload_token_hash: ref.tokenHash,
        ticket_id: null, expires_at: { $gt: created },
      }, { $set: { ticket_id: ticketId } }, { session, returnDocument: 'after' });
      if (!record) throw fail('Tệp không hợp lệ, đã được dùng hoặc hết hạn.', 400, 'SUPPORT_ATTACHMENTS_INVALID');
      attachments.push({ id: record._id, name: record.name, mimeType: record.mimeType, sizeBytes: record.sizeBytes });
    }
    // Ticket numbering follows the user's Vietnam timezone, including midnight boundaries.
    const date = new Date(+created + 7 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
    const counter = await db.collection(COLLECTION_COUNTERS).findOneAndUpdate({ _id: date },
      { $inc: { sequence: 1 } }, { session, upsert: true, returnDocument: 'after' });
    if (!Number.isInteger(counter?.sequence) || counter.sequence < 1 || counter.sequence > 99999) {
      throw fail('Không thể cấp mã yêu cầu trong ngày.', 503, 'SUPPORT_CAPACITY_EXCEEDED');
    }
    const doc = { _id: ticketId, ticket_code: `TK-${date}-${String(counter.sequence).padStart(5, '0')}`,
      user_id: owner, requester_type: owner ? 'student' : 'guest', access_token_hash: accessHash,
      full_name: fullName, contact_email: email, topic: topic.code, message,
      priority: topic.priority, routed_teams: [...topic.teams], status: 'unassigned', assignee_id: null,
      response_due_at: new Date(+created + topic.responseHours * 3600000),
      first_responded_at: null, resolved_at: null, created_at: created, updated_at: created,
      escalation_required: topic.priority === 'critical', escalation_status: topic.priority === 'critical' ? 'pending' : 'not_required',
      acknowledgement_status: 'pending', acknowledgement_attempts: 0,
      attachments, thread: [], request_hash: requestHash };
    await tickets.insertOne(doc, { session });
    return { doc, replayed: false };
  };
  let result;
  try { result = await transaction(db, work); }
  catch (error) {
    if (error.code !== 11000) throw error;
    // Concurrent identical submissions can race on Mongo's unique _id index.
    const existing = await db.collection(COLLECTION_TICKETS).findOne({ _id: ticketId });
    if (!existing) throw error;
    if (existing.request_hash !== requestHash) throw fail('Mã gửi đã được dùng cho nội dung khác.', 409, 'SUPPORT_IDEMPOTENCY_CONFLICT');
    result = { doc: existing, replayed: true };
  }
  return { ...ticketView(result.doc), replayed: result.replayed };
}

/** Sending email happens after commit. Failure never rolls back an accepted ticket. */
export async function sendSupportAcknowledgement(ticketId, options = {}) {
  const db = await database(options);
  const current = timestamp(options);
  const tickets = db.collection(COLLECTION_TICKETS);
  const claimed = await tickets.findOneAndUpdate({ _id: id(ticketId, 'sup'), $or: [
    { acknowledgement_status: { $in: ['pending', 'failed'] } },
    { acknowledgement_status: 'sending', acknowledgement_lease_until: { $lte: current } },
  ] }, { $set: { acknowledgement_status: 'sending', acknowledgement_lease_until: new Date(+current + 120000) },
    $inc: { acknowledgement_attempts: 1 } }, { returnDocument: 'after' });
  if (!claimed) {
    const existing = await tickets.findOne({ _id: ticketId });
    if (!existing) throw fail('Không tìm thấy yêu cầu.', 404, 'SUPPORT_NOT_FOUND');
    return { status: existing.acknowledgement_status };
  }
  let status;
  try {
    const result = await (options.sendEmail || sendEmail)({ to: claimed.contact_email,
      subject: `[ThinkUp] Đã tiếp nhận yêu cầu #${claimed.ticket_code}`,
      text: `ThinkUp đã tiếp nhận yêu cầu #${claimed.ticket_code}.\nChủ đề: ${SUPPORT_TOPICS.find(t => t.code === claimed.topic).label}\nHạn phản hồi: ${claimed.response_due_at.toISOString()}.\nVui lòng giữ mã yêu cầu và mã truy cập nếu bạn gửi với tư cách khách.`,
    });
    status = result?.sent !== false && Array.isArray(result?.accepted) &&
      result.accepted.some(address => String(address).toLowerCase() === claimed.contact_email) ? 'sent' : 'failed';
  } catch { status = 'failed'; }
  // Attempts act as a fencing token if a previous send outlives its lease.
  const saved = await tickets.updateOne({ _id: claimed._id, acknowledgement_attempts: claimed.acknowledgement_attempts,
    acknowledgement_status: 'sending' }, { $set: { acknowledgement_status: status,
    acknowledgement_lease_until: null, acknowledgement_updated_at: timestamp(options) } });
  if (!saved.matchedCount) {
    const latest = await tickets.findOne({ _id: claimed._id });
    if (!latest) throw fail('Không tìm thấy yêu cầu.', 404, 'SUPPORT_NOT_FOUND');
    return { status: latest.acknowledgement_status };
  }
  return { status };
}

async function authorizedTicket(actorId, ticketId, accessToken, options) {
  const owner = userId(actorId);
  const filter = { _id: id(ticketId, 'sup'), ...(owner ? { user_id: owner } : {
    user_id: null, access_token_hash: hash(secret(accessToken)),
  }) };
  const db = await database(options);
  const doc = await db.collection(COLLECTION_TICKETS).findOne(filter);
  if (!doc) throw fail('Không tìm thấy yêu cầu.', 404, 'SUPPORT_NOT_FOUND');
  return { db, doc, filter };
}
export async function getSupportTicket(actorId, ticketId, accessToken, options = {}) {
  return ticketView((await authorizedTicket(actorId, ticketId, accessToken, options)).doc);
}
export async function listSupportTickets(actorId, query = {}, options = {}) {
  const owner = userId(actorId, true);
  const page = integer(query.page, 1, 100000);
  const limit = integer(query.limit, 20, 100);
  const filter = { user_id: owner };
  if (query.status !== undefined) {
    if (!STATUSES.includes(query.status)) throw fail('Trạng thái không hợp lệ.');
    filter.status = query.status;
  }
  if (query.topic !== undefined) {
    if (!SUPPORT_TOPICS.some(topic => topic.code === query.topic)) throw fail('Chủ đề không hợp lệ.');
    filter.topic = query.topic;
  }
  const collection = (await database(options)).collection(COLLECTION_TICKETS);
  const [docs, total] = await Promise.all([
    collection.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items: docs.map(doc => ticketView(doc, false)), pagination: { page, limit, total, hasMore: page * limit < total } };
}
export async function downloadSupportAttachment(actorId, ticketId, attachmentId, accessToken, options = {}) {
  const { db, doc } = await authorizedTicket(actorId, ticketId, accessToken, options);
  const ref = id(attachmentId, 'att');
  if (!doc.attachments.some(item => item.id === ref)) throw fail('Không tìm thấy tệp.', 404, 'SUPPORT_ATTACHMENT_NOT_FOUND');
  const file = await db.collection(COLLECTION_ATTACHMENTS).findOne({ _id: ref, ticket_id: doc._id });
  if (!file) throw fail('Không tìm thấy tệp.', 404, 'SUPPORT_ATTACHMENT_NOT_FOUND');
  return { name: file.name, mimeType: file.mimeType, bytes: Buffer.from(file.bytes.value()) };
}

/** Feature-scoped throttling is per server instance; shared rate limiting remains a deployment concern. */
function throttle() {
  const buckets = new Map();
  return (req, res, next) => {
    const current = Date.now();
    for (const [key, entry] of buckets) if (entry.until <= current) buckets.delete(key);
    const key = hash(req.ip || req.socket?.remoteAddress || 'unknown');
    let entry = buckets.get(key);
    if (!entry) {
      if (buckets.size >= 10000) return res.status(429).json({ message: 'Vui lòng thử lại sau.', code: 'SUPPORT_RATE_LIMITED' });
      entry = { count: 0, until: current + 15 * 60000 }; buckets.set(key, entry);
    }
    entry.count++;
    if (entry.count > 30) {
      res.set('Retry-After', String(Math.ceil((entry.until - current) / 1000)));
      return res.status(429).json({ message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.', code: 'SUPPORT_RATE_LIMITED' });
    }
    next();
  };
}

export function createSupportRouter(express, requireAuth, optionalAuth, options = {}) {
  const router = express.Router();
  router.use(optionalAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const limited = throttle();
  const handle = (operation, status = 200) => async (req, res, next) => {
    try { res.status(status).json({ success: true, data: await operation(req) }); }
    catch (error) { next(error); }
  };
  router.get('/topics', handle(() => SUPPORT_TOPICS));
  router.post('/attachments', limited, express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES }),
    handle(req => uploadSupportAttachment(req.userId, req.query.filename, req.body, options), 201));
  router.delete('/attachments/:id', limited,
    handle(req => removeSupportUpload(req.userId, req.params.id, req.body?.uploadToken, options)));
  router.post('/tickets', limited, handle(async req => {
    const ticket = await createSupportTicket(req.userId, req.body, req.get('Idempotency-Key'), options);
    const delivery = await sendSupportAcknowledgement(ticket.id, options);
    return { ...ticket, acknowledgementStatus: delivery.status };
  }, 201));
  router.get('/tickets', requireAuth, handle(req => listSupportTickets(req.userId, req.query, options)));
  router.get('/tickets/:id', requireAuth, handle(req => getSupportTicket(req.userId, req.params.id, null, options)));
  // Guest credentials stay in the body, never URL/query parameters or stored as plaintext.
  router.post('/tickets/:id/lookup', limited,
    handle(req => getSupportTicket(req.userId, req.params.id, req.body?.accessToken, options)));
  router.post('/tickets/:id/attachments/:attachmentId/download', limited, async (req, res, next) => {
    try {
      const file = await downloadSupportAttachment(req.userId, req.params.id, req.params.attachmentId, req.body?.accessToken, options);
      res.set({ 'Content-Type': file.mimeType, 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'", '%27')}` });
      res.send(file.bytes);
    } catch (error) { next(error); }
  });
  router.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return next(fail('Tệp vượt quá dung lượng tối đa 5MB.', 413, 'SUPPORT_FILE_TOO_LARGE'));
    if (!error.code?.startsWith?.('SUPPORT_') || !error.status || error.status >= 500) {
      return next(fail('Không thể xử lý yêu cầu hỗ trợ lúc này. Vui lòng thử lại.', 503, 'SUPPORT_UNAVAILABLE'));
    }
    next(error);
  });
  return router;
}
