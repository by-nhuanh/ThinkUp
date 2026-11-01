import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { CommerceService } from '../../../core/services/commerce.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { CartItem } from '../../../core/models/commerce.model';
import {
  BankDisplay,
  CheckoutVoucher,
  PaymentMethodId,
  PaymentSession,
  PaymentStatus,
  PaymentStatusValue,
} from '../../../core/models/payment.model';
import { DEMO_BANK_TRANSFER, DEMO_SWIFT_INFO } from '../../../core/data/mock/mock-payment';

type CheckoutTab = 'domestic' | 'international';

type MethodId = 'atm' | 'wallet' | 'bank-transfer' | 'qr' | 'card' | 'paypal' | 'apple-pay' | 'swift';

type PendingKind = 'qr' | 'bank' | 'swift';

type BrandId = 'momo' | 'zalopay' | 'vnpay' | 'visa' | 'mastercard' | 'jcb' | 'paypal' | 'gpay' | 'applepay';

interface PaymentMethodOption {
  id: MethodId;
  title: string;
  description: string;
  icon: 'card' | 'wallet' | 'bank' | 'qr';
  badge?: string;
  brands?: BrandId[];
}

interface BankOption {
  id: string;
  name: string;
  vnpayCode: string;
  logo: string;
}

const DOMESTIC_METHODS: PaymentMethodOption[] = [
  {
    id: 'atm',
    title: 'Thẻ ATM / Tài khoản ngân hàng',
    description: 'Thanh toán qua Internet Banking, ATM nội địa',
    icon: 'card',
    badge: 'Phổ biến',
  },
  {
    id: 'wallet',
    title: 'Ví điện tử',
    description: 'Thanh toán qua MoMo, ZaloPay',
    icon: 'wallet',
    brands: ['momo', 'zalopay'],
  },
  {
    id: 'bank-transfer',
    title: 'Chuyển khoản ngân hàng',
    description: 'Chuyển khoản trực tiếp đến tài khoản ngân hàng',
    icon: 'bank',
  },
  {
    id: 'qr',
    title: 'QR Code (VNPay-QR)',
    description: 'Quét mã QR để thanh toán nhanh chóng',
    icon: 'qr',
    brands: ['vnpay'],
  },
];

const INTERNATIONAL_METHODS: PaymentMethodOption[] = [
  {
    id: 'card',
    title: 'Thẻ tín dụng / Ghi nợ quốc tế',
    description: 'Thanh toán qua Visa, Mastercard, JCB',
    icon: 'card',
    brands: ['visa', 'mastercard', 'jcb'],
  },
  {
    id: 'paypal',
    title: 'PayPal',
    description: 'Thanh toán nhanh chóng qua tài khoản PayPal',
    icon: 'wallet',
    brands: ['paypal'],
  },
  {
    id: 'apple-pay',
    title: 'Apple Pay / Google Pay',
    description: 'Thanh toán nhanh chóng, bảo mật',
    icon: 'wallet',
    brands: ['gpay', 'applepay'],
  },
  {
    id: 'swift',
    title: 'Chuyển khoản quốc tế (Bank Transfer)',
    description: 'Chuyển khoản qua ngân hàng quốc tế (SWIFT)',
    icon: 'bank',
  },
];

/** Ảnh thu nhỏ dự phòng cho phần tóm tắt đơn hàng (khi khóa học chưa có thumbnail thật). */
const SUMMARY_ART: Record<string, { label: string; gradient: string; dark?: boolean }> = {
  reactjs: { label: '⚛', gradient: 'linear-gradient(150deg, #4C1D95 0%, #6D28D9 100%)' },
  'javascript-es6': { label: 'JS', gradient: 'linear-gradient(150deg, #FFDF20 0%, #FDC700 100%)', dark: true },
  'python-data': { label: 'Py', gradient: 'linear-gradient(150deg, #1A2A4A 0%, #2A3A6A 100%)' },
};

