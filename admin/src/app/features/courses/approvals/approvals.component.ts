import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';
import { ApprovalItem, ApprovalStatus } from '../models/course.models';
import { CourseStore } from '../services/course.store';
import {
  APPROVAL_SLA_LABELS, APPROVAL_SLA_TONE, formatCurrency, formatTime, formatDate, paginationRange
} from '../course-utils';

const QUEUE_TOTAL = 284;
const PAGE_SIZE = 41;

type QueueRange = '' | '7' | '30' | '90';

@Component({
  selector: 'app-course-approvals',
  standalone: true,
  imports: [CustomSelectComponent, SearchFieldComponent, ExportMenuComponent, CourseToastComponent],
  templateUrl: './approvals.component.html',
  styleUrl: '../courses-page.css'
})
export class CourseApprovalsComponent {
  private readonly store = inject(CourseStore);
  private readonly router = inject(Router);

  readonly loadError = this.store.loadError;
  readonly approvals = this.store.approvals;
  readonly search = signal('');
  readonly category = signal('');
  readonly level = signal('');
  readonly component = signal('');
  readonly status = signal<'' | ApprovalStatus>('');
  readonly range = signal<QueueRange>('');
  readonly page = signal(1);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  readonly levelOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả cấp độ' },
    { value: 'Cơ bản', label: 'Cơ bản' },
    { value: 'Trung cấp', label: 'Trung cấp' },
    { value: 'Nâng cao', label: 'Nâng cao' }
  ];
  readonly categoryOptions = computed<CustomSelectOption[]>(() => {
    const seen = new Set(this.approvals().map(item => item.category));
    return [{ value: '', label: 'Tất cả danh mục' }, ...[...seen].map(value => ({ value, label: value }))];
  });
  readonly componentOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả học phần' },
    { value: 'Thông tin chung', label: 'Thông tin chung' },
    { value: 'Video / Bài đọc', label: 'Video / Bài đọc' },
    { value: 'Quiz & tài liệu', label: 'Quiz & tài liệu' },
    { value: 'Bài tập lập trình (IDE)', label: 'Bài tập lập trình (IDE)' }
  ];
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'overdue', label: 'Quá hạn' },
    { value: 'due-soon', label: 'Sắp hạn' },
    { value: 'remaining', label: 'Còn trong hạn' },
    { value: 'waiting', label: 'Chờ GV bổ sung' },
    { value: 'approved', label: 'Đã duyệt' }
  ];
  readonly rangeOptions: CustomSelectOption[] = [
    { value: '', label: 'Tháng này' },
    { value: '7', label: '7 ngày gần nhất' },
    { value: '30', label: '30 ngày gần nhất' },
    { value: '90', label: '90 ngày gần nhất' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.category();
    const level = this.level();
    const component = this.component();
    const status = this.status();
    const days = Number(this.range());
    const now = Date.now();
    return this.approvals().filter(item => {
      const matches = !term
        || item.courseId.toLowerCase().includes(term)
        || item.courseTitle.toLowerCase().includes(term)
        || item.instructor.toLowerCase().includes(term)
        || item.id.toLowerCase().includes(term);
      const inRange = !days || (now - Date.parse(item.submittedAt)) / 86_400_000 <= days;
      return matches && inRange
        && (!category || item.category === category)
        && (!level || item.level === level)
        && (!component || item.components === component)
        && (!status || item.slaStatus === status);
    });
  });

  readonly hasFilters = computed(() => Boolean(
    this.search() || this.category() || this.level() || this.component() || this.status() || this.range()
  ));
  readonly total = computed(() => this.hasFilters() ? this.filtered().length : QUEUE_TOTAL);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly rangeLabel = computed(() => {
    const total = this.total();
    if (!total) return 'Không có yêu cầu duyệt nào';
    const start = (this.page() - 1) * PAGE_SIZE + 1;
    return `Hiển thị ${start}–${start + this.visible().length - 1} trong ${total} yêu cầu duyệt`;
  });

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setCategory(value: string): void { this.category.set(value); this.page.set(1); }
  setLevel(value: string): void { this.level.set(value); this.page.set(1); }
  setComponent(value: string): void { this.component.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value as '' | ApprovalStatus); this.page.set(1); }
  setRange(value: string): void { this.range.set(value as QueueRange); this.page.set(1); }

  clearFilters(): void {
    this.search.set(''); this.category.set(''); this.level.set(''); this.component.set('');
    this.status.set(''); this.range.set(''); this.page.set(1);
  }

  goToPage(value: number | '...'): void {
    if (value === '...') return;
    this.page.set(Math.min(Math.max(1, value), this.pages()));
  }

  open(item: ApprovalItem): void {
    this.router.navigate(['/courses/approvals', item.id]);
  }

  openHistory(item: ApprovalItem): void {
    this.router.navigate(['/courses/approvals', item.id], { queryParams: { history: 1 } });
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.total()} yêu cầu duyệt.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.total()} yêu cầu duyệt ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  statusLabel(item: ApprovalItem): string { return APPROVAL_SLA_LABELS[item.slaStatus]; }
  statusTone(item: ApprovalItem): string { return APPROVAL_SLA_TONE[item.slaStatus]; }
  actionLabel(item: ApprovalItem): string {
    return item.action === 'inspect' ? 'Kiểm định ngay' : item.action === 'history' ? 'Xem lịch sử' : 'Xem hồ sơ';
  }
  submittedLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startOfToday - startOfDate) / 86_400_000);
    if (days === 0) return 'Hôm nay';
    if (days === 1) return 'Hôm qua';
    return formatDate(value);
  }
  submittedTime(value: string): string { return formatTime(value); }
  discountLabel(item: ApprovalItem): string { return item.discount > 0 ? `−${item.discount}%` : 'Giá gốc'; }
  money = formatCurrency;
}
