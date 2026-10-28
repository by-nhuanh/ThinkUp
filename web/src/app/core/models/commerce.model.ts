import { Course } from './course.model';

export interface CartItem extends Course {
  displayTitle?: string;
  instructorInitial?: string;
  students?: string;
  thumbnail?: string;
  theme?: string;
  shortLabel?: string;
  /** Trạng thái do API giỏ hàng trả về (GET /api/user/cart). */
  isSelected?: boolean;
  isEnrolled?: boolean;
  isAvailable?: boolean;
}

export interface OrderSummary {
  subtotal: number;
  voucherDiscount: number;
  total: number;
}

export interface Voucher {
  code: string;
  discount: number;
  type: 'percent' | 'fixed';
}

export interface TransactionRow {
  id: string;
  courses: string[];
  paymentMethod: string;
  amount: string;
  status: string;
  date: string;
  time: string;
  timestamp: number;
}

export interface TransactionDetail {
  id: string;
  transactionCode: string;
  paymentMethod: string;
  createdAt: string;
  paidAt: string;
  completedAt: string;
  paymentContent: string;
  status: string;
  order: {
    countLabel: string;
    courses: {
      id: string;
      title: string;
      instructor: string;
      price: string;
      originalPrice: string;
      badge: string;
      tone: string;
    }[];
    subtotal: string;
    courseDiscount: string;
    voucherDiscount: string;
    voucherCode: string;
    total: string;
  };
  payment: {
    bank: string;
    accountNumber: string;
    accountName: string;
    transferContent: string;
    paidAmount: string;
    bankTransactionCode: string;
    paidAt: string;
  };
  invoice: {
    code: string;
    issuedAt: string;
    status: string;
    buyer: { name: string; email: string; phone: string };
  };
}
