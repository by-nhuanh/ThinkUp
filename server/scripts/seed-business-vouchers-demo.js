import { MongoClient } from 'mongodb';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VOUCHERS } from '../src/user/voucher/voucher.service.js';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'Thinkup');
  const col = db.collection(VOUCHERS);
  const courses = await db.collection('courses').find({ status: 'published', instructor_id: { $exists: true, $nin: [null, ''] } }, { projection: { course_id: 1, instructor_id: 1 } }).limit(25).toArray();
  if (courses.length < 25) throw new Error('Need 25 published instructor courses to seed');
  const now = new Date();
  const at = days => new Date(now.getTime() + days * 86400000);
  const rows = Array.from({ length: 50 }, (_, i) => {
    const instructor = i >= 25;
    const course = courses[i % 25];
    const state = i % 5;
    const start = state === 2 ? at(7) : at(-14);
    const end = state === 4 ? at(-1) : at(30);
    const percent = i % 2 === 0;
    return {
      code: `${instructor ? 'GV' : 'TU'}-DEMO-${String(i + 1).padStart(3, '0')}`,
      description: `Voucher minh họa ${i + 1}`,
      sponsor: instructor ? 'instructor' : 'thinkup',
      instructor_id: instructor ? String(course.instructor_id) : null,
      scope: instructor ? 'courses' : 'all',
      scope_target_ids: instructor ? [String(course.course_id || course._id)] : [],
      min_rating: null,
      audience: i % 4 === 0 ? 'new_learner' : 'all',
      discount_type: percent ? 'percent' : 'fixed',
      discount_value: percent ? 10 + i % 20 : 30000 + (i % 8) * 10000,
      max_discount: percent ? 100000 + (i % 5) * 50000 : null,
      min_order_value: 100000 + (i % 4) * 50000,
      min_course_count: 1,
      usage_limit: 50 + i * 2,
      usage_count: 0,
      usage_limit_per_user: 1,
      starts_at: start,
      expires_at: end,
      weekly_schedule: null,
      show_on_site: i % 3 !== 0,
      locked_at: state === 3 ? now : null,
      deleted_at: null,
      version: 1,
      is_demo: true,
      created_at: now,
      updated_at: now,
    };
  });
  const codes = rows.map(row => row.code);
  const existing = await col.countDocuments({ code: { $in: codes } });
  if (existing) throw new Error(`${existing} demo codes already exist; refusing to overwrite`);
  const preview = join(process.cwd(), 'output', `voucher-seed-preview-${now.toISOString().replaceAll(':', '-')}.json`);
  await writeFile(preview, JSON.stringify(rows, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ phase: 'preview', count: rows.length, preview, bySponsor: { thinkup: 25, instructor: 25 }, statePattern: { active: 20, scheduled: 10, locked: 10, expired: 10 } }));
  if (process.argv.includes('--apply')) {
    await col.createIndex({ code: 1 }, { unique: true });
    await col.insertMany(rows, { ordered: true });
    const inserted = await col.countDocuments({ code: { $in: codes }, is_demo: true });
    if (inserted !== 50) throw new Error(`Expected 50 demo vouchers, found ${inserted}`);
    console.log(JSON.stringify({ phase: 'applied', inserted }));
  }
} finally { await client.close(); }
