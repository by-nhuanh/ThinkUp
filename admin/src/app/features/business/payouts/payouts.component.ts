import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, DestroyRef, HostListener, Injector, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideInfo, LucideUpload, LucideX } from '@lucide/angular';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { PayoutRequest, PayoutStatus } from '../models/business.models';
import { BUSINESS_STORE } from '../services/business.store';
import { copyText, dateTime, matchesDates, money, paginationItems } from '../business-utils';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, NUMBER_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';

type PayoutColumn = 'instructor' | 'amount' | 'bank' | 'date' | 'status';

/** Đơn vị nhập hạn mức rút tiền. */
export type LimitUnit = 'vnd' | 'nghin' | 'trieu' | 'ty';

/** Hệ số quy đổi từ đơn vị sang VNĐ. */
const LIMIT_UNIT_FACTORS: Record<LimitUnit, number> = {
  vnd: 1,
  nghin: 1_000,
  trieu: 1_000_000,
  ty: 1_000_000_000
};

@Component({ selector: 'app-payouts', standalone: true, imports: [FormsModule, BulkSelectionDialogComponent, SelectionBarComponent, DateTimePickerComponent, CustomSelectComponent, ExportMenuComponent, SearchFieldComponent, ColumnFilterComponent, LucideX, LucideUpload, LucideInfo], templateUrl: './payouts.component.html', styleUrl: './payouts.component.css' })
export class PayoutsComponent {
  private readonly data = inject(BUSINESS_STORE);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly repositionFilterPopover = () => this.positionFilterPopover();
  private copyToastTimer: ReturnType<typeof setTimeout> | null = null;
  readonly money = money;
  readonly dateTime = dateTime;
  readonly Math = Math;
  readonly payouts = this.data.payouts;
  /** Backend chưa có luồng chi trả thật — giữ dữ liệu minh họa và ghi rõ trên giao diện. */
  readonly payoutsAreDemo = this.data.payoutsAreDemo;
  readonly search = signal('');
  readonly status = signal<PayoutStatus | ''>('');
  readonly statusOptions: ReadonlyArray<CustomSelectOption> = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Chờ giải ngân' },
    { value: 'paid', label: 'Đã giải ngân' },
    { value: 'rejected', label: 'Bị từ chối' }
  ];
  readonly limitMin = signal<number | null>(null);
  readonly limitMax = signal<number | null>(null);
  /** Hạn mức nháp luôn tính theo đơn vị đang chọn, áp dụng mới quy đổi sang VNĐ. */
  readonly limitMinDraft = signal(0);
  readonly limitMaxDraft = signal(999000);
  readonly limitOpen = signal(false);
  readonly quickOpen = signal(false);
  readonly filterPopoverPosition = signal<{ left: number; top: number; maxHeight: number } | null>(null);
  /** Trần hạn mức: 999 tỷ. */
  readonly maxLimit = 999_000_000_000;
  /** Đơn vị nhập hạn mức: số tiền rất lớn nên người dùng chọn đơn vị thay vì chỉ dùng VNĐ. */
  readonly limitUnit = signal<LimitUnit>('trieu');
  readonly limitUnitOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'vnd', label: 'VNĐ' },
    { value: 'nghin', label: 'Nghìn' },
    { value: 'trieu', label: 'Triệu' },
    { value: 'ty', label: 'Tỷ' }
  ];
  readonly from = signal('');
  readonly to = signal('');
  readonly sort = signal<'newest' | 'oldest'>('newest');
  /** Bộ lọc nhiều lựa chọn trên tiêu đề cột; rỗng nghĩa là không lọc cột đó. */
  readonly instructorColumnFilters = signal<string[]>([]);
  readonly amountColumnFilters = signal<string[]>([]);
  readonly bankColumnFilters = signal<string[]>([]);
  readonly dateColumnFilters = signal<string[]>([]);
  readonly statusColumnFilters = signal<string[]>([]);
  /** Chia hạn mức số tiền yêu cầu thành các khoảng cố định để lọc theo cột. */
  private readonly amountBuckets: ReadonlyArray<{ key: string; label: string; min: number; max: number }> = [
    { key: 'under-5m', label: 'Dưới 5 triệu', min: 0, max: 5_000_000 },
    { key: '5m-20m', label: 'Từ 5 đến dưới 20 triệu', min: 5_000_000, max: 20_000_000 },
    { key: '20m-50m', label: 'Từ 20 đến dưới 50 triệu', min: 20_000_000, max: 50_000_000 },
    { key: 'from-50m', label: 'Từ 50 triệu trở lên', min: 50_000_000, max: Number.POSITIVE_INFINITY }
  ];
  readonly amountValues: ColumnFilterValue[] = this.amountBuckets.map(bucket => ({ value: bucket.key, label: bucket.label }));
  readonly instructorValues = computed<ColumnFilterValue[]>(() =>
    this.distinctValues(this.payouts().map(item => item.instructor)));
  readonly bankValues = computed<ColumnFilterValue[]>(() =>
    this.distinctValues(this.payouts().map(item => item.bank)));
  readonly dateValues = computed<ColumnFilterValue[]>(() =>
    this.distinctValues(this.payouts().map(item => this.dayOf(item.submittedAt))));
  readonly statusColumnValues: ColumnFilterValue[] = [
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Chờ giải ngân' },
    { value: 'paid', label: 'Đã giải ngân' },
    { value: 'rejected', label: 'Bị từ chối' }
  ];
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly numberSorts = NUMBER_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly columnSort = signal<{ column: PayoutColumn; direction: 'asc' | 'desc' } | null>(null);
  readonly taxOnly = signal(false);
  readonly paidMonthOnly = signal(false);
  readonly role = this.data.payoutRole;
  readonly selected = signal<PayoutRequest | null>(null);
  readonly openActionMenuId = signal<string | null>(null);
  readonly dialog = signal<'details' | 'review' | 'reject' | null>(null);
  private readonly returnFromReject = signal<'details' | 'review'>('details');
  readonly page = signal(1);
  /** Số dòng mỗi trang đọc từ tham số hệ thống `orders_per_page` (mặc định 8). */
  private readonly pageSizeService = inject(AdminPageSizeService);
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  readonly quickRange = signal<'all' | 'today' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  /** Khoảng thời gian đang chỉnh trong popover, chỉ áp dụng khi bấm "Áp dụng". */
  readonly fromDraft = signal('');
  readonly toDraft = signal('');
  readonly rangeDraft = signal<'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  readonly canClearDateRange = computed(() => !!(this.from() || this.to() || this.fromDraft() || this.toDraft()));
  readonly dateLabel = computed(() => this.from() || this.to()
    ? `${this.shortDate(this.from()) || '...'} - ${this.shortDate(this.to()) || '...'}`
    : 'Tất cả');
  readonly approvalNote = signal('');
  readonly rejectionReason = signal('');
  readonly rejectionDetails = signal('');
  readonly rejectReasonOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'Sai số tài khoản', label: 'Sai số tài khoản' },
    { value: 'Tên tài khoản không khớp', label: 'Tên tài khoản không khớp' },
    { value: 'Doanh thu không khả dụng', label: 'Doanh thu không khả dụng' },
    { value: 'Hợp đồng không hợp lệ', label: 'Hợp đồng không hợp lệ' },
    { value: 'Khác', label: 'Khác' }
  ];
  readonly evidence = signal('');
  private evidenceFile: File | null = null;
  readonly error = signal('');
  readonly toast = signal('');
  readonly copiedId = signal(false);
  readonly filtered = computed(() => {
    const items = this.payouts().filter(item => {
      const query = this.search().trim().toLocaleLowerCase('vi-VN');
      return (!query || [item.id, item.instructor, item.email].some(value => value.toLocaleLowerCase('vi-VN').includes(query)))
        && (!this.status() || item.status === this.status())
        && (this.limitMin() === null || item.amount >= this.limitMin()!)
        && (this.limitMax() === null || item.amount <= this.limitMax()!)
        && (!this.taxOnly() || item.taxAmount > 0)
        && this.matchesColumn(this.instructorColumnFilters(), item.instructor)
        && this.matchesAmountColumn(item.amount)
        && this.matchesColumn(this.bankColumnFilters(), item.bank)
        && (!this.dateColumnFilters().length || this.dateColumnFilters().includes(this.dayOf(item.submittedAt)))
        && (!this.statusColumnFilters().length || this.statusColumnFilters().includes(item.status))
        && matchesDates(this.paidMonthOnly() && item.paidAt ? item.paidAt : item.submittedAt, this.from(), this.to());
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return [...items].sort((a, b) => this.sort() === 'newest'
      ? b.submittedAt.localeCompare(a.submittedAt)
      : a.submittedAt.localeCompare(b.submittedAt));
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly pagination = computed(() => paginationItems(this.currentPage(), this.totalPages()));
  readonly visible = computed(() => this.filtered().slice((this.currentPage() - 1) * this.pageSize, this.currentPage() * this.pageSize));
  readonly pending = computed(() => this.payouts().filter(item => item.status === 'pending').length);
  readonly largePending = computed(() => this.payouts().filter(item => item.status === 'pending' && item.amount >= 20000000).length);
  readonly awaitingAmount = computed(() => this.payouts().filter(item => item.status === 'approved').reduce((sum, item) => sum + item.amount - item.taxAmount, 0));
  readonly paidAmount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, item) => sum + item.amount - item.taxAmount, 0));
  readonly paidCount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length);
  readonly taxAmount = computed(() => this.payouts().filter(item => item.status === 'paid' && item.paidAt?.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, item) => sum + item.taxAmount, 0));
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkRejectIds = signal<readonly string[] | null>(null);
  readonly bulkRejectReason = signal('');
  readonly bulkRejectDetails = signal('');
  readonly bulkRejectError = signal('');
  private bulkToastTimer: ReturnType<typeof setTimeout> | null = null;
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every(item => chosen.has(item.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(item => this.selection().has(item.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.payouts()
    .filter(item => this.selection().has(item.id))
    .map(item => this.selectionItem(item)));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(item => !this.selection().has(item.id))
    .map(item => this.selectionItem(item)));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => {
    const chosen = this.payouts().filter(item => this.selection().has(item.id) && item.status === 'pending');
    const approvable = chosen.filter(item => this.canApprove(item)).length;
    return [
      { key: 'approve', label: 'Duyệt hàng loạt', tone: 'primary', disabled: !approvable, title: approvable ? `${approvable} yêu cầu đủ điều kiện duyệt` : 'Không có yêu cầu chờ duyệt đủ điều kiện trong lựa chọn' },
      { key: 'reject', label: 'Từ chối hàng loạt', tone: 'danger', disabled: !chosen.length, title: chosen.length ? `${chosen.length} yêu cầu chờ duyệt trong lựa chọn` : 'Chỉ áp dụng cho yêu cầu chờ duyệt' },
      { key: 'export', label: 'Xuất đã chọn' }
    ];
  });
  readonly bulkRejectTargets = computed(() => {
    const ids = this.bulkRejectIds();
    return ids ? this.payouts().filter(item => ids.includes(item.id) && item.status === 'pending') : [];
  });
  readonly bulkRejectAmount = computed(() => this.bulkRejectTargets().reduce((sum, item) => sum + item.amount, 0));

  constructor() {
    this.destroyRef.onDestroy(() => this.removeFilterPopoverListeners());
    this.destroyRef.onDestroy(() => { if (this.bulkToastTimer) clearTimeout(this.bulkToastTimer); });
  }

  statusLabel(value: PayoutStatus): string { return { pending: 'Chờ duyệt', approved: 'Chờ giải ngân', paid: 'Đã giải ngân', rejected: 'Bị từ chối' }[value]; }
  toggleRowActions(id: string): void { this.openActionMenuId.update(current => current === id ? null : id); }
  closeRowActions(): void { this.openActionMenuId.set(null); }
  setStatus(value: PayoutStatus | ''): void { this.status.set(value); this.taxOnly.set(false); this.paidMonthOnly.set(false); this.page.set(1); }
  filterFromKpi(value: PayoutStatus): void { this.setStatus(value); this.clearDateRange(); }
  clear(): void {
    this.search.set('');
    this.status.set('');
    this.limitMin.set(null);
    this.limitMax.set(null);
    this.limitMinDraft.set(0);
    this.limitMaxDraft.set(this.limitSliderMax());
    this.closeLimitPopover();
    this.closeDatePopover();
    this.clearDateRange();
    this.taxOnly.set(false);
    this.paidMonthOnly.set(false);
    this.instructorColumnFilters.set([]);
    this.amountColumnFilters.set([]);
    this.bankColumnFilters.set([]);
    this.dateColumnFilters.set([]);
    this.statusColumnFilters.set([]);
    this.sort.set('newest');
    this.columnSort.set(null);
    this.page.set(1);
  }
  /** Áp dụng lựa chọn từ bộ lọc tiêu đề cột và đưa danh sách về trang đầu. */
  setColumnFilter(kind: 'instructor' | 'amount' | 'bank' | 'date' | 'status', values: string[]): void {
    if (kind === 'instructor') this.instructorColumnFilters.set(values);
    else if (kind === 'amount') this.amountColumnFilters.set(values);
    else if (kind === 'bank') this.bankColumnFilters.set(values);
    else if (kind === 'date') this.dateColumnFilters.set(values);
    else this.statusColumnFilters.set(values);
    this.page.set(1);
  }
  sortFor(key: PayoutColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }
  updateColumnSort(key: PayoutColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }
  private sortValue(item: PayoutRequest, column: PayoutColumn): string | number {
    switch (column) {
      case 'instructor': return item.instructor;
      case 'amount': return item.amount;
      case 'bank': return item.bank;
      case 'date': return Date.parse(item.submittedAt);
      case 'status': return this.statusLabel(item.status);
    }
  }
  private matchesColumn(selected: string[], value: string): boolean {
    return !selected.length || selected.includes(value);
  }
  /** Số tiền rơi vào một trong các khoảng đang chọn của bộ lọc cột. */
  private matchesAmountColumn(amount: number): boolean {
    const selected = this.amountColumnFilters();
    if (!selected.length) return true;
    return this.amountBuckets.some(bucket => selected.includes(bucket.key) && amount >= bucket.min && amount < bucket.max);
  }
  /** Danh sách giá trị khác nhau, giữ thứ tự xuất hiện, dùng cho bộ lọc cột. */
  private distinctValues(values: string[]): ColumnFilterValue[] {
    return [...new Set(values)].map(value => ({ value, label: value }));
  }
  /** Ngày gửi dạng YYYY-MM-DD theo giờ Việt Nam, dùng cho bộ lọc cột Ngày gửi. */
  dayOf(value: string): string {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
  }
  toggleSort(): void { this.sort.update(value => value === 'newest' ? 'oldest' : 'newest'); this.columnSort.set(null); this.page.set(1); }
  formatLimit(value: number): string { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: this.limitPrecision() }).format(value); }
  /** Rút gọn số tiền cho nút trên toolbar: 1.234.567.890 → "1,2 tỷ". */
  formatLimitCompact(value: number): string {
    for (const [factor, label] of [[1_000_000_000, 'tỷ'], [1_000_000, 'triệu'], [1_000, 'nghìn']] as [number, string][]) {
      if (value >= factor) {
        const scaled = value / factor;
        return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: scaled < 10 ? 1 : 0 }).format(scaled)} ${label}`;
      }
    }
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  /**
   * Ô nhập hạn mức: bỏ ký tự không phải số, giới hạn theo maxLimit rồi hiển thị
   * lại theo dạng xxx.xxx. Con trỏ được giữ đúng chỗ sau khi định dạng.
   */
  updateLimitInput(kind: 'min' | 'max', input: HTMLInputElement): void {
    const caret = input.selectionStart ?? input.value.length;
    const digitsBefore = input.value.slice(0, caret).replace(/\D/g, '').length;
    const value = this.normalizeLimit(this.parseLimitInput(input.value));
    const normalized = kind === 'min' ? Math.min(value, this.limitMaxDraft()) : Math.max(value, this.limitMinDraft());
    input.value = this.formatLimit(normalized);
    if (kind === 'min') this.limitMinDraft.set(normalized); else this.limitMaxDraft.set(normalized);
    this.keepCaret(input, digitsBefore);
  }
  private keepCaret(input: HTMLInputElement, digitsBefore: number): void {
    const position = this.caretPosition(input.value, digitsBefore);
    setTimeout(() => input.setSelectionRange(position, position));
  }
  private caretPosition(formatted: string, digitsBefore: number): number {
    if (!digitsBefore) return 0;
    let seen = 0;
    for (let index = 0; index < formatted.length; index += 1) {
      if (/\d/.test(formatted[index])) {
        seen += 1;
        if (seen === digitsBefore) return index + 1;
      }
    }
    return formatted.length;
  }
  toggleLimit(): void {
    this.limitMinDraft.set(this.limitMin() === null ? 0 : this.limitMin()! / this.limitFactor());
    this.limitMaxDraft.set(this.limitMax() === null ? this.limitSliderMax() : this.limitMax()! / this.limitFactor());
    this.closeDatePopover();
    if (this.limitOpen()) {
      this.closeLimitPopover();
      return;
    }
    this.limitOpen.set(true);
    this.watchFilterPopover();
  }

  closeLimitPopover(): void {
    if (!this.limitOpen()) return;
    this.limitOpen.set(false);
    this.filterPopoverPosition.set(null);
    this.removeFilterPopoverListeners();
  }
  /** Hệ số quy đổi của đơn vị đang chọn. */
  private limitFactor(): number {
    return LIMIT_UNIT_FACTORS[this.limitUnit()];
  }
  /** Đơn vị hiển thị cạnh ô nhập. */
  limitUnitLabel(): string {
    return this.limitUnitOptions.find(option => option.value === this.limitUnit())?.label ?? 'VNĐ';
  }
  /** Trần của thanh trượt theo đơn vị đang chọn. */
  limitSliderMax(): number { return this.maxLimit / this.limitFactor(); }
  /** Bước của thanh trượt theo đơn vị đang chọn. */
  limitSliderStep(): number { return Math.max(1, Math.round(1_000_000 / this.limitFactor())); }
  /** Số chữ thập phân cho phép nhập theo đơn vị (tỷ cho phép nhập 0,1 tỷ = 100 triệu). */
  private limitPrecision(): number { return this.limitUnit() === 'ty' ? 3 : 0; }
  /** Quy đổi giá trị đang nhập (theo đơn vị) sang VNĐ. */
  private limitToVnd(value: number): number { return Math.round(value * this.limitFactor()); }
  /** Đổi đơn vị nhập, giữ nguyên khoảng hạn mức đang chọn. */
  setLimitUnit(value: string): void {
    if (!(value in LIMIT_UNIT_FACTORS) || value === this.limitUnit()) return;
    const from = this.limitFactor();
    this.limitUnit.set(value as LimitUnit);
    const to = this.limitFactor();
    const convert = (current: number): number => Math.min(this.limitSliderMax(), this.roundLimit(current * from / to, value as LimitUnit));
    this.limitMinDraft.set(convert(this.limitMinDraft()));
    this.limitMaxDraft.set(convert(this.limitMaxDraft()));
  }
  private roundLimit(value: number, unit: LimitUnit): number {
    const precision = unit === 'ty' ? 3 : 0;
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
  private normalizeLimit(value: string | number): number {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount)) return 0;
    return Math.max(0, Math.min(this.limitSliderMax(), this.roundLimit(amount, this.limitUnit())));
  }
  /** Đọc số trong ô nhập: dấu chấm là dấu phân cách nghìn, dấu phẩy là thập phân. */
  private parseLimitInput(text: string): number {
    const cleaned = text.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : 0;
  }
  setLimitMinDraft(value: string | number): void { this.limitMinDraft.set(Math.min(this.normalizeLimit(value), this.limitMaxDraft())); }
  setLimitMaxDraft(value: string | number): void { this.limitMaxDraft.set(Math.max(this.normalizeLimit(value), this.limitMinDraft())); }
  limitPercent(value: number): number { return value / this.limitSliderMax() * 100; }
  applyLimit(): void {
    this.limitMin.set(this.limitToVnd(this.limitMinDraft()));
    this.limitMax.set(this.limitToVnd(this.limitMaxDraft()));
    this.closeLimitPopover();
    this.page.set(1);
  }
  resetLimit(): void {
    this.limitMin.set(null);
    this.limitMax.set(null);
    this.limitMinDraft.set(0);
    this.limitMaxDraft.set(this.limitSliderMax());
    this.closeLimitPopover();
    this.page.set(1);
  }
  /** Chỉnh ngày bắt đầu trong popover, chưa áp dụng cho bộ lọc. */
  selectFrom(value: string): void { this.fromDraft.set(value); if (this.toDraft() && value > this.toDraft()) this.toDraft.set(value); this.rangeDraft.set('custom'); }
  /** Chỉnh ngày kết thúc trong popover, chưa áp dụng cho bộ lọc. */
  selectTo(value: string): void { this.toDraft.set(value); if (this.fromDraft() && value < this.fromDraft()) this.fromDraft.set(value); this.rangeDraft.set('custom'); }
  /** Khoảng ngày của một mốc chọn nhanh. */
  private periodRange(value: string): { from: string; to: string } {
    const now = new Date();
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (value === 'today') return { from: iso(now), to: iso(now) };
    if (value === 'week') { const start = new Date(now); start.setDate(now.getDate() - 6); return { from: iso(start), to: iso(now) }; }
    if (value === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    if (value === 'quarter') return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: iso(now) };
    if (value === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    return { from: '', to: '' };
  }
  /** Chọn nhanh trong popover: chỉ cập nhật bản nháp, chờ bấm "Áp dụng". */
  selectQuickDate(value: string): void {
    const range = this.periodRange(value);
    this.fromDraft.set(range.from);
    this.toDraft.set(range.to);
    this.rangeDraft.set(value as 'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom');
  }
  /** Áp dụng khoảng thời gian đang chọn trong popover. */
  applyDateRange(): void {
    this.from.set(this.fromDraft());
    this.to.set(this.toDraft());
    this.quickRange.set(this.appliedRangeType());
    this.page.set(1);
    this.closeDatePopover();
  }
  /** Xoá khoảng thời gian đang lọc. */
  clearDateRange(): void {
    this.from.set('');
    this.to.set('');
    this.quickRange.set('all');
    this.fromDraft.set('');
    this.toDraft.set('');
    this.rangeDraft.set('all');
    this.page.set(1);
  }
  private appliedRangeType(): 'all' | 'today' | 'month' | 'quarter' | 'year' | 'custom' {
    const draft = this.rangeDraft();
    return draft === 'week' ? 'custom' : draft;
  }
  shortDate(value: string): string { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : ''; }
  toggleQuickRange(): void {
    this.closeLimitPopover();
    if (this.quickOpen()) { this.closeDatePopover(); return; }
    this.filterPopoverPosition.set(null);
    // Popover mở ra với bản nháp bằng đúng khoảng thời gian đang áp dụng.
    this.fromDraft.set(this.from());
    this.toDraft.set(this.to());
    this.rangeDraft.set(this.quickRange());
    this.quickOpen.set(true);
    this.watchFilterPopover();
  }

  private watchFilterPopover(): void {
    const view = this.document.defaultView;
    view?.addEventListener('resize', this.repositionFilterPopover);
    view?.addEventListener('scroll', this.repositionFilterPopover, true);
    afterNextRender(() => this.positionFilterPopover(), { injector: this.injector });
  }
  closeDatePopover(): void {
    this.quickOpen.set(false);
    this.filterPopoverPosition.set(null);
    this.removeFilterPopoverListeners();
  }
  private removeFilterPopoverListeners(): void {
    const view = this.document.defaultView;
    view?.removeEventListener('resize', this.repositionFilterPopover);
    view?.removeEventListener('scroll', this.repositionFilterPopover, true);
  }
  private positionFilterPopover(): void {
    const limit = this.limitOpen();
    if (!limit && !this.quickOpen()) return;
    const view = this.document.defaultView;
    const trigger = this.document.querySelector<HTMLElement>(limit ? '.payouts-page .limit-trigger' : '.payouts-page .date-trigger');
    const popover = this.document.getElementById(limit ? 'payout-limit-options' : 'payout-date-options');
    if (!view || !trigger || !popover) return;
    const margin = 12;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = this.document.documentElement.clientWidth;
    const width = popoverRect.width;
    // Keep the popover attached to the trigger's right edge. This prevents a
    // wide, content-sized date panel from being clipped at the viewport edge.
    const preferredLeft = limit ? triggerRect.left : triggerRect.right - width;
    const left = Math.max(margin, Math.min(preferredLeft, viewportWidth - margin - width));
    const below = Math.max(0, view.innerHeight - triggerRect.bottom - gap - margin);
    const above = Math.max(0, triggerRect.top - gap - margin);
    const height = popover.scrollHeight + popover.offsetHeight - popover.clientHeight;
    const openAbove = below < height && above > below;
    const maxHeight = Math.min(openAbove ? above : below, view.innerHeight - margin * 2);
    const desiredTop = openAbove ? triggerRect.top - gap - Math.min(height, maxHeight) : triggerRect.bottom + gap;
    const top = Math.max(margin, Math.min(desiredTop, view.innerHeight - margin - maxHeight));
    this.filterPopoverPosition.set({ left, top, maxHeight });
  }
  quickDate(value: string): void {
    const range = this.periodRange(value);
    this.from.set(range.from);
    this.to.set(range.to);
    this.quickRange.set(value === 'all' ? 'all' : value === 'week' ? 'custom' : value as 'today' | 'month' | 'quarter' | 'year');
    this.page.set(1);
    this.closeDatePopover();
  }
  filterPaid(): void { this.status.set('paid'); this.taxOnly.set(false); this.paidMonthOnly.set(true); this.quickDate('month'); }
  filterTax(): void { this.status.set('paid'); this.taxOnly.set(true); this.paidMonthOnly.set(true); this.quickDate('month'); }
  canApprove(item: PayoutRequest): boolean {
    return item.status === 'pending' && this.approvalIssues(item).length === 0;
  }
  approvalIssues(item: PayoutRequest): string[] {
    const issues: string[] = [];
    const hasApprovalRole = this.role() === 'super' || (this.role() === 'finance' && item.amount < 20000000);
    if (!hasApprovalRole) issues.push('Tài khoản hiện tại không có quyền duyệt khoản tiền này.');
    if (!item.verified) issues.push('Hồ sơ định danh của giảng viên chưa được xác minh.');
    if (!item.contractValid) issues.push('Hợp đồng đối tác chưa hợp lệ hoặc cần kiểm tra lại.');
    if (item.disputed) issues.push('Yêu cầu đang có tranh chấp cần được xử lý trước.');
    if (!item.bank.trim() || !item.accountNumber.trim() || !item.accountName.trim()) issues.push('Thông tin tài khoản nhận tiền chưa đầy đủ.');
    if (item.availableBalance < item.amount) issues.push(`Số dư khả dụng không đủ để duyệt yêu cầu ${money(item.amount)}.`);
    return issues;
  }
  open(item: PayoutRequest, dialog: 'details' | 'review' | 'reject'): void { this.selected.set(item); this.returnFromReject.set('details'); this.dialog.set(dialog); this.error.set(''); this.clearCopyToast(); this.approvalNote.set(''); this.rejectionReason.set(''); this.rejectionDetails.set(''); this.evidence.set(''); }
  openReject(): void { this.returnFromReject.set(this.dialog() === 'review' ? 'review' : 'details'); this.error.set(''); this.dialog.set('reject'); }
  cancelReject(): void { this.error.set(''); this.dialog.set(this.returnFromReject()); }
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.limitOpen()) this.closeLimitPopover();
    else if (this.quickOpen()) this.closeDatePopover();
    else if (this.bulkRejectIds()) this.cancelBulkReject();
    else if (this.dialog() === 'reject') this.cancelReject();
    else if (this.selected()) this.close();
  }
  async copyRequestId(id: string): Promise<void> {
    this.clearCopyToast();
    if (!await copyText(id)) {
      this.error.set('Không thể sao chép mã yêu cầu. Vui lòng chọn và sao chép thủ công.');
      return;
    }
    this.copiedId.set(true);
    this.copyToastTimer = setTimeout(() => this.clearCopyToast(), 2200);
  }
  private clearCopyToast(): void {
    if (this.copyToastTimer) clearTimeout(this.copyToastTimer);
    this.copyToastTimer = null;
    this.copiedId.set(false);
  }
  datePart(value: string): string { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  timePart(value: string): string { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  close(): void { this.clearCopyToast(); this.selected.set(null); this.dialog.set(null); this.error.set(''); }
  approve(): void {
    const item = this.selected(); if (!item) return;
    if (!this.canApprove(item)) { this.error.set('Chưa thể duyệt. Vui lòng xử lý các cảnh báo phía trên.'); return; }
    // TODO(pre-deploy): Thay cập nhật cục bộ bằng API duyệt chi trả khi backend bàn giao luồng thật.
    this.data.updatePayout(item.id, { status: 'approved' });
    this.close();
    this.toast.set('Đã duyệt yêu cầu (dữ liệu minh họa). Chờ kế toán giải ngân.');
  }
  reject(): void {
    const item = this.selected(); if (!item) return;
    if (!this.rejectionReason() || !this.rejectionDetails().trim()) { this.error.set('Chọn lý do và nhập giải thích chi tiết trước khi xác nhận.'); return; }
    // TODO(pre-deploy): API từ chối + tải minh chứng chưa tồn tại; giữ minh chứng trong bộ nhớ.
    this.data.updatePayout(item.id, {
      status: 'rejected',
      rejectionReason: `${this.rejectionReason()}: ${this.rejectionDetails().trim()}`
    });
    this.close();
    this.toast.set('Đã từ chối yêu cầu (dữ liệu minh họa).');
  }
  chooseEvidence(event: Event): void { this.evidenceFile = (event.target as HTMLInputElement).files?.[0] ?? null; this.evidence.set(this.evidenceFile?.name ?? ''); }
  async downloadEvidence(id: string): Promise<void> {
    // TODO(pre-deploy): API tải minh chứng chi trả chưa có; dữ liệu demo không kèm tệp.
    this.error.set(`Chưa có tệp minh chứng cho yêu cầu ${id} (dữ liệu minh họa).`);
  }
  private selectionItem(item: PayoutRequest): BulkSelectionItem {
    return { id: item.id, label: `${item.id} · ${item.instructor}`, detail: `${money(item.amount)} · ${this.statusLabel(item.status)}` };
  }
  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selection());
    if (checked) next.add(id); else next.delete(id);
    this.selection.set(next);
  }
  toggleSelectAll(): void {
    const next = new Set(this.selection());
    if (this.allVisibleSelected()) this.visible().forEach(item => next.delete(item.id));
    else this.visible().forEach(item => next.add(item.id));
    this.selection.set(next);
  }
  clearSelection(): void { this.selection.set(new Set()); }
  setSelectionIds(ids: string[]): void { this.selection.set(new Set(ids)); }
  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    const targets = ids ?? this.selectedIds();
    if (!targets.length) return;
    if (key === 'export') { this.exportSelected(targets); return; }
    if (key === 'reject') { this.openBulkReject(targets); return; }
    if (key === 'approve') this.bulkApprove(targets);
  }
  private bulkApprove(ids: readonly string[]): void {
    const eligible = this.payouts().filter(item => ids.includes(item.id) && item.status === 'pending' && this.canApprove(item));
    if (!eligible.length) { this.notifyBulk('Không có yêu cầu nào đủ điều kiện duyệt trong lựa chọn.'); return; }
    eligible.forEach(item => this.data.updatePayout(item.id, { status: 'approved' }));
    this.clearSelection();
    const skipped = ids.length - eligible.length;
    this.notifyBulk(`Đã duyệt ${eligible.length} yêu cầu rút tiền, chờ kế toán giải ngân.${skipped ? ` Bỏ qua ${skipped} yêu cầu không đủ điều kiện hoặc không chờ duyệt.` : ''}`);
  }
  private openBulkReject(ids: readonly string[]): void {
    this.bulkRejectIds.set(ids);
    this.bulkRejectReason.set('');
    this.bulkRejectDetails.set('');
    this.bulkRejectError.set('');
  }
  cancelBulkReject(): void {
    this.bulkRejectIds.set(null);
    this.bulkRejectError.set('');
  }
  confirmBulkReject(): void {
    const ids = this.bulkRejectIds();
    if (!ids?.length) return;
    if (!this.bulkRejectReason() || !this.bulkRejectDetails().trim()) {
      this.bulkRejectError.set('Chọn lý do và nhập giải thích chi tiết trước khi xác nhận.');
      return;
    }
    const targets = this.bulkRejectTargets();
    this.bulkRejectIds.set(null);
    if (!targets.length) { this.notifyBulk('Các yêu cầu đã chọn không còn ở trạng thái chờ duyệt nên không thể từ chối.'); return; }
    const rejectionReason = `${this.bulkRejectReason()}: ${this.bulkRejectDetails().trim()}`;
    targets.forEach(item => this.data.updatePayout(item.id, { status: 'rejected', rejectionReason }));
    this.clearSelection();
    const skipped = ids.length - targets.length;
    this.notifyBulk(`Đã từ chối ${targets.length} yêu cầu rút tiền.${skipped ? ` Bỏ qua ${skipped} yêu cầu không ở trạng thái chờ duyệt.` : ''}`);
  }
  private exportSelected(ids: readonly string[]): void {
    const rows = this.payouts().filter(item => ids.includes(item.id));
    downloadTable('xlsx', 'thinkup-rut-tien-da-chon', [
      ['Mã yêu cầu', 'Giảng viên', 'Email', 'Số tiền yêu cầu', 'Thuế TNCN', 'Thực chi', 'Ngân hàng', 'Số tài khoản', 'Ngày gửi', 'Trạng thái'],
      ...rows.map(item => [item.id, item.instructor, item.email, item.amount, item.taxAmount, item.amount - item.taxAmount, item.bank, item.accountNumber, dateTime(item.submittedAt), this.statusLabel(item.status)])
    ]).then(
      () => this.notifyBulk(`Đã xuất ${rows.length} yêu cầu đã chọn ra tệp XLSX.`),
      () => this.notifyBulk('Không thể tạo tệp xuất. Vui lòng thử lại.')
    );
  }
  private notifyBulk(message: string): void {
    if (this.bulkToastTimer) clearTimeout(this.bulkToastTimer);
    this.toast.set(message);
    this.bulkToastTimer = setTimeout(() => this.toast.set(''), 4200);
  }
  export(format: ExportFormat): void { downloadTable(format, 'thinkup-rut-tien', [['Mã yêu cầu', 'Giảng viên', 'Email', 'Số tiền yêu cầu', 'Thuế TNCN', 'Thực chi', 'Ngân hàng', 'Số tài khoản', 'Ngày gửi', 'Trạng thái', 'Dữ liệu minh họa'], ...this.filtered().map(item => [item.id, item.instructor, item.email, item.amount, item.taxAmount, item.amount - item.taxAmount, item.bank, item.accountNumber, dateTime(item.submittedAt), this.statusLabel(item.status), this.data.payoutsAreDemo() ? 'Có' : 'Không'])]); }
}
