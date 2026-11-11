import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BSON } from 'mongodb';
import {
  COLLECTION_CANNED_RESPONSES,
  COLLECTION_COMPLAINTS,
  getTicketSummary,
  listAdminTickets,
  getAdminTicketDetail,
  claimTicket,
  replyAndKeepOpen,
  transferTicket,
  escalateToComplaint,
  listCannedResponses,
  resolveAndCloseTicket,
  processInboundEmailReply,
} from '../tickets.admin.js';
import { COLLECTION_TICKETS } from '../../../user/support/support.user.js';

const clone = (value) => BSON.deserialize(BSON.serialize({ value })).value;

function createMockDb() {
  const tables = new Map();
  return {
    collection(name) {
      if (!tables.has(name)) tables.set(name, []);
      const rows = () => tables.get(name);
      const matches = (doc, filter) => {
        return Object.entries(filter).every(([key, value]) => {
          if (key === '$or') return value.some((item) => matches(doc, item));
          if (key === '$and') return value.every((item) => matches(doc, item));
          if (key === '$expr') {
            const expr = value;
            if (expr.$lte) {
              const field1 = expr.$lte[0].replace('$', '');
              const field2 = expr.$lte[1].replace('$', '');
              return doc[field1] <= doc[field2];
            }
          }
          if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
            return Object.entries(value).every(([op, exp]) => {
              if (op === '$in') return exp.includes(doc[key]);
              if (op === '$ne') return doc[key] !== exp;
              if (op === '$lt') return doc[key] < exp;
              if (op === '$lte') return doc[key] <= exp;
              if (op === '$gte') return doc[key] >= exp;
              if (op === '$exists') return exp ? doc[key] !== undefined : doc[key] === undefined;
              return false;
            });
          }
          if (value instanceof RegExp) return value.test(doc[key]);
          if (value instanceof Date && doc[key] instanceof Date) return value.getTime() === doc[key].getTime();
          return doc[key] === value;
        });
      };

      return {
        async insertOne(doc) {
          const item = clone(doc);
          rows().push(item);
          return { insertedId: item._id };
        },
        async findOne(filter) {
          return clone(rows().find((item) => matches(item, filter)) || null);
        },
        async countDocuments(filter = {}) {
          return rows().filter((item) => matches(item, filter)).length;
        },
        async updateOne(filter, update, options = {}) {
          let doc = rows().find((item) => matches(item, filter));
          if (!doc) {
            if (options.upsert) {
              const newDoc = {
                ...filter,
                ...(update.$setOnInsert ? clone(update.$setOnInsert) : {}),
                ...(update.$set ? clone(update.$set) : {}),
              };
              rows().push(newDoc);
              return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: newDoc._id };
            }
            return { matchedCount: 0, modifiedCount: 0 };
          }
          if (update.$set) Object.assign(doc, clone(update.$set));
          if (update.$push) {
            for (const [key, val] of Object.entries(update.$push)) {
              if (!Array.isArray(doc[key])) doc[key] = [];
              if (val && val.$each) {
                doc[key].push(...clone(val.$each));
              } else {
                doc[key].push(clone(val));
              }
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        find(filter = {}) {
          let list = rows().filter((item) => matches(item, filter));
          return {
            sort(sortCriteria) {
              list.sort((a, b) => {
                for (const [k, dir] of Object.entries(sortCriteria)) {
                  if (a[k] < b[k]) return -dir;
                  if (a[k] > b[k]) return dir;
                }
                return 0;
              });
              return this;
            },
            skip(n) {
              list = list.slice(n);
              return this;
            },
            limit(n) {
              list = list.slice(0, n);
              return this;
            },
            async toArray() {
              return clone(list);
            },
          };
        },
      };
    },
  };
}

test('Support Tickets Admin: Khối 1 - Tính toán KPI Hàng đợi chuẩn xác', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');

  // Insert mock real tickets
  const ticketsCol = db.collection(COLLECTION_TICKETS);
  await ticketsCol.insertOne({
    _id: 'sup_1',
    ticket_code: 'TK-20261110-00001',
    status: 'unassigned',
    assignee_id: null,
    response_due_at: new Date('2026-11-11T10:00:00Z'),
    created_at: now,
  });
  await ticketsCol.insertOne({
    _id: 'sup_2',
    ticket_code: 'TK-20261110-00002',
    status: 'processing',
    assignee_id: 'admin_cs_1',
    response_due_at: new Date('2026-11-10T08:00:00Z'), // Overdue
    created_at: new Date('2026-11-09T08:00:00Z'),
  });
  await ticketsCol.insertOne({
    _id: 'sup_3',
    ticket_code: 'TK-20261110-00003',
    status: 'closed',
    response_due_at: new Date('2026-11-10T12:00:00Z'),
    resolved_at: new Date('2026-11-10T09:00:00Z'), // On-time
    created_at: new Date('2026-11-09T12:00:00Z'),
  });

  const summary = await getTicketSummary({ db, now });
  assert.equal(summary.unassignedCount, 1);
  assert.equal(summary.processingCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.resolvedTodayCount, 1);
  assert.equal(summary.slaComplianceRate, 100);
});

