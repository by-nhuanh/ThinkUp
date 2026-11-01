import { Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { CourseCardComponent } from '../../shared/components/course-card/course-card.component';
import { CourseCardView } from '../../shared/components/course-card/course-card.model';
import { formatMoney, toCourseCardView } from '../../shared/components/course-card/course-card.mapper';
import { CommerceService } from '../../core/services/commerce.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { OnboardingService } from '../../core/services/onboarding.service';
import { Course } from '../../core/models/course.model';
import {
  BENEFITS,
  BenefitItem,
  FEATURED_COURSES,
  FeaturedCourseSeed,
  HEATMAP_LEVELS,
  HEATMAP_STATS,
  HEATMAP_WEEKS,
  HERO_SLIDES,
  HeroSlide,
  MY_LEARNING_COURSES,
  MyLearningItem,
  ROADMAP_BANNER,
  RoadmapBanner,
  STREAK_COUNT,
  STREAK_DAYS,
  StreakDay,
} from '../../core/data/mock/mock-home';

/** Dữ liệu thẻ khóa học ở khối "Đề xuất theo sở thích của bạn". */
type FeaturedCard = CourseCardView;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, IconComponent, CourseCardComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./styles/home-ui.css', './home.component.css'],
})
export class HomeComponent implements OnInit {
  private readonly commerceService = inject(CommerceService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly onboardingService = inject(OnboardingService);

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  readonly heroSlide: HeroSlide = HERO_SLIDES[0];
  readonly myLearning: MyLearningItem[] = MY_LEARNING_COURSES;
  readonly roadmap: RoadmapBanner = ROADMAP_BANNER;
  readonly streakDays: StreakDay[] = STREAK_DAYS;
  readonly streakCount = STREAK_COUNT;
  readonly heatmapWeeks = HEATMAP_WEEKS;
  readonly heatmapLevels = HEATMAP_LEVELS;
  readonly heatmapStats = HEATMAP_STATS;
  readonly benefits: BenefitItem[] = BENEFITS;

  readonly greeting = signal('Chào buổi sáng,');
  readonly userName = signal('Học viên ThinkUP! 👋');
  readonly featured = signal<FeaturedCard[]>(FEATURED_COURSES.map((seed, index) => this.fromSeed(seed, index)));
  readonly savedIds = signal<string[]>([]);
  readonly toastMessage = signal('');

  readonly weekdays = [0, 1, 2, 3, 4, 5, 6];
  readonly monthLabels = this.buildMonthLabels();
  readonly heatmapDayLabels = ['T2', '', 'T4', '', 'T6', '', 'CN'];
  readonly heatmapRows = this.buildHeatmapRows();

  ngOnInit(): void {
    this.updateGreetingTime();
    this.loadUserSession();
    this.loadRecommended();
  }

  benefitIcon(item: BenefitItem): IconName {
    return item.icon as IconName;
  }

  isSaved(card: FeaturedCard): boolean {
    return this.savedIds().includes(card.id);
  }

  scrollTrack(direction: -1 | 1): void {
    const element = this.track()?.nativeElement;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' });
  }

  toggleSave(card: FeaturedCard): void {
    const saved = this.isSaved(card);
    this.savedIds.update(ids => (saved ? ids.filter(id => id !== card.id) : [...ids, card.id]));
    this.showToast(saved ? 'Đã bỏ lưu khóa học.' : `Đã lưu "${card.title}" vào danh sách yêu thích!`);

    // TODO(pre-deploy): đồng bộ với FavoritesService khi thẻ khóa học lấy dữ liệu thật từ API.
    if (!saved && card.course) {
      this.favoritesService.toggleFavorite(card.course).subscribe({ error: () => undefined });
    }
  }

  addToCart(card: FeaturedCard): void {
    this.commerceService.addToCart(card.id).subscribe({
      next: () => this.showToast(`Đã thêm "${card.title}" vào giỏ hàng!`),
      error: () => this.showToast('Chưa thể thêm vào giỏ hàng, vui lòng thử lại.'),
    });
  }

  private updateGreetingTime(): void {
    const hour = new Date().getHours();
    if (hour < 12) this.greeting.set('Chào buổi sáng,');
    else if (hour < 18) this.greeting.set('Chào buổi chiều,');
    else this.greeting.set('Chào buổi tối,');
  }

  private loadUserSession(): void {
    try {
      const saved = localStorage.getItem('thinkup_current_user');
      if (!saved) return;
      const user = JSON.parse(saved);
      const name = user.full_name || user.fullName || user.name;
      if (name) this.userName.set(`${name}! 👋`);
    } catch {
      /* phiên lưu hỏng thì giữ tên mặc định */
    }
  }

  private loadRecommended(): void {
    this.onboardingService.getRecommendedCourses().subscribe({
      next: courses => {
        if (!courses?.length) return;
        this.featured.set(courses.slice(0, 5).map((course, index) => this.fromCourse(course, index)));
      },
      // TODO(pre-deploy): bỏ fallback mock khi API gợi ý khóa học đã chạy ở môi trường dev.
      error: () => this.featured.set(FEATURED_COURSES.map((seed, index) => this.fromSeed(seed, index))),
    });
  }

  private fromSeed(seed: FeaturedCourseSeed, index: number): FeaturedCard {
    const course: Course = {
      id: seed.id,
      title: seed.title,
      instructor: seed.author,
      instructorInitial: seed.author.charAt(0),
      level: seed.level,
      rating: Number(seed.rating),
      ratingCount: seed.reviews,
      students: seed.students,
      duration: seed.duration,
      originalPrice: seed.originalPrice,
      salePrice: seed.salePrice,
      badge: seed.badge?.text,
      tags: seed.tags,
    };

    return {
      id: seed.id,
      coverTitle: seed.coverTitle,
      coverSubtitle: seed.coverSubtitle,
      coverSize: seed.coverSize === 'lg' ? 'lg' : 'md',
      coverGradient: seed.coverGradient,
      badge: seed.badge ?? null,
      title: seed.title,
      author: seed.author,
      level: seed.level,
      rating: seed.rating,
      reviews: seed.reviews,
      students: seed.students,
      duration: seed.duration,
      tags: seed.tags,
      price: formatMoney(seed.salePrice),
      oldPrice: formatMoney(seed.originalPrice),
      discount: seed.discount ?? '',
      course,
    };
  }

  private fromCourse(course: Course, index: number): FeaturedCard {
    return toCourseCardView(course, index);
  }

  private buildMonthLabels(): string[] {
    const labels: string[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(`Tháng ${date.getMonth() + 1}`);
    }
    return labels;
  }

  private buildHeatmapRows(): number[][] {
    const total = HEATMAP_WEEKS * 7;
    const levels = Array.from({ length: total }, (_, index) => this.heatmapLevels[index] ?? 0);
    return this.weekdays.map(day => levels.filter((_, index) => index % 7 === day));
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    setTimeout(() => this.toastMessage.set(''), 3200);
  }
}
