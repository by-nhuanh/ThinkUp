import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { CourseCardComponent } from '../../shared/components/course-card/course-card.component';
import { CourseCardView } from '../../shared/components/course-card/course-card.model';
import { formatMoney, toCourseCardView } from '../../shared/components/course-card/course-card.mapper';
import { CommerceService } from '../../core/services/commerce.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { Course } from '../../core/models/course.model';
import { HomeCourseDto, HomeLearningDay, HomeLearningStreak, HomeOverview, HomeService } from './home.service';
import {
  BENEFITS,
  BenefitItem,
  HERO_SLIDES,
  HeroSlide,
  MyLearningItem,
  RoadmapBanner,
  StreakDay,
} from '../../core/data/mock/mock-home';

/** Dữ liệu thẻ khóa học ở khối "Đề xuất theo sở thích của bạn". */
type FeaturedCard = CourseCardView;
type HomeLearningCard = MyLearningItem & { lessonId: string | null; thumbnailUrl: string | null };
type HeatmapCell = { level: number | null; coverage: HomeLearningDay['coverage'] | 'outside-window'; date: string | null };
const EMPTY_ROADMAP: RoadmapBanner = {
  tag: '✦  LỘ TRÌNH CÁ NHÂN HÓA',
  title: 'Khám phá lộ trình học tập',
  description: 'Chọn một lộ trình để bắt đầu tiến gần hơn tới mục tiêu của bạn.',
  action: 'Khám phá lộ trình  →',
  href: '/learning/roadmap',
  progress: 'Chưa có lộ trình đang học',
  illustration: '/assets/home/learning-journey.svg',
};

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
  private readonly homeService = inject(HomeService);

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  readonly heroSlide: HeroSlide = HERO_SLIDES[0];
  readonly myLearning = signal<HomeLearningCard[]>([]);
  readonly roadmap = signal<RoadmapBanner>(EMPTY_ROADMAP);
  readonly streakDays = signal<StreakDay[]>([]);
  readonly streakCount = signal<number | null>(null);
  readonly heatmapStats = signal<Array<{ value: string; label: string }>>([]);
  readonly benefits: BenefitItem[] = BENEFITS;

  readonly greeting = signal('Chào buổi sáng,');
  readonly userName = signal('Học viên ThinkUP! 👋');
  readonly featured = signal<FeaturedCard[]>([]);
  readonly overviewError = signal(false);
  readonly learningCount = signal(0);
  readonly savedIds = signal<string[]>([]);
  readonly toastMessage = signal('');

  readonly weekdays = [0, 1, 2, 3, 4, 5, 6];
  readonly heatmapWindowWeeks = 28;
  readonly monthLabels = signal<string[]>([]);
  readonly heatmapDayLabels = ['T2', '', 'T4', '', 'T6', '', 'CN'];
  readonly heatmapRows = signal<HeatmapCell[][]>([]);
  private overviewRequestId = 0;

  /** Số thẻ cố định trên một trang của khung carousel khóa học đang học. */
  readonly cardsPerPage = 5;
  readonly carouselPage = signal(0);
  readonly carouselPages = computed(() => Math.max(1, Math.ceil(this.myLearning().length / this.cardsPerPage)));
  readonly carouselPagesArray = computed(() => Array.from({ length: this.carouselPages() }, (_, index) => index));
  readonly canScrollPrev = computed(() => this.carouselPage() > 0);
  readonly canScrollNext = computed(() => this.carouselPage() < this.carouselPages() - 1);

  ngOnInit(): void {
    this.updateGreetingTime();
    this.loadOverview();
  }

  benefitIcon(item: BenefitItem): IconName {
    return item.icon as IconName;
  }

  isSaved(card: FeaturedCard): boolean {
    return this.favoritesService.isFavorite(card.id);
  }

  scrollTrack(direction: -1 | 1): void {
    const element = this.track()?.nativeElement;
    if (!element) return;
    const maxPage = this.carouselPages() - 1;
    const target = Math.min(maxPage, Math.max(0, this.carouselPage() + direction));
    if (target === this.carouselPage()) return;
    this.carouselPage.set(target);
    element.scrollTo({ left: target * this.trackPageWidth(element), behavior: 'smooth' });
  }

  goToCarouselPage(page: number): void {
    const element = this.track()?.nativeElement;
    if (!element) return;
    const target = Math.min(this.carouselPages() - 1, Math.max(0, page));
    this.carouselPage.set(target);
    element.scrollTo({ left: target * this.trackPageWidth(element), behavior: 'smooth' });
  }

  onTrackScroll(): void {
    const element = this.track()?.nativeElement;
    if (!element) return;
    const pageWidth = this.trackPageWidth(element);
    if (pageWidth <= 0) return;
    const page = Math.round(element.scrollLeft / pageWidth);
    this.carouselPage.set(Math.min(this.carouselPages() - 1, Math.max(0, page)));
  }

  /** Bề rộng một trang = số thẻ mỗi trang × (bề rộng thẻ + khoảng cách). */
  private trackPageWidth(element: HTMLElement): number {
    const card = element.querySelector<HTMLElement>('.hm-course');
    if (!card) return element.clientWidth;
    const styles = getComputedStyle(element);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    return (card.getBoundingClientRect().width + gap) * this.cardsPerPage;
  }

  toggleSave(card: FeaturedCard): void {
    if (!card.course) { this.showToast('Không thể cập nhật yêu thích cho khóa học này.'); return; }
    this.favoritesService.toggleFavorite(card.course).subscribe({
      next: result => {
        this.savedIds.update(ids => result.isFavorite ? [...new Set([...ids, card.id])] : ids.filter(id => id !== card.id));
        this.showToast(result.isFavorite ? `Đã lưu "${card.title}" vào danh sách yêu thích!` : 'Đã bỏ lưu khóa học.');
      },
      error: () => this.showToast('Chưa thể cập nhật yêu thích, vui lòng thử lại.'),
    });
  }

  addToCart(card: FeaturedCard): void {
    this.commerceService.addToCart(card.id).subscribe({
      next: result => this.showToast(result.added ? `Đã thêm "${card.title}" vào giỏ hàng!` : 'Khóa học đã có trong giỏ hàng.'),
      error: error => this.showToast(error?.error?.message || 'Chưa thể thêm vào giỏ hàng, vui lòng thử lại.'),
    });
  }

  private updateGreetingTime(): void {
    const hour = new Date().getHours();
    if (hour < 12) this.greeting.set('Chào buổi sáng,');
    else if (hour < 18) this.greeting.set('Chào buổi chiều,');
    else this.greeting.set('Chào buổi tối,');
  }

  private loadOverview(year?: number): void {
    const requestId = ++this.overviewRequestId;
    this.homeService.getOverview(year).subscribe({
      next: overview => {
        if (requestId !== this.overviewRequestId) return;
        this.overviewError.set(false);
        this.greeting.set(overview.greeting);
        this.userName.set(overview.user.full_name ? `${overview.user.full_name}! 👋` : 'Học viên ThinkUp! 👋');
        this.learningCount.set(overview.my_learning.total);
        this.myLearning.set(overview.my_learning.courses.map(course => this.toLearningCard(course)));
        this.carouselPage.set(0);
        this.roadmap.set(overview.roadmap ? this.toRoadmapBanner(overview.roadmap) : EMPTY_ROADMAP);
        this.featured.set(overview.recommendations.courses.slice(0, 5)
          .map((course, index) => this.fromRecommendation(course, index)));
        this.updateActivity(overview.learning_activity, overview.learning_streak);
      },
      error: () => {
        if (requestId !== this.overviewRequestId) return;
        this.overviewError.set(true);
        this.myLearning.set([]);
        this.carouselPage.set(0);
        this.roadmap.set(EMPTY_ROADMAP);
        this.featured.set([]);
        this.streakCount.set(null);
        this.streakDays.set([]);
        this.heatmapRows.set([]);
        this.monthLabels.set([]);
        this.heatmapStats.set([]);
      },
    });
  }

  private toLearningCard(course: HomeOverview['my_learning']['courses'][number]): HomeLearningCard {
    const id = course.course_id;
    return {
      id,
      lessonId: course.resume_lesson?.lesson_id ?? null,
      thumbnailUrl: course.thumbnail_url,
      glyph: course.title.trim().slice(0, 2).toUpperCase(),
      glyphType: 'ts',
      title: course.title,
      subtitle: 'Tiếp tục hành trình học tập',
      tag: 'ĐANG HỌC',
      progress: course.progress_percentage,
      nextLesson: course.resume_lesson?.title ?? 'Tiếp tục khóa học',
      href: `/learning/learn/${encodeURIComponent(id)}`,
    };
  }

  private toRoadmapBanner(roadmap: NonNullable<HomeOverview['roadmap']>): RoadmapBanner {
    return {
      tag: '✦  LỘ TRÌNH CÁ NHÂN HÓA',
      title: roadmap.career_name,
      description: `${roadmap.completed_nodes}/${roadmap.total_nodes} kỹ năng đã hoàn thành. Tiếp tục lộ trình của bạn.`,
      action: 'Tiếp tục lộ trình của bạn  →',
      href: `/learning/roadmap/${encodeURIComponent(String(roadmap.category_id))}`,
      progress: `${roadmap.progress_percentage}% hoàn thành`,
      illustration: '/assets/home/learning-journey.svg',
    };
  }

  private toCourse(dto: HomeCourseDto): Course {
    return {
      id: dto.course_id || dto.id,
      courseId: dto.course_id || undefined,
      slug: dto.slug || undefined,
      title: dto.title,
      description: dto.short_description || dto.description || undefined,
      shortDescription: dto.short_description || undefined,
      instructor: dto.instructor?.name || dto.instructor_name || 'Giảng viên ThinkUp',
      instructorId: dto.instructor_id || dto.instructor?.id || undefined,
      instructorProfile: {
        id: dto.instructor_id || dto.instructor?.id,
        name: dto.instructor?.name || dto.instructor_name || 'Giảng viên ThinkUp',
        title: '',
        bio: '',
        rating: dto.rating ?? 0,
        studentsCount: dto.total_students ?? 0,
        coursesCount: 0,
        avatar: dto.instructor_avatar || dto.instructor?.avatar_url,
      },
      level: dto.level || undefined,
      rating: dto.rating ?? 0,
      ratingCount: dto.total_reviews ?? 0,
      studentsCount: dto.total_students ?? 0,
      duration: this.formatDuration(dto.duration_minutes),
      originalPrice: dto.original_price ?? dto.price ?? 0,
      salePrice: dto.price ?? 0,
      badge: dto.badge || undefined,
      tags: dto.tag_names || [],
      thumbnailUrl: dto.thumbnail_url || undefined,
    };
  }

  private updateActivity(activity: HomeOverview['learning_activity'], streak: HomeLearningStreak): void {
    this.streakCount.set(streak.current_streak);
    this.streakDays.set(this.buildStreakDays(streak.days));
    const currentYear = activity.available_years[0] ?? activity.year;
    const targetDate = activity.year === currentYear
      ? [...activity.days].reverse().find(day => day.coverage !== 'future')?.date ?? activity.end_date
      : activity.end_date;
    const lastWeekIndex = activity.weeks.findIndex(week => week.some(day => day?.date === targetDate));
    const visibleWeeks = lastWeekIndex < 0
      ? []
      : activity.weeks.slice(Math.max(0, lastWeekIndex - this.heatmapWindowWeeks + 1), lastWeekIndex + 1);
    const paddedWeeks: Array<Array<HomeLearningDay | null>> = [
      ...Array.from({ length: this.heatmapWindowWeeks - visibleWeeks.length }, () => Array(7).fill(null)),
      ...visibleWeeks,
    ];
    this.heatmapRows.set(Array.from({ length: 7 }, (_, weekday) => paddedWeeks.map(week => {
      const day = week[weekday];
      return day
        ? { level: day.intensity_level, coverage: day.coverage, date: day.date }
        : { level: null, coverage: 'outside-window' as const, date: null };
    })));
    this.monthLabels.set(this.buildMonthLabels(targetDate));
    const totalHours = activity.total_learning_seconds / 3600;
    const formattedHours = Number.isInteger(totalHours)
      ? String(totalHours)
      : new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(totalHours);
    this.heatmapStats.set([
      { value: `${activity.active_days ?? 0} ngày`, label: 'Có hoạt động' },
      { value: `${formattedHours} giờ`, label: 'Tổng thời gian' },
    ]);
  }

  private fromCourse(course: Course, index: number): FeaturedCard {
    return toCourseCardView(course, index);
  }

  private fromRecommendation(dto: HomeCourseDto, index: number): FeaturedCard {
    const card = this.fromCourse(this.toCourse(dto), index);
    return {
      ...card,
      coverTitle: dto.title,
      coverSubtitle: '',
      author: dto.instructor?.name || dto.instructor_name || 'Giảng viên ThinkUp',
      level: this.translateLevel(dto.level),
      rating: dto.rating == null ? '—' : dto.rating.toFixed(1),
      reviews: dto.total_reviews == null ? '—' : `(${dto.total_reviews})`,
      students: dto.total_students == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(dto.total_students)} học viên`,
      duration: this.formatDuration(dto.duration_minutes) || '—',
      tags: dto.tag_names || [],
      price: dto.price == null ? '—' : formatMoney(dto.price),
      oldPrice: dto.original_price == null ? '—' : formatMoney(dto.original_price),
    };
  }

  private formatDuration(minutes?: number | null): string | undefined {
    if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return undefined;
    const hours = Math.floor(minutes / 60), remainder = Math.round(minutes % 60);
    return [hours ? `${hours} giờ` : '', remainder ? `${remainder} phút` : ''].filter(Boolean).join(' ') || '0 phút';
  }

  private translateLevel(level?: string | null): string {
    const key = (level || '').toLowerCase();
    if (key.includes('beginner')) return 'Cơ bản';
    if (key.includes('intermediate')) return 'Trung cấp';
    if (key.includes('advanced')) return 'Nâng cao';
    return level || '—';
  }

  private buildMonthLabels(endDate: string): string[] {
    const [year, month] = endDate.split('-').map(Number);
    return Array.from({ length: 4 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 4 + index, 1));
      return `Tháng ${date.getUTCMonth() + 1}`;
    });
  }

  private buildStreakDays(days: HomeLearningDay[]): StreakDay[] {
    return days.map(day => ({ label: day.weekday_label, done: day.goal_met === true }));
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    setTimeout(() => this.toastMessage.set(''), 3200);
  }
}
