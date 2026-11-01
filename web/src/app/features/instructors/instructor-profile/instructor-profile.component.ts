import { Location } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DestroyRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Course } from '../../../core/models/course.model';
import { MOCK_COURSES } from '../../../core/data/mock/mock-courses';
import { Instructor, InstructorCourseSort, InstructorCourseSortOption } from '../../../core/models/instructor.model';
import { CourseService } from '../../../core/services/course.service';
import { InstructorService } from '../../../core/services/instructor.service';
import { InstructorCourseCardComponent } from '../components/instructor-course-card/instructor-course-card.component';

const PAGE_SIZE = 5;

/** Thứ tự trình diễn theo Figma 5095-16772 cho tab "Phổ biến nhất". */
const POPULAR_ORDER = new Map<string, number>([
  ['vuejs-3', 0],
  ['javascript-es6', 1],
  ['reactjs', 2],
  ['docker', 3],
  ['uiux-design', 4],
]);

const SORT_OPTIONS: InstructorCourseSortOption[] = [
  { value: 'popular', label: 'Phổ biến nhất' },
  { value: 'rating', label: 'Đánh giá cao nhất' },
  { value: 'price-asc', label: 'Giá thấp đến cao' },
  { value: 'price-desc', label: 'Giá cao đến thấp' },
];

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase();

@Component({
  selector: 'app-instructor-profile',
  standalone: true,
  imports: [InstructorCourseCardComponent],
  templateUrl: './instructor-profile.component.html',
  styleUrl: './instructor-profile.component.css',
})
export class InstructorProfileComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly courseService = inject(CourseService);
  private readonly instructorService = inject(InstructorService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sortBox = viewChild<ElementRef<HTMLElement>>('sortBox');

  readonly instructor = signal<Instructor | null>(null);
  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly sort = signal<InstructorCourseSort>('popular');
  readonly sortOpen = signal(false);
  readonly page = signal(1);

  readonly sortOptions = SORT_OPTIONS;

  readonly activeSortLabel = computed(
    () => SORT_OPTIONS.find(option => option.value === this.sort())?.label ?? SORT_OPTIONS[0].label
  );

  private readonly sortedCourses = computed(() => {
    const list = [...this.courses()];
    switch (this.sort()) {
      case 'rating':
        return list.sort((a, b) => this.ratingCount(b) - this.ratingCount(a) || b.rating - a.rating);
      case 'price-asc':
        return list.sort((a, b) => a.salePrice - b.salePrice);
      case 'price-desc':
        return list.sort((a, b) => b.salePrice - a.salePrice);
      case 'popular':
      default:
        return list.sort((a, b) => {
          const aOrder = POPULAR_ORDER.get(a.id);
          const bOrder = POPULAR_ORDER.get(b.id);
          if (aOrder !== undefined || bOrder !== undefined) {
            return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
          }
          return (b.studentsCount || 0) - (a.studentsCount || 0) || b.rating - a.rating;
        });
    }
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.sortedCourses().length / PAGE_SIZE)));

  readonly pagedCourses = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.sortedCourses().slice(start, start + PAGE_SIZE);
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const windowSize = Math.min(total, 5);
    const start = Math.max(1, Math.min(current - 2, total - windowSize + 1));
    return Array.from({ length: windowSize }, (_, index) => start + index);
  });

  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.sortOpen()) return;
    const target = event.target as Node | null;
    const box = this.sortBox()?.nativeElement;
    if (target && box?.contains(target)) return;
    this.sortOpen.set(false);
  };

  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.sortOpen()) {
      this.sortOpen.set(false);
    }
  };

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map(params => params.get('slug') ?? params.get('id') ?? ''),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(slug => this.load(slug));

    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    document.addEventListener('keydown', this.onDocumentKeydown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    document.removeEventListener('keydown', this.onDocumentKeydown, true);
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }
    this.router.navigateByUrl('/main/courses');
  }

  toggleSort(): void {
    this.sortOpen.update(open => !open);
  }

  selectSort(value: InstructorCourseSort): void {
    this.sort.set(value);
    this.sortOpen.set(false);
    this.page.set(1);
  }

  goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages());
    this.page.set(next);
  }

  previousPage(): void {
    this.goToPage(this.page() - 1);
  }

  nextPage(): void {
    this.goToPage(this.page() + 1);
  }

  formatStat(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value);
  }

  formatRating(value: number): string {
    return Number.isFinite(value) ? value.toFixed(1) : '0.0';
  }

  private load(slug: string): void {
    this.loading.set(true);
    this.page.set(1);

    const instructor = this.instructorService.getInstructor(slug);
    this.instructor.set(instructor);

    if (!instructor) {
      this.courses.set([]);
      this.loading.set(false);
      return;
    }

    // TODO(pre-deploy): Nhớ thay bằng endpoint khóa học theo giảng viên khi backend sẵn sàng.
    this.courseService
      .getCourses()
      .pipe(
        // Giữ trang hồ sơ luôn có dữ liệu trình diễn khi backend chưa chạy.
        catchError(() => of({ success: true, data: MOCK_COURSES, total: MOCK_COURSES.length })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: response => {
          const list = (response.data || []).filter(course => this.belongsTo(course, instructor));
          this.courses.set(list);
          this.loading.set(false);
        },
        error: () => {
          this.courses.set([]);
          this.loading.set(false);
        },
      });
  }

  private belongsTo(course: Course, instructor: Instructor): boolean {
    if (course.instructorId) return course.instructorId === instructor.id;
    return normalize(course.instructor || '') === normalize(instructor.name);
  }

  private ratingCount(course: Course): number {
    const value = Number(course.ratingCount);
    return Number.isFinite(value) ? value : 0;
  }
}
