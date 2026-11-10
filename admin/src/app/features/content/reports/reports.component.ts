import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import {
  formatDateTime, paginationRange, relativeTime, REPORT_STATUS_LABELS, REPORT_STATUS_TONE,
  SEVERITY_LABELS, SEVERITY_TONE
} from '../content-utils';
import { ContentReport, ReportSeverity, ReportStatus } from '../models/content.models';
import { ContentStore } from '../services/content.store';

@Component({
  selector: 'app-content-reports',
  standalone: true,
  imports: [CustomSelectComponent, SearchFieldComponent, ExportMenuComponent, ContentToastComponent],
  templateUrl: './reports.component.html',
  styleUrl: '../content-page.css'
})
export class ContentReportsComponent {
  private readonly store = inject(ContentStore);
  readonly loadError = this.store.loadError;
  private readonly route = inject(ActivatedRoute);

  readonly reports = this.store.reports;
  readonly logs = this.store.logs;
  readonly search = signal('');
  readonly type = signal('');
  readonly status = signal('');
  readonly severity = signal('');
  readonly sort = signal<'newest' | 'oldest' | 'sla'>('newest');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly detailId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly resolutionNote = signal('');
  readonly noteTouched = signal(false);
  readonly enforcement = signal('');
  readonly dismissalReason = signal('');
  readonly actionTouched = signal(false);
  readonly historyOpen = signal(false);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

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
    const items = this.reports().filter(item => {
      const matches = !term
        || item.code.toLowerCase().includes(term)
        || item.targetTitle.toLowerCase().includes(term)
        || item.targetAuthor.toLowerCase().includes(term)
        || item.reportedBy.toLowerCase().includes(term)
        || item.reason.toLowerCase().includes(term);
      return matches && (!type || item.type === type) && (!status || item.status === status)
        && (!severity || item.severity === severity);
    });
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

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setType(value: string): void { this.type.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value); this.page.set(1); }
  setSeverity(value: string): void { this.severity.set(value); this.page.set(1); }
  setSort(value: string): void { this.sort.set(value as 'newest' | 'oldest' | 'sla'); }

  clearFilters(): void {
    this.search.set(''); this.type.set(''); this.status.set(''); this.severity.set('');
    this.sort.set('newest'); this.page.set(1);
  }

  openDetail(item: ContentReport): void {
    this.detailId.set(item.id);
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

  escalate(item: ContentReport): void {
    this.store.updateReport(item.id, { status: 'escalated', severity: 'critical' }, 'Leo thang cho quản trị cấp cao do mức độ nghiêm trọng.');
    this.notify(`Đã leo thang báo cáo ${item.code}.`, 'info');
  }

  resolve(item: ContentReport, status: 'resolved' | 'dismissed'): void {
    this.noteTouched.set(true);
    this.actionTouched.set(true);
    if (this.resolutionNote().trim().length < 20) return;
    if (status === 'resolved' && !this.enforcement()) {
      this.notify('Vui lòng chọn hình thức xử lý trước khi kết luận vi phạm.', 'error');
      return;
    }
    if (status === 'dismissed' && !this.dismissalReason()) {
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
