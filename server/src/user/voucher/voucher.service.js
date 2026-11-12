export const VOUCHERS = 'business_vouchers';
export async function ensureBusinessVoucherIndexes(db) {
  await db.collection(VOUCHERS).createIndex({ code: 1 }, { unique: true });
}
const fail = (message, code = 'VOUCHER_INVALID', status = 400) => Object.assign(new Error(message), { code, status });
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const aliases = course => [course.id, course.course_id, course._id, ...(course.aliases || [])].filter(Boolean).map(String);

export function voucherStatus(voucher, now = new Date()) {
  if (voucher.deleted_at) return 'deleted';
  if (voucher.expires_at && new Date(voucher.expires_at) <= now) return 'expired';
  if (voucher.usage_limit && number(voucher.usage_count) >= number(voucher.usage_limit)) return 'expired';
  if (voucher.status === 'expired') return 'expired';
  if (voucher.status === 'scheduled') return 'scheduled';
  if (voucher.status && voucher.status !== 'active') return 'locked';
  if (voucher.is_active === false || voucher.is_active === 0 || voucher.is_active === '0') return 'locked';
  if (voucher.locked_at) return 'locked';
  if (voucher.starts_at && new Date(voucher.starts_at) > now) return 'scheduled';
  return 'active';
}

export function quoteBusinessVoucher(voucher, courses, { user, now = new Date() } = {}) {
  if (voucherStatus(voucher, now) !== 'active') throw fail('Voucher đang tạm ngưng hoặc không còn hiệu lực.', 'VOUCHER_UNAVAILABLE', 409);
  if (voucher.audience === 'new_learner' && !user?.isNewLearner) throw fail('Voucher chỉ dành cho học viên mới.');
  if (Array.isArray(voucher.weekly_schedule) && voucher.weekly_schedule.length) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
    const rule = voucher.weekly_schedule.find(item => item.day === day && item.enabled);
    const time = `${parts.hour}:${parts.minute}`;
    if (!rule || !rule.allDay && !(rule.slots || []).some(slot => slot.start <= time && time < slot.end)) throw fail('Voucher chưa đến khung giờ áp dụng.', 'VOUCHER_UNAVAILABLE', 409);
  }
  const scope = voucher.scope || 'all';
  const targets = (voucher.scope_target_ids || []).map(String);
  const eligible = courses.filter(course => {
    if (voucher.sponsor === 'instructor' && String(course.instructor_id || '') !== String(voucher.instructor_id || '')) return false;
    if (scope === 'courses') return aliases(course).some(id => targets.includes(id));
    if (scope === 'instructor') return String(course.instructor_id || '') === String(voucher.instructor_id || targets[0] || '');
    if (scope === 'rating') return number(course.rating) >= number(voucher.min_rating);
    return scope === 'all';
  });
  const subtotal = eligible.reduce((sum, course) => sum + number(course.price), 0);
  const fullSubtotal = courses.reduce((sum, course) => sum + number(course.price), 0);
  if (!eligible.length || fullSubtotal < number(voucher.min_order_value) || eligible.length < number(voucher.min_course_count || 1)) throw fail('Đơn hàng không đáp ứng điều kiện voucher.');
  const value = number(voucher.discount_value);
  const raw = voucher.discount_type === 'percent' ? Math.round(subtotal * value / 100) : value;
  const discount = Math.max(0, Math.min(subtotal, raw, voucher.discount_type === 'percent' ? number(voucher.max_discount) : Infinity));
  const allocations = eligible.map((course, index) => ({ courseId: String(course.id || course.course_id || course._id), discount: !subtotal ? 0 : index === eligible.length - 1 ? discount - eligible.slice(0, -1).reduce((sum, prior) => sum + Math.floor(discount * number(prior.price) / subtotal), 0) : Math.floor(discount * number(course.price) / subtotal) }));
  return { discount, eligibleCourseIds: eligible.map(course => String(course.id || course.course_id || course._id)), allocations, sponsor: voucher.sponsor, instructorId: voucher.instructor_id || null };
}

export async function findBusinessVoucher(db, code, options = {}) {
  return db.collection(VOUCHERS).findOne({ code: String(code || '').trim().toUpperCase(), deleted_at: null }, options);
}

export async function reserveBusinessVoucher(db, voucher, quote, userId, session) {
  const col = db.collection(VOUCHERS);
  const now = new Date();
  const updated = await col.updateOne({ _id: voucher._id, version: voucher.version, locked_at: null, deleted_at: null,
    starts_at: { $lte: now }, expires_at: { $gt: now }, usage_count: { $lt: voucher.usage_limit } },
  { $inc: { usage_count: 1, version: 1 } }, { session });
  if (updated.matchedCount !== 1) throw fail('Voucher vừa thay đổi hoặc bị khóa. Vui lòng xác nhận lại giá.', 'VOUCHER_UNAVAILABLE', 409);
  if (voucher.usage_limit_per_user) {
    const held = await db.collection('payment_transactions').countDocuments({ user_id: String(userId), voucher_id: voucher._id, voucher_released: { $ne: true }, status: { $in: ['pending', 'paid', 'success'] } }, { session });
    if (held >= voucher.usage_limit_per_user) throw fail('Bạn đã đạt giới hạn dùng voucher.', 'VOUCHER_USER_LIMIT', 409);
  }
  return { ...quote, id: voucher._id, collection: VOUCHERS };
}

export function normalizeVoucherCode(code) {
  const value = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(value)) throw fail('Mã voucher không hợp lệ.');
  return value;
}