const BANKS: BankOption[] = [
  { id: 'vietcombank', name: 'Vietcombank', vnpayCode: 'VIETCOMBANK', logo: '/assets/payment/bank-vietcombank.png' },
  { id: 'bidv', name: 'BIDV', vnpayCode: 'BIDV', logo: '/assets/payment/bank-bidv.png' },
  { id: 'vietinbank', name: 'VietinBank', vnpayCode: 'VIETINBANK', logo: '/assets/payment/bank-vietinbank.png' },
  { id: 'agribank', name: 'Agribank', vnpayCode: 'AGRIBANK', logo: '/assets/payment/bank-agribank.png' },
  { id: 'techcombank', name: 'Techcombank', vnpayCode: 'TECHCOMBANK', logo: '/assets/payment/bank-techcombank.png' },
  { id: 'acb', name: 'ACB', vnpayCode: 'ACB', logo: '/assets/payment/bank-acb.png' },
  { id: 'mbbank', name: 'MB Bank', vnpayCode: 'MBBANK', logo: '/assets/payment/bank-mbbank.png' },
  { id: 'sacombank', name: 'Sacombank', vnpayCode: 'SACOMBANK', logo: '/assets/payment/bank-sacombank.png' },
  { id: 'msb', name: 'MSB', vnpayCode: 'MSB', logo: '/assets/payment/bank-msb.png' },
  { id: 'vpbank', name: 'VPBank', vnpayCode: 'VPBANK', logo: '/assets/payment/bank-vpbank.png' },
  { id: 'tpbank', name: 'TPBank', vnpayCode: 'TPBANK', logo: '/assets/payment/bank-tpbank.png' },
  { id: 'hdbank', name: 'HDBank', vnpayCode: 'HDBANK', logo: '/assets/payment/bank-hdbank.png' },
  { id: 'shb', name: 'SHB', vnpayCode: 'SHB', logo: '/assets/payment/bank-shb.png' },
  { id: 'vib', name: 'VIB', vnpayCode: 'VIB', logo: '/assets/payment/bank-vib.png' },
  { id: 'ocb', name: 'OCB', vnpayCode: 'OCB', logo: '/assets/payment/bank-ocb.png' },
];

const BANK_FULL_NAMES: Record<string, string> = {
  vietcombank: 'Ngân hàng TMCP Ngoại thương Việt Nam',
  bidv: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
  vietinbank: 'Ngân hàng TMCP Công thương Việt Nam',
  agribank: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam',
  techcombank: 'Ngân hàng TMCP Kỹ Thương Việt Nam',
  acb: 'Ngân hàng TMCP Á Châu',
  mbbank: 'Ngân hàng TMCP Quân đội',
  sacombank: 'Ngân hàng TMCP Sài Gòn Thương Tín',
  msb: 'Ngân hàng TMCP Hàng Hải Việt Nam',
  vpbank: 'Ngân hàng TMCP Việt Nam Thịnh Vượng',
  tpbank: 'Ngân hàng TMCP Tiên Phong',
  hdbank: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh',
  shb: 'Ngân hàng TMCP Sài Gòn - Hà Nội',
  vib: 'Ngân hàng TMCP Quốc tế Việt Nam',
  ocb: 'Ngân hàng TMCP Phương Đông',
};

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './checkout.component.html',
  styleUrls: [
    '../../payment-ui.css',
    './checkout.component.css',
    './checkout-controls.css',
    './checkout-summary.css',
    './checkout-qr.css',
  ],
})
export class CheckoutComponent implements OnInit {
  private commerce = inject(CommerceService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly courses = this.commerce.checkoutCourses;
  readonly voucher = this.commerce.checkoutVoucher;

  readonly domesticMethods = DOMESTIC_METHODS;
  readonly internationalMethods = INTERNATIONAL_METHODS;
  readonly banks = BANKS;

  tab = signal<CheckoutTab>('domestic');
  selectedMethod = signal<MethodId>('atm');
  expandedMethod = signal<MethodId | null>('atm');
  selectedBank = signal<string | null>(null);
  walletProvider = signal<'momo' | 'zalopay'>('momo');

  acceptedTerms = signal(true);
  termsWarning = signal(false);
  processing = signal(false);
  paymentError = signal('');

  voucherCode = signal('');
  voucherError = signal('');
  readonly voucherErrorText = computed(() => {
    const message = this.voucherError();
    if (!message) return '';
    return /không hợp lệ|hết hạn/i.test(message) ? 'Vui lòng kiểm tra lại và thử mã khác.' : message;
  });
  voucherLoading = signal(false);

  cardNumber = signal('');
  cardName = signal('');
  cardExpiry = signal('');
  cardCvv = signal('');

  copiedField = signal<string | null>(null);
  private thumbErrors = signal<Set<string>>(new Set());

  session = signal<PaymentSession | null>(null);
  pendingKind = signal<PendingKind>('qr');
  remaining = signal(0);
  checkingStatus = signal(false);

  dialog = signal<'success' | 'failure' | 'expired' | null>(null);
  dialogMessage = signal('');
  lastMethodLabel = signal('');
  purchasedCourses = signal<CartItem[]>([]);
  paidOrderId = signal('');
  paidAmount = signal(0);

  private countdownSub?: Subscription;
  private pollSub?: Subscription;
  private copyTimeout?: ReturnType<typeof setTimeout>;

  private readonly fallbackBank: BankDisplay = DEMO_BANK_TRANSFER;

  readonly swiftInfo = DEMO_SWIFT_INFO;

  readonly methodOptions = computed<PaymentMethodOption[]>(() =>
    this.tab() === 'domestic' ? this.domesticMethods : this.internationalMethods,
  );

  readonly courseCount = computed(() => this.courses().length);

  readonly saleSubtotal = computed(() =>
    this.courses().reduce((sum, course) => sum + (course.salePrice || 0), 0),
  );

  readonly voucherDiscount = computed(() => this.voucher()?.discount ?? 0);

  readonly total = computed(() => Math.max(0, this.saleSubtotal() - this.voucherDiscount()));

  readonly summaryVoucherLabel = computed(() => {
    const code = this.voucher()?.code;
    return code ? `Mã giảm giá (${code})` : 'Mã giảm giá';
  });

  readonly voucherTitle = computed(() => {
    const code = this.voucher()?.code;
    return code ? `Mã ${code} đã được áp dụng!` : 'Mã giảm giá đã được áp dụng!';
  });

  readonly displayBank = computed<BankDisplay>(() => {
    const current = this.session();
    if (!current?.bankInfo) return this.fallbackBank;
    return {
      bankName: current.bankInfo.bankName || this.bankFullName(current.bankInfo.bankId),
      accountNo: current.bankInfo.accountNo,
      accountName: current.bankInfo.accountHolder,
      transferContent: current.transferContent,
    };
  });

  readonly pendingTitle = computed(() => {
    switch (this.pendingKind()) {
      case 'swift':
        return 'Chuyển khoản quốc tế (SWIFT)';
      case 'bank':
        return 'Chuyển khoản ngân hàng';
      default:
        return 'Quét mã để thanh toán';
    }
  });

  readonly cardBrandLabel = computed(() => {
    const digits = this.cardNumber().replace(/\D/g, '');
    if (digits.startsWith('4')) return 'Visa';
    if (/^5[1-5]/.test(digits)) return 'Mastercard';
    if (/^3[47]/.test(digits)) return 'American Express';
    if (/^35/.test(digits)) return 'JCB';
    return 'Thẻ quốc tế';
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopTimers();
      if (this.copyTimeout) clearTimeout(this.copyTimeout);
    });
  }

