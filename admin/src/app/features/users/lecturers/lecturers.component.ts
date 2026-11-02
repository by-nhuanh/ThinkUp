import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { UserRowMenuItem, UserRowMenuComponent } from '../components/user-row-menu/user-row-menu.component';
import { UserDateRangeComponent } from '../components/user-date-range/user-date-range.component';
import { UserModalComponent } from '../components/user-modal/user-modal.component';
import { UserToastComponent } from '../components/user-toast/user-toast.component';
import { LECTURER_COURSE_OPTIONS, LECTURER_STATUS_LABELS, LECTURER_STATUS_TONE } from '../models/user-management.labels';
import { DisciplineLevel, DisciplineRecord, Lecturer } from '../models/user-management.models';
import { UserManagementService } from '../services/user-management.service';
import { UserToastService } from '../services/user-toast.service';
import { formatCount, formatCurrency, formatDate, formatRevenueShort } from '../user-management.utils';

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
    UserModalComponent,
    UserRowMenuComponent,
    UserToastComponent
  ],
  templateUrl: './lecturers.component.html',
  styleUrls: ['../user-page.css', '../user-modal-content.css', './lecturers.component.css']
})
export class LecturersComponent {
  private readonly data = inject(UserManagementService);
  private readonly toastService = inject(UserToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly lecturers = this.data.lecturers;
  readonly kpis = this.data.lecturerKpis;
  readonly quickStats = this.data.quickStats;
  readonly statusLabels = LECTURER_STATUS_LABELS;
  readonly statusTone = LECTURER_STATUS_TONE;
  readonly pageSize = 5;
  readonly courseOptions = LECTURER_COURSE_OPTIONS;
  readonly formatCurrency = formatCurrency;
  readonly formatCount = formatCount;
  readonly formatDate = formatDate;
  readonly formatRevenueShort = formatRevenueShort;

  readonly searchInput = signal('');
  readonly query = signal('');
  readonly status = signal('');
  readonly legal = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly page = signal(1);

  readonly modal = signal<LecturerModal | null>(null);
  readonly selected = signal<Lecturer | null>(null);

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
    return lecturer ? this.data.coursesForLecturer(lecturer) : [];
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
      return (!query || haystack.includes(query))
        && (!status || item.status === status)
        && (!legal || item.legalStatus === legal)
        && (!from || item.joinedAt >= from)
        && (!to || item.joinedAt <= to);
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

  readonly canSubmitDiscipline = computed(() =>
    this.reason().trim().length >= 15
    && this.evidence().length > 0
    && (this.level() !== 2 || this.disciplineCourses().length > 0));
  readonly canSubmitUnlock = computed(() => this.unlockReason().trim().length >= 10);

  private readonly baseMenuItems: readonly UserRowMenuItem[] = [
    { key: 'profile', label: 'Chi tiết' },
    { key: 'courses', label: 'Khóa học' },
    { key: 'discipline', label: 'Xử lý kỷ luật', danger: true }
  ];

  private readonly pendingMenuItems: readonly UserRowMenuItem[] = [
    { key: 'profile', label: 'Chi tiết' },
    { key: 'courses', label: 'Khóa học' },
    { key: 'verify', label: 'Thẩm định hồ sơ' },
    { key: 'discipline', label: 'Xử lý kỷ luật', danger: true }
  ];

  private readonly unlockMenuItems: readonly UserRowMenuItem[] = [
    { key: 'profile', label: 'Chi tiết' },
    { key: 'courses', label: 'Khóa học' },
    { key: 'discipline', label: 'Xử lý kỷ luật', danger: true },
    { key: 'unlock', label: 'Mở khóa tài khoản' }
  ];

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  menuItemsFor(lecturer: Lecturer): readonly UserRowMenuItem[] {
    if (lecturer.status === 'pending-review' || lecturer.status === 'pending-docs') return this.pendingMenuItems;
    if (lecturer.status === 'warning' || lecturer.status === 'violation' || lecturer.status === 'frozen') return this.unlockMenuItems;
    return this.baseMenuItems;
  }

  onRowAction(key: string, lecturer: Lecturer): void {
    switch (key) {
      case 'profile':
        this.openProfile(lecturer);
        break;
      case 'courses':
        this.openCourses(lecturer);
        break;
      case 'verify':
        this.openVerification(lecturer);
        break;
      case 'discipline':
        this.openDiscipline(lecturer);
        break;
      case 'unlock':
        this.openUnlock(lecturer);
        break;
    }
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

  openVerification(lecturer: Lecturer): void {
    void this.router.navigate(['/users/lecturers', lecturer.id]);
  }

  openProfile(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.modal.set('profile');
  }

  openCourses(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.modal.set('courses');
  }

  openDiscipline(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.level.set(1);
    this.disciplineCourses.set([]);
    this.evidence.set([]);
    this.ticket.set('');
    this.reason.set('');
    this.modal.set('discipline');
  }

  openUnlock(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.unlockReason.set('');
    this.modal.set('unlock');
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

  /** Vi phạm gần nhất của giảng viên — dùng cho dải cảnh báo khi mở khoá. */
  latestViolation(lecturer: Lecturer): DisciplineRecord | undefined {
    return lecturer.violations.length ? lecturer.violations[lecturer.violations.length - 1] : undefined;
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
    this.data.disciplineLecturer(lecturer.id, {
      level: this.level(),
      reason: this.reason().trim(),
      courses: this.disciplineCourses(),
      ticket: this.ticket().trim(),
      evidence: this.evidence()
    });
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
        formatDate(item.joinedAt)
      ])
    ];
    void downloadTable(format, 'thinkup-giang-vien', rows);
    this.notify(`Đang xuất ${this.filtered().length} giảng viên.`);
  }

  notify(message: string): void {
    this.toastService.show(message);
  }
}
