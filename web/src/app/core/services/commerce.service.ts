import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, defer, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { CartItem, TransactionDetail } from '../models/commerce.model';
import {
  ApiCartCourse,
  CartView,
  CheckoutVoucher,
  CreatePaymentSessionPayload,
  PaymentSession,
  PaymentStatus,
  PaymentReceipt,
  VoucherValidateResult,
} from '../models/payment.model';
import { Course } from '../models/course.model';
import { AuthService } from './auth.service';

/** Chuyển khóa học của API giỏ hàng sang model dùng chung của app. */
function mapApiCartCourse(course: ApiCartCourse): CartItem {
  const instructorName = course.instructor?.name || 'Giảng viên ThinkUp';
  const instructorAvatar = course.instructor?.avatar_url || course.instructor?.avatar;
  return {
    id: course.course_id,
    courseId: course.course_id,
    slug: course.slug,
    title: course.title,
    displayTitle: course.title,
    instructor: instructorName,
    instructorId: course.instructor?.id,
    instructorProfile: {
      id: course.instructor?.id,
      name: instructorName,
      title: '',
      bio: '',
      rating: course.rating,
      studentsCount: course.total_students ?? 0,
      coursesCount: 0,
      avatar: instructorAvatar,
    },
    instructorInitial: instructorName.charAt(0).toUpperCase(),
    rating: course.rating,
    ratingCount: course.total_reviews,
    studentsCount: course.total_students,
    students: `${new Intl.NumberFormat('vi-VN').format(course.total_students || 0)} học viên`,
    originalPrice: course.price?.original ?? 0,
    salePrice: course.price?.sale ?? 0,
    tags: course.tags ?? [],
    thumbnailUrl: course.thumbnail || course.thumbnail_url || '',
    isSelected: course.is_selected,
    isEnrolled: course.is_owned || course.is_already_enrolled,
    isAvailable: course.is_available,
  };
}