test('Support Tickets Admin: Khối 2 & 3 - Bộ lọc đa diện & Tự động gán khi tiếp nhận', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const ticketsCol = db.collection(COLLECTION_TICKETS);

  await ticketsCol.insertOne({
    _id: 'sup_claim_1',
    ticket_code: 'TK-2026-1042',
    full_name: 'Nguyễn Văn A',
    contact_email: 'nguyenvana@email.com',
    topic: 'technical_lab',
    priority: 'high',
    status: 'unassigned',
    message: 'Không thể chạy code bài 5 Python',
    response_due_at: new Date('2026-11-10T12:00:00Z'),
    created_at: now,
    assignee_id: null,
  });

  const actorCS = { id: 'admin_huy', fullName: 'Gia Huy', role: 'CS' };

  // Danh sách lọc theo từ khóa
  const listRes = await listAdminTickets(actorCS, { q: '1042' }, { db, now });
  assert.equal(listRes.items.length, 1);
  assert.equal(listRes.items[0].ticketCode, 'TK-2026-1042');
  assert.equal(listRes.items[0].assignee.name, 'Chưa gán');

  // Thao tác Tiếp nhận / Trả lời (Claim)
  const claimRes = await claimTicket(actorCS, 'sup_claim_1', { db, now });
  assert.equal(claimRes.assigned, true);
  assert.equal(claimRes.assigneeName, 'Gia Huy');
  assert.equal(claimRes.status, 'processing');

  // Kiểm tra chi tiết
  const detail = await getAdminTicketDetail(actorCS, 'sup_claim_1', { db, now });
  assert.equal(detail.assignee.name, 'Gia Huy');
  assert.equal(detail.status, 'processing');
});

test('Support Tickets Admin: Khối 4 & Inbound Email - Gửi phản hồi giữ mở & Bóc tách email', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const ticketsCol = db.collection(COLLECTION_TICKETS);

  await ticketsCol.insertOne({
    _id: 'sup_thread_1',
    ticket_code: 'TK-2026-1042',
    full_name: 'Nguyễn Văn A',
    contact_email: 'nguyenvana@email.com',
    status: 'processing',
    response_due_at: new Date('2026-11-10T12:00:00Z'),
    created_at: now,
    thread: [],
  });

  const actorCS = { id: 'admin_huy', fullName: 'Gia Huy', role: 'CS' };

  // 1. Phản hồi và giữ mở
  let emailSent = null;
  const replyRes = await replyAndKeepOpen(actorCS, 'sup_thread_1', {
    body: 'Chào bạn, vui lòng gửi thêm ảnh chụp màn hình lỗi.',
  }, {
    db,
    now,
    sendEmail: async (mail) => { emailSent = mail; return { accepted: [mail.to] }; },
  });

  assert.equal(replyRes.success, true);
  assert.equal(replyRes.status, 'waiting');
  assert.ok(emailSent);
  assert.equal(emailSent.to, 'nguyenvana@email.com');

  // 2. Inbound Email webhook từ học viên
  const inboundRes = await processInboundEmailReply({
    ticketCode: 'TK-2026-1042',
    fromEmail: 'nguyenvana@email.com',
    body: 'Dạ em gửi lại ảnh chụp màn hình ạ.\n\n-----Original Message-----\nChào bạn, vui lòng gửi thêm...',
  }, { db, now });

  assert.equal(inboundRes.success, true);
  assert.equal(inboundRes.status, 'reopened');
  assert.equal(inboundRes.message.body, 'Dạ em gửi lại ảnh chụp màn hình ạ.');
});

