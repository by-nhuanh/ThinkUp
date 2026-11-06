import { Component, HostListener, DestroyRef, inject, signal, computed, effect, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, forkJoin, of, catchError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../core/services/course.service';
import { CertificateService } from '../../core/services/certificate.service';
import { EnrolledCourse } from '../../core/models/course.model';
import { InstructorTriggerDirective } from '../../shared/directives/instructor-trigger.directive';
import { AuthService } from '../../core/services/auth.service';

interface FilterTab {
  value: 'all' | 'learning' | 'completed';
  label: string;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ');
}

@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, InstructorTriggerDirective],
  templateUrl: './my-courses.component.html',
  styleUrl: './my-courses.component.css'
})
export class MyCoursesComponent {
  private readonly courseService = inject(CourseService);
  private readonly certificateService = inject(CertificateService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accountId = computed(() => this.auth.currentUser()?.id);
  private request?: Subscription;

  readonly courses = signal<EnrolledCourse[]>([]);
  readonly certificatesMap = signal<Map<string, string>>(new Map());
  readonly currentFilter = signal<'all' | 'learning' | 'completed'>('all');
  readonly searchQuery = signal<string>('');
  readonly status = signal<'loading' | 'success' | 'error'>('loading');
  private readonly failedThumbnails = signal<Set<string>>(new Set());

  searchInput = '';

  readonly filterTabs: FilterTab[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'learning', label: 'Đang học' },
    { value: 'completed', label: 'Đã hoàn thành' }
  ];

  readonly visibleCourses = computed(() => {
    const all = this.courses();
    const filter = this.currentFilter();
    const terms = normalizeSearch(this.searchQuery()).split(' ').filter(Boolean);

    return all.filter((course) => {
      const completed = course.totalLessons > 0 && course.completedLessons === course.totalLessons;
      const matchesStatus =
        filter === 'all' ||
        (filter === 'completed' ? completed : !completed);

      const searchableText = normalizeSearch(`${course.title} ${course.instructor}`);
      const matchesQuery = terms.every(term => searchableText.includes(term));

      return matchesStatus && matchesQuery;
    });
  });

  readonly stats = computed(() => {
    const list = this.courses();
    let inProgress = 0;
    let completedLessons = 0;
    let totalLessons = 0;

    for (const c of list) {
      if (c.totalLessons === 0 || c.completedLessons < c.totalLessons) {
        inProgress++;
      }
      completedLessons += c.completedLessons || 0;
      totalLessons += c.totalLessons || 0;
    }

    const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { inProgress, completedLessons, totalLessons, progress };
  });

  constructor() {
    effect(() => {
      this.accountId();
      untracked(() => this.fetchCourses());
    });
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    if (this.accountId()) this.fetchCourses();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'visible' && this.accountId()) this.fetchCourses();
  }

  fetchCourses(): void {
    this.request?.unsubscribe();
    const accountId = this.accountId();
    this.courses.set([]);
    this.status.set('loading');
    this.request = forkJoin({
      courses: this.courseService.getMyCourses(),
      certs: this.certificateService.getMyCertificates().pipe(catchError(() => of([]))),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ courses, certs }) => {
        if (accountId !== this.accountId()) return;
        const certMap = new Map<string, string>();
        for (const cert of certs) {
          if (cert.code) {
            if (cert.courseId) certMap.set(cert.courseId, cert.code);
            if (cert.courseTitle) {
              certMap.set(cert.courseTitle.trim().toLowerCase(), cert.code);
              certMap.set(normalizeSearch(cert.courseTitle), cert.code);
            }
          }
        }
        this.certificatesMap.set(certMap);
        this.courses.set(courses.data);
        this.status.set('success');

        // Tự động kiểm tra và đồng bộ chứng chỉ cho các khóa đã hoàn thành 100% nhưng chưa cấp
        for (const c of courses.data) {
          if (this.getCoursePercent(c) === 100 && !this.getCertificateCode(c)) {
            this.syncCertificateForCourse(c);
          }
        }
      },
      error: () => {
        if (accountId !== this.accountId()) return;
        this.status.set('error');
      }
    });
  }

  readonly claimingCourseIds = signal<Set<string>>(new Set());

  syncCertificateForCourse(course: EnrolledCourse): void {
    if (this.claimingCourseIds().has(course.id)) return;
    this.claimingCourseIds.update(set => new Set([...set, course.id]));
    this.certificateService.claimCertificate(course.id).pipe(
      catchError(() => of(null))
    ).subscribe({
      next: (res) => {
        this.claimingCourseIds.update(set => {
          const next = new Set(set);
          next.delete(course.id);
          return next;
        });
        if (res?.certificate?.code) {
          this.certificatesMap.update(map => {
            const next = new Map(map);
            next.set(course.id, res.certificate.code);
            next.set(course.title.trim().toLowerCase(), res.certificate.code);
            next.set(normalizeSearch(course.title), res.certificate.code);
            return next;
          });
        }
      },
    });
  }

  getCertificateCode(course: EnrolledCourse): string | null {
    return this.certificatesMap().get(course.id) ||
      this.certificatesMap().get(course.title.trim().toLowerCase()) ||
      this.certificatesMap().get(normalizeSearch(course.title)) ||
      course.certificateCode || null;
  }

  setFilter(filter: 'all' | 'learning' | 'completed'): void {
    this.currentFilter.set(filter);
  }

  applySearch(): void {
    this.searchQuery.set(this.searchInput);
  }

  updateSearch(value: string): void {
    this.searchInput = value;
    this.searchQuery.set(value);
  }

  resetFilterAndSearch(): void {
    this.searchInput = '';
    this.searchQuery.set('');
    this.currentFilter.set('all');
  }

  getCoursePercent(course: EnrolledCourse): number {
    if (!course.totalLessons) return 0;
    if (course.completedLessons === course.totalLessons) return 100;
    return Math.min(99, Math.round((course.completedLessons / course.totalLessons) * 100));
  }

  getThumbnail(course: EnrolledCourse): string | null {
    return [course.thumbnailUrl, course.image]
      .find((url): url is string => !!url && !this.failedThumbnails().has(url)) ?? null;
  }

  onThumbnailError(course: EnrolledCourse): void {
    const url = this.getThumbnail(course);
    if (url) this.failedThumbnails.update(failed => new Set([...failed, url]));
  }
}