  ngOnInit(): void {
    const existingVoucher = this.commerce.checkoutVoucher();
    if (existingVoucher) {
      this.voucherCode.set(existingVoucher.code);
    }
  }

  // ─── Tab & phương thức ────────────────────────────────────────────────────

  selectTab(tab: CheckoutTab): void {
    if (this.tab() === tab) return;

    this.tab.set(tab);
    const firstMethod: MethodId = tab === 'domestic' ? 'atm' : 'card';
    this.selectedMethod.set(firstMethod);
    this.expandedMethod.set(firstMethod);
    this.paymentError.set('');
  }

  selectMethod(method: MethodId): void {
    if (this.selectedMethod() === method) {
      this.expandedMethod.update(current => (current === method ? null : method));
    } else {
      this.selectedMethod.set(method);
      this.expandedMethod.set(method);
    }
    this.paymentError.set('');

    if (method === 'bank-transfer' && !this.selectedBank()) {
      this.selectedBank.set('techcombank');
    }
  }

  isExpanded(method: MethodId): boolean {
    return this.expandedMethod() === method;
  }

  isSelectedMethod(method: MethodId): boolean {
    return this.selectedMethod() === method;
  }

  selectBank(bank: BankOption): void {
    this.selectedBank.set(bank.id);
    this.paymentError.set('');
  }

  selectWallet(provider: 'momo' | 'zalopay'): void {
    this.walletProvider.set(provider);
  }

  // ─── Voucher ──────────────────────────────────────────────────────────────

  updateVoucherCode(event: Event): void {
    this.voucherCode.set((event.target as HTMLInputElement).value);
    if (this.voucherError()) this.voucherError.set('');
  }

