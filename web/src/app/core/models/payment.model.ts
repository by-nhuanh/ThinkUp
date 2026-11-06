/**
 * Hợp đồng dữ liệu cho luồng Giỏ hàng & Thanh toán.
 * Nguồn: server/src/user/cart/cart.user.js và server/src/user/payment/payment.router.js
 */

/** Khóa học trong giỏ hàng do API trả về (GET /api/user/cart). */
export interface ApiCartCourse {
  id?: string;
  course_id: string;
  slug: string;
  title: string;
  thumbnail?: string;
  thumbnail_url?: string;
  instructor: {
    id: string;
    name: string;
    avatar?: string;
    avatar_url?: string;
  };
  rating: number;
  total_reviews: number;
  total_students?: number;
  tags?: string[];
  price: {
    original: number;
    original_formatted: string;
    sale: number;
    sale_formatted: string;
    discount_percent?: number;
    discount_amount?: number;
    discount_formatted?: string;
  };
  status?: string;
  is_available?: boolean;
  is_in_wishlist: boolean;
  is_owned: boolean;
  is_already_enrolled?: boolean;
  action_button_state?: 'CHECKOUT' | 'GO_TO_LEARNING' | 'UNAVAILABLE';
  action_button_label?: string;
  is_selected?: boolean;
}

/** Tổng tiền do API tính sẵn cho giỏ hàng. */
export interface CartSummary {
  totalCourseCount: number;
  selectedCourseCount: number;
  originalSubtotal: number;
  originalSubtotalFormatted: string;
  courseDiscount: number;
  courseDiscountFormatted: string;
  saleSubtotal: number;
  saleSubtotalFormatted: string;
  voucherCode: string;
  voucherDiscount: number;
  voucherDiscountFormatted: string;
  finalTotal: number;
  finalTotalFormatted: string;
  voucherMessage: string;
  isVoucherValid: boolean;
}

/** GET /api/user/cart -> { success, data: CartView } */
export interface CartView {
  totalCourses: number;
  courses: ApiCartCourse[];
  summary: CartSummary;
  isGuest: boolean;
  requiresAuthToCheckout: boolean;
}

/** POST /api/user/cart/voucher/validate -> { success, data } */
export interface VoucherValidateResult {
  isValid: boolean;
  code: string;
  discount: number;
  message: string;
}

/** Voucher đang chờ áp dụng, giữ nguyên từ giỏ hàng sang trang thanh toán. */
export interface CheckoutVoucher {
  code: string;
  discount: number;
  message?: string;
}

/** Phương thức gửi lên POST /api/payment/create-session. */
export type PaymentMethodId = 'sepay' | 'vnpay' | 'stripe' | 'swift' | 'momo' | 'zalopay' | 'paypal' | 'apple-pay';

export interface CreatePaymentSessionPayload {
  courseIds: string[];
  paymentMethod: PaymentMethodId;
  bankCode?: string;
  voucherCode?: string;
}

/** POST /api/payment/create-session -> { success, message, data } */
export interface PaymentSession {
  orderId: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: PaymentStatusValue;
  fulfillmentStatus: string;
  expiresAt: string;
  expiresInSeconds: number;
  paymentMethod: string;
  transferContent: string;
  bankInfo?: {
    bankId: string;
    bankName?: string;
    accountNo: string;
    accountName: string;
  };
  qrCodeUrl?: string;
  paymentUrl?: string;
  executionMode?: 'simulation';
  isSimulated?: boolean;
  requestedPaymentMethod?: PaymentMethodId;
  invoiceCode?: string | null;
  paymentContent?: string;
}

export interface PaymentReceipt {
  transactionId: string;
  orderId: string;
  invoiceCode: string;
  paymentContent: string;
  transferContent: string;
  paymentMethod: string;
  isSimulated: boolean;
}

/** Thông tin ngân hàng hiển thị cho chuyển khoản nội địa / QR. */
export interface BankDisplay {
  bankName: string;
  accountNo: string;
  accountName: string;
  transferContent: string;
}

/** Thông tin ngân hàng hiển thị cho chuyển khoản quốc tế (SWIFT). */
export interface SwiftInfo {
  bankName: string;
  address: string;
  swift: string;
  account: string;
  accountName: string;
  content: string;
}

export type PaymentStatusValue = 'pending' | 'paid' | 'success' | 'failed' | 'expired' | 'cancelled' | 'needs_review';

/** GET /api/payment/status/:id */
export interface PaymentStatus {
  success: boolean;
  transactionId: string;
  orderId: string;
  status: PaymentStatusValue;
  fulfillmentStatus: string;
  currency: string;
  amount: number;
  paidAt: string | null;
  expiresAt: string;
  remainingSeconds: number;
}

export interface PaymentPreferences {
  savePayment: boolean;
  invoiceEmail: boolean;
  quickConfirm: boolean;
  revision: number;
}

export interface PaymentSettingsOverview {
  preferences: PaymentPreferences;
  capabilities: { savePayment: boolean; invoiceEmail: boolean; quickConfirm: boolean; linkedPaymentMethods: boolean; invoiceDownload: boolean };
  methods: { items: import('../../features/settings/models/settings.model').PaymentMethod[]; supported: boolean };
  transactions: { items: PaymentTransactionDto[]; pagination: { page: number; limit: number; total: number; hasMore: boolean } };
  invoices: { items: { id: string; orderId: string; code: string; issuedAt: string; amount: number; currency: string; detailHref: string }[] };
}

export interface PaymentTransactionDto {
  order_id: string;
  transaction_id: string;
  payment_method: string;
  amount: number;
  currency: string;
  status: string;
  courses: { title?: string }[];
  created_at: string | null;
  created_at_local?: { date: string; dateOnly: string; timeOnly: string } | null;
}
