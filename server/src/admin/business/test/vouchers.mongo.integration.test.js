import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { getMongoDb, closeMongoDb, signJwt } from '../../../user/db.js';
import { createAdminAuthMiddleware } from '../../auth/auth.admin.js';
import { createAdminVouchersRouter } from '../vouchers.admin.js';
import { createPaymentSession } from '../../../user/payment/payment.service.js';
import { VOUCHERS } from '../../../user/voucher/voucher.service.js';

test('real MongoDB and Admin auth: API roles and reservation versus lock', async () => {
  if (!/^Thinkup_voucher_test_[A-Za-z0-9_-]+$/.test(process.env.MONGODB_DB_NAME || '')) throw new Error('Use an isolated Thinkup_voucher_test_ database.');
  const db = await getMongoDb();
  const suffix = String(Date.now());
  const code = `GV-RACE-${suffix}`;
  const adminIds = { SA: new ObjectId(), FA: new ObjectId(), CA: new ObjectId() };
  const userId = new ObjectId(), courseId = `VOUCHER-COURSE-${suffix}`, instructorId = `GV-${suffix}`;
  const app = express(); app.use(express.json());
  app.use('/api/admin/business/vouchers', createAdminVouchersRouter(express, createAdminAuthMiddleware(), { db }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ code: error.code || 'ERROR' }));
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/business/vouchers`;
  const call = (role, path, method, body) => fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${signJwt({ adminId: String(adminIds[role]) })}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    for (const [role, id] of Object.entries(adminIds)) await db.collection('admins').insertOne({ _id: id, role, status: 'ACTIVE', is_active: true });
    await db.collection('users').insertOne({ _id: userId, status: 'active', is_active: true });
    await db.collection('courses').insertOne({ course_id: courseId, instructor_id: instructorId, status: 'published', title: 'Test course', price: 500000, original_price: 500000 });
    const body = { code, sponsor: 'instructor', instructorId, scope: 'courses', scopeTargetIds: [courseId], audience: 'all', discountType: 'percent', discountValue: 20, maxDiscount: 100000, minOrder: 100000, minCourseCount: 1, limit: 10, perAccount: 1, startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() };
    assert.equal((await call('CA', '/', 'POST', body)).status, 403);
    assert.equal((await call('FA', '/', 'POST', body)).status, 200);
    assert.equal((await call('SA', `/${code}`, 'PATCH', { version: 1, description: 'Reviewed' })).status, 200);
    const paymentOptions = { db, paymentMode: 'live', generateIds: async () => ({ orderId: `DH${suffix}001`, transactionId: `GD${suffix}001` }) };
    const previous = Object.fromEntries(['SEPAY_BANK_ID', 'SEPAY_ACCOUNT_NO', 'BANK_ACCOUNT_HOLDER', 'SEPAY_WEBHOOK_KEY'].map(key => [key, process.env[key]]));
    Object.assign(process.env, { SEPAY_BANK_ID: 'MB', SEPAY_ACCOUNT_NO: '123456789', BANK_ACCOUNT_HOLDER: 'TEST', SEPAY_WEBHOOK_KEY: 'test-only' });
    try {
      const [payment, lock] = await Promise.allSettled([
        createPaymentSession({ userId: String(userId), courseIds: [courseId], voucherCode: code, paymentMethod: 'sepay', idempotencyKey: `voucher-race-${suffix}` }, paymentOptions),
        call('FA', `/${code}/lock`, 'POST'),
      ]);
      assert.equal(lock.status, 'fulfilled'); assert.equal(lock.value.status, 200);
      const voucher = await db.collection(VOUCHERS).findOne({ code });
      assert.ok(voucher.locked_at);
      assert.equal(voucher.usage_count, payment.status === 'fulfilled' ? 1 : 0);
      if (payment.status === 'rejected') assert.equal(payment.reason.code, 'VOUCHER_UNAVAILABLE');
    } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
    assert.equal((await call('SA', `/${code}/unlock`, 'POST')).status, 200);
    assert.equal((await db.collection('admin_audit_logs').countDocuments({ 'details.entity.id': code })), 4);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.collection('admin_audit_logs').deleteMany({ 'details.entity.id': code });
    await db.collection('payment_transactions').deleteMany({ user_id: String(userId) });
    await db.collection('orders').deleteMany({ user_id: String(userId) });
    await db.collection('counters').deleteMany({ _id: { $in: [`payment-code:DH${suffix}001`, `payment-code:GD${suffix}001`] } });
    await db.collection(VOUCHERS).deleteMany({ code });
    await db.collection('courses').deleteMany({ course_id: courseId });
    await db.collection('users').deleteMany({ _id: userId });
    await db.collection('admins').deleteMany({ _id: { $in: Object.values(adminIds) } });
    await closeMongoDb();
  }
});
