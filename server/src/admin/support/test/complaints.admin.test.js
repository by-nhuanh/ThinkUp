import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BSON } from 'mongodb';
import {
  COLLECTION_COMPLAINTS,
  getComplaintSummary,
  listComplaints,
  getComplaintDetail,
  requestInstructorExplanation,
  resolveRefund,
  dismissComplaint,
  disciplineInstructor,
} from '../complaints.admin.js';

const clone = (val) => BSON.deserialize(BSON.serialize({ val })).val;

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
          if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
            return Object.entries(value).every(([op, exp]) => {
              if (op === '$in') return exp.includes(doc[key]);
              if (op === '$ne') return doc[key] !== exp;
              if (op === '$lt') return doc[key] < exp;
              if (op === '$lte') return doc[key] <= exp;
              if (op === '$gte') return doc[key] >= exp;
              if (op === '$gt') return doc[key] > exp;
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
              const newDoc = { ...filter, ...(update.$set ? clone(update.$set) : {}) };
              rows().push(newDoc);
              return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0, modifiedCount: 0 };
          }
          if (update.$set) Object.assign(doc, clone(update.$set));
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        async deleteOne(filter) {
          const idx = rows().findIndex((item) => matches(item, filter));
          if (idx >= 0) {
            rows().splice(idx, 1);
            return { deletedCount: 1 };
          }
          return { deletedCount: 0 };
        },
        find(filter = {}) {
          let list = rows().filter((item) => matches(item, filter));
          return {
            sort(criteria) {
              list.sort((a, b) => {
                for (const [k, dir] of Object.entries(criteria)) {
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
        aggregate(pipeline = []) {
          return {
            async toArray() {
              let current = clone(rows());
              for (const stage of pipeline) {
                if (stage.$match) current = current.filter((item) => matches(item, stage.$match));
                if (stage.$group) {
                  const sumField = stage.$group.total?.$sum?.replace('$', '');
                  const total = current.reduce((acc, cur) => acc + (cur[sumField] || 0), 0);
                  return [{ _id: null, total }];
                }
              }
              return current;
            },
          };
        },
      };
    },
  };
}

test('Complaints Admin: Khối 1 - Tính toán 4 thẻ KPI Điểm nóng', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const col = db.collection(COLLECTION_COMPLAINTS);

  await col.insertOne({
    _id: 'cmp_1',
    complaint_code: 'CP-2026-0001',
    amount: 1500000,
    status: 'pending',
    due_at: new Date('2026-11-10T12:00:00Z'),
    created_at: now,
  });
  await col.insertOne({
    _id: 'cmp_2',
    complaint_code: 'CP-2026-0002',
    amount: 6000000, // High risk (> 5M)
    status: 'reviewing',
    due_at: new Date('2026-11-10T09:00:00Z'), // Overdue SLA
    created_at: now,
  });

  const summary = await getComplaintSummary({ db, now });
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.highRiskCount, 1);
  assert.equal(summary.totalRefundRequestedAmount, 7500000);
  assert.equal(summary.slaBreachedCount, 1);
});

test('Complaints Admin: Khối 2 & 3 - Bộ lọc đa diện & Ưu tiên sắp xếp SLA', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const col = db.collection(COLLECTION_COMPLAINTS);

  await col.insertOne({
    _id: 'cmp_filter_1',
    complaint_code: 'CP-2026-0048',
    claimant: { fullName: 'Nguyễn Văn A', email: 'nguyenvana@email.com' },
    respondent: { fullName: 'Trần B', email: 'tranb@email.com' },
    dispute_type: 'refund',
    status: 'pending',
    amount: 1290000,
    due_at: new Date('2026-11-10T11:45:00Z'), // Còn 1h45m
    created_at: now,
  });

  const actorSA = { id: 'admin_1', role: 'SA' };
  const list = await listComplaints(actorSA, { amountRange: '1m_to_5m', disputeType: 'refund' }, { db, now });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].complaintCode, 'CP-2026-0048');
  assert.equal(list.items[0].sla.isWarning, false);
});

