import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommerceService } from '../../../core/services/commerce.service';
import { CourseService } from '../../../core/services/course.service';
import { FavoritesService } from '../../../core/services/favorites.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { CartItem } from '../../../core/models/commerce.model';
import { Course } from '../../../core/models/course.model';
import { CheckoutVoucher } from '../../../core/models/payment.model';
import { InstructorTriggerDirective } from '../../../shared/directives/instructor-trigger.directive';

interface CourseArt {
  gradient: string;
  badge: string;
  title: string;
  subtitle: string;
  icon: string;
  dark: boolean;
}

/** Bảng màu/nhãn cho thumbnail dự phòng khi khóa học chưa có ảnh thật. */
const COURSE_ART: Record<string, { title: string; subtitle: string; icon: string; dark?: boolean }> = {
  reactjs: { title: 'React', subtitle: 'Từ cơ bản đến nâng cao', icon: '⚛' },
  'javascript-es6': {
    title: 'JavaScript ES6+',
    subtitle: 'Master JavaScript for Modern Web',
    icon: 'JS',
    dark: true,
  },
  'python-data': { title: 'Python', subtitle: 'for Data Science with Python', icon: 'Py' },
};

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink, InstructorTriggerDirective],
  templateUrl: './cart.component.html',
  styleUrls: ['../../payment-ui.css', './cart.component.css'],
})
export class CartComponent implements OnInit {
  private commerce = inject(CommerceService);
  private courseService = inject(CourseService);
  private favorites = inject(FavoritesService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly cartItems = this.commerce.cartItems;

  loading = signal(true);
  selectedIds = signal<string[]>([]);
  voucherCode = signal('');
  voucherDiscount = signal(0);
  voucherApplied = signal(false);
  voucherMessage = signal('');
  voucherError = signal('');
  readonly voucherErrorText = computed(() => {
    const message = this.voucherError();
    if (!message) return '';
    return /không hợp lệ|hết hạn/i.test(message) ? 'Vui lòng kiểm tra lại và thử mã khác.' : message;
  });
  voucherLoading = signal(false);
  removingIds = signal<string[]>([]);
  thumbnailErrors = signal<Set<string>>(new Set());

  private suggestionPool = signal<Course[]>([]);
  private voucherSequence = 0;

  readonly isAllSelected = computed(() => {
    const selectable = this.cartItems().filter(item => this.isSelectable(item));
    return selectable.length > 0 && selectable.every(item => this.selectedIds().includes(item.id));
  });

  readonly selectedItems = computed(() => {
    const ids = new Set(this.selectedIds());
    return this.cartItems().filter(item => ids.has(item.id) && this.isSelectable(item));
  });

  readonly selectedCount = computed(() => this.selectedItems().length);

  readonly originalSubtotal = computed(() =>
    this.selectedItems().reduce((sum, item) => sum + (item.originalPrice || item.salePrice || 0), 0),
  );

  readonly saleSubtotal = computed(() =>
    this.selectedItems().reduce((sum, item) => sum + (item.salePrice || 0), 0),
  );

  readonly courseDiscount = computed(() => Math.max(0, this.originalSubtotal() - this.saleSubtotal()));

  readonly finalTotal = computed(() => Math.max(0, this.saleSubtotal() - this.voucherDiscount()));

  readonly suggestions = computed<Course[]>(() => {
    const inCart = new Set<string>();
    for (const item of this.cartItems()) {
      inCart.add(item.id);
      if (item.courseId) inCart.add(item.courseId);
    }

    const preferred = ['uiux-design', 'nodejs', 'docker', 'flutter'];
    const pool = this.suggestionPool();
    const ordered: Course[] = [];

    for (const id of preferred) {
      const found = pool.find(course => course.id === id);
      if (found) ordered.push(found);
    }
    for (const course of pool) {
      if (!ordered.some(item => item.id === course.id)) ordered.push(course);
    }

    return ordered.filter(course => !inCart.has(course.id)).slice(0, 4);
  });

  ngOnInit(): void {
    this.restoreVoucher();

    this.commerce
      .getCart()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.syncSelection();
          this.loading.set(false);
          this.revalidateVoucher();
        },
        error: () => {
          this.syncSelection();
          this.loading.set(false);
        },
      });

    this.courseService
      .getCourses({})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => this.suggestionPool.set(response?.data ?? []),
        error: () => this.suggestionPool.set([]),
      });
  }

  // ─── Chọn khóa học ─────────────────────────────────────────────────────────

  isSelectable(item: CartItem): boolean {
    return item.isAvailable !== false && item.isEnrolled !== true;
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleSelect(id: string): void {
    const item = this.cartItems().find(course => course.id === id);
    if (!item || !this.isSelectable(item)) return;

    this.selectedIds.update(ids =>
      ids.includes(id) ? ids.filter(existing => existing !== id) : [...ids, id],
    );
    this.revalidateVoucher();
  }

  toggleSelectAll(): void {
    const selectable = this.cartItems().filter(item => this.isSelectable(item));
    this.selectedIds.set(this.isAllSelected() ? [] : selectable.map(item => item.id));
    this.revalidateVoucher();
  }

  // ─── Thao tác giỏ hàng ─────────────────────────────────────────────────────

  removeItem(item: CartItem, notify = true): void {
    if (this.removingIds().includes(item.id)) return;

    this.removingIds.update(ids => [...ids, item.id]);
    this.commerce
      .removeFromCart(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingIds.update(ids => ids.filter(id => id !== item.id));
          this.selectedIds.update(ids => ids.filter(id => id !== item.id));
          if (notify) {
            this.toast.showToast({ type: 'success', message: `Đã xóa “${item.displayTitle || item.title}” khỏi giỏ hàng.` });
          }
          this.revalidateVoucher();
        },
        error: () => {
          this.removingIds.update(ids => ids.filter(id => id !== item.id));
          this.toast.showToast({ type: 'error', message: 'Không thể xóa khóa học. Vui lòng thử lại.' });
        },
      });
  }

  /** Lưu/bỏ yêu thích nhưng giữ nguyên khóa học trong giỏ hàng. */
  toggleCartFavorite(item: CartItem): void {
    if (this.removingIds().includes(item.id)) return;

    this.favorites
      .toggleFavorite(item)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          const isFavorite = result?.isFavorite ?? !this.isFavorite(item.courseId || item.id);
          this.toast.showToast({
            type: 'success',
            message: isFavorite
              ? `Đã lưu “${item.displayTitle || item.title}” vào danh sách yêu thích.`
              : `Đã bỏ “${item.displayTitle || item.title}” khỏi danh sách yêu thích.`,
          });
        },
        error: () => this.toast.showToast({ type: 'error', message: 'Không thể cập nhật danh sách yêu thích.' }),
      });
  }

  // ─── Voucher ───────────────────────────────────────────────────────────────

  updateVoucherCode(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.voucherCode.set(value);
    if (this.voucherError()) this.voucherError.set('');
  }

  applyVoucher(): void {
    const code = this.voucherCode().trim().toUpperCase();
    if (!code) {
      this.voucherError.set('Vui lòng nhập mã giảm giá.');
      return;
    }
    if (this.selectedCount() === 0) {
      this.voucherError.set('Vui lòng chọn ít nhất một khóa học để áp dụng mã giảm giá.');
      return;
    }

    const sequence = ++this.voucherSequence;
    this.voucherLoading.set(true);
    this.voucherError.set('');

    this.commerce
      .validateVoucher(code, this.saleSubtotal())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          if (sequence !== this.voucherSequence) return;
          this.voucherLoading.set(false);

          if (result?.isValid) {
            this.voucherCode.set(result.code || code);
            this.voucherDiscount.set(result.discount || 0);
            this.voucherMessage.set(result.message || '');
            this.voucherApplied.set(true);
            this.commerce.setCheckoutVoucher({
              code: result.code || code,
              discount: result.discount || 0,
              message: result.message || '',
            });
            return;
          }

          this.clearVoucher();
          this.voucherError.set(result?.message || 'Mã giảm giá không hợp lệ hoặc đã hết hạn.');
        },
        error: () => {
          if (sequence !== this.voucherSequence) return;
          this.voucherLoading.set(false);
          this.clearVoucher();
          this.voucherError.set('Không thể kiểm tra mã giảm giá lúc này. Vui lòng thử lại.');
        },
      });
  }

  private restoreVoucher(): void {
    const voucher = this.commerce.checkoutVoucher();
    if (!voucher) return;

    this.voucherCode.set(voucher.code);
    this.voucherDiscount.set(voucher.discount);
    this.voucherMessage.set(voucher.message || '');
    this.voucherApplied.set(true);
  }

  private clearVoucher(): void {
    this.voucherDiscount.set(0);
    this.voucherApplied.set(false);
    this.voucherMessage.set('');
    this.commerce.setCheckoutVoucher(null);
  }

  /** Danh sách chọn thay đổi → tính lại mã giảm giá theo tổng tiền mới. */
  private revalidateVoucher(): void {
    const voucher = this.commerce.checkoutVoucher();
    if (!voucher) return;

    if (this.selectedCount() === 0) {
      this.clearVoucher();
      this.voucherError.set('');
      return;
    }

    const sequence = ++this.voucherSequence;
    this.commerce
      .validateVoucher(voucher.code, this.saleSubtotal())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          if (sequence !== this.voucherSequence) return;

          if (result?.isValid) {
            this.voucherDiscount.set(result.discount || 0);
            this.voucherMessage.set(result.message || '');
            this.voucherApplied.set(true);
            this.commerce.setCheckoutVoucher({
              code: result.code || voucher.code,
              discount: result.discount || 0,
              message: result.message || '',
            });
            return;
          }

          this.clearVoucher();
          this.voucherError.set(result?.message || 'Mã giảm giá không còn hợp lệ với danh sách khóa học đã chọn.');
        },
        error: () => {
          if (sequence !== this.voucherSequence) return;
          this.clearVoucher();
          this.voucherError.set('Không thể kiểm tra lại mã giảm giá. Vui lòng áp dụng lại mã.');
        },
      });
  }

  // ─── Điều hướng ────────────────────────────────────────────────────────────

  proceedToCheckout(): void {
    if (this.selectedCount() === 0) return;

    if (!this.auth.isAuthenticated()) {
      this.toast.showToast({ type: 'warning', message: 'Vui lòng đăng nhập để tiếp tục thanh toán.' });
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/main/checkout' } });
      return;
    }

    this.commerce.setCheckoutCourses(this.selectedIds());
    if (this.voucherApplied()) {
      const voucher: CheckoutVoucher = {
        code: this.voucherCode().trim().toUpperCase(),
        discount: this.voucherDiscount(),
        message: this.voucherMessage(),
      };
      this.commerce.setCheckoutVoucher(voucher);
    } else {
      this.commerce.setCheckoutVoucher(null);
    }
    void this.router.navigate(['/main/checkout']);
  }

  // ─── Gợi ý khóa học ────────────────────────────────────────────────────────

  isFavorite(courseId: string): boolean {
    this.favorites.favorites();
    return this.favorites.isFavorite(courseId);
  }

  toggleSuggestionFavorite(course: Course): void {
    this.favorites
      .toggleFavorite(course)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.toast.showToast({
            type: 'success',
            message: result?.isFavorite === false
              ? 'Đã bỏ khóa học khỏi danh sách yêu thích.'
              : 'Đã lưu khóa học vào danh sách yêu thích.',
          });
        },
        error: () => this.toast.showToast({ type: 'error', message: 'Không thể cập nhật danh sách yêu thích.' }),
      });
  }

  addSuggestionToCart(course: Course): void {
    this.commerce
      .addToCart(course.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.selectedIds.update(ids => (ids.includes(course.id) ? ids : [...ids, course.id]));
          this.toast.showToast({ type: 'success', message: 'Đã thêm khóa học vào giỏ hàng.' });
        },
        error: () => this.toast.showToast({ type: 'error', message: 'Không thể thêm khóa học vào giỏ hàng.' }),
      });
  }

  // ─── Hiển thị ──────────────────────────────────────────────────────────────

  formatPrice(value: number | null | undefined): string {
    return `${new Intl.NumberFormat('vi-VN').format(Math.max(0, Number(value) || 0))}đ`;
  }

  compactRating(count: number | string | null | undefined): string {
    const value = typeof count === 'string' ? Number(count) : Number(count ?? 0);
    if (!Number.isFinite(value) || value <= 0) return '0';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}tr`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${Math.round(value)}`;
  }

  studentsLabel(item: CartItem): string {
    if (item.students) return item.students;
    const count = Number(item.studentsCount) || 0;
    return `${new Intl.NumberFormat('vi-VN').format(count)} học viên`;
  }

  discountPercent(item: CartItem): number {
    if (!item.originalPrice || item.originalPrice <= item.salePrice) return 0;
    return Math.round((1 - item.salePrice / item.originalPrice) * 100);
  }

  courseArt(item: CartItem): CourseArt {
    const preset = COURSE_ART[item.id] ?? COURSE_ART[item.courseId ?? ''];
    const [firstPart, ...restParts] = (item.displayTitle || item.title || '').split(' - ');
    return {
      gradient: item.bgGradient || 'linear-gradient(150deg, #0A1535 0%, #243B75 100%)',
      badge: item.badge || 'KHÓA HỌC',
      title: preset?.title || firstPart || item.title,
      subtitle: preset?.subtitle || restParts.join(' - ') || item.shortDescription || '',
      icon: preset?.icon || item.icon || (item.instructorInitial ?? 'T'),
      dark: preset?.dark ?? false,
    };
  }

  hasArtImage(item: CartItem): boolean {
    return !!item.thumbnailUrl && !this.thumbnailErrors().has(item.id);
  }

  onArtImageError(item: CartItem): void {
    this.thumbnailErrors.update(errors => {
      const next = new Set(errors);
      next.add(item.id);
      return next;
    });
  }

  badgeClass(badge: string | undefined): string {
    const normalized = (badge || '').toLowerCase();
    if (normalized.includes('sale')) return 'art-badge--sale';
    if (normalized.includes('new')) return 'art-badge--new';
    if (normalized.includes('best')) return 'art-badge--best';
    if (normalized.includes('hot')) return 'art-badge--hot';
    return 'art-badge--default';
  }

  coverTitle(course: Course): string {
    return (course.title || '').split(' - ')[0] || course.title;
  }

  coverSubtitle(course: Course): string {
    const parts = (course.title || '').split(' - ');
    if (parts.length > 1) return parts.slice(1).join(' - ');
    return course.shortDescription || '';
  }

  coverGradient(course: Course): string {
    return course.bgGradient || 'linear-gradient(150deg, #155DFC 0%, #14B8A6 100%)';
  }

  isLightCover(course: Course): boolean {
    const gradient = (course.bgGradient || '').toUpperCase();
    return ['#FFDF20', '#FDC700', '#FFB86A'].some(color => gradient.includes(color));
  }

  private syncSelection(): void {
    const selectable = this.cartItems().filter(item => this.isSelectable(item)).map(item => item.id);
    const current = this.selectedIds().filter(id => selectable.includes(id));
    this.selectedIds.set(current.length > 0 || this.cartItems().length === 0 ? current : selectable);
  }
}
