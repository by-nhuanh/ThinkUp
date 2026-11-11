import test from 'node:test';
import assert from 'node:assert/strict';
import { exportAdminOrders, getAdminOrder, getAdminOrderSummary, listAdminOrders, parseOrderQuery } from '../orders.admin.js';

const transactions = [
  { _id: '1', order_id: 'DH-1', transaction_id: 'TX-1', user_id: 'missing', status: 'completed', amount: '100000.00', payment_method: 'QR Code', created_at: '2026-11-09 10:00:00', paid_at: '2026-11-09 10:00:00', order_summary: JSON.stringify({ courses: [{ id: 'course-1', title: 'Khóa học A', price: 100000 }] }) },
  { _id: '2', order_id: 'DH-2', transaction_id: 'TX-2', user_id: 'missing', status: 'pending', amount: 200000, payment_method: 'bank', created_at: '2026-11-10 10:00:00', order_summary: JSON.stringify({ courses: [] }) },
];
const db = { collection(name) {
  if (name === 'payment_transactions') return { find: () => ({ toArray: async () => transactions }) };
  if (name === 'users') return { find: () => ({ toArray: async () => [] }) };
  throw new Error(`Unexpected collection ${name}`);
} };

test('filters and export use the same full result set without pagination', async () => {
  const query = { status: 'success', from: '2026-11-09', to: '2026-11-09', pageSize: '1' };
  const list = await listAdminOrders(query, { db });
  const file = await exportAdminOrders({ ...query, format: 'csv' }, { db });
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, 'DH-1');
  assert.match(file.body, /DH-1/);
  assert.doesNotMatch(file.body, /DH-2/);
});

test('legacy values and missing learner are handled in detail and KPI', async () => {
  const detail = await getAdminOrder('TX-1', { db });
  assert.equal(detail.order.amount, 100000);
  assert.equal(detail.order.learner, null);
  assert.equal(detail.order.courses[0].title, 'Khóa học A');
  const summary = await getAdminOrderSummary({}, { db });
  assert.deepEqual([summary.total, summary.successCount, summary.pendingCount], [2, 1, 1]);
});

test('rejects invalid query and unknown order', async () => {
  assert.throws(() => parseOrderQuery({ pageSize: '101' }), { status: 400 });
  await assert.rejects(getAdminOrder('missing', { db }), { status: 404, code: 'ORDER_NOT_FOUND' });
});
