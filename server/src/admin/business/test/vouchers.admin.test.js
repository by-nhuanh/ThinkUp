import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteBusinessVoucher, voucherStatus } from '../../../user/voucher/voucher.service.js';

const now = new Date('2026-11-10T10:00:00Z');
const base = { code: 'GV-DEMO-001', sponsor: 'instructor', instructor_id: 'GV-1', scope: 'courses', scope_target_ids: ['C-1'], audience: 'all',
  discount_type: 'percent', discount_value: 20, max_discount: 100000, min_order_value: 100000, min_course_count: 1, usage_limit: 10, usage_count: 0,
  starts_at: new Date('2026-11-01T00:00:00Z'), expires_at: new Date('2026-12-01T00:00:00Z'), locked_at: null, deleted_at: null };

test('instructor voucher discounts only owned target courses', () => {
  const quote = quoteBusinessVoucher(base, [{ id: 'C-1', instructor_id: 'GV-1', price: 200000 }, { id: 'C-2', instructor_id: 'GV-2', price: 200000 }], { now });
  assert.equal(quote.discount, 40000);
  assert.deepEqual(quote.eligibleCourseIds, ['C-1']);
  assert.deepEqual(quote.allocations, [{ courseId: 'C-1', discount: 40000 }]);
});

test('locked and expired vouchers are rejected', () => {
  assert.equal(voucherStatus({ ...base, locked_at: now }, now), 'locked');
  assert.throws(() => quoteBusinessVoucher({ ...base, locked_at: now }, [{ id: 'C-1', instructor_id: 'GV-1', price: 200000 }], { now }), { code: 'VOUCHER_UNAVAILABLE' });
  assert.equal(voucherStatus({ ...base, expires_at: now, locked_at: now }, now), 'expired');
});

test('voucher with wrong instructor or course cannot be applied', () => {
  assert.throws(() => quoteBusinessVoucher(base, [{ id: 'C-1', instructor_id: 'GV-2', price: 200000 }], { now }), { code: 'VOUCHER_INVALID' });
});
