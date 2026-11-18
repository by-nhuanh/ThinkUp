import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ColumnFilterComponent, ColumnFilterSection, ColumnFilterValue, DATE_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { ExportFormat, downloadTable } from '../../../shared/utils/export-formats';
import { AuditLog, AuditRisk } from '../models/system.models';
import { SYSTEM_STORE } from '../data/system.store';
import { SystemToastService } from '../services/system-toast.service';
import { SystemToastComponent } from '../components/system-toast/system-toast.component';
import { AuditDetailDialogComponent } from '../components/audit-detail-dialog/audit-detail-dialog.component';
import { AuditTargetDialogComponent } from '../components/audit-target-dialog/audit-target-dialog.component';
import { AuditEvidenceDialogComponent } from '../components/audit-evidence-dialog/audit-evidence-dialog.component';
import { AuditExportDialogComponent, AuditExportRequest } from '../components/audit-export-dialog/audit-export-dialog.component';

const MODULE_OPTIONS = [
  'Rút tiền giảng viên',
  'Quản lý Đơn hàng',
  'Duyệt Khóa học',
  'Quản lý Giảng viên',
  'Quản lý Học viên',
  'Quản lý Voucher',
  'Cấu hình sàn',
  'Phân quyền Admin'
];

const ACTION_CATEGORIES = ['Phê duyệt', 'Từ chối', 'Kỷ luật / Khóa', 'Cập nhật cấu hình', 'Đổi vai trò', 'Mở khóa'];

type AuditColumn = 'module' | 'action' | 'actor' | 'outcome' | 'risk';

const OUTCOME_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'success', label: 'Thành công' },
  { value: 'failed', label: 'Thất bại' }
];

