import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CartItem, OrderSummary, Voucher, TransactionRow, TransactionDetail } from '../models/commerce.model';
import {
  ApiCartCourse,
  CartView,
  CheckoutVoucher,
  CreatePaymentSessionPayload,
  PaymentSession,
  PaymentStatus,
  VoucherValidateResult,
} from '../models/payment.model';
import { Course } from '../models/course.model';
import { MOCK_COURSES } from '../data/mock/mock-courses';
import { MOCK_BILLING_DETAILS, MOCK_BILLING_EMAIL, MOCK_BILLING_ROWS } from '../data/mock/mock-billing';

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
}

/** Chuyển khóa học của API giỏ hàng sang model dùng chung của app. */
function mapApiCartCourse(course: ApiCartCourse): CartItem {
  const instructorName = course.instructor?.name || 'Giảng viên ThinkUp';
  return {
    id: course.course_id || course.id,
    courseId: course.course_id,
    slug: course.slug,
    title: course.title,
    displayTitle: course.title,
    instructor: instructorName,
    instructorInitial: instructorName.charAt(0).toUpperCase(),
    rating: course.rating,
    ratingCount: course.total_reviews,
    studentsCount: course.total_students,
    students: `${new Intl.NumberFormat('vi-VN').format(course.total_students || 0)} học viên`,
    originalPrice: course.price?.original ?? 0,
    salePrice: course.price?.sale ?? 0,
    tags: course.tags ?? [],
    thumbnailUrl: course.thumbnail_url || '',
    isSelected: course.is_selected,
    isEnrolled: course.is_already_enrolled,
    isAvailable: course.is_available,
  };
}

function normalizeCommerceCourse(course: Course): CartItem {
  return {
    ...course,
    displayTitle: course.displayTitle || course.title,
    instructorInitial: course.instructorInitial || course.instructor?.charAt(0) || 'T',
    students: course.students || `${course.studentsCount?.toLocaleString('vi-VN') || 0} học viên`,
    thumbnail: course.thumbnail || course.id,
    theme: course.theme || 'from-[#155DFC] to-[#14B8A6]',
    shortLabel: course.shortLabel || course.icon || course.title?.split(' ').slice(0, 2).join(' '),
  };
}

