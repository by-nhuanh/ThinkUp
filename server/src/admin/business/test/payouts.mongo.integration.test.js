import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import express from 'express';
import { getMongoDb, closeMongoDb, signJwt } from '../../../user/db.js';
import { createAdminAuthMiddleware } from '../../auth/auth.admin.js';
import { rejectAdminPayout, approveAdminPayout, createAdminPayoutsRouter } from '../payouts.admin.js';

test('MongoDB payout rejection is atomic and cannot refund twice', async () => {
  if (!/^Thinkup_payout_test_[A-Za-z0-9_-]+$/.test(process.env.MONGODB_DB_NAME || '')) throw new Error('Use an isolated Thinkup_payout_test_ database.');
  const db = await getMongoDb(), suffix = String(Date.now());
  const id = new ObjectId(), walletId = new ObjectId(), holdId = new ObjectId(), requestId = `PO-TEST-${suffix}`, instructorId = `GV-TEST-${suffix}`;
  const approveId = new ObjectId(), approveHoldId = new ObjectId(), approveWalletId = new ObjectId(), approveRequestId = `PO-APPROVE-${suffix}`, approveInstructorId = `GV-APPROVE-${suffix}`;
  const demoApproveId = new ObjectId(), demoRejectId = new ObjectId(), demoApproveRequestId = `PO-DEMO-A-${suffix}`, demoRejectRequestId = `PO-DEMO-R-${suffix}`;
  const actor = String(new ObjectId());
  const caId = new ObjectId();
  let server;
  const data = { _id: id, request_id: requestId, instructor_id: instructorId, hold_ledger_id: holdId, email: 'payout-test@example.invalid', amount: 5000000, bank: 'TEST', account_number: '123456789', verified: true, contract_valid: true, disputed: false, status: 'pending', is_demo: false };
  try {
    await db.collection('payout_requests').insertOne(data);
    await db.collection('instructor_wallet_ledger').insertOne({ _id: holdId, request_id: requestId, instructor_id: instructorId, action: 'hold', amount: 5000000 });
    await assert.rejects(rejectAdminPayout(requestId, { reason: 'Sai STK', details: 'Đối soát không khớp', adminId: actor }, { db }), { code: 'PAYOUT_BALANCE_UNAVAILABLE' });
    assert.equal((await db.collection('payout_requests').findOne({ _id: id })).status, 'pending');
    await db.collection('instructor_wallets').insertOne({ _id: walletId, instructor_id: instructorId, available_balance: 1000000, frozen_balance: 5000000 });
    const results = await Promise.allSettled([
      rejectAdminPayout(requestId, { reason: 'Sai STK', details: 'Đối soát không khớp', adminId: actor }, { db }),
      rejectAdminPayout(requestId, { reason: 'Sai STK', details: 'Đối soát không khớp', adminId: actor }, { db }),
    ]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    const profile = await db.collection('instructor_wallets').findOne({ _id: walletId });
    assert.equal(profile.available_balance, 6000000);
    assert.equal(profile.frozen_balance, 0);
    assert.equal((await db.collection('payout_requests').findOne({ _id: id })).status, 'rejected');
    assert.equal(await db.collection('admin_audit_logs').countDocuments({ 'details.entity.id': requestId }), 1);
    assert.equal(await db.collection('admin_user_email_outbox').countDocuments({ _id: `payout-rejected:${requestId}`, next_attempt_at: { $exists: true } }), 1);
    assert.equal(await db.collection('instructor_wallet_ledger').countDocuments({ request_id: requestId, action: 'release' }), 1);
    await assert.rejects(approveAdminPayout(requestId, { adminId: actor, adminRole: 'SA' }, { db }), { code: 'PAYOUT_STATE_CONFLICT' });
    await db.collection('payout_requests').insertOne({ ...data, _id: approveId, request_id: approveRequestId, instructor_id: approveInstructorId, hold_ledger_id: approveHoldId, tax_policy_snapshot: { contract_id: 'signed-test-contract', approved_at: new Date(), threshold: 2000000, rate: 0.1, version: 1 }, account_name: 'TEST OWNER' });
    await db.collection('instructor_wallet_ledger').insertOne({ _id: approveHoldId, request_id: approveRequestId, instructor_id: approveInstructorId, action: 'hold', amount: 5000000 });
    await db.collection('instructor_wallets').insertOne({ _id: approveWalletId, instructor_id: approveInstructorId, available_balance: 0, frozen_balance: 5000000 });
    const approvals = await Promise.allSettled([
      approveAdminPayout(approveRequestId, { adminId: actor, adminRole: 'FA' }, { db }),
      approveAdminPayout(approveRequestId, { adminId: actor, adminRole: 'FA' }, { db }),
    ]);
    assert.equal(approvals.filter(x => x.status === 'fulfilled').length, 1);
    const approved = await db.collection('payout_requests').findOne({ _id: approveId });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.tax_amount, 500000);
    assert.equal(approved.net_amount, 4500000);
    assert.equal((await db.collection('instructor_wallets').findOne({ _id: approveWalletId })).frozen_balance, 5000000);
    assert.equal(await db.collection('admin_audit_logs').countDocuments({ 'details.entity.id': approveRequestId }), 1);
    await db.collection('admins').insertOne({ _id: new ObjectId(actor), role: 'FA', status: 'ACTIVE', is_active: true });
    await db.collection('admins').insertOne({ _id: caId, role: 'CA', status: 'ACTIVE', is_active: true });
    const app = express(); app.use(express.json());
    app.use('/api/admin/business/payouts', createAdminPayoutsRouter(express, createAdminAuthMiddleware()));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ code: error.code || 'ERROR' }));
    server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/admin/business/payouts`;
    const call = (token) => fetch(`${url}/summary`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal((await call(null)).status, 401);
    assert.equal((await call(signJwt({ adminId: String(caId) }))).status, 403);
    assert.equal((await call(signJwt({ adminId: actor }))).status, 200);
    await db.collection('payout_requests').insertMany([
      { ...data, _id: demoApproveId, request_id: demoApproveRequestId, is_demo: true, hold_ledger_id: null, account_name: 'TEST OWNER' },
      { ...data, _id: demoRejectId, request_id: demoRejectRequestId, is_demo: true, hold_ledger_id: null, account_name: 'TEST OWNER' },
    ]);
    const demoToken = signJwt({ adminId: actor });
    const demoCall = (id, action, body) => fetch(`${url}/${id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${demoToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await demoCall(demoApproveRequestId, 'approve', {})).status, 200);
    assert.equal((await demoCall(demoRejectRequestId, 'reject', { reason: 'Sai STK', details: 'Dữ liệu thử nghiệm' })).status, 200);
    assert.equal((await db.collection('payout_requests').findOne({ _id: demoApproveId })).status, 'approved');
    assert.equal((await db.collection('payout_requests').findOne({ _id: demoRejectId })).status, 'rejected');
    assert.equal(await db.collection('instructor_wallet_ledger').countDocuments({ request_id: { $in: [demoApproveRequestId, demoRejectRequestId] } }), 0);
    assert.equal(await db.collection('admin_user_email_outbox').countDocuments({ _id: `payout-rejected:${demoRejectRequestId}` }), 0);
    const summary = await (await call(demoToken)).json();
    assert.equal(summary.containsDemo, true);
    assert.equal(summary.demoKpi.awaitingDisbursementAmount, 4500000);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.collection('admin_user_email_outbox').deleteMany({ _id: `payout-rejected:${requestId}` });
    await db.collection('admin_audit_logs').deleteMany({ 'details.entity.id': requestId });
    await db.collection('admin_audit_logs').deleteMany({ 'details.entity.id': approveRequestId });
    await db.collection('admin_audit_logs').deleteMany({ 'details.entity.id': { $in: [demoApproveRequestId, demoRejectRequestId] } });
    await db.collection('payout_requests').deleteMany({ _id: id });
    await db.collection('payout_requests').deleteMany({ _id: approveId });
    await db.collection('payout_requests').deleteMany({ _id: { $in: [demoApproveId, demoRejectId] } });
    await db.collection('instructor_wallet_ledger').deleteMany({ request_id: requestId });
    await db.collection('instructor_wallet_ledger').deleteMany({ request_id: approveRequestId });
    await db.collection('instructor_wallets').deleteMany({ _id: walletId });
    await db.collection('instructor_wallets').deleteMany({ _id: approveWalletId });
    await db.collection('admins').deleteMany({ _id: { $in: [new ObjectId(actor), caId] } });
    await closeMongoDb();
  }
});