test('Support Tickets Admin: Khối 5 & 6 - Điều chuyển công việc & Thăng cấp khiếu nại khẩn', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const ticketsCol = db.collection(COLLECTION_TICKETS);

  await ticketsCol.insertOne({
    _id: 'sup_transfer_1',
    ticket_code: 'TK-2026-1042',
    full_name: 'Nguyễn Văn A',
    topic: 'technical_lab',
    status: 'processing',
    assignee_id: 'admin_huy',
    assignee_name: 'Gia Huy',
    response_due_at: new Date('2026-11-10T20:00:00Z'),
    created_at: now,
    thread: [],
  });

  const actorCS = { id: 'admin_huy', fullName: 'Gia Huy', role: 'CS' };

  // 1. Điều chuyển nhân viên (Khối 5)
  // Ghi chú < 10 ký tự phải bị chặn
  await assert.rejects(
    transferTicket(actorCS, 'sup_transfer_1', {
      department: 'technical',
      newAssigneeId: 'admin_c',
      newAssigneeName: 'Lê Văn C',
      internalNote: 'Ngắn',
    }, { db, now }),
    (err) => err.code === 'NOTE_TOO_SHORT'
  );

  // Điều chuyển hợp lệ >= 10 ký tự
  const transferRes = await transferTicket(actorCS, 'sup_transfer_1', {
    department: 'technical',
    newAssigneeId: 'admin_c',
    newAssigneeName: 'Lê Văn C',
    internalNote: 'Bàn giao chuyển cho đội Kỹ thuật kiểm tra cấu hình Python.',
  }, { db, now });

  assert.equal(transferRes.success, true);
  assert.equal(transferRes.newAssigneeName, 'Lê Văn C');

  // 2. Thăng cấp lên Khiếu nại khẩn (Khối 6)
  // Lý do < 20 ký tự phải bị chặn
  await assert.rejects(
    escalateToComplaint(actorCS, 'sup_transfer_1', {
      disputeGroup: 'quality_complaint',
      reason: 'Lỗi bài học',
    }, { db, now }),
    (err) => err.code === 'REASON_TOO_SHORT'
  );

  // Thăng cấp hợp lệ
  const escalateRes = await escalateToComplaint(actorCS, 'sup_transfer_1', {
    disputeGroup: 'quality_complaint',
    reason: 'Học viên bức xúc vì hệ thống lab lỗi không thể nộp bài tập đúng hạn.',
  }, { db, now });

  assert.equal(escalateRes.success, true);
  assert.ok(escalateRes.complaintCode.startsWith('CP-'));
  // SLA rút ngắn xuống còn 4 giờ (AC-68)
  const diffHours = (new Date(escalateRes.newDueAt).getTime() - now.getTime()) / 3600000;
  assert.equal(diffHours, 4);

  // Kiểm tra hồ sơ lưu trong collection khiếu nại (AC-66, AC-67)
  const complaintDoc = await db.collection(COLLECTION_COMPLAINTS).findOne({ source_ticket_id: 'sup_transfer_1' });
  assert.ok(complaintDoc);
  assert.equal(complaintDoc.dispute_group, 'quality_complaint');
});

test('Support Tickets Admin: Khối 7 & 8 - Canned Responses & Giải quyết Đóng ticket', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const ticketsCol = db.collection(COLLECTION_TICKETS);

  await ticketsCol.insertOne({
    _id: 'sup_close_1',
    ticket_code: 'TK-2026-1042',
    full_name: 'Nguyễn Văn A',
    contact_email: 'nguyenvana@email.com',
    status: 'processing',
    response_due_at: new Date('2026-11-10T20:00:00Z'),
    created_at: now,
    thread: [],
  });

  const actorCS = { id: 'admin_huy', fullName: 'Gia Huy', role: 'CS' };

  // 1. Thư viện câu trả lời mẫu (Khối 7)
  const cannedList = await listCannedResponses({ topic: 'technical_lab' }, { db });
  assert.ok(cannedList.length >= 3);
  assert.ok(cannedList.some((c) => c.code === 'request_screenshot_code'));

  // 2. Đóng ticket (Khối 8)
  // Phân loại không hợp lệ bị chặn
  await assert.rejects(
    resolveAndCloseTicket(actorCS, 'sup_close_1', {
      resolutionCategory: 'invalid_cat',
    }, { db, now }),
    (err) => err.code === 'CATEGORY_REQUIRED'
  );

  let csatEmail = null;
  const resolveRes = await resolveAndCloseTicket(actorCS, 'sup_close_1', {
    resolutionCategory: 'code_guidance',
    internalSolutionNote: 'Đã hướng dẫn học viên sửa thụt lề syntax error thành công.',
    sendCsatSurvey: true,
    finalReplyBody: 'Cảm ơn bạn đã liên hệ ThinkUp. Chúc bạn học tốt!',
  }, {
    db,
    now,
    sendEmail: async (mail) => { csatEmail = mail; return { accepted: [mail.to] }; },
  });

  assert.equal(resolveRes.success, true);
  assert.equal(resolveRes.status, 'closed');
  assert.equal(resolveRes.resolution.category, 'code_guidance');
  assert.ok(csatEmail);
  assert.ok(csatEmail.text.includes('1 đến 5 sao'));

  // Kiểm tra cập nhật trong database
  const updatedDoc = await ticketsCol.findOne({ _id: 'sup_close_1' });
  assert.equal(updatedDoc.status, 'closed');
  assert.ok(updatedDoc.resolved_at);
  assert.ok(updatedDoc.thread.length >= 2);
});
