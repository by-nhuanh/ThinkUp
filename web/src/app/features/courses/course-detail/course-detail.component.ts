import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { CourseService } from '../../../core/services/course.service';
import { CommerceService } from '../../../core/services/commerce.service';
import { FavoritesService } from '../../../core/services/favorites.service';
import {
  Course,
  CourseReview,
  CourseReviewFilterOption,
  CourseReviewPage,
  CourseReviewSortOption,
  ReviewBreakdownRow,
} from '../../../core/models/course.model';
import { InstructorTriggerDirective } from '../../../shared/directives/instructor-trigger.directive';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, InstructorTriggerDirective],
  templateUrl: './course-detail.component.html',
  styleUrl: './course-detail.component.css'
})
export class CourseDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private courseService = inject(CourseService);
  private commerceService = inject(CommerceService);
  private favoritesService = inject(FavoritesService);
  private loadVersion = 0;
  private changingWishlist = false;
  addingCart = false;

  courseId = signal<string>('');
  course = signal<Course | null>(null);
  loading = signal<boolean>(true);
  error = signal<string>('');
  openChapters = signal<number[]>([0]);
  toastMessage = signal<string>('');

  reviews = signal<CourseReview[]>([]);
  reviewSummary = signal<{ average: number; total: number } | null>(null);
  reviewBreakdown = signal<ReviewBreakdownRow[]>([]);
  reviewFilterOptions = signal<CourseReviewFilterOption[]>([]);
  reviewSortOptions = signal<CourseReviewSortOption[]>([
    { label: 'Mới nhất', value: 'newest', active: true },
    { label: 'Đánh giá cao nhất', value: 'highest', active: false },
    { label: 'Đánh giá thấp nhất', value: 'lowest', active: false },
  ]);
  reviewSort = signal<string>('newest');
  reviewFilter = signal<number | 'all'>('all');
  reviewPage = signal<number>(1);
  reviewHasNext = signal<boolean>(false);
  reviewsLoading = signal<boolean>(false);
  reviewsLoadingMore = signal<boolean>(false);

  private readonly now = signal<number>(Date.now());
  private countdownTimer?: ReturnType<typeof setInterval>;

  readonly countdown = computed(() => {
    const endsAt = this.course()?.saleEndsAt;
    if (!endsAt) return '';
    const diff = new Date(endsAt).getTime() - this.now();
    if (!Number.isFinite(diff) || diff <= 0) return '';
    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days} ngày ${hours} giờ`;
    if (hours > 0) return `${hours} giờ ${minutes} phút`;
    return `${minutes} phút`;
  });

  isPurchased = computed(() => this.course()?.isPurchased === true);

  readonly trialLesson = computed(() => {
    const curriculum = this.course()?.curriculum;
    if (!curriculum) return null;
    for (const chapter of curriculum) {
      const lesson = chapter.lessons.find(item => item.isPreview && !item.isLocked);
      if (lesson) return lesson;
    }
    return null;
  });

  isWishlisted = computed(() => {
    const id = this.course()?.id || this.courseId();
    const serverState = this.course()?.isInWishlist === true;
    return serverState || (id ? this.favoritesService.isFavorite(id) : false);
  });

  isInCart = computed(() => {
    const id = this.course()?.id;
    return id ? this.commerceService.cartItems().some(i => i.id === id) : false;
  });
  cartVerified = signal(false);

  totalLessonsCount = computed(() => {
    const c = this.course();
    if (!c) return 0;
    if (c.lessonsCount) return c.lessonsCount;
    if (!c.curriculum) return 0;
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

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  private loadCourse(id: string): void {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.cartVerified.set(false);
    this.error.set('');
    this.reviews.set([]);
    this.reviewsLoading.set(false);
    this.reviewsLoadingMore.set(false);
    this.reviewSummary.set(null);
    this.reviewBreakdown.set([]);
    this.reviewPage.set(1);
    this.reviewHasNext.set(false);
    this.reviewSort.set('newest');
    this.reviewFilter.set('all');

    forkJoin({
      detail: this.courseService.getCourseDetail(id),
      cart: this.commerceService.refreshCart().pipe(catchError(() => {
        this.showToast('Không kiểm tra được giỏ hàng. Vui lòng tải lại trang.');
        return of(null);
      })),
      reviews: this.courseService
        .getCourseReviews(id, { page: 1, limit: 5 })
        .pipe(catchError(() => { this.showToast('Không tải được đánh giá khóa học.'); return of(null); })),
    }).subscribe({
      next: ({ detail, reviews, cart }) => {
        if (version !== this.loadVersion) return;
        this.loading.set(false);
        this.course.set(detail);
        this.cartVerified.set(cart !== null);
        this.openChapters.set([0]);
        this.reviewSummary.set({ average: detail.rating, total: Number(detail.ratingCount) || 0 });
        this.reviewBreakdown.set(detail.ratingBreakdown ?? []);
        if (reviews) this.applyReviewPage(reviews, true);
        this.startCountdown();
        this.favoritesService.checkFavorite(detail.id).subscribe({
          next: isFavorite => { if (version === this.loadVersion) this.course.update(course => course ? { ...course, isInWishlist: isFavorite } : course); },
          error: () => this.showToast('Không kiểm tra được trạng thái yêu thích.'),
        });
      },
      error: () => {
        if (version !== this.loadVersion) return;
        this.loading.set(false);
        this.error.set('Không thể tải khóa học. Vui lòng thử lại sau.');
      }
    });
  }

  private startCountdown(): void {
    if (this.countdownTimer) return;
    this.countdownTimer = setInterval(() => this.now.set(Date.now()), 60_000);
  }

  private applyReviewPage(page: CourseReviewPage, reset: boolean): void {
    this.reviewSummary.set({ average: page.summary.average, total: page.summary.total });
    this.reviewBreakdown.set(page.summary.breakdown);
    if (page.filterOptions.length) this.reviewFilterOptions.set(page.filterOptions);
    if (page.sortOptions.length) this.reviewSortOptions.set(page.sortOptions);
    this.reviews.set(reset ? page.reviews : [...this.reviews(), ...page.reviews]);
    this.reviewPage.set(page.pagination.page);
    this.reviewHasNext.set(page.pagination.hasNext);
  }

  onReviewSortChange(event: Event): void {
    this.reviewSort.set((event.target as HTMLSelectElement).value);
    this.reloadReviews();
  }

  onReviewFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.reviewFilter.set(value === 'all' ? 'all' : Number(value));
    this.reloadReviews();
  }

  private reloadReviews(): void {
    const id = this.courseId();
    const key = JSON.stringify([id, this.reviewSort(), this.reviewFilter()]);
    if (!id) return;
    this.reviewsLoading.set(true);
    this.reviewsLoadingMore.set(false);
    this.courseService
      .getCourseReviews(id, {
        rating: this.reviewFilter(),
        sort: this.reviewSort(),
        page: 1,
        limit: 5,
      })
      .subscribe({
        next: page => {
          if (key !== JSON.stringify([this.courseId(), this.reviewSort(), this.reviewFilter()])) return;
          this.reviewsLoading.set(false);
          this.applyReviewPage(page, true);
        },
        error: () => {
          if (key !== JSON.stringify([this.courseId(), this.reviewSort(), this.reviewFilter()])) return;
          this.reviewsLoading.set(false);
          this.showToast('Không tải được danh sách đánh giá.');
        }
      });
  }

  loadMoreReviews(): void {
    const id = this.courseId();
    const key = JSON.stringify([id, this.reviewSort(), this.reviewFilter()]);
    if (!id || this.reviewsLoading() || this.reviewsLoadingMore() || !this.reviewHasNext()) return;
    this.reviewsLoadingMore.set(true);
    this.courseService
      .getCourseReviews(id, {
        rating: this.reviewFilter(),
        sort: this.reviewSort(),
        page: this.reviewPage() + 1,
        limit: 5,
      })
      .subscribe({
        next: page => {
          if (key !== JSON.stringify([this.courseId(), this.reviewSort(), this.reviewFilter()])) return;
          this.reviewsLoadingMore.set(false);
          this.applyReviewPage(page, false);
        },
        error: () => {
          if (key !== JSON.stringify([this.courseId(), this.reviewSort(), this.reviewFilter()])) return;
          this.reviewsLoadingMore.set(false);
          this.showToast('Không tải thêm được đánh giá.');
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

  handlePrimaryAction(): void {
    if (this.isPurchased()) {
      this.continueLearning();
      return;
    }
    this.handleBuyNow();
  }

  continueLearning(): void {
    const c = this.course();
    if (!c) return;
    const targetId = c.courseId || c.id;
    void this.router.navigate(['/main/my-courses', targetId]);
  }

  openPreview(): void {
    const c = this.course();
    if (!c) return;
    if (c.previewVideoUrl) {
      window.open(c.previewVideoUrl, '_blank', 'noopener');
      return;
    }
    const lesson = this.trialLesson();
    if (!lesson) {
      this.showToast('Khóa học chưa có nội dung học thử.');
      return;
    }
    void this.router.navigate(['/learning/learn', c.id], {
      queryParams: { lesson: lesson.id, preview: true },
    });
  }

  handleAddToCart(): void {
    const c = this.course();
    if (!c || this.addingCart || !this.cartVerified() || this.isInCart()) return;
    this.addingCart = true;

    this.commerceService.addToCart(c.id).pipe(finalize(() => this.addingCart = false)).subscribe({
      next: () => {
        this.showToast('Khóa học đã được thêm vào giỏ hàng!');
      }, error: () => this.showToast('Không thêm được khóa học vào giỏ hàng.')
    });
  }

  handleBuyNow(): void {
    const c = this.course();
    if (!c || this.addingCart || !this.cartVerified()) return;
    if (this.isInCart()) {
      void this.router.navigate(['/main/checkout']);
      return;
    }
    this.addingCart = true;

    this.commerceService.addToCart(c.id).pipe(finalize(() => this.addingCart = false)).subscribe({
      next: () => {
        this.router.navigate(['/main/checkout']);
      }, error: () => this.showToast('Không thêm được khóa học vào giỏ hàng.')
    });
  }

  handleToggleWishlist(): void {
    const c = this.course();
    if (!c || this.changingWishlist) return;
    this.changingWishlist = true;

    this.favoritesService.toggleFavorite(c).pipe(finalize(() => this.changingWishlist = false)).subscribe({
      next: (res) => {
        this.course.update(course => course?.id === c.id ? { ...course, isInWishlist: res.isFavorite } : course);
        const msg = res.isFavorite
          ? 'Đã lưu khóa học vào danh sách yêu thích!'
          : 'Đã xóa khỏi danh sách yêu thích!';
        this.showToast(msg);
      }, error: () => this.showToast('Không cập nhật được yêu thích.')
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
