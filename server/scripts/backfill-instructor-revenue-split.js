import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMongoDb, closeMongoDb } from '../src/user/db.js';
import { dateOf } from '../src/admin/business/payouts.admin.js';

const VERSION = 'instructor-revenue-60-40-20261110-v1';
const apply = process.argv.includes('--apply');
const db = await getMongoDb();
const collection = db.collection('instructor_revenue_transactions');

function amount(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${field} không phải số tiền VND hợp lệ.`);
  return parsed;
}

function sponsorOf(row, discount) {
  if (discount === 0) return 'none';
  const code = String(row.discount_code || '').trim().toUpperCase();
  if (['THINKUP100', 'THINKUP50'].includes(code)) return 'thinkup';
  if (['NEXT100K', 'REACT20'].includes(code)) return 'instructor';
  throw new Error(`Nguồn tài trợ voucher chưa được xác định: ${code}`);
}

try {
  const rows = await collection.find({}).toArray();
  if (rows.length !== 29) throw new Error(`Dừng: dự kiến đúng 29 dòng lịch sử, thực tế ${rows.length}.`);
  const courses = await db.collection('courses').find({}, { projection: { _id: 1, course_id: 1, instructor_id: 1 } }).toArray();
  const byCourse = new Map(courses.flatMap(course => [[String(course.course_id), course], [String(course._id), course]]));
  const planned = rows.map(row => {
    if (row.allocation_version && row.allocation_version !== VERSION) throw new Error('Có dòng đã được phân bổ theo phiên bản khác.');
    const price = amount(row.original_price, 'original_price');
    const discount = amount(row.discount_amount, 'discount_amount');
    const paid = amount(row.paid_amount, 'paid_amount');
    if (price - discount !== paid || row.status !== 'success') throw new Error('Giá, giảm giá hoặc trạng thái dòng lịch sử không nhất quán.');
    const course = byCourse.get(String(row.course_id));
    if (!course?.instructor_id) throw new Error('Không xác định được giảng viên từ khóa học.');
    const sponsor = sponsorOf(row, discount);
    const platform = Math.round(price * 0.6) - (sponsor === 'thinkup' ? discount : 0);
    const instructor = paid - platform;
    if (platform < 0 || instructor < 0) throw new Error('Phân bổ tạo khoản âm.');
    const paidAt = dateOf(row.paid_at);
    if (!paidAt) throw new Error('Ngày thanh toán không hợp lệ.');
    const set = {
      instructor_id: String(course.instructor_id),
      platform_share_rate: 0.6,
      instructor_share_rate: 0.4,
      voucher_sponsor: sponsor,
      platform_share_amount: platform,
      instructor_share_amount: instructor,
      withdrawable_at: new Date(paidAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      allocation_version: VERSION,
      allocation_basis: 'historical_original_price_with_sponsor_discount',
      source_reconciliation_status: 'unverified_payment_source',
      wallet_credit_status: 'not_posted',
    };
    if (row.allocation_version === VERSION && Object.entries(set).some(([key, value]) =>
      key === 'withdrawable_at' ? new Date(row[key]).getTime() !== value.getTime() : row[key] !== value)) {
      throw new Error('Dòng đã phân bổ không khớp kết quả dự kiến; cần đối soát thủ công.');
    }
    return { row, set };
  });
  const pending = planned.filter(({ row }) => row.allocation_version !== VERSION);
  const summary = { database: db.databaseName, rows: rows.length, toUpdate: pending.length, alreadyUpdated: rows.length - pending.length,
    paidAmount: planned.reduce((sum, item) => sum + amount(item.row.paid_amount, 'paid_amount'), 0),
    platformShare: planned.reduce((sum, item) => sum + item.set.platform_share_amount, 0),
    instructorShare: planned.reduce((sum, item) => sum + item.set.instructor_share_amount, 0),
    sponsorCounts: Object.fromEntries(['none', 'thinkup', 'instructor'].map(sponsor => [sponsor, planned.filter(item => item.set.voucher_sponsor === sponsor).length])), apply };
  console.log(JSON.stringify(summary));
  if (apply && pending.length) {
    const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../output');
    await mkdir(output, { recursive: true });
    const backupPath = path.join(output, `instructor-revenue-before-${VERSION}.json`);
    await writeFile(backupPath, JSON.stringify(rows, null, 2), { flag: 'wx' });
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const { row, set } of pending) {
          const result = await collection.updateOne({ _id: row._id, allocation_version: { $exists: false },
            original_price: row.original_price, discount_amount: row.discount_amount, paid_amount: row.paid_amount, status: 'success' },
          { $set: set }, { session });
          if (result.matchedCount !== 1) throw new Error('Dòng doanh thu vừa thay đổi; rollback toàn bộ.');
        }
      });
    } finally { await session.endSession(); }
    const verified = await collection.countDocuments({ allocation_version: VERSION, wallet_credit_status: 'not_posted' });
    if (verified !== rows.length) throw new Error('Số dòng sau cập nhật không khớp; cần đối soát.');
    console.log(JSON.stringify({ verified, backupPath }));
  }
} finally { await closeMongoDb(); }
