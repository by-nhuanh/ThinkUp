import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BSON } from 'mongodb';
import {
  COLLECTION_FAQS,
  COLLECTION_FAILED_SEARCHES,
  FAQ_CATEGORIES,
  getFaqSummary,
  listFaqs,
  createFaq,
  updateFaq,
  reorderFaq,
  toggleFaqStatus,
  deleteFaq,
  listFailedSearches,
} from '../faqs.admin.js';

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
        async updateMany(filter, update) {
          const matched = rows().filter((item) => matches(item, filter));
          for (const doc of matched) {
            if (update.$inc) {
              for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
            }
            if (update.$set) Object.assign(doc, clone(update.$set));
          }
          return { matchedCount: matched.length, modifiedCount: matched.length };
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
                  const sumField = (stage.$group.totalViews || stage.$group.totalFailed)?.$sum?.replace('$', '');
                  const total = current.reduce((acc, cur) => acc + (cur[sumField] || 0), 0);
                  if (stage.$group.totalViews) return [{ _id: null, totalViews: total }];
                  if (stage.$group.totalFailed) return [{ _id: null, totalFailed: total }];
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

test('FAQ Admin: Khối 1 - 4 thẻ KPI Hiệu năng Tri thức', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const faqsCol = db.collection(COLLECTION_FAQS);
  const failedCol = db.collection(COLLECTION_FAILED_SEARCHES);

  await faqsCol.insertOne({
    _id: 'faq_1',
    question: 'Làm thế nào để đổi mật khẩu?',
    category_code: 'account_security',
    views_count: 1526,
    status: 'published',
  });
  await failedCol.insertOne({
    _id: 'fail_1',
    keyword: 'xuất hóa đơn đỏ',
    search_count: 64,
    last_searched_at: now,
  });

  const summary = await getFaqSummary({ db, now });
  assert.equal(summary.totalFaqsCount, 1);
  assert.equal(summary.monthlyViewsCount, 1526);
  assert.equal(summary.failedSearchesCount, 64);
});

test('FAQ Admin: Khối 2 & 3 - Bộ lọc 7 nhóm & Soạn thảo câu hỏi mới', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const actorCS = { id: 'admin_cs', fullName: 'Gia Huy', role: 'CS' };

  // Soạn câu hỏi 1
  const createRes1 = await createFaq(actorCS, {
    categoryCode: 'payment_invoice',
    question: 'ThinkUp chấp nhận những phương thức thanh toán nào?',
    answer: 'ThinkUp hỗ trợ thanh toán qua cổng VNPay, Ví MoMo, thẻ ATM nội địa và thẻ Visa/Mastercard.',
    keywords: 'vnpay, momo, visa, chuyển khoản',
    orderIndex: 1,
  }, { db, now });

  assert.equal(createRes1.success, true);
  assert.equal(createRes1.item.order_index, 1);

  // Soạn câu hỏi 2 chèn vào vị trí 1 -> câu 1 tự dồn lên 2
  const createRes2 = await createFaq(actorCS, {
    categoryCode: 'payment_invoice',
    question: 'Làm sao để xuất hóa đơn VAT?',
    answer: 'Bạn vui lòng gửi thông tin công ty và mã đơn hàng trong vòng 48h qua email support@thinkup.vn.',
    keywords: 'hóa đơn, vat, doanh nghiệp',
    orderIndex: 1,
  }, { db, now });

  assert.equal(createRes2.item.order_index, 1);

  // Lọc theo nhóm Thanh toán & Hóa đơn
  const listRes = await listFaqs({ category: 'payment_invoice' }, { db });
  assert.equal(listRes.items.length, 2);
  assert.equal(listRes.items[0].question, 'Làm sao để xuất hóa đơn VAT?');
  assert.equal(listRes.items[1].orderIndex, 2); // Câu 1 đã dồn lên 2
});

test('FAQ Admin: Đổi thứ tự nhanh, Ẩn/Hiện & Xóa câu hỏi dồn thứ tự', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const actorCS = { id: 'admin_cs', fullName: 'Gia Huy', role: 'CS' };

  const q1 = await createFaq(actorCS, { categoryCode: 'certificate', question: 'Q1', answer: 'A1', orderIndex: 1 }, { db, now });
  const q2 = await createFaq(actorCS, { categoryCode: 'certificate', question: 'Q2', answer: 'A2', orderIndex: 2 }, { db, now });
  const q3 = await createFaq(actorCS, { categoryCode: 'certificate', question: 'Q3', answer: 'A3', orderIndex: 3 }, { db, now });

  // 1. Ẩn hiện nhanh Q2
  const toggleRes = await toggleFaqStatus(actorCS, q2.item._id, { db });
  assert.equal(toggleRes.status, 'hidden');

  // 2. Xóa Q2 -> Q3 tự dồn thành thứ tự 2
  const deleteRes = await deleteFaq(actorCS, q2.item._id, { db });
  assert.equal(deleteRes.success, true);

  const updatedQ3 = await db.collection(COLLECTION_FAQS).findOne({ _id: q3.item._id });
  assert.equal(updatedQ3.order_index, 2);
});

test('FAQ Admin: Danh sách từ khóa tìm hụt (Failed Searches)', async () => {
  const db = createMockDb();
  const now = new Date('2026-11-10T10:00:00Z');
  const failedCol = db.collection(COLLECTION_FAILED_SEARCHES);

  await failedCol.insertOne({
    _id: 'fail_1',
    keyword: 'học trên ipad',
    search_count: 42,
    suggested_category: 'Kỹ thuật và Ứng dụng',
    last_searched_at: now,
  });

  const list = await listFailedSearches({ db, now });
  assert.equal(list.length, 1);
  assert.equal(list[0].keyword, 'học trên ipad');
  assert.equal(list[0].searchCount, 42);
});

