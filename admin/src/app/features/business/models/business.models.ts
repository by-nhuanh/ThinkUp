export type OrderStatus = 'success' | 'pending' | 'cancelled';
export type OrderCancellationActor = 'learner' | 'system' | 'admin';
export type VoucherStatus = 'active' | 'scheduled' | 'locked' | 'expired';
export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'rejected';

/** Phạm vi sản phẩm mà voucher được áp dụng. */
export type VoucherScope = 'all' | 'rating' | 'instructor' | 'courses';
/** Nhóm học viên được phép dùng voucher (tương ứng "nhóm khách hàng" của Haravan). */
export type VoucherAudience = 'all' | 'new_learner';
/** Loại thao tác quản trị được ghi vào lịch sử voucher. */
export type VoucherAuditAction = 'created' | 'updated' | 'locked' | 'unlocked' | 'deleted';

export interface VoucherAuditEntry {
  at: string;
  actor: string;
  action: VoucherAuditAction;
  note?: string;
}

export interface VoucherWeeklyTimeSlot { start: string; end: string; }
export interface VoucherWeeklyDay {
  day: number;
  label: string;
  enabled: boolean;
  allDay: boolean;
  slots: VoucherWeeklyTimeSlot[];
}

export interface BusinessOrder {
  id: string;
  transactionId?: string;
  learner: string;
  email: string;
  phone: string;
  courses: string[];
  courseItems?: { courseName: string; salePrice: number }[];
  instructor?: string;
  originalAmount: number;
  discount: number;
  voucherCode?: string;
  sponsor?: 'thinkup' | 'instructor';
  method: string;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
  invoiceId?: string;
  bankReference?: string;
  cancellation?: { reason: string; cancelledAt: string; cancelledBy: OrderCancellationActor; paymentState: 'unpaid' | 'paid' | 'refunded' | 'unknown' };
}

export interface BusinessVoucher {
  code: string;
  description: string;
  sponsor: 'thinkup' | 'instructor';
  instructor?: string;
  scope: VoucherScope;
  scopeTarget?: string;
  audience: VoucherAudience;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  minOrder: number;
  minCourseCount: number;
  used: number;
  limit: number;
  perAccount: number;
  startsAt: string;
  endsAt: string;
  weeklyLimitEnabled?: boolean;
  weeklySchedule?: VoucherWeeklyDay[];
  showOnSite: boolean;
  locked: boolean;
  deleted?: boolean;
  /** Ngân sách chiết khấu tối đa ThinkUp cam kết, tự tính từ limit × mức giảm. */
  fundedAmount: number;
  auditLog: VoucherAuditEntry[];
}

/** Multi field filter applied on the voucher list through the advanced filter popup. */
export interface VoucherAdvancedFilter {
  code: string;
  sponsor: '' | 'thinkup' | 'instructor';
  scope: '' | BusinessVoucher['scope'];
  discountType: '' | BusinessVoucher['discountType'];
  discountMin: number | null;
  discountMax: number | null;
  minOrderMin: number | null;
  minOrderMax: number | null;
  usedMin: number | null;
  usedMax: number | null;
  remainingMin: number | null;
  remainingMax: number | null;
  startsFrom: string;
  startsTo: string;
  endsFrom: string;
  endsTo: string;
  status: '' | VoucherStatus | 'hidden';
}

export function emptyVoucherFilter(): VoucherAdvancedFilter {
  return {
    code: '', sponsor: '', scope: '', discountType: '',
    discountMin: null, discountMax: null, minOrderMin: null, minOrderMax: null,
    usedMin: null, usedMax: null, remainingMin: null, remainingMax: null,
    startsFrom: '', startsTo: '', endsFrom: '', endsTo: '', status: ''
  };
}

/** Number of filled conditions, used for the badge on the advanced filter button. */
export function countVoucherFilter(filter: VoucherAdvancedFilter): number {
  return [
    filter.code.trim(), filter.sponsor, filter.scope, filter.discountType, filter.status,
    filter.discountMin, filter.discountMax, filter.minOrderMin, filter.minOrderMax,
    filter.usedMin, filter.usedMax, filter.remainingMin, filter.remainingMax,
    filter.startsFrom, filter.startsTo, filter.endsFrom, filter.endsTo
  ].filter(value => value !== '' && value !== null && value !== undefined).length;
}

export interface PayoutRequest {
  id: string;
  instructor: string;
  email: string;
  amount: number;
  taxAmount: number;
  bank: string;
  accountNumber: string;
  accountName: string;
  availableBalance: number;
  verified: boolean;
  contractValid: boolean;
  disputed: boolean;
  status: PayoutStatus;
  submittedAt: string;
  paidAt?: string;
  bankReference?: string;
  rejectionReason?: string;
}