@Component({
  selector: 'app-system-audit',
  standalone: true,
  imports: [
    ColumnFilterComponent,
    CustomSelectComponent,
    SearchFieldComponent,
    ExportMenuComponent,
    SelectionBarComponent,
    BulkSelectionDialogComponent,
    SystemToastComponent,
    AuditDetailDialogComponent,
    AuditTargetDialogComponent,
    AuditEvidenceDialogComponent,
    AuditExportDialogComponent
  ],
  templateUrl: './audit.component.html',
  styleUrls: ['../system-page.css', './audit.component.css', '../system-list-support.css']
})
export class AuditComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(SYSTEM_STORE);
  private readonly toast = inject(SystemToastService);

  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly integrity = computed(() =>
    this.queryParams()?.get('integrity') === 'broken' ? 'broken' : this.store.auditSummary().integrity);
  readonly exportFailure = computed(() => this.queryParams()?.get('exportError') === '1');
  readonly broken = computed(() => this.integrity() === 'broken');

  readonly search = signal('');
  readonly timeFilter = signal('today');
  readonly moduleFilter = signal('all');
  readonly riskFilter = signal('all');
  readonly actionFilter = signal('all');
  private readonly columnFilters: Record<AuditColumn, WritableSignal<string[]>> = {
    module: signal<string[]>([]),
    action: signal<string[]>([]),
    actor: signal<string[]>([]),
    outcome: signal<string[]>([]),
    risk: signal<string[]>([])
  };
  readonly page = signal(1);

  readonly detailLog = signal<AuditLog | null>(null);
  readonly targetLog = signal<AuditLog | null>(null);
  readonly evidenceLog = signal<AuditLog | null>(null);
  readonly exportOpen = signal(false);

  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.paged();
    const chosen = this.selection();
    return items.length > 0 && items.every((log) => chosen.has(log.id));
  });
  readonly someVisibleSelected = computed(() =>
    !this.allVisibleSelected() && this.paged().some((log) => this.selection().has(log.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() =>
    this.store.auditLogs()
      .filter((log) => this.selection().has(log.id))
      .map((log) => ({ id: log.id, label: log.actorName, detail: `${log.id} · ${log.action}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() =>
    this.filtered()
      .filter((log) => !this.selection().has(log.id))
      .map((log) => ({ id: log.id, label: log.actorName, detail: `${log.id} · ${log.action}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    {
      key: 'export',
      label: 'Xuất mục đã chọn',
      tone: 'primary',
      disabled: this.broken(),
      title: this.broken() ? 'Chức năng kiểm toán đang tạm khóa' : 'Tải tệp các mục đã chọn'
    },
    { key: 'copy', label: 'Sao chép mã log' }
  ]);

  readonly timeOptions = [
    { value: 'today', label: 'Hôm nay · 03/11/2026' },
    { value: 'month', label: 'Tháng này · 11/2026' }
  ];
  readonly moduleOptions = [
    { value: 'all', label: 'Tất cả phân hệ' },
    ...MODULE_OPTIONS.map((module) => ({ value: module, label: module }))
  ];
  readonly riskOptions = [
    { value: 'all', label: 'Tất cả mức độ' },
    { value: 'normal', label: 'Thông thường' },
    { value: 'attention', label: 'Chú ý' },
    { value: 'high', label: 'Nguy cơ cao' }
  ];
  readonly actionOptions = [
    { value: 'all', label: 'Tất cả hành động' },
    ...ACTION_CATEGORIES.map((action) => ({ value: action, label: action }))
  ];

  readonly moduleValues: ColumnFilterValue[] = MODULE_OPTIONS.map((module) => ({ value: module, label: module }));
  readonly actionValues: ColumnFilterValue[] = ACTION_CATEGORIES.map((action) => ({ value: action, label: action }));
  readonly riskValues: ColumnFilterValue[] = this.riskOptions
    .filter((option) => option.value !== 'all')
    .map((option) => ({ value: option.value, label: option.label }));
  readonly outcomeValues = OUTCOME_FILTER_VALUES;
  readonly actorValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.store.auditLogs().map((log) => log.actorName))].map((name) => ({ value: name, label: name })));
  readonly eventFilterSections = computed<ColumnFilterSection[]>(() => [
    { key: 'module', title: 'Phân hệ', values: this.moduleValues, selected: this.columnFilters.module() },
    { key: 'action', title: 'Hành động', values: this.actionValues, selected: this.columnFilters.action() },
    { key: 'outcome', title: 'Kết quả', values: this.outcomeValues, selected: this.columnFilters.outcome() }
  ]);
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly columnSort = signal<{ column: AuditColumn | 'event'; direction: 'asc' | 'desc' } | null>(null);

  readonly summary = computed(() => this.store.auditSummary());
  readonly totalLabel = computed(() => this.summary().totalToday.toLocaleString('vi-VN'));
  readonly exportCount = computed(() => this.timeFilter() === 'month' ? 62850 : this.summary().totalToday);
  readonly exportCountLabel = computed(() => this.exportCount().toLocaleString('vi-VN'));
  readonly riskFilterLabel = computed(() => {
    const value = this.riskFilter();
    return value === 'all' ? 'Tất cả' : this.riskLabel(value as AuditRisk);
  });

  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const modules = this.columnFilters.module();
    const actions = this.columnFilters.action();
    const actors = this.columnFilters.actor();
    const outcomes = this.columnFilters.outcome();
    const risks = this.columnFilters.risk();
    const items = this.store.auditLogs().filter((log) => {
      if (query && !`${log.id} ${log.targetId} ${log.targetName} ${log.actorName} ${log.actorRole} ${log.module} ${log.action}`
        .toLowerCase().includes(query)) return false;
      if (this.moduleFilter() !== 'all' && log.module !== this.moduleFilter()) return false;
      if (this.riskFilter() !== 'all' && log.risk !== this.riskFilter()) return false;
      if (this.actionFilter() !== 'all' && this.actionCategory(log.action) !== this.actionFilter()) return false;
      if (modules.length && !modules.includes(log.module)) return false;
      if (actions.length && !actions.includes(this.actionCategory(log.action))) return false;
      if (actors.length && !actors.includes(log.actorName)) return false;
      if (outcomes.length && !outcomes.includes(log.outcome)) return false;
      if (risks.length && !risks.includes(log.risk)) return false;
      return true;
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / 5)));
  readonly safePage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly paged = computed(() => this.filtered().slice((this.safePage() - 1) * 5, this.safePage() * 5));
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'Không có bản ghi nào · Mới nhất trước · Giờ Việt Nam (UTC+7)';
    const start = (this.safePage() - 1) * 5 + 1;
    return `Hiển thị ${start}–${Math.min(start + 4, total)} trong ${total.toLocaleString('vi-VN')} bản ghi · Mới nhất trước · Giờ Việt Nam (UTC+7)`;
  });
  readonly pageItems = computed(() => {
    const last = this.totalPages();
    const current = this.safePage();
    if (last <= 5) return Array.from({ length: last }, (_, index) => index + 1);
    if (current <= 3) return [1, 2, 3, '…', last];
    if (current >= last - 2) return [1, '…', last - 2, last - 1, last];
    return [1, '…', current, '…', last];
  });

  actionCategory(action: string): string {
    if (action.includes('Từ chối')) return 'Từ chối';
    if (action.includes('Khóa') || action.includes('Kỷ luật')) return 'Kỷ luật / Khóa';
    if (action.includes('cấu hình')) return 'Cập nhật cấu hình';
    if (action.includes('vai trò')) return 'Đổi vai trò';
    if (action.includes('Mở khóa')) return 'Mở khóa';
    if (action.includes('Phê duyệt') || action.includes('Duyệt')) return 'Phê duyệt';
    return action;
  }

  riskLabel(risk: AuditRisk): string {
    return risk === 'high' ? 'Nguy cơ cao' : risk === 'attention' ? 'Chú ý' : 'Thông thường';
  }

  riskClass(risk: AuditRisk): string {
    return risk === 'high' ? 'status-badge status-danger' : risk === 'attention' ? 'status-badge status-warning' : 'status-badge status-info';
  }

  /** Mã vai trò rút từ chuỗi "Finance Admin (FA)" để dùng đúng bảng màu chip của trang phân quyền. */
  roleCode(role: string): string {
    const match = role.match(/\(([A-Z]{2})\)/);
    return match ? match[1].toLowerCase() : 'ca';
  }

  moduleChipClass(module: string): string {
    const map: Record<string, string> = {
      'Rút tiền giảng viên': 'module-chip chip-blue',
      'Quản lý Đơn hàng': 'module-chip chip-cyan',
      'Duyệt Khóa học': 'module-chip chip-violet',
      'Quản lý Giảng viên': 'module-chip chip-green',
      'Quản lý Học viên': 'module-chip chip-green',
      'Quản lý Voucher': 'module-chip chip-amber',
      'Cấu hình sàn': 'module-chip chip-grey',
      'Phân quyền Admin': 'module-chip chip-violet'
    };
    return map[module] ?? 'module-chip chip-grey';
  }

  setFilter(kind: 'time' | 'module' | 'risk' | 'action', value: string): void {
    if (kind === 'time') this.timeFilter.set(value);
    if (kind === 'module') this.moduleFilter.set(value);
    if (kind === 'risk') this.riskFilter.set(value);
    if (kind === 'action') this.actionFilter.set(value);
    this.page.set(1);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  filterHighRisk(): void {
    this.riskFilter.set('high');
    this.page.set(1);
  }

  resetFilters(): void {
    this.search.set('');
    this.timeFilter.set('today');
    this.moduleFilter.set('all');
    this.riskFilter.set('all');
    this.actionFilter.set('all');
    this.columnFilters.module.set([]);
    this.columnFilters.action.set([]);
    this.columnFilters.actor.set([]);
    this.columnFilters.outcome.set([]);
    this.columnFilters.risk.set([]);
    this.columnSort.set(null);
    this.page.set(1);
  }

  filterFor(key: AuditColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: AuditColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
  }

  updateEventSectionFilter(change: { key: string; values: string[] }): void {
    this.updateColumnFilter(change.key as AuditColumn, change.values);
  }

  sortFor(key: AuditColumn | 'event'): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: AuditColumn | 'event', direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(log: AuditLog, column: AuditColumn | 'event'): string | number {
    switch (column) {
      case 'module': return log.module;
      case 'action': return this.actionCategory(log.action);
      case 'actor': return log.actorName;
      case 'outcome': return log.outcome === 'success' ? 'Thành công' : 'Thất bại';
      case 'risk': return this.riskLabel(log.risk);
      case 'event': return eventTimestamp(log.at);
    }
  }

  goToPage(item: number | string): void {
    if (typeof item === 'number') this.page.set(item);
  }

  openDetail(log: AuditLog): void {
    this.detailLog.set(log);
  }

  openTarget(log: AuditLog): void {
    this.targetLog.set(log);
  }

  openEvidence(log: AuditLog): void {
    this.evidenceLog.set(log);
  }

  openExport(format: ExportFormat): void {
    if (this.broken()) {
      this.toast.show('Chức năng kiểm toán đang tạm khóa', 'error', 4200, 'Checksum sai lệch — liên hệ quản trị hệ thống để kiểm tra.');
      return;
    }
    this.exportFormat.set(format);
    this.exportOpen.set(true);
  }

  readonly exportFormat = signal<ExportFormat>('xlsx');

  onExported(request: AuditExportRequest): void {
    this.exportOpen.set(false);
    this.toast.show('Báo cáo đã sẵn sàng', 'success', 5200,
      `${request.fileName} đang được tải xuống.\n${this.exportCountLabel()} bản ghi · Có mã kiểm tra toàn vẹn.`);
  }

  onPrintRecord(): void {
    // TODO(pre-deploy): Nhớ nối API in/xuất PDF bản ghi kiểm toán khi backend sẵn sàng.
    this.toast.show('Đã gửi yêu cầu in bản ghi', 'success', 3200, 'Bản demo: PDF sẽ được tạo từ máy chủ khi nối API.');
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
    if (this.allVisibleSelected()) this.paged().forEach((log) => next.delete(log.id));
    else this.paged().forEach((log) => next.add(log.id));
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
    if (key === 'export') this.exportSelection(targets);
    if (key === 'copy') this.copyLogIds(targets);
  }

  private exportSelection(ids: readonly string[]): void {
    if (this.broken()) {
      this.toast.show('Chức năng kiểm toán đang tạm khóa', 'error', 4200, 'Checksum sai lệch — liên hệ quản trị hệ thống để kiểm tra.');
      return;
    }
    const logs = this.store.auditLogs().filter((log) => ids.includes(log.id));
    if (!logs.length) return;
    const header = ['Mã Log', 'Thời gian', 'Quản trị viên', 'Email', 'Vai trò', 'Phân hệ', 'Hành động', 'Kết quả', 'Đối tượng', 'IP', 'Mức độ'];
    const body = logs.map((log) => [
      log.id, log.at, log.actorName, log.actorEmail, log.actorRole,
      log.module, log.action, log.outcome === 'success' ? 'Thành công' : 'Thất bại',
      `${log.targetId} · ${log.targetName}`, log.ip, log.risk
    ]);
    const rows: (string | number)[][] = [header, ...body, ['Checksum', logs[0].checksum]];
    void downloadTable('xlsx', 'audit_log_da_chon', rows).then(
      () => this.toast.show('Đã xuất mục đã chọn', 'success', 5200,
        `${logs.length} bản ghi · Tệp audit_log_da_chon.xlsx đang được tải xuống.`),
      () => this.toast.show('Không thể xuất tệp', 'error', 4200, 'Đã xảy ra lỗi khi tạo tệp. Vui lòng thử lại.')
    );
  }

  private copyLogIds(ids: readonly string[]): void {
    if (!navigator.clipboard?.writeText) {
      this.toast.show('Không thể sao chép mã log', 'error', 4200, 'Trình duyệt không hỗ trợ clipboard trong ngữ cảnh này.');
      return;
    }
    void navigator.clipboard.writeText(ids.join('\n')).then(
      () => this.toast.show(`Đã sao chép ${ids.length} mã log`, 'success'),
      () => this.toast.show('Không thể sao chép mã log', 'error', 4200, 'Clipboard bị chặn. Vui lòng cấp quyền và thử lại.')
    );
  }
}

function eventTimestamp(value: string): number {
  const [datePart, timePart] = value.replace('·', ' ').split(/\s+/);
  const [day, month, year] = datePart.split('/');
  if (!day || !month || !year) return 0;
  const parsed = Date.parse(`${year}-${month}-${day}T${timePart || '00:00:00'}`);
  return Number.isNaN(parsed) ? 0 : parsed;
}