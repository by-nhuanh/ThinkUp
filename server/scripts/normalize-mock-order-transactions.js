import { MongoClient } from 'mongodb';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');
const dbName = process.env.MONGODB_DB_NAME || 'Thinkup';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
const targetIds = new Set(['TXN14638737', 'TXN14307073', 'TXN14056757', 'TXN14666368', 'TXN14819630']);
const validMoney = value => typeof value === 'string' && /^\d+\.00$/.test(value) && Number.isSafeInteger(Number(value));

try {
  await client.connect();
  const collection = client.db(dbName).collection('payment_transactions');
  const rows = await collection.find({ record_type: { $ne: 'gateway_receipt' } }).toArray();
  if (rows.length !== 212) throw new Error(`Expected 212 transactions, found ${rows.length}`);
  const changes = [];
  for (const row of rows) {
    const set = {};
    if (typeof row.amount === 'string') {
      if (!validMoney(row.amount)) throw new Error(`Unsafe amount on ${row.transaction_id}`);
      set.amount = Number(row.amount);
    }
    if (row.status === 'completed') {
      const summary = JSON.parse(row.order_summary);
      if (summary.total === undefined) {
        if (!validMoney(row.amount)) throw new Error(`Unsafe total on ${row.transaction_id}`);
        summary.total = Number(row.amount);
        set.order_summary = JSON.stringify(summary);
      }
    }
    if (targetIds.has(row.transaction_id)) {
      if (row.status !== 'success' || row.paid_at || row.created_at !== row.updated_at) {
        throw new Error(`Paid date source changed on ${row.transaction_id}`);
      }
      set.paid_at = row.created_at;
      set.paid_at_source = 'mock_created_at_fallback';
    }
    if (Object.keys(set).length) changes.push({ row, set });
  }
  const counts = {
    amount: changes.filter(x => x.set.amount !== undefined).length,
    total: changes.filter(x => x.set.order_summary !== undefined).length,
    paidAt: changes.filter(x => x.set.paid_at !== undefined).length,
  };
  if (counts.amount !== 202 || counts.total !== 180 || counts.paidAt !== 5) {
    throw new Error(`Unexpected update counts: ${JSON.stringify(counts)}`);
  }
  const backupPath = join(process.cwd(), 'output', `mock-order-transactions-backup-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await writeFile(backupPath, JSON.stringify(changes.map(({ row }) => row), null, 2), { flag: 'wx' });
  let updated = 0;
  for (const { row, set } of changes) {
    const filter = { _id: row._id, amount: row.amount, order_summary: row.order_summary, status: row.status };
    if (set.paid_at) Object.assign(filter, { paid_at: row.paid_at ?? null, created_at: row.created_at, updated_at: row.updated_at });
    const result = await collection.updateOne(filter, { $set: set });
    if (result.matchedCount !== 1) throw new Error(`Concurrent change detected on ${row.transaction_id}; updated ${updated} earlier rows. Backup: ${backupPath}`);
    updated++;
  }
  console.log(JSON.stringify({ database: dbName, updated, counts, backupPath }));
} finally {
  await client.close();
}
