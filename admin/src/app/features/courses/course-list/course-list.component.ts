import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { formatCurrency, formatDate, formatNumber, formatTime, paginationRange } from '../course-utils';
import { Course, CourseLevel, CourseStatus } from '../models/course.models';
import { CourseStore } from '../services/course.store';
import { CourseArchiveDialogComponent, ArchivePayload } from '../components/course-archive-dialog/course-archive-dialog.component';
import { CourseDetailDialogComponent } from '../components/course-detail-dialog/course-detail-dialog.component';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';

const PLATFORM_TOTAL = 1248;

const CATEGORIES = [
  'Frontend Developer', 'Backend Developer', 'Fullstack Developer', 'Mobile Developer',
  'Software Tester', 'Quality Assurance', 'Business Analyst', 'Project Manager',
  'Product Owner', 'DevOps Engineer', 'Cloud Engineer', 'Data Analyst',
  'Data Engineer', 'Data Scientist', 'Artificial Intelligence', 'Product Designer',
  'ERP Consultant', 'System Analyst', 'Security Engineer'
];

type RangeKey = '' | '7' | '30' | '90';

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [
    RouterLink,
    SearchFieldComponent,
    CustomSelectComponent,
    ExportMenuComponent,
    CourseDetailDialogComponent,
    CourseArchiveDialogComponent,
    CourseToastComponent
  ],
  templateUrl: './course-list.component.html',
  styleUrl: '../courses-page.css'
})
export class CourseListComponent {
  private readonly store = inject(CourseStore);
  private readonly router = inject(Router);

  readonly loadError = this.store.loadError;
  readonly courses = this.store.courses;

  readonly search = signal('');
  readonly category = signal('');
  readonly level = signal('');
  readonly status = signal<'' | CourseStatus>('');
  readonly createdRange = signal<RangeKey>('');
  readonly page = signal(1);
  readonly pageSize = 200;
  readonly detailId = signal<string | null>(null);
  readonly archiveId = signal<string | null>(null);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  readonly totals = { total: PLATFORM_TOTAL, published: 980, pending: 36, archived: 232 };

  readonly categoryOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả danh mục' },
    ...CATEGORIES.map(label => ({ value: label, label }))
  ];
  readonly levelOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả cấp độ' },
    { value: 'Cơ bản', label: 'Cơ bản' },
    { value: 'Trung cấp', label: 'Trung cấp' },
    { value: 'Nâng cao', label: 'Nâng cao' }
  ];
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'published', label: 'Đang bán' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'hidden', label: 'Tạm ẩn' },
    { value: 'archived', label: 'Đã lưu trữ' }
  ];
  readonly rangeOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả thời gian' },
    { value: '7', label: '7 ngày gần đây' },
    { value: '30', label: '30 ngày gần đây' },
    { value: '90', label: '90 ngày gần đây' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.category();
    const level = this.level();
    const status = this.status();
    const days = Number(this.createdRange());
    const cutoff = days ? Date.now() - days * 86_400_000 : 0;
    return this.courses().filter(item => {
      const matches = !term
        || item.id.toLowerCase().includes(term)
        || item.title.toLowerCase().includes(term)
        || item.instructor.toLowerCase().includes(term);
      const recent = !cutoff || Date.parse(item.createdAt) >= cutoff;
      return matches && recent
        && (!category || item.category === category)
        && (!level || item.level === level)
        && (!status || item.status === status);
    });
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.resultTotal() / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly hasFilters = computed(() => Boolean(
    this.search() || this.category() || this.level() || this.status() || this.createdRange()
  ));
  readonly resultTotal = computed(() => this.hasFilters() ? this.filtered().length : PLATFORM_TOTAL);
  readonly rangeLabel = computed(() => {
    const total = this.resultTotal();
    const shown = this.visible().length;
    if (!total || !shown) return 'Không có khóa học nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start}–${start + shown - 1} trong ${formatNumber(total)} khóa học`;
  });
  readonly detail = computed(() => this.courses().find(item => item.id === this.detailId()) ?? null);
  readonly archiveTarget = computed(() => this.courses().find(item => item.id === this.archiveId()) ?? null);

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setCategory(value: string): void { this.category.set(value); this.page.set(1); }
  setLevel(value: string): void { this.level.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value as '' | CourseStatus); this.page.set(1); }
  setRange(value: string): void { this.createdRange.set(value as RangeKey); this.page.set(1); }

  resetFilters(): void {
    this.search.set('');
    this.category.set('');
    this.level.set('');
    this.status.set('');
    this.createdRange.set('');
    this.page.set(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
  }

  onPage(item: number | '...'): void {
    if (typeof item === 'number') this.goToPage(item);
  }

  openDetail(item: Course): void {
    this.detailId.set(item.id);
  }

  closeDetail(): void {
    this.detailId.set(null);
  }

  openArchive(item: Course): void {
    this.archiveId.set(item.id);
  }

  closeArchive(): void {
    this.archiveId.set(null);
  }

  confirmArchive(payload: ArchivePayload): void {
    const target = this.archiveTarget();
    if (!target) return;
    this.store.archiveCourse(target.id, payload.reason, payload.explanation);
    this.archiveId.set(null);
    this.detailId.set(null);
    this.notify(`Đã lưu trữ khóa học ${target.id}.`, 'success');
  }

  inspectCourse(item: Course): void {
    if (item.status === 'pending') {
      void this.router.navigate(['/courses/approvals']);
      return;
    }
    this.openDetail(item);
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.resultTotal()} khóa học.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.resultTotal()} khóa học ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  statusText(status: CourseStatus): string {
    return status === 'published' ? 'Đang xuất bản'
      : status === 'pending' ? 'Chờ duyệt'
      : status === 'hidden' ? 'Tạm ẩn'
      : 'Đã lưu trữ';
  }

  statusTone(status: CourseStatus): string {
    return status === 'published' ? 'success'
      : status === 'pending' ? 'pending'
      : status === 'hidden' ? 'warning'
      : 'neutral';
  }

  levelText(level: CourseLevel): string { return level; }
  levelTone(level: CourseLevel): string {
    return level === 'Cơ bản' ? 'info' : level === 'Trung cấp' ? 'pending' : 'danger';
  }

  canArchive(status: CourseStatus): boolean {
    return status === 'published' || status === 'hidden';
  }

  money = formatCurrency;
  number = formatNumber;
  date = formatDate;
  time = formatTime;
}