@Injectable({ providedIn: 'root' })
export class CommerceService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private readonly auth = inject(AuthService);

  private readonly guardAccount = <T>(source: Observable<T>): Observable<T> => defer(() => {
    const token = this.auth.getToken();
    return source.pipe(map(value => {
      if (token !== this.auth.getToken()) throw new Error('Phiên đăng nhập đã thay đổi.');
      return value;
    }));
  });

  clearAccountCart(): void {
    this._cartItems.set([]);
    this._checkoutIds.set([]);
    this._checkoutVoucher.set(null);
  }

  mergeGuestCart(): Observable<CartItem[]> {
    const ids = this.readGuestCourseIds();
    if (!ids.length) return this.refreshCart();
    return this.http.post<{ success: boolean; data: CartView }>(`${this.apiUrl}/user/cart/merge`,
      { guestCourseIds: ids }, { withCredentials: true }).pipe(this.guardAccount, map(response => {
        if (response.success !== true) throw new Error('Chưa đồng bộ được giỏ hàng.');
        const items = this.applyCartPayload(response.data);
        const remaining = this.readGuestCourseIds().filter(id => !ids.includes(id));
        if (remaining.length) localStorage.setItem('thinkup_guest_cart_ids', JSON.stringify(remaining));
        else localStorage.removeItem('thinkup_guest_cart_ids');
        return items;
      }));
  }

  // State
  private _cartItems = signal<CartItem[]>([]);
  private _checkoutIds = signal<string[]>([]);
  private _checkoutVoucher = signal<CheckoutVoucher | null>(null);

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
  private persistState(): void {
    try {
      sessionStorage.setItem(`thinkup_checkout_${this.auth.currentUser()?.id || 'guest'}`, JSON.stringify(this._checkoutIds()));
    } catch {}
  }

  // Cart API
  /**
   * Tải giỏ hàng từ API thật (GET /api/user/cart).
   * Không truyền selectedIds để lấy toàn bộ giỏ; trang giỏ hàng tự tính lại tổng tiền
   * khi người dùng bỏ tick (yêu cầu TC-04: cập nhật tức thời).
   */
  loadCartView(params: { selectedIds?: string[]; voucherCode?: string } = {}): Observable<CartItem[]> {
    if (!this._checkoutIds().length) {
      try {
        const ids = JSON.parse(sessionStorage.getItem(`thinkup_checkout_${this.auth.currentUser()?.id || 'guest'}`) || '[]');
        if (Array.isArray(ids) && ids.every(id => typeof id === 'string')) this._checkoutIds.set(ids);
      } catch {}
    }
    let query = '';
    const search: string[] = [];
    if (params.selectedIds?.length) {
      search.push(`selectedIds=${encodeURIComponent(params.selectedIds.join(','))}`);
    }
    if (params.voucherCode) {
      search.push(`voucherCode=${encodeURIComponent(params.voucherCode)}`);
    }
    const guestCourseIds = this.readGuestCourseIds();
    if (guestCourseIds.length > 0) {
      search.push(`guestCourseIds=${encodeURIComponent(guestCourseIds.join(','))}`);
    }
    if (search.length) query = `?${search.join('&')}`;

    return this.http
      .get<{ success: boolean; data: CartView }>(`${this.apiUrl}/user/cart${query}`, { withCredentials: true })
      .pipe(this.guardAccount, map(res => {
        if (res.success !== true) throw new Error('Không tải được giỏ hàng.');
        return this.applyCartPayload(res.data);
      }));
  }

  /** PATCH-like refresh: đồng bộ lại danh sách khóa học sau mỗi thao tác giỏ hàng. */
  refreshCart(): Observable<CartItem[]> {
    return this.loadCartView();
  }

  private applyCartPayload(payload: unknown): CartItem[] {
    const data = payload as CartView | null;
    if (!data) throw new Error('Phản hồi giỏ hàng không hợp lệ.');

    if (Array.isArray(data.courses)) {
      const items = data.courses.map(mapApiCartCourse);
      this._cartItems.set(items);
      this._checkoutIds.update(ids => ids.filter(id => items.some(item => item.id === id)));
      this.persistState();
      return items;
    }
    throw new Error('Phản hồi giỏ hàng không hợp lệ.');
  }

  getCart(): Observable<{ success: boolean; data: CartItem[] }> {
    return this.loadCartView().pipe(map(items => ({ success: true, data: items })));
  }

  addToCart(courseId: string): Observable<{ success: boolean; data: CartItem[]; added: boolean }> {
    if (!this.auth.isAuthenticated()) {
      const ids = this.readGuestCourseIds();
      const added = !ids.includes(courseId);
      localStorage.setItem('thinkup_guest_cart_ids', JSON.stringify([...new Set([...ids, courseId])]));
      return this.loadCartView().pipe(map(data => ({ success: true, data, added })));
    }
    return this.http.post<{ success: boolean; data: CartView }>(
      `${this.apiUrl}/user/cart`, { courseId }, { withCredentials: true }
    ).pipe(this.guardAccount,
      map(res => {
        if (!res.success) throw new Error('Không thêm được khóa học vào giỏ hàng.');
        const data = this.applyCartPayload(res.data);
        if (!data.some(item => item.id === courseId)) throw new Error('Giỏ hàng chưa có khóa học này.');
        return { success: true, data, added: true };
      })
    );
  }

  removeFromCart(courseId: string): Observable<{ success: boolean; data: CartItem[] }> {
    if (!this.auth.isAuthenticated()) {
      localStorage.setItem('thinkup_guest_cart_ids', JSON.stringify(this.readGuestCourseIds().filter(id => id !== courseId)));
      return this.loadCartView().pipe(map(data => ({ success: true, data })));
    }
    return this.http.delete<{ success: boolean; data: unknown }>(
      `${this.apiUrl}/user/cart`, { body: { courseId }, withCredentials: true }
    ).pipe(this.guardAccount,
      map(res => ({ success: res.success, data: this.applyCartPayload(res.data) }))
    );
  }

  private readGuestCourseIds(): string[] {
    try {
      const raw = localStorage.getItem('thinkup_guest_cart_ids');
      const ids = raw ? JSON.parse(raw) as unknown : [];
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
    } catch {
      return [];
    }
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
    return this.requestPaymentSession('create-session', { ...payload, courseIds: [...new Set(payload.courseIds)].sort() });
  }

  retryPaymentSession(orderId: string, paymentMethod: CreatePaymentSessionPayload['paymentMethod'], bankCode?: string): Observable<PaymentSession> {
    return this.requestPaymentSession(`retry/${encodeURIComponent(orderId)}`, { paymentMethod, ...(bankCode ? { bankCode } : {}) });
  }

  resetPaymentAttempt(transactionId?: string): void {
    if (transactionId && !this.isCurrentPaymentAttempt(transactionId)) return;
    sessionStorage.removeItem(this.paymentAttemptStorageKey());
  }

  isCurrentPaymentAttempt(transactionId: string): boolean {
    try { return JSON.parse(sessionStorage.getItem(this.paymentAttemptStorageKey()) || 'null')?.transactionId === transactionId; }
    catch { return false; }
  }

  private paymentAttemptStorageKey(): string {
    return `thinkup_payment_attempt_${this.auth.currentUser()?.id || 'guest'}`;
  }

  private requestPaymentSession(path: string, payload: object): Observable<PaymentSession> {
    const signature = JSON.stringify({ path, payload });
    const storageKey = this.paymentAttemptStorageKey();
    let attempt: { signature: string; key: string; transactionId?: string } | null = null;
    try { attempt = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch {}
    if (attempt?.signature !== signature) {
      attempt = { signature, key: `checkout_${crypto.randomUUID()}` };
      sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    }
    return this.http
      .post<{ success: boolean; data: PaymentSession }>(`${this.apiUrl}/payment/${path}`, payload, {
        withCredentials: true,
        headers: { 'Idempotency-Key': attempt.key },
      })
      .pipe(this.guardAccount, map(res => {
        if (!res.success || !res.data?.transactionId || !res.data.orderId || !Number.isSafeInteger(res.data.amount)
          || res.data.amount < 0 || res.data.currency !== 'VND') throw new Error('Phản hồi thanh toán không hợp lệ.');
        const data = res.data;
        if (data.paymentMethod === 'simulation' || data.isSimulated || data.executionMode === 'simulation') {
          if (data.paymentMethod !== 'simulation' || data.isSimulated !== true || data.executionMode !== 'simulation'
            || !data.paymentContent || !data.transferContent || data.requestedPaymentMethod !== (payload as { paymentMethod?: string }).paymentMethod
            || (data.status === 'success' && (data.fulfillmentStatus !== 'completed' || !data.invoiceCode))) {
            throw new Error('Không xác minh được kết quả thanh toán mô phỏng.');
          }
        }
        const current = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        if (current?.key === attempt.key) sessionStorage.setItem(storageKey, JSON.stringify({ ...attempt, transactionId: res.data.transactionId }));
        return res.data;
      }));
  }

  /** GET /api/payment/status/:id — dùng để polling trạng thái và đồng hồ đếm ngược. */
  getPaymentStatus(transactionId: string): Observable<PaymentStatus> {
    return this.http.get<PaymentStatus>(`${this.apiUrl}/payment/status/${encodeURIComponent(transactionId)}`, {
      withCredentials: true,
    }).pipe(this.guardAccount, map(result => {
      if (!result.success || result.transactionId !== transactionId) throw new Error('Không xác minh được giao dịch.');
      return result;
    }));
  }

  getPaymentReceipt(transactionId: string): Observable<PaymentReceipt> {
    return this.http.get<TransactionDetail>(`${this.apiUrl}/user/billing/${encodeURIComponent(transactionId)}`).pipe(
      this.guardAccount,
      map(detail => {
        if (detail.transactionCode !== transactionId || detail.status !== 'success' || !detail.invoice?.code || !detail.paymentMethod) {
          throw new Error('Chưa lấy được chứng từ giao dịch đã hoàn tất.');
        }
        return { transactionId: detail.transactionCode, orderId: detail.id, invoiceCode: detail.invoice.code,
          paymentContent: detail.paymentContent, transferContent: detail.payment.transferContent,
          paymentMethod: detail.paymentMethod, isSimulated: detail.paymentMethod === 'simulation' };
      }),
    );
  }

  finalizeCheckout(): void {
    this._checkoutIds.set([]);
    this.persistState();
  }

}
