import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Course } from '../../../../core/models/course.model';
import { FavoritesService } from '../../../../core/services/favorites.service';
import { CommerceService } from '../../../../core/services/commerce.service';
import { InstructorTriggerDirective } from '../../../../shared/directives/instructor-trigger.directive';

/**
 * Thẻ khóa học dùng riêng trong trang hồ sơ giảng viên (Figma 5095-16772):
 * cover 140px + 4 dòng meta + hàng giá/CTA, cao 296px.
 */
@Component({
  selector: 'app-instructor-course-card',
  standalone: true,
  imports: [CommonModule, InstructorTriggerDirective],
  templateUrl: './instructor-course-card.component.html',
  styleUrl: './instructor-course-card.component.css',
})
export class InstructorCourseCardComponent {
  @Input({ required: true }) course!: Course;

  private router = inject(Router);
  private favoritesService = inject(FavoritesService);
  private commerceService = inject(CommerceService);

  private readonly coverColors: Record<string, string> = {
    'vuejs-3': '#0D3D2E',
    'javascript-es6': '#FACC15',
    reactjs: '#0A1929',
    docker: '#2D1B4E',
    'uiux-design': '#0F3D5C',
  };

  get instructorRef(): string {
    return this.course.instructorId || this.course.instructor;
  }

  getCoverColor(): string {
    return this.coverColors[this.course.id] || this.course.bgGradient || '#0A1535';
  }

  getCoverTitle(): string {
    const title = this.course.title || '';
    const [head, ...rest] = title.split(' - ');
    return (this.course.shortLabel || head || title).trim();
  }

  getCoverSubtitle(): string {
    if (this.course.coverSubtitle !== undefined) return this.course.coverSubtitle;
    const parts = (this.course.title || '').split(' - ');
    if (parts.length > 1) return parts.slice(1).join(' - ').trim();
    return (this.course.category || '').trim();
  }

  getCoverMark(): 'letter' | 'ring' | 'none' {
    if (this.course.id === 'vuejs-3') return 'letter';
    if (this.course.id === 'reactjs') return 'ring';
    return 'none';
  }

  isDarkCover(): boolean {
    return this.course.id === 'javascript-es6';
  }

  getBadgeClass(badge: string): string {
    switch (badge.toUpperCase()) {
      case 'HOT':
        return 'icard__badge--hot';
      case 'NEW':
        return 'icard__badge--new';
      case 'SALE':
        return 'icard__badge--sale';
      case 'BEST SELLER':
        return 'icard__badge--best';
      default:
        return 'icard__badge--default';
    }
  }

  isWishlisted(): boolean {
    return this.favoritesService.isFavorite(this.course.id);
  }

  isInCart(): boolean {
    return this.commerceService.cartItems().some(item => item.id === this.course.id);
  }

  toggleWishlist(): void {
    this.favoritesService.toggleFavorite(this.course).subscribe();
  }

  addToCart(): void {
    if (this.isInCart()) {
      this.router.navigate(['/main/cart']);
      return;
    }
    this.commerceService.addToCart(this.course.id).subscribe();
  }

  openCourse(): void {
    this.router.navigate(['/main/courses', this.course.id]);
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('vi-VN').format(price || 0) + 'đ';
  }

  formatRating(): string {
    const rating = Number(this.course.rating);
    return Number.isFinite(rating) ? rating.toFixed(1) : '0.0';
  }

  formatCompactCount(value: number | string): string {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return String(value || '0');
    if (num >= 1000) {
      const compact = num / 1000;
      return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k`;
    }
    return String(num);
  }

  formatStudents(): string {
    if (this.course.students) return this.course.students;
    const count = Number(this.course.studentsCount);
    if (!Number.isFinite(count) || count <= 0) return 'Đang cập nhật';
    return `${new Intl.NumberFormat('vi-VN').format(count)} học viên`;
  }

  getDiscountLabel(): string {
    const original = Number(this.course.originalPrice || 0);
    const sale = Number(this.course.salePrice || 0);
    if (original > sale && sale > 0) {
      return `-${Math.round(((original - sale) / original) * 100)}%`;
    }
    return '';
  }
}
