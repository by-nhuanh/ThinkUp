export type OrderStatus = 'success' | 'pending' | 'cancelled';
export type VoucherStatus = 'active' | 'scheduled' | 'locked' | 'expired';
export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface BusinessOrder {
  id: string;
  transactionId?: string;
  learner: string;
  email: string;
  courses: string[];
  instructor?: string;
  originalAmount: number;
  discount: number;
  voucherCode?: string;
  sponsor?: 'thinkup' | 'instructor';
  method: string;
  status: OrderStatus;
  createdAt: string;
  invoiceId?: string;
  bankReference?: string;
}

export interface BusinessVoucher {
  code: string;
  name: string;
  sponsor: 'thinkup' | 'instructor';
  instructor?: string;
  scope: 'all' | 'rating' | 'instructor' | 'courses';
  scopeTarget?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  minOrder: number;
  used: number;
  limit: number;
  perAccount: number;
  startsAt: string;
  endsAt: string;
  locked: boolean;
  fundedAmount: number;
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
