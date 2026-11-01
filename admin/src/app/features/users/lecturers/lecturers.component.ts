import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  LECTURER_COURSE_OPTIONS,
  LECTURER_STATUS_LABELS,
  LECTURER_STATUS_TONE,
  USER_MODULE_QUICK_STATS,
  coursesForLecturer
} from '../../../core/data/mock/user-management.mock';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { UserDateRangeComponent } from '../components/user-date-range/user-date-range.component';
import { UserModalComponent } from '../components/user-modal/user-modal.component';
import { DisciplineLevel, Lecturer } from '../models/user-management.models';
import { UserManagementService } from '../services/user-management.service';
import { formatCount, formatCurrency, formatRevenueShort, toIsoDate } from '../user-management.utils';

type LecturerModal = 'profile' | 'courses' | 'discipline' | 'unlock';

/**
 * Danh sách giảng viên — frame Figma "Quản lý giảng viên" (node 5224:18503).
 * KPI, thanh lọc, bảng 8 cột, menu thao tác theo dòng và 4 hộp thoại nghiệp vụ.
 */
@Component({
  selector: 'app-lecturers',
  standalone: true,
  imports: [
    SearchFieldComponent,
    CustomSelectComponent,
    ExportMenuComponent,
    UserDateRangeComponent,
    UserModalComponent
  ],
  templateUrl: './lecturers.component.html',
  styleUrls: ['../user-page.css', '../user-modal-content.css', './lecturers.component.css']
})
export class LecturersComponent {
  private readonly data = inject(UserManagementService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private searchTimer?: ReturnType<typeof setTimeout>;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly lecturers = this.data.lecturers;
  readonly kpis = this.data.lecturerKpis;
  readonly quickStats = USER_MODULE_QUICK_STATS;
  readonly statusLabels = LECTURER_STATUS_LABELS;
  readonly statusTone = LECTURER_STATUS_TONE;
  readonly pageSize = 5;
  readonly courseOptions = LECTURER_COURSE_OPTIONS;
  readonly formatCurrency = formatCurrency;
  readonly formatCount = formatCount;
  readonly formatRevenueShort = formatRevenueShort;

  readonly searchInput = signal('');
  readonly query = signal('');
  readonly status = signal('');
  readonly legal = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly page = signal(1);

  readonly menu = signal<{ id: string; left: number; top: number } | null>(null);
  readonly modal = signal<LecturerModal | null>(null);
  readonly selected = signal<Lecturer | null>(null);
  readonly toast = signal('');

  readonly level = signal<DisciplineLevel>(1);
  readonly disciplineCourses = signal<readonly string[]>([]);
  readonly evidence = signal<readonly string[]>([]);
  readonly ticket = signal('');
  readonly reason = signal('');
  readonly unlockReason = signal('');

  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả trạng thái' },
    ...(Object.keys(LECTURER_STATUS_LABELS) as Array<keyof typeof LECTURER_STATUS_LABELS>)
      .map((value) => ({ value, label: LECTURER_STATUS_LABELS[value] }))
  ];

