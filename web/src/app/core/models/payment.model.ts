/**
 * Hợp đồng dữ liệu cho luồng Giỏ hàng & Thanh toán.
 * Nguồn: server/src/user/cart/cart.user.js và server/src/user/payment/payment.router.js
 */

/** Khóa học trong giỏ hàng do API trả về (GET /api/user/cart). */
export interface ApiCartCourse {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  thumbnail_url: string;
  instructor: {
    id: string;
    name: string;
    avatar_url: string;
  };
  rating: number;
  total_reviews: number;
  total_students: number;
  tags: string[];
  price: {
    original: number;
    original_formatted: string;
    sale: number;
    sale_formatted: string;
    discount_amount: number;
    discount_formatted: string;
  };
  status: string;
  is_available: boolean;
  is_in_wishlist: boolean;
  is_already_enrolled: boolean;
  action_button_state: 'CHECKOUT' | 'GO_TO_LEARNING' | 'UNAVAILABLE';
  action_button_label: string;
  is_selected: boolean;
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
export type PaymentMethodId =
  | 'atm'
  | 'wallet'
  | 'bank-transfer'
  | 'qr'
  | 'card'
  | 'paypal'
  | 'apple-pay'
  | 'swift'
  | 'stripe'
  | 'international';

export interface CreatePaymentSessionPayload {
  courses: {
    id: string;
    title: string;
    salePrice: number;
    originalPrice: number;
    thumbnail?: string;
    thumbnail_url?: string;
    instructor?: string;
  }[];
  paymentMethod: PaymentMethodId;
  bankCode?: string;
  voucherCode?: string;
  voucherDiscount?: number;
}

/** POST /api/payment/create-session -> { success, message, data } */
export interface PaymentSession {
  orderId: string;
  transactionId: string;
  amount: number;
  currency: string;
  expiresAt: string;
  expiresInSeconds: number;
  paymentMethod: string;
  transferContent: string;
  bankInfo: {
    bankId: string;
    accountNo: string;
    accountName: string;
  };
  qrCodeUrl: string;
  paymentUrl?: string;
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

export type PaymentStatusValue = 'pending' | 'success' | 'failed' | 'expired';

/** GET /api/payment/status/:id */
export interface PaymentStatus {
  success: boolean;
  transactionId: string;
  orderId: string;
  status: PaymentStatusValue;
  amount: number;
  paidAt: string | null;
  expiresAt: string;
  remainingSeconds: number;
}
