import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTax,
  parsePayoutQuery,
  payoutView,
  listAdminPayouts,
  getAdminPayoutSummary,
  getAdminPayoutDetail,
  approveAdminPayout,
  rejectAdminPayout,
  exportAdminPayouts,
  LARGE_PAYOUT_THRESHOLD,
} from '../payouts.admin.js';

const mockPayouts = [
  {
    _id: '64b000000000000000000001',
    request_id: 'PO-2026-001',
    instructor_id: 'GV-1',
    instructor_name: 'Nguyễn Văn A',
    email: 'nva@thinkup.vn',
    amount: 5000000,
    available_balance: 10000000,
    bank: 'Vietcombank',
    account_number: '1234567890',
    account_name: 'NGUYEN VAN A',
    verified: true,
    contract_valid: true,
    disputed: false,
    status: 'pending',
    submitted_at: '2026-11-01T10:00:00Z',
  },
  {
    _id: '64b000000000000000000002',
    request_id: 'PO-2026-002',
    instructor_id: 'GV-2',
    instructor_name: 'Trần Thị B',
    email: 'ttb@thinkup.vn',
    amount: 25000000, // Lớn hơn 20M -> cần SA
    available_balance: 30000000,
    bank: 'Techcombank',
    account_number: '0987654321',
    account_name: 'TRAN THI B',
    verified: true,
    contract_valid: true,
    disputed: false,
    status: 'pending',
    submitted_at: '2026-11-02T10:00:00Z',
  },
  {
    _id: '64b000000000000000000003',
    request_id: 'PO-2026-003',
    instructor_id: 'GV-3',
    instructor_name: 'Lê Văn C',
    email: 'lvc@thinkup.vn',
    amount: 1500000, // Dưới 2 triệu -> không chịu thuế
    tax_amount: 0,
    net_amount: 1500000,
    available_balance: 5000000,
    bank: 'MB Bank',
    account_number: '1122334455',
    account_name: 'LE VAN C',
    verified: true,
    contract_valid: true,
    disputed: false,
    status: 'approved',
    submitted_at: '2026-11-03T10:00:00Z',
    approved_at: '2026-11-04T10:00:00Z',
  },
  {
    _id: '64b000000000000000000004',
    request_id: 'PO-2026-004',
    instructor_id: 'GV-4',
    instructor_name: 'Phạm Thị D',
    email: 'ptd@thinkup.vn',
    amount: 10000000,
    tax_amount: 1000000,
    net_amount: 9000000,
    available_balance: 20000000,
    bank: 'ACB',
    account_number: '9988776655',
    account_name: 'PHAM THI D',
    verified: true,
    contract_valid: true,
    disputed: false,
    status: 'paid',
    submitted_at: '2026-11-05T10:00:00Z',
    paid_at: new Date().toISOString(), // Tháng này
  },
];

