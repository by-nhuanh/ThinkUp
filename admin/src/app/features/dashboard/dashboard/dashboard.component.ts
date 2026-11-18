import { afterNextRender, Component, computed, ElementRef, HostListener, inject, Injector, signal, viewChild } from '@angular/core';
import { LucideArrowRight, LucideCircleDollarSign, LucideGraduationCap, LucideMonitorUp, LucideTrendingUp, LucideUsersRound } from '@lucide/angular';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { ColumnFilterComponent, ColumnFilterValue, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { AdminNumberPipe } from '../../../shared/pipes/admin-number.pipe';
import { AdminPrivacyPipe } from '../../../shared/pipes/admin-privacy.pipe';
import { AUDIT_LOGS, DASHBOARD_ACTIONS, DASHBOARD_METRICS, REVENUE_BARS, TOP_COURSES, type AuditLog } from '../../../core/data/mock/dashboard.mock';

type Period = 'Ngày' | 'Tuần' | 'Tháng' | 'Năm' | 'Quý';
type DashboardLogColumn = 'account' | 'role' | 'action';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AdminNumberPipe, AdminPrivacyPipe, DateTimePickerComponent, ColumnFilterComponent, CustomSelectComponent, ExportMenuComponent, SelectionBarComponent, BulkSelectionDialogComponent, LucideArrowRight, LucideCircleDollarSign, LucideGraduationCap, LucideMonitorUp, LucideTrendingUp, LucideUsersRound],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  readonly metrics = DASHBOARD_METRICS;
  readonly actions = DASHBOARD_ACTIONS;
  readonly courses = TOP_COURSES;
  readonly bars = REVENUE_BARS;
  readonly periods: Period[] = ['Ngày', 'Tuần', 'Tháng', 'Năm', 'Quý'];
  readonly period = signal<Period>('Tháng');
  readonly filter = signal('Tất cả');
  readonly filterOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'Tất cả', label: 'Tất cả' },
    { value: 'Finance (FA)', label: 'Finance (FA)' },
    { value: 'Academic (CA)', label: 'Academic (CA)' },
    { value: 'Support (CS)', label: 'Support (CS)' },
    { value: 'Admin', label: 'Admin' }
  ];
  readonly datePickerOpen = signal(false);
  readonly datePopoverPosition = signal<{ left: number; top: number; maxHeight: number } | null>(null);
  private readonly injector = inject(Injector);
  private readonly dateTrigger = viewChild<ElementRef<HTMLButtonElement>>('dateTrigger');
  private readonly datePopover = viewChild<ElementRef<HTMLElement>>('datePopover');
  readonly startDate = signal('2026-09-01');
  readonly endDate = signal('2026-09-30');
  readonly rangeLabel = computed(() => `${this.displayDate(this.startDate())} - ${this.displayDate(this.endDate())}`);
  readonly selectedLog = signal<AuditLog | null>(null);
  readonly toast = signal<string | null>(null);
  readonly logAccountFilter = signal<string[]>([]);
  readonly logRoleFilter = signal<string[]>([]);
  readonly logActionFilter = signal<string[]>([]);
  readonly logAccountValues: readonly ColumnFilterValue[] = [...new Set(AUDIT_LOGS.map(log => log.account))]
    .map(account => ({ value: account, label: account }));
  readonly logRoleValues: readonly ColumnFilterValue[] = this.filterOptions
    .filter(option => option.value !== 'Tất cả')
    .map(option => ({ value: option.value, label: option.label }));
  readonly logActionValues: readonly ColumnFilterValue[] = [...new Set(AUDIT_LOGS.map(log => log.action))]
    .map(action => ({ value: action, label: action }));
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly columnSort = signal<{ column: DashboardLogColumn; direction: 'asc' | 'desc' } | null>(null);
  readonly visibleLogs = computed(() => {
    const accounts = this.logAccountFilter();
    const roles = this.logRoleFilter();
    const actions = this.logActionFilter();
    const logs = AUDIT_LOGS.filter(log =>
      (this.filter() === 'Tất cả' || log.role === this.filter())
      && (!accounts.length || accounts.includes(log.account))
      && (!roles.length || roles.includes(log.role))
      && (!actions.length || actions.includes(log.action)));
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...logs].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return logs;
  });
  readonly payoutPath = this.makePayoutPath();

  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const logs = this.visibleLogs();
    const chosen = this.selection();
    return logs.length > 0 && logs.every(log => chosen.has(log.time));
  });
  readonly someVisibleSelected = computed(() =>
    !this.allVisibleSelected() && this.visibleLogs().some(log => this.selection().has(log.time)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() =>
    AUDIT_LOGS.filter(log => this.selection().has(log.time))
      .map(log => ({ id: log.time, label: log.account, detail: `${log.action} · ${log.time}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() =>
    this.visibleLogs().filter(log => !this.selection().has(log.time))
      .map(log => ({ id: log.time, label: log.account, detail: `${log.action} · ${log.time}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'export', label: 'Xuất mục đã chọn', tone: 'primary', title: 'Tải tệp các mục nhật ký đã chọn' }
  ]);
  private toastTimer?: ReturnType<typeof setTimeout>;

  isLogSelected(time: string): boolean {
    return this.selection().has(time);
  }

  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selection());
    if (checked) next.add(id);
    else next.delete(id);
    this.selection.set(next);
  }

  toggleSelectAll(): void {
    const next = new Set(this.selection());
    if (this.allVisibleSelected()) this.visibleLogs().forEach(log => next.delete(log.time));
    else this.visibleLogs().forEach(log => next.add(log.time));
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
    if (!targets.length || key !== 'export') return;
    const logs = AUDIT_LOGS.filter(log => targets.includes(log.time));
    if (!logs.length) return;
    void downloadTable('xlsx', 'nhat-ky-quan-tri-da-chon', [
      ['Thời gian', 'Tài khoản', 'Role', 'Hành động', 'IP'],
      ...logs.map(log => [log.time, log.account, log.role, log.action, log.ip])
    ]).then(
      () => this.notify(`Đã xuất ${logs.length} mục nhật ký đã chọn.`),
      () => this.notify('Không thể xuất tệp nhật ký. Vui lòng thử lại.')
    );
  }

  private notify(message: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(message);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }

  toggleDatePopover(): void {
    if (this.datePickerOpen()) {
      this.closeDatePopover();
      return;
    }

    this.datePickerOpen.set(true);
    afterNextRender(() => this.positionDatePopover(), { injector: this.injector });
  }

  closeDatePopover(): void {
    this.datePickerOpen.set(false);
    this.datePopoverPosition.set(null);
  }

  @HostListener('document:keydown.escape')
  closeDatePopoverOnEscape(): void {
    if (!this.datePickerOpen()) return;
    this.closeDatePopover();
    this.dateTrigger()?.nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  closeDatePopoverOnOutsideClick(event: MouseEvent): void {
    if (!this.datePickerOpen()) return;
    const path = event.composedPath();
    const trigger = this.dateTrigger()?.nativeElement;
    const popover = this.datePopover()?.nativeElement;
    if ((trigger && path.includes(trigger)) || (popover && path.includes(popover))) return;
    this.closeDatePopover();
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  positionDatePopover(): void {
    const trigger = this.dateTrigger()?.nativeElement;
    const popover = this.datePopover()?.nativeElement;
    if (!trigger || !popover) return;

    const margin = 12;
    const gap = 8;
    const anchor = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const left = Math.max(margin, Math.min(anchor.right - popover.offsetWidth, viewportWidth - margin - popover.offsetWidth));
    const below = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
    const above = Math.max(0, anchor.top - gap - margin);
    const height = popover.scrollHeight + popover.offsetHeight - popover.clientHeight;
    const opensAbove = below < height && above > below;
    const maxHeight = Math.min(opensAbove ? above : below, viewportHeight - 2 * margin);
    const top = opensAbove ? anchor.top - gap - Math.min(height, maxHeight) : anchor.bottom + gap;

    this.datePopoverPosition.set({
      left,
      top: Math.max(margin, Math.min(top, viewportHeight - margin - maxHeight)),
      maxHeight
    });
  }

  private makePayoutPath(): string {
    const points = REVENUE_BARS.map((bar, index) => ({ x: 34 + index * 58, y: 305 - bar.payout }));
    return points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const previous = points[index - 1];
      const midpointX = (previous.x + point.x) / 2;
      return `${path} C ${midpointX} ${previous.y}, ${midpointX} ${point.y}, ${point.x} ${point.y}`;
    }, '');
  }

  // TODO(pre-deploy): Nhớ xóa thông báo thao tác mẫu này khi các chức năng quản trị được nối tới API thực tế.
  showPendingFeature(): void {
    this.toast.set('Chức năng hiện chưa khả dụng.');
    window.setTimeout(() => this.toast.set(null), 3500);
  }

  chooseToday(): void {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.startDate.set(today); this.endDate.set(today);
  }
  private displayDate(value: string): string { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; }
  chooseFilter(value: string): void { this.filter.set(value); }
  setLogColumnFilter(kind: 'account' | 'role' | 'action', values: string[]): void {
    if (kind === 'account') this.logAccountFilter.set(values);
    if (kind === 'role') this.logRoleFilter.set(values);
    if (kind === 'action') this.logActionFilter.set(values);
  }

  sortFor(key: DashboardLogColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: DashboardLogColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
  }

  private sortValue(log: AuditLog, column: DashboardLogColumn): string | number {
    switch (column) {
      case 'account': return log.account;
      case 'role': return log.role;
      case 'action': return log.action;
    }
  }

  exportLogs(format: ExportFormat): void {
    downloadTable(format, 'nhat-ky-quan-tri', [
      ['Thời gian', 'Tài khoản', 'Role', 'Hành động', 'IP'],
      ...this.visibleLogs().map(log => [log.time, log.account, log.role, log.action, log.ip])
    ]);
  }
}
