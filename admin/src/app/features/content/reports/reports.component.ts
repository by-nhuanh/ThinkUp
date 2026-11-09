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
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  readonly counts = computed(() => {
    const items = this.reports();
    const open = items.filter(item => item.status === 'new' || item.status === 'processing' || item.status === 'escalated');
    const now = Date.now();
    return {
      total: items.length,
      fresh: items.filter(item => item.status === 'new').length,
      processing: items.filter(item => item.status === 'processing').length,
      overdue: open.filter(item => Date.parse(item.slaDueAt) < now).length
    };
  });
  readonly typeOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả loại nội dung' },
    { value: 'Bình luận', label: 'Bình luận' },
    { value: 'Đánh giá', label: 'Đánh giá' },
    { value: 'Bài viết', label: 'Bài viết' },
    { value: 'Tài khoản', label: 'Tài khoản' }
  ];
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'new', label: 'Mới tiếp nhận' },
    { value: 'processing', label: 'Đang xử lý' },
    { value: 'escalated', label: 'Đã leo thang' },
    { value: 'resolved', label: 'Đã xử lý' },
    { value: 'dismissed', label: 'Đã bỏ qua' }
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
  readonly noteError = computed(() => this.noteTouched() && this.resolutionNote().trim().length < 5 ? 'Vui lòng nhập kết luận xử lý tối thiểu 5 ký tự.' : '');
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
  }

  closeDetail(): void {
    this.detailId.set(null);
    this.resolutionNote.set('');
    this.noteTouched.set(false);
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
    if (this.noteError()) return;
    const note = this.resolutionNote().trim();
    this.store.updateReport(item.id, { status, assignee: item.assignee === 'Chưa phân công' ? 'Quản trị viên' : item.assignee }, note);
    this.noteTouched.set(false);
    this.resolutionNote.set('');
    this.notify(status === 'resolved' ? `Đã xử lý báo cáo ${item.code}.` : `Đã bỏ qua báo cáo ${item.code}.`, 'success');
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
  dateTime = formatDateTime;
  ago = relativeTime;
  truncate(value: string): string { return value.length > 80 ? `${value.slice(0, 80)}…` : value; }
}
