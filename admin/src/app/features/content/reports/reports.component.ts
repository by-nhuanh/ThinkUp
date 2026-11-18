import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { Component, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import {
  formatDate, formatDateTime, paginationRange, relativeTime, REPORT_STATUS_LABELS, REPORT_STATUS_TONE,
  SEVERITY_LABELS, SEVERITY_TONE
} from '../content-utils';
import { ContentReport, ReportSeverity, ReportStatus, ReportType } from '../models/content.models';
import { ContentStore } from '../services/content.store';

type ReportColumn = 'type' | 'severity' | 'reason' | 'reportedBy' | 'created' | 'slaState' | 'status' | 'assignee';

const REPORT_TYPE_VALUES: ColumnFilterValue[] = (['Bình luận khóa học', 'Bình luận Blog', 'Đánh giá', 'Bài viết'] as ReportType[])
  .map(type => ({ value: type, label: type }));

const REPORT_STATUS_VALUES: ColumnFilterValue[] = (Object.keys(REPORT_STATUS_LABELS) as ReportStatus[])
  .map(status => ({ value: status, label: REPORT_STATUS_LABELS[status] }));

const SEVERITY_VALUES: ColumnFilterValue[] = (Object.keys(SEVERITY_LABELS) as ReportSeverity[])
  .map(severity => ({ value: severity, label: SEVERITY_LABELS[severity] }));

const SLA_STATE_VALUES: ColumnFilterValue[] = [
  { value: 'late', label: 'Quá hạn' },
  { value: 'ontime', label: 'Trong hạn' }
];

@Component({
  selector: 'app-content-reports',
  standalone: true,
  imports: [AdminDialogComponent, BulkSelectionDialogComponent, ColumnFilterComponent, CustomSelectComponent, SearchFieldComponent, ExportMenuComponent, SelectionBarComponent, ContentToastComponent],
  templateUrl: './reports.component.html',
  styleUrls: ['../content-page.css', '../content-moderation.css', './reports.component.css']
})
export class ContentReportsComponent {
  private readonly store = inject(ContentStore);
  readonly loadError = this.store.loadError;
  private readonly route = inject(ActivatedRoute);

  readonly rowMenu = signal<{ item: ContentReport; top: number; left: number } | null>(null);
  private rowMenuTrigger: HTMLElement | null = null;

  readonly reports = this.store.reports;
  readonly logs = this.store.logs;
  readonly search = signal('');
  readonly type = signal('');
  readonly status = signal('');
  readonly severity = signal('');
  readonly sort = signal<'newest' | 'oldest' | 'sla'>('newest');
  readonly page = signal(1);
  private readonly pageSizeService = inject(AdminPageSizeService);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly detailId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly resolutionDecision = signal<'resolved' | 'dismissed'>('resolved');
  readonly resolutionNote = signal('');
  readonly noteTouched = signal(false);
  readonly enforcement = signal('');
  readonly dismissalReason = signal('');
  readonly actionTouched = signal(false);
  readonly historyOpen = signal(false);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  private readonly columnFilters: Record<ReportColumn, WritableSignal<string[]>> = {
    type: signal<string[]>([]),
    severity: signal<string[]>([]),
    reason: signal<string[]>([]),
    reportedBy: signal<string[]>([]),
    created: signal<string[]>([]),
    slaState: signal<string[]>([]),
    status: signal<string[]>([]),
    assignee: signal<string[]>([])
  };

  readonly reportTypeValues = REPORT_TYPE_VALUES;
  readonly reportStatusValues = REPORT_STATUS_VALUES;
  readonly severityValues = SEVERITY_VALUES;
  readonly slaStateValues = SLA_STATE_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly columnSort = signal<{ column: ReportColumn; direction: 'asc' | 'desc' } | null>(null);
  readonly reasonValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reports().map(item => item.reason))], this.columnFilters.reason())
      .map(item => ({ value: item, label: item })));
  readonly reporterValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reports().map(item => item.reportedBy))], this.columnFilters.reportedBy())
      .map(item => ({ value: item, label: item })));
  readonly createdValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reports().map(item => formatDate(item.createdAt)))], this.columnFilters.created())
      .map(item => ({ value: item, label: item })));
  readonly assigneeValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reports().map(item => item.assignee))], this.columnFilters.assignee())
      .map(item => ({ value: item, label: item })));

  readonly counts = computed(() => {
    const items = this.reports();
    const open = items.filter(item => item.status === 'new' || item.status === 'processing' || item.status === 'escalated');
    const now = Date.now();
    return {
      total: items.length,
      fresh: items.filter(item => item.status === 'new').length,
      processing: items.filter(item => item.status === 'processing').length,
      urgent: open.filter(item => item.severity === 'critical' || item.severity === 'high').length,
      resolved: items.filter(item => item.status === 'resolved' || item.status === 'dismissed').length,
      resolvedOnly: items.filter(item => item.status === 'resolved').length,
      dismissed: items.filter(item => item.status === 'dismissed').length,
      overdue: open.filter(item => Date.parse(item.slaDueAt) < now).length
    };
  });
  readonly typeOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả loại nội dung' },
    { value: 'Bình luận khóa học', label: 'Bình luận khóa học' },
    { value: 'Bình luận Blog', label: 'Bình luận Blog' },
    { value: 'Đánh giá', label: 'Đánh giá' },
    { value: 'Bài viết', label: 'Bài viết' }
  ];
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'new', label: 'Chờ xử lý' },
    { value: 'processing', label: 'Đang điều tra' },
    { value: 'escalated', label: 'Đã leo thang' },
    { value: 'resolved', label: 'Đã giải quyết' },
    { value: 'dismissed', label: 'Bác bỏ' }
  ];
  readonly severityOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả mức độ' },
    { value: 'critical', label: 'Nghiêm trọng' },
    { value: 'high', label: 'Cao' },
    { value: 'medium', label: 'Trung bình' },
    { value: 'low', label: 'Thấp' }
  ];
  readonly sortOptions: CustomSelectOption[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'oldest', label: 'Cũ nhất' },
    { value: 'sla', label: 'Gần hạn SLA' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const type = this.type();
    const status = this.status();
    const severity = this.severity();
    const sort = this.sort();
    const types = this.columnFilters.type();
    const severities = this.columnFilters.severity();
    const reasons = this.columnFilters.reason();
    const reporters = this.columnFilters.reportedBy();
    const createdDates = this.columnFilters.created();
    const slaStates = this.columnFilters.slaState();
    const statuses = this.columnFilters.status();
    const assignees = this.columnFilters.assignee();
    const now = Date.now();
    const items = this.reports().filter(item => {
      const matches = !term
        || item.code.toLowerCase().includes(term)
        || item.targetTitle.toLowerCase().includes(term)
        || item.targetAuthor.toLowerCase().includes(term)
        || item.reportedBy.toLowerCase().includes(term)
        || item.reason.toLowerCase().includes(term);
      return matches && (!type || item.type === type) && (!status || item.status === status)
        && (!severity || item.severity === severity)
        && (!types.length || types.includes(item.type))
        && (!severities.length || severities.includes(item.severity))
        && (!reasons.length || reasons.includes(item.reason))
        && (!reporters.length || reporters.includes(item.reportedBy))
        && (!createdDates.length || createdDates.includes(formatDate(item.createdAt)))
        && (!slaStates.length || slaStates.includes(Date.parse(item.slaDueAt) < now ? 'late' : 'ontime'))
        && (!statuses.length || statuses.includes(item.status))
        && (!assignees.length || assignees.includes(item.assignee));
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return [...items].sort((a, b) => {
      if (sort === 'sla') return Date.parse(a.slaDueAt) - Date.parse(b.slaDueAt);
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return sort === 'oldest' ? -delta : delta;
    });
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'Không có báo cáo nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start} - ${Math.min(start + this.pageSize - 1, total)} của ${total} báo cáo`;
  });
  readonly detail = computed(() => this.reports().find(item => item.id === this.detailId()) ?? null);
  readonly detailLogs = computed(() => {
    const id = this.detailId();
    return id ? this.logs().filter(log => log.entity.includes(id)) : [];
  });
  readonly noteError = computed(() => this.noteTouched() && this.resolutionNote().trim().length < 20 ? 'Vui lòng nhập kết luận xử lý tối thiểu 20 ký tự.' : '');
  readonly enforcementOptions: CustomSelectOption[] = [
    { value: 'remove_content', label: 'Gỡ nội dung vi phạm' },
    { value: 'warn', label: 'Cảnh cáo tài khoản' },
    { value: 'restrict_comments', label: 'Hạn chế bình luận 7 ngày' },
    { value: 'lock_account', label: 'Khóa tài khoản vĩnh viễn' }
  ];
  readonly dismissalOptions: CustomSelectOption[] = [
    { value: 'context', label: 'Hiểu lầm ngữ cảnh bài học' },
    { value: 'insufficient', label: 'Bằng chứng không đủ căn cứ' },
    { value: 'false_report', label: 'Báo cáo sai sự thật' },
    { value: 'other', label: 'Lý do khác' }
  ];
  readonly actionError = computed(() => {
    if (!this.actionTouched()) return '';
    if (this.resolutionNote().trim().length < 20) return 'Kết luận xử lý cần tối thiểu 20 ký tự.';
    return '';
  });
  readonly overdueIds = computed(() => {
    const now = Date.now();
    return new Set(this.reports()
      .filter(item => item.status !== 'resolved' && item.status !== 'dismissed' && Date.parse(item.slaDueAt) < now)
      .map(item => item.id));
  });
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every(item => chosen.has(item.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(item => this.selection().has(item.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.reports()
    .filter(item => this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.code, detail: `${item.id} · Người báo cáo: ${item.reportedBy}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(item => !this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.code, detail: `${item.id} · Người báo cáo: ${item.reportedBy}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'resolved', label: 'Giải quyết', tone: 'primary' },
    { key: 'escalated', label: 'Leo thang' },
    { key: 'dismissed', label: 'Bác bỏ' }
  ]);

  isRowMenuOpen(id: string): boolean { return this.rowMenu()?.item.id === id; }

  openRowMenu(event: MouseEvent | KeyboardEvent, item: ContentReport): void {
    event.stopPropagation();
    if (this.rowMenu()?.item.id === item.id) { this.closeRowMenu(); return; }
    this.rowMenuTrigger = event.currentTarget as HTMLElement;
    const rect = this.rowMenuTrigger.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(260, window.innerWidth - margin * 2);
    const count = 1 + (item.status === 'new' ? 1 : 0);
    const height = Math.min(count * 42 + 16, window.innerHeight - margin * 2);
    const below = window.innerHeight - rect.bottom - 6 - margin;
    const top = Math.max(margin, below >= height ? rect.bottom + 6 : rect.top - 6 - height);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width));
    this.rowMenu.set({ item, top, left });
    setTimeout(() => {
      if (this.rowMenu()?.item.id === item.id) document.querySelector<HTMLButtonElement>('#report-row-menu button')?.focus();
    });
  }

  openRowMenuFromKeyboard(event: Event, item: ContentReport): void {
    if (!(event instanceof KeyboardEvent)) return;
    event.preventDefault();
    if (!this.isRowMenuOpen(item.id)) this.openRowMenu(event, item);
  }

  closeRowMenu(): void {
    if (!this.rowMenu()) return;
    this.rowMenu.set(null);
    this.rowMenuTrigger?.focus({ preventScroll: true });
  }

  onRowMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.closeRowMenu(); return; }
    if (event.key === 'Tab') { this.closeRowMenu(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }

  @HostListener('window:resize')
  onMenuResize(): void { this.closeRowMenu(); }

  @HostListener('window:scroll')
  onMenuScroll(): void { this.closeRowMenu(); }

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setType(value: string): void { this.type.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value); this.page.set(1); }
  setSeverity(value: string): void { this.severity.set(value); this.page.set(1); }
  setSort(value: string): void { this.sort.set(value as 'newest' | 'oldest' | 'sla'); this.columnSort.set(null); }

  clearFilters(): void {
    this.search.set(''); this.type.set(''); this.status.set(''); this.severity.set('');
    this.sort.set('newest');
    this.columnSort.set(null);
    Object.values(this.columnFilters).forEach(filter => filter.set([]));
    this.page.set(1);
  }

  filterFor(key: ReportColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: ReportColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
  }

  sortFor(key: ReportColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: ReportColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: ContentReport, column: ReportColumn): string | number {
    switch (column) {
      case 'type': return item.targetTitle;
      case 'severity': return SEVERITY_LABELS[item.severity];
      case 'reason': return item.reason;
      case 'reportedBy': return item.reportedBy;
      case 'created': return Date.parse(item.createdAt);
      case 'slaState': return Date.parse(item.slaDueAt);
      case 'status': return REPORT_STATUS_LABELS[item.status];
      case 'assignee': return item.assignee;
    }
  }

  private withSelected(values: string[], selected: readonly string[]): string[] {
    return [...new Set([...values, ...selected])];
  }

  isSelected(id: string): boolean { return this.selection().has(id); }

  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selection());
    checked ? next.add(id) : next.delete(id);
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

  bulkStatus(status: 'resolved' | 'escalated' | 'dismissed', ids: readonly string[] = this.selectedIds()): void {
    if (!ids.length) return;
    ids.forEach(id => {
      const item = this.reports().find(report => report.id === id);
      const assignee = item && item.assignee !== 'Chưa phân công' ? item.assignee : 'Quản trị viên';
      this.store.updateReport(id, { status, assignee }, `Cập nhật hàng loạt sang ${REPORT_STATUS_LABELS[status]}.`);
    });
    this.clearSelection();
    this.page.set(Math.min(this.page(), this.pages()));
    this.notify(`Đã chuyển ${ids.length} báo cáo sang ${REPORT_STATUS_LABELS[status]}.`, 'success');
  }

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    if (key === 'resolved' || key === 'escalated' || key === 'dismissed') this.bulkStatus(key, ids);
  }

  openDetail(item: ContentReport): void {
    this.detailId.set(item.id);
    this.resolutionDecision.set('resolved');
    this.resolutionNote.set('');
    this.noteTouched.set(false);
    this.enforcement.set('');
    this.dismissalReason.set('');
    this.actionTouched.set(false);
    this.historyOpen.set(false);
    if (item.status === 'new') {
      this.store.updateReport(item.id, { status: 'processing', assignee: 'Quản trị viên' },
        'Tự động ghi nhận Đang điều tra khi mở hồ sơ.');
    }
  }

  closeDetail(): void {
    this.detailId.set(null);
    this.resolutionDecision.set('resolved');
    this.resolutionNote.set('');
    this.noteTouched.set(false);
    this.enforcement.set('');
    this.dismissalReason.set('');
    this.actionTouched.set(false);
    this.historyOpen.set(false);
  }

  toggleHistory(): void {
    this.historyOpen.update(value => !value);
  }

  priorOffenseList(item: ContentReport): number[] {
    return Array.from({ length: item.priorOffenses }, (_, index) => index + 1);
  }

  openOriginal(item: ContentReport): void {
    this.notify(`Đang mở nội dung gốc của ${item.targetId}.`, 'info');
  }

  startProcessing(item: ContentReport): void {
    this.store.updateReport(item.id, { status: 'processing', assignee: 'Quản trị viên' }, 'Tiếp nhận và bắt đầu xử lý báo cáo.');
    this.notify(`Đã nhận xử lý báo cáo ${item.code}.`, 'success');
  }

  resolve(item: ContentReport, status: 'resolved' | 'dismissed'): void {
    this.noteTouched.set(true);
    this.actionTouched.set(true);
    if (this.resolutionNote().trim().length < 20) {
      document.getElementById('resolution-note')?.focus();
      return;
    }
    if (status === 'resolved' && !this.enforcement()) {
      document.getElementById('report-enforcement')?.focus();
      this.notify('Vui lòng chọn hình thức xử lý trước khi kết luận vi phạm.', 'error');
      return;
    }
    if (status === 'dismissed' && !this.dismissalReason()) {
      document.getElementById('report-dismissal')?.focus();
      this.notify('Vui lòng chọn lý do bác bỏ báo cáo.', 'error');
      return;
    }
    const action = status === 'resolved'
      ? this.enforcementOptions.find(option => option.value === this.enforcement())?.label ?? ''
      : this.dismissalOptions.find(option => option.value === this.dismissalReason())?.label ?? '';
    const note = `${action} — ${this.resolutionNote().trim()}`;
    this.store.updateReport(item.id, { status, assignee: item.assignee === 'Chưa phân công' ? 'Quản trị viên' : item.assignee }, note);
    this.noteTouched.set(false);
    this.actionTouched.set(false);
    this.resolutionNote.set('');
    this.enforcement.set('');
    this.dismissalReason.set('');
    this.notify(status === 'resolved' ? `Đã xử lý báo cáo ${item.code}: ${action}.` : `Đã bác bỏ báo cáo ${item.code}: ${action}.`, 'success');
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.filtered().length} báo cáo.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.filtered().length} báo cáo ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  statusLabel(status: ReportStatus): string { return REPORT_STATUS_LABELS[status]; }
  statusTone(status: ReportStatus): string { return REPORT_STATUS_TONE[status]; }
  severityLabel(value: ReportSeverity): string { return SEVERITY_LABELS[value]; }
  severityTone(value: ReportSeverity): string { return SEVERITY_TONE[value]; }
  isOverdue(item: ContentReport): boolean { return this.overdueIds().has(item.id); }
  slaRemaining(item: ContentReport): string {
    const diff = Date.parse(item.slaDueAt) - Date.now();
    const minutes = Math.max(0, Math.round(Math.abs(diff) / 60_000));
    const label = `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
    return diff < 0 ? `Quá hạn ${label}` : `Còn ${label}`;
  }
  dateTime = formatDateTime;
  ago = relativeTime;
  truncate(value: string): string { return value.length > 80 ? `${value.slice(0, 80)}…` : value; }
}
