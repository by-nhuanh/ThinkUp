import { Component, DestroyRef, Input, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Course } from '../../../../core/models/course.model';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { CommerceService } from '../../../../core/services/commerce.service';
import { InstructorTriggerDirective } from '../../../../shared/directives/instructor-trigger.directive';
import { ToastService } from '../../../../core/services/toast.service';
import { finalize, map, switchMap, timeout } from 'rxjs';

@Component({
  selector: 'app-course-card',
  standalone: true,
  imports: [CommonModule, InstructorTriggerDirective],
  templateUrl: './course-card.component.html',
  styleUrl: './course-card.component.css'
})
export class CourseCardComponent {
  @Input({ required: true }) course!: Course;
  @Input() featured = false;

  private router = inject(Router);
  private favoritesService = inject(FavoritesService);
  private commerceService = inject(CommerceService);
  private readonly toast = inject(ToastService);
  private changingFavorite = false;
  readonly addingCart = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  failedThumbnail = '';

  get coverUrl(): string {
    const url = this.course.thumbnailUrl || '';
    return url === this.failedThumbnail ? '' : url;
  }

  get instructorRef(): string {
    return this.course.instructorId || this.course.instructor;
  }

  isWishlisted(): boolean {
    return this.favoritesService.isFavorite(this.course.id);
  }

  isPurchased(): boolean {
    return this.course?.isPurchased === true;
  }

  isInCart(): boolean {
    return this.commerceService.cartItems().some(i => i.id === this.course.id);
  }

  toggleWishlist(): void {
    if (this.changingFavorite) return;
    this.changingFavorite = true;
    const request = this.isWishlisted() ? this.favoritesService.removeFavorite(this.course.id) : this.favoritesService.addFavorite(this.course);
    request.pipe(finalize(() => this.changingFavorite = false)).subscribe({
      error: () => this.toast.showToast({ type: 'warning', message: 'Không cập nhật được yêu thích. Vui lòng đăng nhập hoặc thử lại.' }),
    });
  }

  addToCart(): void {
    if (this.isPurchased() || this.addingCart()) return;
    this.addingCart.set(true);
    const id = this.course.id;
    this.commerceService.refreshCart().pipe(
      timeout(15000),
      switchMap(items => {
        const removing = items.some(item => item.id === id);
        const request = removing ? this.commerceService.removeFromCart(id) : this.commerceService.addToCart(id);
        return request.pipe(timeout(20000), map(result => {
          if (!result.success || result.data.some(item => item.id === id) === removing) {
            throw new Error('Giỏ hàng chưa xác nhận thay đổi.');
          }
          return removing;
        }));
      }),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.addingCart.set(false)),
    ).subscribe({
      next: removing => this.toast.showToast({ type: 'success', message: removing ? 'Đã xóa khóa học khỏi giỏ hàng.' : 'Đã thêm khóa học vào giỏ hàng.' }),
      error: error => this.toast.showToast({ type: 'warning', message: error.name === 'TimeoutError'
        ? 'Máy chủ phản hồi quá lâu. Vui lòng thử lại để kiểm tra giỏ hàng trước khi thêm hoặc xóa.'
        : error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : 'Không cập nhật được giỏ hàng. Vui lòng thử lại.' }),
    });
  }

  navigateToDetail(): void {
    this.router.navigate(['/main/courses', this.course.id]);
  }

  getBackgroundStyle(): string {
    if (this.course.bgGradient) return this.course.bgGradient;
    switch (this.course.id) {
      case 'uiux-design':
        return 'linear-gradient(165deg, rgba(15, 118, 110, 1) 0%, rgba(13, 148, 136, 1) 100%)';
      case 'nodejs':
        return 'linear-gradient(165deg, rgba(30, 58, 138, 1) 0%, rgba(55, 48, 163, 1) 100%)';
      case 'docker':
        return 'linear-gradient(165deg, rgba(30, 27, 75, 1) 0%, rgba(49, 46, 129, 1) 100%)';
      case 'flutter':
        return 'linear-gradient(165deg, rgba(247, 201, 72, 1) 0%, rgba(253, 184, 106, 1) 100%)';
      default:
        return 'linear-gradient(164deg, #0A1535 0%, #1A2A5E 100%)';
    }
  }

  getCoverTitle(): string {
    const title = this.course.title || '';
    const [head, ...rest] = title.split(' - ');
    return (this.course.shortLabel || head || title).trim();
  }

  getCoverSubtitle(): string {
    const title = this.course.title || '';
    const parts = title.split(' - ');
    if (parts.length > 1) {
      return parts.slice(1).join(' - ').trim();
    }
    return (this.course.category || '').trim();
  }

  getCoverTitleClass(): string[] {
    const title = this.getCoverTitle();
    const classes: string[] = [];

    if (this.featured && title.length <= 12) {
      classes.push('cover-title--featured');
    } else if (title.length > 21) {
      classes.push('cover-title--xlong');
    } else if (title.length > 17) {
      classes.push('cover-title--long');
    }

    if (this.isDarkCover()) {
      classes.push('cover-title--dark');
    }

    return classes;
  }

  getCoverMarkKind(): '' | 'ring' | 'text' {
    if (this.course.id === 'reactjs') return 'ring';
    if (this.course.id === 'flutter' || this.course.id === 'vuejs-3') return 'text';
    return '';
  }

  getCoverMarkColor(): string {
    if (this.course.id === 'flutter') return '#02569B';
    if (this.course.id === 'vuejs-3') return '#41B883';
    return '#FFFFFF';
  }

  getVisibleTags(): string[] {
    return (this.course.tags || []).slice(0, 3);
  }

  isDarkCover(): boolean {
    if (this.course.id === 'flutter' || this.course.id === 'javascript-es6') {
      return true;
    }

    const gradient = (this.course.bgGradient || '').toUpperCase();
    return gradient.includes('#FFDF20') || gradient.includes('#FDC700') || gradient.includes('#FFB86A');
  }

  getBadgeColor(badge: string): string {
    switch (badge.toUpperCase()) {
      case 'HOT':
      case 'SALE':
        return 'bg-[#FB2C36]';
      case 'NEW':
        return 'bg-[#00C950]';
      case 'BEST SELLER':
        return 'bg-[#FF6900]';
      default:
        return 'bg-[#4B5563]';
    }
  }

  getDiscountLabel(): string {
    const original = Number(this.course.originalPrice || 0);
    const sale = Number(this.course.salePrice || 0);

    if (original > sale && sale > 0) {
      return `-${Math.round(((original - sale) / original) * 100)}%`;
    }

    return '';
  }

  formatRating(): string {
    const rating = Number(this.course.rating);
    return Number.isFinite(rating) ? rating.toFixed(1) : '0.0';
  }

  formatStudents(): string {
    if (this.course.students) return this.course.students;

    const count = Number(this.course.studentsCount);
    if (!Number.isFinite(count) || count <= 0) return 'Đang cập nhật';

    return `${new Intl.NumberFormat('vi-VN').format(count)} học viên`;
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('vi-VN').format(price || 0) + 'đ';
  }

  formatCompactCount(value: any): string {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return String(value || '0');
    if (num >= 1000) {
      const compact = num / 1000;
      return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k`;
    }
    return String(num);
  }
}