  readonly legalOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả pháp lý' },
    { value: 'signed', label: 'Đã ký hợp đồng điện tử' },
    { value: 'incomplete', label: 'Chưa hoàn tất hợp đồng' }
  ];

  readonly totalCourses = computed(() => this.lecturers().reduce((sum, item) => sum + item.courses, 0));
  readonly activePercent = computed(() => {
    const kpi = this.kpis();
    return kpi.total ? Math.round((kpi.active / kpi.total) * 100) : 0;
  });

  readonly selectedCourses = computed(() => {
    const lecturer = this.selected();
    return lecturer ? coursesForLecturer(lecturer) : [];
  });

  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('vi-VN');
    const status = this.status();
    const legal = this.legal();
    const from = this.from();
    const to = this.to();

    return this.lecturers().filter((item) => {
      const haystack = [item.name, item.email, item.phone, item.id, item.specialty, item.kyc.taxCode]
        .join(' ')
        .toLocaleLowerCase('vi-VN');
      const joined = toIsoDate(item.joinedAt);
      return (!query || haystack.includes(query))
        && (!status || item.status === status)
        && (!legal || item.legalStatus === legal)
        && (!from || joined >= from)
        && (!to || joined <= to);
    });
  });

  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pages()));
  readonly visible = computed(() => {
    const page = this.currentPage();
    return this.filtered().slice((page - 1) * this.pageSize, page * this.pageSize);
  });
  readonly rangeStart = computed(() => (this.filtered().length ? (this.currentPage() - 1) * this.pageSize + 1 : 0));
  readonly rangeEnd = computed(() => Math.min(this.currentPage() * this.pageSize, this.filtered().length));

  readonly pageItems = computed<Array<number | 'gap'>>(() => {
    const total = this.pages();
    const current = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    if (current <= 3) return [1, 2, 3, 'gap', total];
    if (current >= total - 2) return [1, 'gap', total - 2, total - 1, total];
    return [1, 'gap', current, 'gap', total];
  });

  readonly canSubmitDiscipline = computed(() => this.reason().trim().length >= 15 && this.evidence().length > 0);
  readonly canSubmitUnlock = computed(() => this.unlockReason().trim().length >= 10);

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.searchTimer);
      clearTimeout(this.toastTimer);
    });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menu.set(null);
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  closeMenuOnViewportChange(): void {
    if (this.menu()) this.menu.set(null);
  }

  setSearch(value: string): void {
    this.searchInput.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.query.set(value);
      this.page.set(1);
    }, 250);
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
  }

  setLegal(value: string): void {
    this.legal.set(value);
    this.page.set(1);
  }

  setRange(range: { from: string; to: string }): void {
    this.from.set(range.from);
    this.to.set(range.to);
    this.page.set(1);
  }

  hasActiveFilters(): boolean {
    return !!(this.query() || this.status() || this.legal() || this.from() || this.to());
  }

  resetFilters(): void {
    clearTimeout(this.searchTimer);
    this.searchInput.set('');
    this.query.set('');
    this.status.set('');
    this.legal.set('');
    this.from.set('');
    this.to.set('');
    this.page.set(1);
  }

  pageTo(value: number): void {
    this.page.set(Math.max(1, Math.min(this.pages(), value)));
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    if (this.menu()?.id === id) {
      this.menu.set(null);
      return;
    }

    // Menu dùng position: fixed để không bị cắt bởi vùng cuộn ngang của bảng.
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const width = 210;
    const height = 4 * 38 + 14;
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const openAbove = rect.bottom + 6 + height > window.innerHeight - 12;
    const top = openAbove ? Math.max(12, rect.top - 6 - height) : rect.bottom + 6;
    this.menu.set({ id, left, top });
  }

  openVerification(lecturer: Lecturer): void {
    this.menu.set(null);
    void this.router.navigate(['/users/lecturers', lecturer.id]);
  }

  openProfile(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.modal.set('profile');
    this.menu.set(null);
  }

  openCourses(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.modal.set('courses');
    this.menu.set(null);
  }

  openDiscipline(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.level.set(1);
    this.disciplineCourses.set([]);
    this.evidence.set([]);
    this.ticket.set('');
    this.reason.set('');
    this.modal.set('discipline');
    this.menu.set(null);
  }

  openUnlock(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.unlockReason.set('');
    this.modal.set('unlock');
    this.menu.set(null);
  }

  closeModal(): void {
    this.modal.set(null);
    this.selected.set(null);
  }

  setLevel(level: DisciplineLevel): void {
    this.level.set(level);
    if (level !== 2) this.disciplineCourses.set([]);
  }

  toggleCourse(name: string, checked: boolean): void {
    this.disciplineCourses.update((current) => (checked
      ? [...current, name]
      : current.filter((item) => item !== name)));
  }

  isCourseSelected(name: string): boolean {
    return this.disciplineCourses().includes(name);
  }

  toggleCourseFromEvent(name: string, event: Event): void {
    this.toggleCourse(name, (event.target as HTMLInputElement).checked);
  }

  setTicketFromEvent(event: Event): void {
    this.ticket.set((event.target as HTMLInputElement).value);
  }

  setReasonFromEvent(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  setUnlockReasonFromEvent(event: Event): void {
    this.unlockReason.set((event.target as HTMLTextAreaElement).value);
  }

  onEvidenceChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const names = Array.from(input.files ?? []).map((file) => file.name).slice(0, 5);
    this.evidence.set(names);
    this.notify(names.length ? `Đã chọn ${names.length} tệp bằng chứng.` : 'Chưa chọn tệp bằng chứng.');
  }

  submitDiscipline(): void {
    const lecturer = this.selected();
    if (!lecturer || !this.canSubmitDiscipline()) return;
    this.data.disciplineLecturer(lecturer.id, this.level(), this.reason().trim(), this.disciplineCourses());
    this.modal.set(null);
    this.selected.set(null);
    this.notify(`Đã áp dụng kỷ luật cho ${lecturer.name}.`);
  }

  submitUnlock(): void {
    const lecturer = this.selected();
    if (!lecturer || !this.canSubmitUnlock()) return;
    this.data.unlockLecturer(lecturer.id);
    this.modal.set(null);
    this.selected.set(null);
    this.notify(`Đã mở khoá tài khoản ${lecturer.name}.`);
  }

  exportList(format: ExportFormat): void {
    const rows: Array<Array<string | number>> = [
      ['Mã giảng viên', 'Họ tên', 'Email', 'Số điện thoại', 'Chuyên môn', 'Khóa học', 'Học viên', 'Doanh thu', 'Pháp lý', 'Trạng thái', 'Tham gia'],
      ...this.filtered().map((item) => [
        item.id,
        item.name,
        item.email,
        item.phone,
        item.specialty,
        item.courses,
        item.learners,
        item.revenue,
        item.legalStatus === 'signed' ? 'Đã ký hợp đồng điện tử' : 'Chưa hoàn tất hợp đồng',
        LECTURER_STATUS_LABELS[item.status],
        item.joinedAt
      ])
    ];
    void downloadTable(format, 'thinkup-giang-vien', rows);
    this.notify(`Đang xuất ${this.filtered().length} giảng viên.`);
  }

  notify(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3200);
  }
}
