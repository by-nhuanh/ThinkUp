import { Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, NUMBER_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { ExportFormat } from '../../../shared/utils/export-formats';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { AdminNumberPipe } from '../../../shared/pipes/admin-number.pipe';
import { AdminPrivacyPipe } from '../../../shared/pipes/admin-privacy.pipe';
import { UserRowMenuItem, UserRowMenuComponent } from '../components/user-row-menu/user-row-menu.component';
import { UserDateRangeComponent } from '../components/user-date-range/user-date-range.component';
import { UserModalComponent } from '../components/user-modal/user-modal.component';
import { UserToastComponent } from '../components/user-toast/user-toast.component';
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_TONE } from '../models/user-management.labels';
import { DisciplineLevel, Student } from '../models/user-management.models';
import { UserManagementService } from '../services/user-management.service';
import { UserToastService } from '../services/user-toast.service';
import {
  formatCount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDeadline,
  formatDeadlineLong,
  lockDeadlineIso
} from '../user-management.utils';

type StudentModal = 'profile' | 'lock' | 'unlock';
type StudentColumn = 'name' | 'status' | 'courses' | 'registered';

/** Giá trị lọc của cột "Số lượng khóa học" — khớp nhóm đang dùng ở thanh lọc. */
const COURSE_COUNT_FILTER_VALUES: ReadonlyArray<{ filter: string; label: string }> = [
  { filter: 'none', label: 'Chưa mua khóa học nào' },
  { filter: '1-3', label: 'Đã mua 1 đến 3 khóa' },
  { filter: 'more', label: 'Đã mua trên 3 khóa' }
];

/** Nhóm số khóa học của một học viên — dùng chung cho thanh lọc và bộ lọc cột. */
function courseCountBucket(count: number): string {
  if (count === 0) return 'none';
  return count <= 3 ? '1-3' : 'more';
}

/** Các mốc thời gian đăng ký — giá trị lọc của cột "Ngày đăng ký". */
const REGISTERED_FILTER_VALUES: readonly ColumnFilterValue[] = [
  { value: '30', label: 'Trong 30 ngày gần nhất' },
  { value: '90', label: 'Trong 90 ngày gần nhất' },
  { value: '365', label: 'Trong 12 tháng gần nhất' },
  { value: 'older', label: 'Trên 12 tháng trước' }
];

/** Nhãn + thời hạn của từng mức kỷ luật trong hộp thoại khoá tài khoản học viên. */
const LEVELS: ReadonlyArray<{ level: DisciplineLevel; title: string; tag: string; description: string; days: number | null }> = [
  {
    level: 1,
    title: 'Mức 1 · Cảnh cáo vi phạm nhẹ',
    tag: 'Tạm khóa 7 ngày',
    description: 'Áp dụng cho spam bình luận, quấy rối thảo luận hoặc học viên gây mất trật tự phòng học ảo.',
    days: 7
  },
  {
    level: 2,
    title: 'Mức 2 · Đình chỉ có thời hạn',
    tag: 'Tạm khóa 30 ngày',
    description: 'Áp dụng khi chia sẻ tài khoản cho nhiều người dùng chung hoặc gian lận làm bài kiểm tra.',
    days: 30
  },
  {
    level: 3,
    title: 'Mức 3 · Khóa vĩnh viễn',
    tag: 'Vô thời hạn',
    description: 'Áp dụng khi gian lận thanh toán, can thiệp mã nguồn/hack testcase phòng Lab hoặc phát tán mã độc.',
    days: null
  }
];

/**
 * Danh sách học viên — frame Figma "Quản lý học viên" (node 5541:17828).
 * Bảng có chọn nhiều dòng để khoá tài khoản hàng loạt.
 */
