import { getMongoDb, closeMongoDb } from '../src/user/db.js';
import { ensureAdminPayoutIndexes, PAYOUT_WALLETS, PAYOUT_LEDGER } from '../src/admin/business/payouts.admin.js';

const apply = process.argv.includes('--apply');
const db = await getMongoDb();
try {
  const profiles = await db.collection('instructor_profiles').find({}, { projection: { instructor_id: 1, user_id: 1 } }).toArray();
  const ids = profiles.map(profile => String(profile.user_id || profile.instructor_id || ''));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Mã giảng viên thiếu hoặc trùng; cần đối soát trước khi tạo ví.');
  const existing = await db.collection(PAYOUT_WALLETS).find({}, { projection: { instructor_id: 1, available_balance: 1, pending_balance: 1, frozen_balance: 1 } }).toArray();
  const existingIds = new Set(existing.map(wallet => String(wallet.instructor_id)));
  const missing = ids.filter(id => !existingIds.has(id));
  const invalid = existing.filter(wallet => !Number.isSafeInteger(wallet.available_balance) || wallet.available_balance < 0 || !Number.isSafeInteger(wallet.frozen_balance) || wallet.frozen_balance < 0 ||
    wallet.pending_balance !== undefined && (!Number.isSafeInteger(wallet.pending_balance) || wallet.pending_balance < 0));
  const pendingToInitialize = existing.filter(wallet => wallet.pending_balance === undefined && wallet.available_balance === 0 && wallet.frozen_balance === 0);
  const preview = { database: db.databaseName, profiles: profiles.length, walletsExisting: existing.length, walletsToCreate: missing.length, pendingToInitialize: pendingToInitialize.length, invalidWallets: invalid.length, ledgerEntries: await db.collection(PAYOUT_LEDGER).countDocuments({}), apply };
  console.log(JSON.stringify(preview));
  if (invalid.length) throw new Error('Đã có ví với số dư không hợp lệ; không tự điều chỉnh.');
  if (apply) {
    await ensureAdminPayoutIndexes(db);
    for (const instructorId of missing) {
      await db.collection(PAYOUT_WALLETS).updateOne({ instructor_id: instructorId }, { $setOnInsert: { instructor_id: instructorId, available_balance: 0, pending_balance: 0, frozen_balance: 0, created_at: new Date(), source: 'initialized_zero_pending_reconciliation' } }, { upsert: true });
    }
    for (const wallet of pendingToInitialize) {
      await db.collection(PAYOUT_WALLETS).updateOne({ _id: wallet._id, available_balance: 0, frozen_balance: 0, pending_balance: { $exists: false } }, { $set: { pending_balance: 0 } });
    }
    const verified = await db.collection(PAYOUT_WALLETS).countDocuments({ instructor_id: { $in: ids }, pending_balance: { $gte: 0 } });
    if (verified !== ids.length) throw new Error('Số ví sau khởi tạo không khớp số hồ sơ giảng viên.');
    console.log(JSON.stringify({ walletsVerified: verified, ledgerEntries: await db.collection(PAYOUT_LEDGER).countDocuments({}) }));
  }
} finally { await closeMongoDb(); }