function createMockDb(initialPayouts = mockPayouts) {
  const payouts = JSON.parse(JSON.stringify(initialPayouts));
  for (const payout of payouts) {
    payout.hold_ledger_id = `hold:${payout.request_id}`;
    payout.tax_policy_snapshot = { contract_id: 'signed-test-contract', approved_at: '2026-01-01T00:00:00Z', threshold: 2000000, rate: 0.1, version: 1 };
  }
  const auditLogs = [];
  const emails = [];
  const ledger = payouts.map(p => ({ _id: p.hold_ledger_id, request_id: p.request_id, instructor_id: p.instructor_id, action: 'hold', amount: p.amount }));
  const profiles = [
    { user_id: 'GV-1', instructor_id: 'GV-1', available_balance: 10000000, frozen_balance: 5000000 },
    { user_id: 'GV-2', instructor_id: 'GV-2', available_balance: 30000000, frozen_balance: 25000000 },
  ];

  return {
    client: { startSession: () => ({ withTransaction: work => work(), endSession: async () => {} }) },
    collection(name) {
      if (name === 'payout_requests') {
        return {
          find: () => ({ toArray: async () => payouts }),
          findOne: async query => {
            return payouts.find(p => {
              if (query.request_id && p.request_id === query.request_id) return true;
              if (query._id && String(p._id) === String(query._id)) return true;
              if (query.$or) {
                return query.$or.some(q => (q.request_id && p.request_id === q.request_id) || (q._id && String(p._id) === String(q._id)));
              }
              return false;
            }) || null;
          },
          updateOne: async (query, update) => {
            const doc = payouts.find(p => String(p._id) === String(query._id));
            if (doc && query.status && doc.status !== query.status) return { matchedCount: 0 };
            if (doc && query.is_demo?.$ne === true && doc.is_demo === true) return { matchedCount: 0 };
            if (doc && update.$set) Object.assign(doc, update.$set);
            return { matchedCount: doc ? 1 : 0 };
          },
        };
      }
      if (name === 'admin_audit_logs') {
        return {
          insertOne: async doc => { auditLogs.push(doc); return { insertedId: 'audit-1' }; },
        };
      }
      if (name === 'admin_user_email_outbox') {
        return {
          insertOne: async doc => { emails.push(doc); return { insertedId: 'email-1' }; },
        };
      }
      if (name === 'instructor_wallet_ledger') return {
        findOne: async query => ledger.find(row => row._id === query._id && row.request_id === query.request_id && row.instructor_id === query.instructor_id && row.action === query.action && row.amount === query.amount) || null,
        insertOne: async row => { ledger.push(row); return { insertedId: row._id || 'ledger-1' }; },
      };
      if (name === 'instructor_wallets') {
        return {
          findOne: async query => profiles.find(p => p.instructor_id === query.instructor_id && p.frozen_balance >= query.frozen_balance.$gte) || null,
          updateOne: async (query, update) => {
            const p = profiles.find(pr => pr.instructor_id === query.instructor_id);
            if (p && (p.frozen_balance < query.frozen_balance?.$gte || p.available_balance < query.available_balance?.$gte)) return { matchedCount: 0 };
            if (p && update.$inc) {
              if (update.$inc.available_balance) p.available_balance += update.$inc.available_balance;
              if (update.$inc.frozen_balance) p.frozen_balance += update.$inc.frozen_balance;
            }
            return { matchedCount: p ? 1 : 0 };
          },
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
    _payouts: payouts,
    _auditLogs: auditLogs,
    _emails: emails,
    _profiles: profiles,
    _ledger: ledger,
  };
}

test('AC-07: Thuế TNCN tính đúng 10% từ 2.000.000 VNĐ, dưới 2 triệu không chịu thuế', () => {
  assert.equal(computeTax(1500000), 0);
  assert.equal(computeTax(2000000), 200000);
  assert.equal(computeTax(4200000), 420000);
  assert.equal(computeTax(25000000), 2500000);
});

test('AC-03 & AC-04: Thống kê KPI rút tiền và lọc theo bộ lọc', async () => {
  const db = createMockDb();
  const summary = await getAdminPayoutSummary({}, { db });
  assert.equal(summary.success, true);
  assert.equal(summary.kpi.pendingCount, 2);
  assert.equal(summary.kpi.largePendingCount, 1);
  assert.equal(summary.kpi.awaitingDisbursementAmount, 1500000); // GV-3 1.5M net
  assert.equal(summary.kpi.paidThisMonthCount, 1);
  assert.equal(summary.kpi.paidThisMonthAmount, 9000000); // 10M - 1M tax
  assert.equal(summary.kpi.taxDeductedThisMonthAmount, 1000000);

  // Lọc theo trạng thái
  const pendingList = await listAdminPayouts({ status: 'pending' }, { db });
  assert.equal(pendingList.total, 2);

  // Lọc theo hạn mức
  const largeList = await listAdminPayouts({ limitMin: LARGE_PAYOUT_THRESHOLD }, { db });
  assert.equal(largeList.total, 1);
  assert.equal(largeList.items[0].id, 'PO-2026-002');
});

test('AC-02 & AC-08: Phân quyền duyệt (FA chỉ duyệt < 20M, SA duyệt >= 20M)', async () => {
  const db = createMockDb();

  // FA duyệt lệnh nhỏ (< 20M) -> thành công
  const res1 = await approveAdminPayout('PO-2026-001', { adminId: 'admin_fa', adminRole: 'FA' }, { db });
  assert.equal(res1.success, true);
  assert.equal(res1.payout.status, 'approved');

  // FA duyệt lệnh lớn (>= 20M) -> bị chặn 403
  await assert.rejects(
    approveAdminPayout('PO-2026-002', { adminId: 'admin_fa', adminRole: 'FA' }, { db }),
    { status: 403, code: 'PAYOUT_SUPER_ADMIN_REQUIRED' }
  );

  // SA duyệt lệnh lớn (>= 20M) -> thành công
  const res2 = await approveAdminPayout('PO-2026-002', { adminId: 'admin_sa', adminRole: 'SA' }, { db });
  assert.equal(res2.success, true);
  assert.equal(res2.payout.status, 'approved');
});

test('AC-06: Chặn duyệt khi hồ sơ hoặc thông tin không hợp lệ', async () => {
  const invalidDoc = {
    _id: '64b000000000000000000099',
    request_id: 'PO-INVALID',
    instructor_id: 'GV-1',
    amount: 3000000,
    verified: false, // Chưa KYC
    contract_valid: true,
    disputed: false,
    bank: 'Vietcombank',
    account_number: '12345',
    status: 'pending',
  };
  const db = createMockDb([...mockPayouts, invalidDoc]);

  await assert.rejects(
    approveAdminPayout('PO-INVALID', { adminId: 'admin_fa', adminRole: 'FA' }, { db }),
    { status: 422, code: 'PAYOUT_UNVERIFIED_INSTRUCTOR' }
  );
});

test('AC-09: Từ chối yêu cầu, hoàn trả số dư đóng băng và gửi email', async () => {
  const db = createMockDb();

  // Thiếu lý do -> báo lỗi
  await assert.rejects(
    rejectAdminPayout('PO-2026-001', { reason: '', details: '', adminId: 'admin_fa', adminRole: 'FA' }, { db }),
    { status: 400, code: 'PAYOUT_REASON_REQUIRED' }
  );

  // Từ chối hợp lệ
  const res = await rejectAdminPayout('PO-2026-001', {
    reason: 'Sai số tài khoản',
    details: 'Số tài khoản không đúng chi nhánh',
    adminId: 'admin_fa',
    adminRole: 'FA',
  }, { db });

  assert.equal(res.success, true);
  assert.equal(res.payout.status, 'rejected');
  assert.match(res.payout.rejectionReason, /Sai số tài khoản/);

  // Kiểm tra số dư ví được hoàn trả 100%
  const profileGV1 = db._profiles.find(p => p.user_id === 'GV-1');
  assert.equal(profileGV1.available_balance, 15000000); // 10M + 5M hoàn trả
  assert.equal(profileGV1.frozen_balance, 0); // 5M - 5M

  // Kiểm tra email outbox & audit log
  assert.equal(db._emails.length, 1);
  assert.equal(db._emails[0].to, 'nva@thinkup.vn');
  assert.equal(db._auditLogs.length, 1);
  assert.equal(db._auditLogs[0].action, 'REJECT_PAYOUT');
});

test('AC-10 & Xuất file Excel/CSV đúng bộ lọc', async () => {
  const db = createMockDb();
  const csvRes = await exportAdminPayouts({ status: 'pending', format: 'csv' }, { db });
  assert.equal(csvRes.type, 'text/csv; charset=utf-8');
  assert.match(csvRes.body, /PO-2026-001/);
  assert.match(csvRes.body, /PO-2026-002/);
  assert.doesNotMatch(csvRes.body, /PO-2026-003/); // Đã approved nên không xuất
});

test('demo payouts can exercise Admin transitions and KPI without wallet or email effects', async () => {
  const db = createMockDb(mockPayouts.map(row => ({ ...row, is_demo: true })));
  const list = await listAdminPayouts({}, { db });
  assert.equal(list.total, 4);
  assert.ok(list.items.every(row => row.isDemo));
  const summary = await getAdminPayoutSummary({}, { db });
  assert.equal(summary.kpi.pendingCount, 2);
  assert.equal(summary.realKpi.pendingCount, 0);
  assert.equal(summary.demoKpi.pendingCount, 2);
  const balances = structuredClone(db._profiles);
  const approved = await approveAdminPayout('PO-2026-001', { adminId: 'admin_sa', adminRole: 'SA' }, { db });
  const rejected = await rejectAdminPayout('PO-2026-002', { reason: 'Sai STK', details: 'Sai', adminId: 'admin_sa' }, { db });
  assert.equal(approved.payout.status, 'approved');
  assert.equal(rejected.payout.status, 'rejected');
  assert.deepEqual(db._profiles, balances);
  assert.equal(db._ledger.length, 4);
  assert.equal(db._emails.length, 0);
  assert.equal(db._auditLogs.length, 2);
  assert.ok(db._auditLogs.every(log => log.details.is_demo === true));
  const updated = await getAdminPayoutSummary({}, { db });
  assert.equal(updated.kpi.pendingCount, 0);
  assert.equal(updated.kpi.awaitingDisbursementAmount, 6000000);
});

test('approval requires signed tax policy snapshot', async () => {
  const db = createMockDb();
  delete db._payouts[0].tax_policy_snapshot;
  await assert.rejects(approveAdminPayout('PO-2026-001', { adminId: 'admin_sa', adminRole: 'SA' }, { db }), { code: 'PAYOUT_TAX_POLICY_UNVERIFIED' });
  assert.equal(db._payouts[0].status, 'pending');
});