@Component({
  selector: 'app-students',
  standalone: true,
  imports: [
    SearchFieldComponent,
    CustomSelectComponent,
    ColumnFilterComponent,
    BulkSelectionDialogComponent,
    SelectionBarComponent,
    ExportMenuComponent,
    UserDateRangeComponent,
    UserModalComponent,
    UserRowMenuComponent,
    UserToastComponent,
    AdminNumberPipe,
    AdminPrivacyPipe
  ],
  templateUrl: './students.component.html',
  styleUrls: ['../user-page.css', '../user-modal-content.css', './students.component.css']
})
export class StudentsComponent {
  private readonly data = inject(UserManagementService);
  private readonly toastService = inject(UserToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly students = this.data.students;
  readonly kpis = this.data.studentKpis;
  readonly statusLabels = STUDENT_STATUS_LABELS;
  readonly statusTone = STUDENT_STATUS_TONE;
  readonly levels = LEVELS;
  private readonly pageSizeService = inject(AdminPageSizeService);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  /** Menu xuất chỉ mời CSV vì API người dùng chưa trả Excel (xem `exportList`). */
  readonly csvOnly: ReadonlyArray<ExportFormat> = ['csv'];
  readonly formatCount = formatCount;
  readonly formatCurrency = formatCurrency;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;

  readonly searchInput = signal('');
  readonly query = signal('');
  readonly status = signal('');
  readonly courseCount = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly page = signal(1);
  private readonly columnFilters: Record<StudentColumn, WritableSignal<string[]>> = {
    name: signal<string[]>([]),
    status: signal<string[]>([]),
    courses: signal<string[]>([]),
    registered: signal<string[]>([])
  };

  readonly modal = signal<StudentModal | null>(null);
  readonly selected = signal<Student | null>(null);
  readonly selection = signal<ReadonlyArray<string>>([]);
  readonly selectionListOpen = signal(false);
  readonly bulkLockIds = signal<readonly string[] | null>(null);

  readonly level = signal<DisciplineLevel>(1);
  readonly reason = signal('');
  readonly evidenceFiles = signal<readonly File[]>([]);
  readonly evidence = computed(() => this.evidenceFiles().map((file) => file.name));
  readonly unlockReason = signal('');
  readonly saving = signal(false);
  readonly loadError = this.data.error;
  readonly loading = this.data.loading;
  readonly showAllCourses = signal(false);
  readonly showAllViolations = signal(false);

  /** Số dòng xem trước trước khi bấm "Xem tất cả" trong hồ sơ học viên. */
  readonly coursePreview = 2;
  readonly violationPreview = 2;

  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'active', label: 'Đang hoạt động' },
    { value: 'locked', label: 'Đang bị khóa' },
    { value: 'inactive', label: 'Tạm ngưng' }
  ];

  readonly courseCountOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả số lượng' },
    { value: 'none', label: 'Chưa mua khóa học nào' },
    { value: '1-3', label: 'Đã mua 1 đến 3 khóa' },
    { value: 'more', label: 'Đã mua trên 3 khóa' }
  ];

  readonly nameValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.students().map((student) => student.name))].map((name) => ({ value: name, label: name })));
  readonly statusValues: readonly ColumnFilterValue[] = this.statusOptions
    .filter((option) => option.value)
    .map((option) => ({ value: option.value, label: option.label }));
  readonly coursesValues: readonly ColumnFilterValue[] = COURSE_COUNT_FILTER_VALUES
    .map((option) => ({ value: option.filter, label: option.label }));
  readonly registeredValues = REGISTERED_FILTER_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly numberSorts = NUMBER_SORT_OPTIONS;
  readonly columnSort = signal<{ column: StudentColumn; direction: 'asc' | 'desc' } | null>(null);

  readonly activePercent = computed(() => {
    const kpi = this.kpis();
    return kpi.total ? Math.round((kpi.active / kpi.total) * 100) : 0;
  });

  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('vi-VN');
    const status = this.status();
    const courseCount = this.courseCount();
    const from = this.from();
    const to = this.to();
    const names = this.columnFilters.name();
    const statuses = this.columnFilters.status();
    const courseBuckets = this.columnFilters.courses();
    const registered = this.columnFilters.registered();
    // Mốc thời gian của bộ lọc cột "Ngày đăng ký", tính lùi từ ngày hiện tại.
    const daysAgo = (days: number): string =>
      new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const items = this.students().filter((item) => {
      const haystack = [item.id, item.name, item.email, item.phone].join(' ').toLocaleLowerCase('vi-VN');
      const courseOk = !courseCount
        || (courseCount === 'none' && item.courseCount === 0)
        || (courseCount === '1-3' && item.courseCount >= 1 && item.courseCount <= 3)
        || (courseCount === 'more' && item.courseCount > 3);
      const registeredOk = !registered.length || registered.some((bucket) => bucket === 'older'
        ? item.registeredAt < daysAgo(365)
        : item.registeredAt >= daysAgo(Number(bucket)));
      return (!query || haystack.includes(query))
        && (!names.length || names.includes(item.name))
        && (!status || item.status === status)
        && courseOk
        && (!from || item.registeredAt >= from)
        && (!to || item.registeredAt <= to)
        && (!statuses.length || statuses.includes(item.status))
        && (!courseBuckets.length || courseBuckets.includes(courseCountBucket(item.courseCount)))
        && registeredOk;
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
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

  /** Toàn bộ dòng của trang hiện tại đã được chọn. */
  readonly allVisibleSelected = computed(() => {
    const visible = this.visible();
    return visible.length > 0 && visible.every((item) => this.selection().includes(item.id));
  });

  /** Chọn một phần dòng trên trang — dùng cho trạng thái indeterminate của checkbox tổng. */
  readonly someVisibleSelected = computed(() => {
    const visible = this.visible();
    return !this.allVisibleSelected() && visible.some((item) => this.selection().includes(item.id));
  });

  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.students()
    .filter((item) => this.selection().includes(item.id))
    .map((item) => ({ id: item.id, label: item.name, detail: item.email })));

  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter((item) => !this.selection().includes(item.id))
    .map((item) => ({ id: item.id, label: item.name, detail: item.email })));

  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'lock', label: 'Khóa tài khoản', tone: 'danger' }
  ]);

  readonly lockTargets = computed(() => {
    const selected = this.selected();
    return selected ? [selected.id] : (this.bulkLockIds() ?? this.selection());
  });

  readonly lockSubjectLabel = computed(() => {
    const selected = this.selected();
    if (selected) return selected.name;
    const count = this.lockTargets().length;
    return count > 1 ? `${count} học viên đã chọn` : '1 học viên đã chọn';
  });

  readonly levelDays = computed(() => LEVELS.find((item) => item.level === this.level())?.days ?? null);

  readonly canSubmitLock = computed(() => this.reason().trim().length >= 10 && this.evidence().length > 0);
  readonly canSubmitUnlock = computed(() => this.unlockReason().trim().length >= 10);

  readonly visibleCourses = computed(() => {
    const courses = this.selected()?.enrolledCourses ?? [];
    return this.showAllCourses() ? courses : courses.slice(0, this.coursePreview);
  });

  readonly hasMoreCourses = computed(() => (this.selected()?.enrolledCourses.length ?? 0) > this.coursePreview);

  readonly visibleViolations = computed(() => {
    const violations = this.selected()?.violations ?? [];
    return this.showAllViolations() ? violations : violations.slice(0, this.violationPreview);
  });

  readonly hasMoreViolations = computed(() => (this.selected()?.violations.length ?? 0) > this.violationPreview);

  private readonly baseMenuItems: readonly UserRowMenuItem[] = [
    { key: 'profile', label: 'Chi tiết' },
    { key: 'orders', label: 'Đơn hàng' },
    { key: 'lock', label: 'Xử lý kỷ luật', danger: true }
  ];

  private readonly lockedMenuItems: readonly UserRowMenuItem[] = [
    { key: 'profile', label: 'Chi tiết' },
    { key: 'orders', label: 'Đơn hàng' },
    { key: 'unlock', label: 'Mở khóa tài khoản' },
    { key: 'lock', label: 'Xử lý kỷ luật', danger: true }
  ];

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  menuItemsFor(student: Student): readonly UserRowMenuItem[] {
    return student.status === 'locked' ? this.lockedMenuItems : this.baseMenuItems;
  }

  onRowAction(key: string, student: Student): void {
    switch (key) {
      case 'profile':
        this.openProfile(student);
        break;
      case 'orders':
        this.openOrders(student);
        break;
      case 'lock':
        this.openLock(student);
        break;
      case 'unlock':
        this.openUnlock(student);
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

  setCourseCount(value: string): void {
    this.courseCount.set(value);
    this.page.set(1);
  }

  setRange(range: { from: string; to: string }): void {
    this.from.set(range.from);
    this.to.set(range.to);
    this.page.set(1);
  }

  hasActiveFilters(): boolean {
    return !!(this.query() || this.status() || this.courseCount() || this.from() || this.to())
      || (Object.keys(this.columnFilters) as StudentColumn[]).some((key) => this.columnFilters[key]().length > 0);
  }

  resetFilters(): void {
    clearTimeout(this.searchTimer);
    this.searchInput.set('');
    this.query.set('');
    this.status.set('');
    this.courseCount.set('');
    this.from.set('');
    this.to.set('');
    this.columnSort.set(null);
    this.clearColumnFilters();
    this.page.set(1);
  }

  filterFor(key: StudentColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: StudentColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    // Dòng đã chọn có thể không còn hiển thị sau khi lọc — bỏ chọn để tránh khoá nhầm.
    this.selection.set([]);
    this.page.set(1);
  }

  private clearColumnFilters(): void {
    (Object.keys(this.columnFilters) as StudentColumn[]).forEach((key) => this.columnFilters[key].set([]));
  }

  sortFor(key: StudentColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: StudentColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: Student, column: StudentColumn): string | number {
    switch (column) {
      case 'name': return item.name;
      case 'status': return STUDENT_STATUS_LABELS[item.status];
      case 'courses': return item.courseCount;
      case 'registered': return Date.parse(item.registeredAt);
    }
  }

  pageTo(value: number): void {
    this.page.set(Math.max(1, Math.min(this.pages(), value)));
  }

  isSelected(id: string): boolean {
    return this.selection().includes(id);
  }

  toggleRow(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selection.update((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }

  toggleAllVisible(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const ids = this.visible().map((item) => item.id);
    this.selection.update((current) => (checked
      ? Array.from(new Set([...current, ...ids]))
      : current.filter((id) => !ids.includes(id))));
  }

  clearSelection(): void {
    this.selection.set([]);
  }

  setSelectionIds(ids: string[]): void {
    this.selection.set(ids);
  }

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    if (key !== 'lock') return;
    this.bulkLockIds.set(ids ?? this.selection());
    this.openBulkLock();
  }

  openProfile(student: Student): void {
    this.selected.set(student);
    this.showAllCourses.set(false);
    this.showAllViolations.set(false);
    this.modal.set('profile');
    // Danh sách chỉ có số liệu tổng hợp; tải chi tiết để có khóa học, đơn hàng và lịch sử kỷ luật.
    void this.data.loadStudentDetail(student.id)
      .then((detail) => {
        if (detail && this.modal() === 'profile' && this.selected()?.id === student.id) this.selected.set(detail);
      })
      .catch((error: unknown) => this.notify(error instanceof Error ? error.message : 'Không tải được hồ sơ học viên.'));
  }

  toggleAllCourses(): void {
    this.showAllCourses.update((value) => !value);
  }

  toggleAllViolations(): void {
    this.showAllViolations.update((value) => !value);
  }

  /** Mở trang Đơn hàng đã lọc sẵn theo email học viên. */
  openOrders(student: Student): void {
    void this.router.navigate(['/business/orders'], { queryParams: { q: student.email } });
  }

  openLock(student: Student): void {
    this.selected.set(student);
    this.level.set(1);
    this.reason.set('');
    this.evidenceFiles.set([]);
    this.modal.set('lock');
  }

  openBulkLock(): void {
    this.selected.set(null);
    this.level.set(1);
    this.reason.set('');
    this.evidenceFiles.set([]);
    this.modal.set('lock');
  }

  openUnlock(student: Student): void {
    this.selected.set(student);
    this.unlockReason.set('');
    this.modal.set('unlock');
  }

  closeModal(): void {
    this.modal.set(null);
    this.selected.set(null);
    this.bulkLockIds.set(null);
  }

  setLevel(level: DisciplineLevel): void {
    this.level.set(level);
  }

  /** Hạn khoá tương ứng từng mức, dùng chung cho thẻ chọn mức và banner nhắc. */
  deadlineLabel(days: number | null): string {
    const deadline = lockDeadlineIso(days);
    return deadline
      ? `Tài khoản sẽ bị khóa tới ${formatDeadline(deadline)}.`
      : 'Tài khoản sẽ bị khóa vĩnh viễn.';
  }

  /** Hạn khoá đang lưu trên hồ sơ học viên. */
  lockExpiryLabel(student: Student): string {
    return student.lockedUntil
      ? `Hết hạn: ${formatDeadlineLong(student.lockedUntil)}`
      : 'Khóa vĩnh viễn, không có ngày hết hạn.';
  }

  setReasonFromEvent(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  setUnlockReasonFromEvent(event: Event): void {
    this.unlockReason.set((event.target as HTMLTextAreaElement).value);
  }

  onEvidenceChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, 5);
    this.evidenceFiles.set(files);
    this.notify(files.length ? `Đã chọn ${files.length} tệp bằng chứng.` : 'Chưa chọn tệp bằng chứng.');
  }

  async submitLock(): Promise<void> {
    if (!this.canSubmitLock() || this.saving()) return;
    const targets = this.lockTargets();
    if (!targets.length) return;
    this.saving.set(true);
    try {
      const affected = await this.data.lockStudents({
        ids: targets,
        level: this.level(),
        reason: this.reason().trim(),
        files: this.evidenceFiles()
      });
      this.selection.set([]);
      this.bulkLockIds.set(null);
      this.modal.set(null);
      this.selected.set(null);
      this.notify(`Đã khóa ${affected} tài khoản học viên.`);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Không khóa được tài khoản học viên.');
    } finally {
      this.saving.set(false);
    }
  }

  async submitUnlock(): Promise<void> {
    const student = this.selected();
    if (!student || !this.canSubmitUnlock() || this.saving()) return;
    this.saving.set(true);
    try {
      await this.data.unlockStudent(student.id, this.unlockReason().trim());
      this.modal.set(null);
      this.selected.set(null);
      this.notify(`Đã mở khoá tài khoản ${student.name}.`);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Không mở khoá được tài khoản.');
    } finally {
      this.saving.set(false);
    }
  }

  async exportList(format: ExportFormat): Promise<void> {
    try {
      await this.data.exportList('students', format, {
        q: this.query(),
        status: this.status(),
        courseCount: this.courseCount(),
        from: this.from(),
        to: this.to()
      });
      this.notify('Đã tải tệp học viên từ máy chủ.');
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Không xuất được danh sách học viên.');
    }
  }

  retryLoad(): void {
    void this.data.reload();
  }

  notify(message: string): void {
    this.toastService.show(message);
  }
}