  applyVoucher(): void {
    const code = this.voucherCode().trim().toUpperCase();
    if (!code) {
      this.voucherError.set('Vui lòng nhập mã giảm giá.');
      return;
    }
    if (this.courseCount() === 0) {
      this.voucherError.set('Chưa có khóa học nào để áp dụng mã giảm giá.');
      return;
    }

    this.voucherLoading.set(true);
    this.voucherError.set('');

    this.commerce
      .validateVoucher(code, this.saleSubtotal())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.voucherLoading.set(false);

          if (result?.isValid) {
            const voucher: CheckoutVoucher = {
              code: result.code || code,
              discount: result.discount || 0,
              message: result.message || '',
            };
            this.voucherCode.set(voucher.code);
            this.commerce.setCheckoutVoucher(voucher);
            this.toast.showToast({ type: 'success', message: `Đã áp dụng mã ${voucher.code}.` });
            return;
          }

          this.commerce.setCheckoutVoucher(null);
          this.voucherError.set(result?.message || 'Mã giảm giá không hợp lệ hoặc đã hết hạn.');
        },
        error: () => {
          this.voucherLoading.set(false);
          this.commerce.setCheckoutVoucher(null);
          this.voucherError.set('Không thể kiểm tra mã giảm giá lúc này. Vui lòng thử lại.');
        },
      });
  }

  // ─── Thẻ quốc tế (chỉ định dạng hiển thị, không gửi dữ liệu thẻ lên server) ─

  updateCardNumber(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 16);
    const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
    this.cardNumber.set(formatted);
    input.value = formatted;
  }

  updateCardName(event: Event): void {
    const input = event.target as HTMLInputElement;
    const formatted = input.value.toUpperCase().slice(0, 48);
    this.cardName.set(formatted);
    input.value = formatted;
  }

  updateCardExpiry(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
    this.cardExpiry.set(formatted);
    input.value = formatted;
  }

  updateCardCvv(event: Event): void {
    const input = event.target as HTMLInputElement;
    const formatted = input.value.replace(/\D/g, '').slice(0, 4);
    this.cardCvv.set(formatted);
    input.value = formatted;
  }

  // ─── Điều khoản & thanh toán ──────────────────────────────────────────────

  toggleTerms(): void {
    const next = !this.acceptedTerms();
    this.acceptedTerms.set(next);
    if (next) this.termsWarning.set(false);
  }

  submit(): void {
    if (this.processing()) return;

    if (!this.acceptedTerms()) {
      this.termsWarning.set(true);
      this.toast.showToast({ type: 'warning', message: 'Vui lòng đồng ý với điều khoản để tiếp tục thanh toán.' });
      return;
    }

    if (this.courseCount() === 0) {
      this.toast.showToast({ type: 'error', message: 'Không có khóa học nào để thanh toán.' });
      return;
    }

    if (!this.auth.isAuthenticated()) {
      this.toast.showToast({ type: 'warning', message: 'Vui lòng đăng nhập để tiếp tục thanh toán.' });
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/main/checkout' } });
      return;
    }

    this.termsWarning.set(false);
    this.processing.set(true);
    this.paymentError.set('');

    const method = this.selectedMethod();
    const bankCode = method === 'atm' && this.selectedBank()
      ? this.banks.find(bank => bank.id === this.selectedBank())?.vnpayCode
      : undefined;

    this.commerce
      .createPaymentSession({
        courses: this.courses().map(course => ({
          id: course.courseId || course.id,
          title: course.displayTitle || course.title,
          price: course.salePrice,
          originalPrice: course.originalPrice,
          thumbnail: course.thumbnailUrl || '',
          instructorName: course.instructor,
        })),
        paymentMethod: this.requestMethod(method),
        bankCode,
        voucherCode: this.voucher()?.code,
        voucherDiscount: this.voucherDiscount(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: session => {
          this.processing.set(false);
          this.lastMethodLabel.set(this.methodLabel(method));
          this.handleSession(session, method);
        },
        error: error => {
          this.processing.set(false);
          const message = this.extractError(error);
          this.paymentError.set(message);
          this.toast.showToast({ type: 'error', message });
        },
      });
  }

  private requestMethod(method: MethodId): PaymentMethodId {
    switch (method) {
      case 'atm':
        return 'vnpay';
      case 'card':
      case 'paypal':
      case 'apple-pay':
        return 'stripe';
      case 'swift':
        return 'stripe';
      case 'wallet':
      case 'bank-transfer':
      case 'qr':
        return 'sepay';
      default:
        return 'sepay';
    }
  }

  private requiresRedirect(method: MethodId): boolean {
    return method === 'atm' || method === 'card' || method === 'paypal' || method === 'apple-pay';
  }

  private handleSession(session: PaymentSession, method: MethodId): void {
    this.session.set(session);
    this.paidOrderId.set(session.orderId);
    this.paidAmount.set(session.amount || this.total());
    this.remaining.set(session.expiresInSeconds > 0 ? session.expiresInSeconds : 900);

    if (this.requiresRedirect(method) && session.paymentUrl) {
      window.location.assign(session.paymentUrl);
      return;
    }

    if (this.requiresRedirect(method) && !session.paymentUrl) {
      this.paymentError.set('Cổng thanh toán đang bảo trì. Bạn có thể quét mã QR bên dưới để hoàn tất.');
      this.pendingKind.set('qr');
      this.startPending(session);
      return;
    }

    this.pendingKind.set(
      method === 'swift' ? 'swift' : method === 'bank-transfer' ? 'bank' : 'qr',
    );
    this.startPending(session);
  }

  private startPending(session: PaymentSession): void {
    this.stopTimers();

    const expiresAt = session.expiresAt
      ? new Date(session.expiresAt).getTime()
      : Date.now() + (session.expiresInSeconds || 900) * 1000;

    this.countdownSub = timer(0, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        this.remaining.set(left);
        if (left === 0) this.expirePayment();
      });

    this.pollSub = timer(0, 5000)
      .pipe(
        switchMap(() =>
          this.commerce.getPaymentStatus(session.transactionId).pipe(
            catchError(() => of(null)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(status => {
        if (status) this.handleStatus(status);
      });
  }

  private handleStatus(status: PaymentStatus): void {
    if (typeof status.remainingSeconds === 'number') {
      this.remaining.set(Math.max(0, status.remainingSeconds));
    }

    switch (status.status as PaymentStatusValue) {
      case 'success':
        this.completePayment(status);
        break;
      case 'failed':
        this.failPayment();
        break;
      case 'expired':
        this.expirePayment();
        break;
      default:
        break;
    }
  }

  private completePayment(status: PaymentStatus): void {
    const purchased = [...this.courses()];
    const amount = status.amount || this.total();
    const orderId = status.orderId || this.session()?.orderId || this.paidOrderId();

    this.stopTimers();
    this.purchasedCourses.set(purchased);
    this.paidAmount.set(amount);
    this.paidOrderId.set(orderId);
    this.session.set(null);
    this.commerce.finalizeCheckout();
    this.commerce.setCheckoutVoucher(null);
    this.dialog.set('success');
  }

  private failPayment(): void {
    this.stopTimers();
    this.session.set(null);
    this.dialogMessage.set('Giao dịch chưa thể hoàn tất. Vui lòng thử lại hoặc chọn phương thức thanh toán khác.');
    this.dialog.set('failure');
  }

  private expirePayment(): void {
    this.stopTimers();
    this.remaining.set(0);
    this.session.set(null);
    this.dialogMessage.set('Phiên thanh toán đã hết hạn. Vui lòng tạo phiên mới để tiếp tục.');
    this.dialog.set('expired');
  }

  checkStatusNow(): void {
    const current = this.session();
    if (!current || this.checkingStatus()) return;

    this.checkingStatus.set(true);
    this.commerce
      .getPaymentStatus(current.transactionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: status => {
          this.checkingStatus.set(false);
          this.handleStatus(status);
          if (status.status === 'pending') {
            this.toast.showToast({ type: 'info', message: 'Chưa nhận được thanh toán. Vui lòng chờ trong giây lát.' });
          }
        },
        error: () => {
          this.checkingStatus.set(false);
          this.toast.showToast({ type: 'error', message: 'Không thể kiểm tra trạng thái giao dịch lúc này.' });
        },
      });
  }

  regenerateQr(): void {
    if (this.processing()) return;
    this.closePending(false);
    this.submit();
  }

  closePending(notify = true): void {
    this.stopTimers();
    this.session.set(null);
    this.remaining.set(0);
    if (notify) {
      this.toast.showToast({
        type: 'info',
        message: 'Phiên thanh toán vẫn đang chờ. Bạn có thể bấm Thanh toán ngay để tạo phiên mới.',
      });
    }
  }

  private stopTimers(): void {
    this.countdownSub?.unsubscribe();
    this.pollSub?.unsubscribe();
    this.countdownSub = undefined;
    this.pollSub = undefined;
  }

  // ─── Hộp thoại ────────────────────────────────────────────────────────────

  closeDialog(): void {
    this.dialog.set(null);
  }

  goToLearning(): void {
    this.dialog.set(null);
    void this.router.navigate(['/main/my-courses']);
  }

  goToBilling(): void {
    this.dialog.set(null);
    void this.router.navigate(['/main/profile/billing']);
  }

  goToCart(): void {
    this.dialog.set(null);
    this.stopTimers();
    this.session.set(null);
    void this.router.navigate(['/main/cart']);
  }

  retryPayment(): void {
    this.dialog.set(null);
    this.dialogMessage.set('');
  }

  // ─── Hiển thị ─────────────────────────────────────────────────────────────

  formatPrice(value: number | null | undefined): string {
    return `${new Intl.NumberFormat('vi-VN').format(Math.max(0, Number(value) || 0))}đ`;
  }

  summaryArt(item: CartItem): { label: string; gradient: string; dark: boolean } {
    const preset = SUMMARY_ART[item.courseId || item.id] ?? SUMMARY_ART[item.id];
    return {
      label: preset?.label || (item.icon || item.instructorInitial || item.title || 'T').slice(0, 2),
      gradient: preset?.gradient || item.bgGradient || 'linear-gradient(150deg, #243B75 0%, #4F46E5 100%)',
      dark: preset?.dark ?? false,
    };
  }

  hasThumb(item: CartItem): boolean {
    return !!item.thumbnailUrl && !this.thumbErrors().has(item.id);
  }

  onThumbError(item: CartItem): void {
    this.thumbErrors.update(errors => {
      const next = new Set(errors);
      next.add(item.id);
      return next;
    });
  }

  formatCountdown(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  methodLabel(method: MethodId): string {
    switch (method) {
      case 'atm':
        return 'Thẻ ATM / Tài khoản ngân hàng';
      case 'wallet':
        return this.walletProvider() === 'momo' ? 'Ví MoMo' : 'Ví ZaloPay';
      case 'bank-transfer':
        return 'Chuyển khoản ngân hàng';
      case 'qr':
        return 'QR Code (VNPay-QR)';
      case 'card':
        return 'Thẻ tín dụng / Ghi nợ quốc tế';
      case 'paypal':
        return 'PayPal';
      case 'apple-pay':
        return 'Apple Pay / Google Pay';
      default:
        return 'Chuyển khoản quốc tế (SWIFT)';
    }
  }

  brandText(brand: BrandId): string {
    switch (brand) {
      case 'momo':
        return 'momo';
      case 'zalopay':
        return 'ZaloPay';
      case 'vnpay':
        return 'VNPAY';
      case 'visa':
        return 'VISA';
      case 'mastercard':
        return 'Mastercard';
      case 'jcb':
        return 'JCB';
      case 'paypal':
        return 'PayPal';
      case 'gpay':
        return 'G Pay';
      default:
        return ' Pay';
    }
  }

  bankFullName(bankId: string): string {
    const normalized = this.normalizeBankId(bankId);
    const bank = this.banks.find(item => item.id === normalized);
    const fullName = BANK_FULL_NAMES[normalized];
    if (bank && fullName) return `${bank.name} - ${fullName}`;
    return bank?.name || bankId || 'Ngân hàng';
  }

  private normalizeBankId(bankId: string): string {
    const key = String(bankId || '').toLowerCase();
    if (key === 'mb') return 'mbbank';
    return key;
  }

  copyText(value: string, field: string, label: string): void {
    if (!value) return;

    const done = (): void => {
      this.copiedField.set(field);
      if (this.copyTimeout) clearTimeout(this.copyTimeout);
      this.copyTimeout = setTimeout(() => {
        if (this.copiedField() === field) this.copiedField.set(null);
      }, 1600);
      this.toast.showToast({ type: 'success', message: `Đã sao chép ${label}.` });
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done).catch(() => this.fallbackCopy(value, done));
      return;
    }

    this.fallbackCopy(value, done);
  }

  private fallbackCopy(value: string, done: () => void): void {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(area);
      if (copied) done();
      else this.toast.showToast({ type: 'error', message: 'Trình duyệt không cho phép sao chép tự động.' });
    } catch {
      this.toast.showToast({ type: 'error', message: 'Không thể sao chép. Vui lòng sao chép thủ công.' });
    }
  }

  private extractError(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const candidate = error as { error?: { message?: string }; message?: string };
      return candidate.error?.message || candidate.message || 'Không thể tạo phiên thanh toán. Vui lòng thử lại.';
    }
    return 'Không thể tạo phiên thanh toán. Vui lòng thử lại.';
  }
}
