import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { ExportFormat } from '../../../shared/utils/export-formats';
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

@Component({
  selector: 'app-system-audit',
  standalone: true,
  imports: [
    CustomSelectComponent,
    SearchFieldComponent,
    ExportMenuComponent,
    SystemToastComponent,
    AuditDetailDialogComponent,
    AuditTargetDialogComponent,
    AuditEvidenceDialogComponent,
    AuditExportDialogComponent
  ],
  templateUrl: './audit.component.html',
  styleUrls: ['../system-page.css', './audit.component.css']
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
  readonly page = signal(1);

  readonly detailLog = signal<AuditLog | null>(null);
  readonly targetLog = signal<AuditLog | null>(null);
  readonly evidenceLog = signal<AuditLog | null>(null);
  readonly exportOpen = signal(false);

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
    return this.store.auditLogs().filter((log) => {
      if (query && !`${log.id} ${log.targetId} ${log.targetName} ${log.actorName} ${log.actorRole} ${log.module} ${log.action}`
        .toLowerCase().includes(query)) return false;
      if (this.moduleFilter() !== 'all' && log.module !== this.moduleFilter()) return false;
      if (this.riskFilter() !== 'all' && log.risk !== this.riskFilter()) return false;
      if (this.actionFilter() !== 'all' && this.actionCategory(log.action) !== this.actionFilter()) return false;
      return true;
    });
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
    this.page.set(1);
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
}