import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../../core/services/course.service';
import { CommerceService } from '../../../core/services/commerce.service';
import { FavoritesService } from '../../../core/services/favorites.service';
import { Course, CourseChapter } from '../../../core/models/course.model';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './course-detail.component.html',
  styleUrl: './course-detail.component.css'
})
export class CourseDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private courseService = inject(CourseService);
  private commerceService = inject(CommerceService);
  private favoritesService = inject(FavoritesService);

  courseId = signal<string>('');
  course = signal<Course | null>(null);
  loading = signal<boolean>(true);
  error = signal<string>('');
  openChapters = signal<number[]>([0]);
  toastMessage = signal<string>('');

  readonly reviewBreakdown = [
    { stars: 5, percent: 80, count: 960 },
    { stars: 4, percent: 12, count: 144 },
    { stars: 3, percent: 5, count: 60 },
    { stars: 2, percent: 2, count: 24 },
    { stars: 1, percent: 1, count: 12 },
  ];

  isWishlisted = computed(() => {
    const id = this.courseId();
    return id ? this.favoritesService.isFavorite(id) : false;
  });

  isInCart = computed(() => {
    const id = this.courseId();
    return id ? this.commerceService.cartItems().some(i => i.id === id) : false;
  });

  totalLessonsCount = computed(() => {
    const c = this.course();
    if (!c?.curriculum) return 0;
    return c.curriculum.reduce((acc, chap) => acc + (chap.lessons?.length || 0), 0);
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id') || params.get('courseId') || '';
      this.courseId.set(id);
      if (id) {
        this.loadCourse(id);
      } else {
        this.error.set('Không tìm thấy mã khóa học.');
        this.loading.set(false);
      }
    });
  }

  private loadCourse(id: string): void {
    this.loading.set(true);
    this.error.set('');

    this.courseService.getCourseById(id).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.success && res.data) {
          this.course.set(res.data);
          this.openChapters.set([0]);
        } else {
          this.error.set('Không tìm thấy thông tin khóa học.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Không thể tải khóa học. Vui lòng thử lại sau.');
      }
    });
  }

  isChapterOpen(index: number): boolean {
    return this.openChapters().includes(index);
  }

  handleToggleChapter(index: number): void {
    this.openChapters.update(current => {
      return current.includes(index)
        ? current.filter(i => i !== index)
        : [...current, index];
    });
  }

  handleToggleAll(): void {
    const c = this.course();
    if (!c?.curriculum) return;
    const all = c.curriculum.map((_, i) => i);
    this.openChapters.update(current => {
      return current.length === all.length ? [] : all;
    });
  }

  handleAddToCart(): void {
    const c = this.course();
    if (!c) return;

    this.commerceService.addToCart(c.id).subscribe({
      next: () => {
        this.showToast('Khóa học đã được thêm vào giỏ hàng!');
      }
    });
  }

  handleBuyNow(): void {
    const c = this.course();
    if (!c) return;

    this.commerceService.addToCart(c.id).subscribe({
      next: () => {
        this.router.navigate(['/main/checkout']);
      }
    });
  }

  handleToggleWishlist(): void {
    const c = this.course();
    if (!c) return;

    this.favoritesService.toggleFavorite(c).subscribe({
      next: (res) => {
        const msg = res.isFavorite
          ? 'Đã lưu khóa học vào danh sách yêu thích!'
          : 'Đã xóa khỏi danh sách yêu thích!';
        this.showToast(msg);
      }
    });
  }

  getLessonToneClass(type: string): string {
    switch (type) {
      case 'Video': return 'bg-blue-50 text-blue-600';
      case 'Lab': return 'bg-amber-50 text-amber-600';
      case 'Quiz': return 'bg-purple-50 text-purple-600';
      case 'Reading': return 'bg-emerald-50 text-emerald-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  formatPrice(price: number): string {
    if (!price) return 'Miễn phí';
    return `${new Intl.NumberFormat('vi-VN').format(price)}đ`;
  }

  getDiscountPercent(c: Course): number {
    if (!c.originalPrice || !c.salePrice || c.originalPrice <= c.salePrice) return 0;
    return Math.round(((c.originalPrice - c.salePrice) / c.originalPrice) * 100);
  }

  private showToast(msg: string): void {
    this.toastMessage.set(msg);
    setTimeout(() => {
      this.toastMessage.set('');
    }, 3000);
  }
}
