import { Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { ExportFormat } from '../../../shared/utils/export-formats';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { AdminNumberPipe } from '../../../shared/pipes/admin-number.pipe';
import { AdminPrivacyPipe } from '../../../shared/pipes/admin-privacy.pipe';
import { UserRowMenuItem, UserRowMenuComponent } from '../components/user-row-menu/user-row-menu.component';
import { UserDateRangeComponent } from '../components/user-date-range/user-date-range.component';
import { UserModalComponent } from '../components/user-modal/user-modal.component';
import { UserToastComponent } from '../components/user-toast/user-toast.component';
import { LECTURER_STATUS_LABELS, LECTURER_STATUS_TONE } from '../models/user-management.labels';
import { DisciplineLevel, Lecturer } from '../models/user-management.models';
import { UserManagementService } from '../services/user-management.service';
import { UserToastService } from '../services/user-toast.service';
import { formatCount, formatCurrency, formatDate, formatDeadline, formatRevenueShort } from '../user-management.utils';

type LecturerModal = 'profile' | 'courses' | 'discipline' | 'unlock';
type LecturerColumn = 'name' | 'specialty' | 'legal' | 'tax' | 'joined' | 'status';

/** Tháng tham gia — giá trị lọc của bộ lọc cột "Thời gian tham gia". */
const JOINED_FILTER_VALUES: readonly ColumnFilterValue[] = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
].map((label, index) => ({ value: String(index + 1).padStart(2, '0'), label }));

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
    ColumnFilterComponent,
    ExportMenuComponent,
    SelectionBarComponent,
    BulkSelectionDialogComponent,
    UserDateRangeComponent,
    UserModalComponent,
    UserRowMenuComponent,
    UserToastComponent,
    AdminNumberPipe,
    AdminPrivacyPipe
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
  private readonly pageSizeService = inject(AdminPageSizeService);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  /** Menu xuất chỉ mời CSV vì API người dùng chưa trả Excel (xem `exportList`). */
  readonly csvOnly: ReadonlyArray<ExportFormat> = ['csv'];
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
  private readonly columnFilters: Record<LecturerColumn, WritableSignal<string[]>> = {
    name: signal<string[]>([]),
    specialty: signal<string[]>([]),
    legal: signal<string[]>([]),
    tax: signal<string[]>([]),
    joined: signal<string[]>([]),
    status: signal<string[]>([])
  };

  readonly modal = signal<LecturerModal | null>(null);
  readonly selected = signal<Lecturer | null>(null);

  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkConfirm = signal<{ key: 'suspend' | 'lock'; ids: readonly string[] } | null>(null);

  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every((item) => chosen.has(item.id));
  });
  readonly someVisibleSelected = computed(() =>
    !this.allVisibleSelected() && this.visible().some((item) => this.selection().has(item.id)));
  private readonly selectedLecturers = computed(() =>
    this.lecturers().filter((item) => this.selection().has(item.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() =>
    this.selectedLecturers().map((item) => ({ id: item.id, label: item.name, detail: item.email })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() =>
    this.filtered()
      .filter((item) => !this.selection().has(item.id))
      .map((item) => ({ id: item.id, label: item.name, detail: item.email })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => {
    const pending = this.selectedLecturers()
      .filter((item) => item.status === 'pending-review' || item.status === 'pending-docs').length;
    return [
      {
        key: 'approve',
        label: 'Duyệt hồ sơ',
        tone: 'primary',
        disabled: !pending,
        title: pending ? `Duyệt ${pending} hồ sơ đang chờ` : 'Chỉ áp dụng cho hồ sơ chờ thẩm định hoặc chờ bổ sung'
      },
      { key: 'suspend', label: 'Tạm ngưng', title: 'Kỷ luật Mức 1 — cảnh cáo và hạn chế 7 ngày' },
      { key: 'lock', label: 'Khóa tài khoản', tone: 'danger', title: 'Kỷ luật Mức 3 — đóng băng dòng tiền và khóa đăng nhập' }
    ];
  });

  readonly level = signal<DisciplineLevel>(1);
  readonly disciplineCourses = signal<readonly string[]>([]);
  readonly courseQuery = signal('');
  readonly evidenceFiles = signal<readonly File[]>([]);
  readonly evidence = computed(() => this.evidenceFiles().map((file) => file.name));
  readonly ticket = signal('');
  readonly reason = signal('');
  readonly unlockReason = signal('');
  readonly saving = signal(false);
  readonly loadError = this.data.error;
  readonly loading = this.data.loading;

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

  readonly nameValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.lecturers().map((item) => item.name))].map((name) => ({ value: name, label: name })));
  readonly specialtyValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.lecturers().map((item) => item.specialty))].map((specialty) => ({ value: specialty, label: specialty })));
  readonly legalValues: readonly ColumnFilterValue[] = this.legalOptions
    .filter((option) => option.value)
    .map((option) => ({ value: option.value, label: option.label }));
  readonly taxValues: readonly ColumnFilterValue[] = [
    { value: 'verified', label: 'MST xác minh' },
    { value: 'pending', label: 'Chờ đối soát ngân hàng' }
  ];
  readonly joinedValues = JOINED_FILTER_VALUES;
  readonly statusValues: readonly ColumnFilterValue[] = this.statusOptions
    .filter((option) => option.value)
    .map((option) => ({ value: option.value, label: option.label }));
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly columnSort = signal<{ column: LecturerColumn; direction: 'asc' | 'desc' } | null>(null);

  readonly totalCourses = computed(() => this.lecturers().reduce((sum, item) => sum + item.courses, 0));
  readonly activePercent = computed(() => {
    const kpi = this.kpis();
    return kpi.total ? Math.round((kpi.active / kpi.total) * 100) : 0;
  });

  readonly selectedCourses = computed(() => {
    const lecturer = this.selected();
    return lecturer ? this.data.coursesFor(lecturer.id) : [];
  });

  /** Danh sách khóa học của giảng viên đang chọn, lọc theo ô tìm kiếm ở Mức 2. */
  readonly disciplineCourseRows = computed(() => {
    const query = this.courseQuery().trim().toLocaleLowerCase('vi-VN');
    const courses = this.selectedCourses();
    if (!query) return courses;
    return courses.filter((course) =>
      `${course.name} ${course.code}`.toLocaleLowerCase('vi-VN').includes(query));
  });

  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('vi-VN');
    const status = this.status();
    const legal = this.legal();
    const from = this.from();
    const to = this.to();
    const names = this.columnFilters.name();
    const specialties = this.columnFilters.specialty();
    const legalColumn = this.columnFilters.legal();
    const taxes = this.columnFilters.tax();
    const joined = this.columnFilters.joined();
    const statuses = this.columnFilters.status();

    const items = this.lecturers().filter((item) => {
      const haystack = [item.name, item.email, item.phone, item.id, item.specialty, item.kyc.taxCode]
        .join(' ')
        .toLocaleLowerCase('vi-VN');
      return (!query || haystack.includes(query))
        && (!status || item.status === status)
        && (!legal || item.legalStatus === legal)
        && (!from || item.joinedAt >= from)
        && (!to || item.joinedAt <= to)
        && (!names.length || names.includes(item.name))
        && (!specialties.length || specialties.includes(item.specialty))
        && (!legalColumn.length || legalColumn.includes(item.legalStatus))
        && (!taxes.length || taxes.includes(item.taxVerified ? 'verified' : 'pending'))
        && (!joined.length || joined.includes(item.joinedAt.slice(5, 7)))
        && (!statuses.length || statuses.includes(item.status));
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
    return !!(this.query() || this.status() || this.legal() || this.from() || this.to())
      || (Object.keys(this.columnFilters) as LecturerColumn[]).some((key) => this.columnFilters[key]().length > 0);
  }

  resetFilters(): void {
    clearTimeout(this.searchTimer);
    this.searchInput.set('');
    this.query.set('');
    this.status.set('');
    this.legal.set('');
    this.from.set('');
    this.to.set('');
    this.columnSort.set(null);
    this.clearColumnFilters();
    this.page.set(1);
  }

  filterFor(key: LecturerColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: LecturerColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
  }

  private clearColumnFilters(): void {
    (Object.keys(this.columnFilters) as LecturerColumn[]).forEach((key) => this.columnFilters[key].set([]));
  }

  sortFor(key: LecturerColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: LecturerColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: Lecturer, column: LecturerColumn): string | number {
    switch (column) {
      case 'name': return item.name;
      case 'specialty': return item.specialty;
      case 'legal': return item.legalStatus === 'signed' ? 'Đã ký hợp đồng điện tử' : 'Chưa hoàn tất hợp đồng';
      case 'tax': return item.taxVerified ? 'MST xác minh' : 'Chờ đối soát ngân hàng';
      case 'joined': return Date.parse(item.joinedAt);
      case 'status': return LECTURER_STATUS_LABELS[item.status];
    }
  }

  pageTo(value: number): void {
    this.page.set(Math.max(1, Math.min(this.pages(), value)));
  }

  isSelected(id: string): boolean {
    return this.selection().has(id);
  }

  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selection());
    if (checked) next.add(id);
    else next.delete(id);
    this.selection.set(next);
  }

  toggleSelectAll(): void {
    const next = new Set(this.selection());
    if (this.allVisibleSelected()) this.visible().forEach((item) => next.delete(item.id));
    else this.visible().forEach((item) => next.add(item.id));
    this.selection.set(next);
  }

  clearSelection(): void {
    this.selection.set(new Set());
  }

  setSelectionIds(ids: string[]): void {
    this.selection.set(new Set(ids));
  }

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    const targets = ids ?? this.selectedIds();
    if (!targets.length) return;
    if (key === 'approve') {
      const approvable = targets.filter((id) => {
        const lecturer = this.data.findLecturer(id);
        return lecturer?.status === 'pending-review' || lecturer?.status === 'pending-docs';
      });
      if (!approvable.length) {
        this.notify('Không có hồ sơ chờ thẩm định hoặc chờ bổ sung trong lựa chọn.');
        return;
      }
      approvable.forEach((id) => this.data.approveLecturer(id));
      this.clearSelection();
      this.notify(`Đã duyệt ${approvable.length} hồ sơ giảng viên, chuyển sang chờ ký hợp đồng.`);
      return;
    }
    if (key === 'suspend' || key === 'lock') {
      this.bulkConfirm.set({ key, ids: targets });
    }
  }

  confirmBulkAction(): void {
    const confirm = this.bulkConfirm();
    if (!confirm) return;
    const level = confirm.key === 'lock' ? 3 : 1;
    const reason = confirm.key === 'lock'
      ? 'Khóa tài khoản hàng loạt từ danh sách giảng viên.'
      : 'Tạm ngưng hàng loạt từ danh sách giảng viên.';
    confirm.ids.forEach((id) => this.data.disciplineLecturer(id, { level, reason }));
    this.bulkConfirm.set(null);
    this.clearSelection();
    this.notify(confirm.key === 'lock'
      ? `Đã khóa ${confirm.ids.length} tài khoản giảng viên (Mức 3).`
      : `Đã tạm ngưng ${confirm.ids.length} giảng viên (Mức 1).`);
  }

  openVerification(lecturer: Lecturer): void {
    void this.router.navigate(['/users/lecturers', lecturer.id]);
  }

  openProfile(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.modal.set('profile');
    // Danh sách chỉ có dữ liệu rút gọn; tải hồ sơ chi tiết để có stack/bio/liên kết/tài liệu.
    void this.data.loadLecturerDetail(lecturer.id)
      .then((detail) => {
        if (detail && this.modal() === 'profile' && this.selected()?.id === lecturer.id) this.selected.set(detail);
      })
      .catch((error: unknown) => this.notify(error instanceof Error ? error.message : 'Không tải được hồ sơ giảng viên.'));
  }

  openCourses(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.modal.set('courses');
    void this.loadCourses(lecturer);
  }

  openDiscipline(lecturer: Lecturer): void {
    this.selected.set(lecturer);
    this.level.set(1);
    this.disciplineCourses.set([]);
    this.courseQuery.set('');
    this.evidenceFiles.set([]);
    this.ticket.set('');
    this.reason.set('');
    this.modal.set('discipline');
    void this.loadCourses(lecturer);
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
    if (level !== 2) {
      this.disciplineCourses.set([]);
      this.courseQuery.set('');
    }
  }

  toggleCourse(code: string, checked: boolean): void {
    this.disciplineCourses.update((current) => (checked
      ? [...current, code]
      : current.filter((item) => item !== code)));
  }

  isCourseSelected(code: string): boolean {
    return this.disciplineCourses().includes(code);
  }

  /** Mức kỷ luật đang áp dụng — mock cũ không có trường này nên suy ra từ trạng thái. */
  lockLevelOf(lecturer: Lecturer): DisciplineLevel {
    if (lecturer.lockLevel) return lecturer.lockLevel;
    if (lecturer.status === 'frozen') return 3;
    if (lecturer.status === 'violation') return 2;
    return 1;
  }

  /** Câu hạn mở khoá hiển thị trong dải cảnh báo. */
  lockExpiryOf(lecturer: Lecturer): string {
    return lecturer.lockedUntil
      ? `Hết hạn: ${formatDeadline(lecturer.lockedUntil)}`
      : 'Khóa vĩnh viễn, không có ngày hết hạn.';
  }

  toggleCourseFromEvent(code: string, event: Event): void {
    this.toggleCourse(code, (event.target as HTMLInputElement).checked);
  }

  setCourseQueryFromEvent(event: Event): void {
    this.courseQuery.set((event.target as HTMLInputElement).value);
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
    const files = Array.from(input.files ?? []).slice(0, 5);
    this.evidenceFiles.set(files);
    this.notify(files.length ? `Đã chọn ${files.length} tệp bằng chứng.` : 'Chưa chọn tệp bằng chứng.');
  }

  async submitDiscipline(): Promise<void> {
    const lecturer = this.selected();
    if (!lecturer || !this.canSubmitDiscipline() || this.saving()) return;
    this.saving.set(true);
    try {
      await this.data.disciplineLecturer(lecturer.id, {
        level: this.level(),
        reason: this.reason().trim(),
        courses: this.disciplineCourses(),
        ticket: this.ticket().trim(),
        files: this.evidenceFiles()
      });
      this.modal.set(null);
      this.selected.set(null);
      this.notify(`Đã áp dụng kỷ luật cho ${lecturer.name}.`);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Không áp dụng được kỷ luật.');
    } finally {
      this.saving.set(false);
    }
  }

  async submitUnlock(): Promise<void> {
    const lecturer = this.selected();
    if (!lecturer || !this.canSubmitUnlock() || this.saving()) return;
    this.saving.set(true);
    try {
      await this.data.unlockLecturer(lecturer.id, this.unlockReason().trim());
      this.modal.set(null);
      this.selected.set(null);
      this.notify(`Đã mở khoá tài khoản ${lecturer.name}.`);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Không mở khoá được tài khoản.');
    } finally {
      this.saving.set(false);
    }
  }

  async exportList(format: ExportFormat): Promise<void> {
    try {
      await this.data.exportList('lecturers', format, {
        q: this.query(),
        status: this.status(),
        legalStatus: this.legal(),
        from: this.from(),
        to: this.to()
      });
      this.notify('Đã tải tệp giảng viên từ máy chủ.');
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Không xuất được danh sách giảng viên.');
    }
  }

  retryLoad(): void {
    void this.data.reload();
  }

  private async loadCourses(lecturer: Lecturer): Promise<void> {
    try {
      await this.data.loadCoursesFor(lecturer.id);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Không tải được danh sách khóa học.');
    }
  }

  notify(message: string): void {
    this.toastService.show(message);
  }
}