test('Complaints Admin: Khối 5 & 6 - Yêu cầu giải trình & Phê duyệt bồi hoàn tài chính', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const col = db.collection(COLLECTION_COMPLAINTS);

  await col.insertOne({
    _id: 'cmp_act_1',
    complaint_code: 'CP-2026-0048',
    claimant: { id: 'student_1', fullName: 'Nguyễn Văn A', email: 'nguyenvana@email.com' },
    respondent: { id: 'inst_1', fullName: 'Trần B', email: 'tranb@email.com' },
    course_id: 'course_react',
    amount: 1290000,
    status: 'reviewing',
    due_at: new Date('2026-11-10T14:00:00Z'),
    created_at: now,
    learner_statement: 'Bài lab chương 3 bị lỗi không thể thực hành',
  });

  const actorCS = { id: 'admin_cs', fullName: 'Minh Anh', role: 'CS' };

  // 1. Yêu cầu giải trình 12h và đóng băng ví
  const reqRes = await requestInstructorExplanation(actorCS, 'cmp_act_1', {
    deadlineHours: 12,
    freezeInstructorWallet: true,
    adminInstructionNote: 'Yêu cầu GV giải trình lỗi lab.',
  }, {
    db,
    now,
    sendEmail: async () => ({ accepted: ['test@example.com'] }),
  });

  assert.equal(reqRes.success, true);
  assert.equal(reqRes.status, 'waiting_instructor');
  assert.equal(reqRes.walletFrozen, true);

  // Giảng viên cung cấp giải trình
  await col.updateOne({ _id: 'cmp_act_1' }, { $set: { instructor_statement: 'Đã fix bài lab vào phiên bản mới.' } });

  // 2. Phê duyệt hoàn tiền
  const refundRes = await resolveRefund(actorCS, 'cmp_act_1', {
    refundType: 'full',
    revokeAccess: true,
    revokeCertificate: true,
    conclusionNote: 'Chấp thuận hoàn tiền 100% do bài lab lỗi kéo dài gây bức xúc cho học viên.',
  }, {
    db,
    now,
    sendEmail: async () => ({ accepted: ['test@example.com'] }),
  });

  assert.equal(refundRes.success, true);
  assert.equal(refundRes.status, 'resolved');
  assert.equal(refundRes.resolution.refundAmount, 1290000);
  assert.equal(refundRes.resolution.instructorDeduction, 903000); // 70% ví GV (AC-29)
});

test('Complaints Admin: Khối 7 & 8 - Bác bỏ khiếu nại & Kỷ luật đối tác', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const col = db.collection(COLLECTION_COMPLAINTS);

  await col.insertOne({
    _id: 'cmp_dismiss_1',
    complaint_code: 'CP-2026-0049',
    claimant: { id: 'student_2', fullName: 'Lê Văn D', email: 'levand@email.com' },
    respondent: { id: 'inst_1', fullName: 'Trần B', email: 'tranb@email.com' },
    amount: 500000,
    status: 'reviewing',
    wallet_frozen: true,
    due_at: new Date('2026-11-10T14:00:00Z'),
    created_at: now,
  });

  const actorSA = { id: 'admin_sa', fullName: 'Super Admin', role: 'SA' };

  // 1. Bác bỏ khiếu nại
  const dismissRes = await dismissComplaint(actorSA, 'cmp_dismiss_1', {
    rejectionBasis: 'Học viên đã học vượt quá thời lượng cho phép (> 20%)',
    explanationNote: 'Theo điều khoản quy chế hoàn tiền, học viên đã hoàn thành 45% thời lượng video và hoàn thành Quiz nên không đủ điều kiện hoàn học phí.',
    grantVoucher: true,
  }, {
    db,
    now,
    sendEmail: async () => ({ accepted: ['test@example.com'] }),
  });

  assert.equal(dismissRes.success, true);
  assert.equal(dismissRes.status, 'dismissed');
  assert.ok(dismissRes.resolution.grantedVoucherCode);

  // 2. Kỷ luật đối tác (Khối 8)
  const disciplineRes = await disciplineInstructor(actorSA, 'cmp_dismiss_1', {
    sanctions: ['strike', 'archive_course_14d'],
    decisionText: 'Cảnh cáo giảng viên chậm trễ hỗ trợ học viên và tạm ẩn khóa học trong 14 ngày.',
  }, {
    db,
    now,
    sendEmail: async () => ({ accepted: ['test@example.com'] }),
  });

  assert.equal(disciplineRes.success, true);
  assert.deepEqual(disciplineRes.discipline.sanctions, ['strike', 'archive_course_14d']);
});