@Injectable({ providedIn: 'root' })
export class CommerceService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // State
  private _cartItems = signal<CartItem[]>([]);
  private _checkoutIds = signal<string[]>([]);
  private _checkoutVoucher = signal<CheckoutVoucher | null>(null);
  private _transactions = signal<TransactionRow[]>([]);
  private _transactionDetails = signal<Record<string, TransactionDetail>>({});

  readonly cartItems = this._cartItems.asReadonly();
  readonly cartCount = computed(() => this._cartItems().length);
  readonly checkoutIds = this._checkoutIds.asReadonly();
  readonly checkoutVoucher = this._checkoutVoucher.asReadonly();
  readonly checkoutCourses = computed(() => {
    const ids = this._checkoutIds();
    const items = this._cartItems();
    if (ids.length === 0) return items; // Default to all if none selected
    return items.filter(item => ids.includes(item.id));
  });
  // TODO(pre-deploy): Nhớ bỏ giao dịch mẫu khi lịch sử thanh toán lấy từ API theo tài khoản.
  readonly transactions = () => {
    const email = this.currentUserEmail();
    const ownTransactions = this._transactions().filter(row =>
      this._transactionDetails()[row.id]?.invoice.buyer.email.toLowerCase() === email,
    );
    return email === MOCK_BILLING_EMAIL
      ? [...ownTransactions, ...MOCK_BILLING_ROWS.filter(row => !ownTransactions.some(own => own.id === row.id))]
      : ownTransactions;
  };

  constructor() {
    this.loadFromStorage();
  }

  private currentUserEmail(): string {
    try {
      const user = JSON.parse(localStorage.getItem('thinkup_current_user') || 'null') as { email?: string } | null;
      return user?.email?.toLowerCase() || '';
    } catch { return ''; }
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('thinkup-commerce');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.state) {
          if (data.state.cartCourses?.length) this._cartItems.set(data.state.cartCourses);
          if (data.state.completedTransactions) this._transactions.set(data.state.completedTransactions);
          if (data.state.transactionDetails) this._transactionDetails.set(data.state.transactionDetails);
          return;
        }
      }
      // TODO(pre-deploy): Nhớ xóa giỏ hàng mẫu khi có dữ liệu giỏ hàng thật.
      // Initial sample cart items
      const sample = MOCK_COURSES.slice(0, 2).map(normalizeCommerceCourse);
      this._cartItems.set(sample);
      this._checkoutIds.set(sample.map(s => s.id));
      this.persistState();
    } catch {
      const sample = MOCK_COURSES.slice(0, 2).map(normalizeCommerceCourse);
      this._cartItems.set(sample);
    }
  }

  private persistState(): void {
    try {
      const state = {
        state: {
          cartCourses: this._cartItems(),
          checkoutCourseIds: this._checkoutIds(),
          completedTransactions: this._transactions(),
          transactionDetails: this._transactionDetails(),
        }
      };
      localStorage.setItem('thinkup-commerce', JSON.stringify(state));
    } catch {}
  }

  // Cart API
  /**
   * Tải giỏ hàng từ API thật (GET /api/user/cart).
   * Không truyền selectedIds để lấy toàn bộ giỏ; trang giỏ hàng tự tính lại tổng tiền
   * khi người dùng bỏ tick (yêu cầu TC-04: cập nhật tức thời).
   */
  loadCartView(params: { selectedIds?: string[]; voucherCode?: string } = {}): Observable<CartItem[]> {
    let query = '';
    const search: string[] = [];
    if (params.selectedIds?.length) {
      search.push(`selectedIds=${encodeURIComponent(params.selectedIds.join(','))}`);
    }
    if (params.voucherCode) {
      search.push(`voucherCode=${encodeURIComponent(params.voucherCode)}`);
    }
    if (search.length) query = `?${search.join('&')}`;

    return this.http
      .get<{ success: boolean; data: CartView }>(`${this.apiUrl}/user/cart${query}`, { withCredentials: true })
      .pipe(
        map(res => this.applyCartPayload(res?.data)),
        catchError(() => of(this._cartItems())),
      );
  }

  /** PATCH-like refresh: đồng bộ lại danh sách khóa học sau mỗi thao tác giỏ hàng. */
  refreshCart(): Observable<CartItem[]> {
    return this.loadCartView();
  }

  private applyCartPayload(payload: unknown): CartItem[] {
    const data = payload as CartView | Course[] | null;
    if (!data) return this._cartItems();

    if (Array.isArray(data)) {
      const items = data.map(normalizeCommerceCourse);
      this._cartItems.set(items);
      this.persistState();
      return items;
    }

    if (Array.isArray(data.courses)) {
      const items = data.courses.map(mapApiCartCourse);
      this._cartItems.set(items);
      this._checkoutIds.update(ids => ids.filter(id => items.some(item => item.id === id)));
      this.persistState();
      return items;
    }

    return this._cartItems();
  }

  getCart(): Observable<{ success: boolean; data: CartItem[] }> {
    return this.loadCartView().pipe(map(items => ({ success: true, data: items })));
  }

  addToCart(courseId: string): Observable<{ success: boolean; data: CartItem[]; added: boolean }> {
    const course = MOCK_COURSES.find(c => c.id === courseId);
    if (course) {
      const normalized = normalizeCommerceCourse(course);
      if (!this._cartItems().some(i => i.id === courseId)) {
        this._cartItems.update(items => [normalized, ...items]);
        this.persistState();
      }
    }

    return this.http.post<{ success: boolean; data: unknown; added: boolean }>(
      `${this.apiUrl}/user/cart`, { courseId }, { withCredentials: true }
    ).pipe(
      map(res => ({ success: res?.success ?? true, data: this.applyCartPayload(res?.data), added: true })),
      catchError(() => of({ success: true, data: this._cartItems(), added: true }))
    );
  }

  removeFromCart(courseId: string): Observable<{ success: boolean; data: CartItem[] }> {
    this._cartItems.update(items => items.filter(item => item.id !== courseId));
    this._checkoutIds.update(ids => ids.filter(id => id !== courseId));
    this.persistState();

    return this.http.delete<{ success: boolean; data: unknown }>(
      `${this.apiUrl}/user/cart`, { body: { courseId }, withCredentials: true }
    ).pipe(
      map(res => ({ success: res?.success ?? true, data: this.applyCartPayload(res?.data) })),
      catchError(() => of({ success: true, data: this._cartItems() }))
    );
  }

  setCheckoutCourses(courseIds: string[]): void {
    this._checkoutIds.set(courseIds);
    this.persistState();
  }

  /** Voucher đã áp dụng ở giỏ hàng, cần bảo toàn sang trang thanh toán (BR-PAY-02). */
  setCheckoutVoucher(voucher: CheckoutVoucher | null): void {
    this._checkoutVoucher.set(voucher);
  }

  /** POST /api/user/cart/voucher/validate */
  validateVoucher(code: string, eligibleSubtotal: number): Observable<VoucherValidateResult> {
    return this.http
      .post<{ success: boolean; data: VoucherValidateResult }>(
        `${this.apiUrl}/user/cart/voucher/validate`,
        { code, eligibleSubtotal },
        { withCredentials: true },
      )
      .pipe(map(res => res.data));
  }

  /** POST /api/payment/create-session — khởi tạo phiên thanh toán thật. */
  createPaymentSession(payload: CreatePaymentSessionPayload): Observable<PaymentSession> {
    return this.http
      .post<{ success: boolean; data: PaymentSession }>(`${this.apiUrl}/payment/create-session`, payload, {
        withCredentials: true,
      })
      .pipe(map(res => res.data));
  }

  /** GET /api/payment/status/:id — dùng để polling trạng thái và đồng hồ đếm ngược. */
  getPaymentStatus(transactionId: string): Observable<PaymentStatus> {
    return this.http.get<PaymentStatus>(`${this.apiUrl}/payment/status/${encodeURIComponent(transactionId)}`, {
      withCredentials: true,
    });
  }

  // TODO(pre-deploy): Nhớ xóa giao dịch và hóa đơn mock khi tích hợp thanh toán thật.
  completePurchase(params: {
    courses: CartItem[];
    summary: OrderSummary;
    paymentMethod: string;
    voucher?: Voucher;
    orderId?: string;
    buyerEmail?: string;
  }): TransactionDetail {
    const now = new Date();
    const timestamp = now.getTime();
    const suffix = String(timestamp).slice(-8);
    const id = params.orderId || `GD${suffix}`;

    let buyerName = 'Khách hàng ThinkUp';
    let buyerEmail = params.buyerEmail || 'user@thinkup.vn';
    let buyerPhone = '';

    try {
      const userStr = localStorage.getItem('thinkup_current_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        buyerName = user.full_name || user.fullName || user.name || buyerName;
        if (!params.buyerEmail) buyerEmail = user.email || buyerEmail;
        buyerPhone = user.phone || user.phone_number || '';
      }
    } catch {}

    const timeStr = now.toLocaleString('vi-VN', { hour12: false });
    const dateStr = now.toLocaleDateString('vi-VN');
    const timeOnly = now.toLocaleTimeString('vi-VN', { hour12: false });

    const row: TransactionRow = {
      id,
      courses: params.courses.map(c => c.displayTitle || c.title),
      paymentMethod: params.paymentMethod,
      amount: formatMoney(params.summary.total),
      status: 'success',
      date: dateStr,
      time: timeOnly,
      timestamp,
    };

    const detail: TransactionDetail = {
      id,
      transactionCode: `THKUP-${suffix}`,
      paymentMethod: params.paymentMethod,
      createdAt: timeStr,
      paidAt: timeStr,
      completedAt: timeStr,
      paymentContent: `Đơn hàng ${suffix}`,
      status: 'success',
      order: {
        countLabel: `${params.courses.length} khóa học`,
        courses: params.courses.map(c => ({
          id: c.id,
          title: c.displayTitle || c.title,
          instructor: c.instructor,
          price: formatMoney(c.salePrice),
          originalPrice: formatMoney(c.originalPrice),
          badge: c.shortLabel || c.icon || 'Course',
          tone: 'blue',
        })),
        subtotal: formatMoney(params.summary.subtotal),
        courseDiscount: formatMoney(0),
        voucherDiscount: `-${formatMoney(params.summary.voucherDiscount)}`,
        voucherCode: params.voucher?.code || '',
        total: formatMoney(params.summary.total),
      },
      payment: {
        bank: params.paymentMethod,
        accountNumber: '—',
        accountName: 'THINKUP',
        transferContent: `THINKUP ${suffix}`,
        paidAmount: formatMoney(params.summary.total),
        bankTransactionCode: `FT${timestamp}`,
        paidAt: timeStr,
      },
      invoice: {
        code: `HD-${suffix}`,
        issuedAt: timeStr,
        status: 'Đã phát hành',
        buyer: { name: buyerName, email: buyerEmail, phone: buyerPhone },
      },
    };

    this._transactions.update(txs => [row, ...txs]);
    this._transactionDetails.update(details => ({ ...details, [id]: detail }));
    this.persistState();
    return detail;
  }

  finalizeCheckout(): void {
    const checkoutIds = this._checkoutIds();
    this._cartItems.update(items => items.filter(item => !checkoutIds.includes(item.id)));
    this._checkoutIds.set([]);
    this.persistState();
  }

  getTransactionDetail(id: string): TransactionDetail | undefined {
    const email = this.currentUserEmail();
    const detail = this._transactionDetails()[id] ?? (email === MOCK_BILLING_EMAIL ? MOCK_BILLING_DETAILS[id] : undefined);
    return detail?.invoice.buyer.email.toLowerCase() === email ? detail : undefined;
  }
}
