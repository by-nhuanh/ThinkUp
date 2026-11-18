import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { ColumnFilterComponent, ColumnFilterValue, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { downloadTable } from '../../../shared/utils/export-formats';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';
import { CourseHistoryDialogComponent } from '../components/course-history-dialog/course-history-dialog.component';
import { ApprovalItem, ApprovalStatus } from '../models/course.models';
import { CourseStore } from '../services/course.store';
import {
  APPROVAL_SLA_LABELS, APPROVAL_SLA_TONE, countChars, formatCurrency, formatTime, formatDate, paginationRange
} from '../course-utils';

const QUEUE_TOTAL = 284;
const PAGE_SIZE = 41;

type QueueRange = '' | '7' | '30' | '90';
type ApprovalColumn = 'course' | 'instructor' | 'component' | 'status';

const LEVEL_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'Cơ bản', label: 'Cơ bản' },
  { value: 'Trung cấp', label: 'Trung cấp' },
  { value: 'Nâng cao', label: 'Nâng cao' }
];
const SLA_FILTER_VALUES: ColumnFilterValue[] = [
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'due-soon', label: 'Sắp hạn' },
  { value: 'remaining', label: 'Còn trong hạn' },
  { value: 'waiting', label: 'Chờ GV bổ sung' },
  { value: 'approved', label: 'Đã duyệt' }
];
const BULK_REJECT_REASONS: CustomSelectOption[] = [
  { value: 'Nội dung chưa đạt chất lượng', label: 'Nội dung chưa đạt chất lượng' },
  { value: 'Vi phạm bản quyền', label: 'Vi phạm bản quyền' },
  { value: 'Thông tin sai lệch', label: 'Thông tin sai lệch' },
  { value: 'Vi phạm tiêu chuẩn cộng đồng', label: 'Vi phạm tiêu chuẩn cộng đồng' },
  { value: 'Khác', label: 'Khác' }
];

@Component({
  selector: 'app-course-approvals',
  standalone: true,
  imports: [ColumnFilterComponent, CustomSelectComponent, SearchFieldComponent, ExportMenuComponent, CourseToastComponent, CourseHistoryDialogComponent, AdminDialogComponent, SelectionBarComponent, BulkSelectionDialogComponent],
  templateUrl: './approvals.component.html',
  styleUrls: ['../courses-page.css', './approvals.component.css']
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
  private readonly columnFilters: Record<ApprovalColumn, WritableSignal<string[]>> = {
    course: signal<string[]>([]),
    instructor: signal<string[]>([]),
    component: signal<string[]>([]),
    status: signal<string[]>([])
  };
  readonly page = signal(1);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkRejectIds = signal<readonly string[] | null>(null);
  readonly bulkRejectReason = signal('');
  readonly bulkRejectDetail = signal('');
  readonly bulkRejectTouched = signal(false);
  readonly bulkRejectReasons = BULK_REJECT_REASONS;
  readonly historyItem = signal<ApprovalItem | null>(null);
  readonly historyWorkspace = computed(() => {
    const item = this.historyItem();
    return item ? this.store.workspaces().find(ws => ws.approvalId === item.id) ?? null : null;
  });

  readonly levelOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả cấp độ' },
    ...LEVEL_FILTER_VALUES
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
    ...SLA_FILTER_VALUES
  ];
  readonly rangeOptions: CustomSelectOption[] = [
    { value: '', label: 'Tháng này' },
    { value: '7', label: '7 ngày gần nhất' },
    { value: '30', label: '30 ngày gần nhất' },
    { value: '90', label: '90 ngày gần nhất' }
  ];

  readonly courseValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.approvals().map(item => item.courseTitle))].map(title => ({ value: title, label: title })));
  readonly instructorValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.approvals().map(item => item.instructor))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(instructor => ({ value: instructor, label: instructor })));
  readonly componentValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.approvals().map(item => item.components))]
      .map(value => ({ value, label: value })));
  readonly statusValues = SLA_FILTER_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly columnSort = signal<{ column: ApprovalColumn; direction: 'asc' | 'desc' } | null>(null);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.category();
    const level = this.level();
    const component = this.component();
    const status = this.status();
    const days = Number(this.range());
    const now = Date.now();
    const courses = this.columnFilters.course();
    const instructors = this.columnFilters.instructor();
    const components = this.columnFilters.component();
    const slaStatuses = this.columnFilters.status();
    const items = this.approvals().filter(item => {
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
        && (!status || item.slaStatus === status)
        && (!courses.length || courses.includes(item.courseTitle))
        && (!instructors.length || instructors.includes(item.instructor))
        && (!components.length || components.includes(item.components))
        && (!slaStatuses.length || slaStatuses.includes(item.slaStatus));
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
  });

  readonly hasFilters = computed(() => Boolean(
    this.search() || this.category() || this.level() || this.component() || this.status() || this.range()
    || this.columnFilters.course().length || this.columnFilters.instructor().length
    || this.columnFilters.component().length || this.columnFilters.status().length
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
  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every(item => chosen.has(item.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(item => this.selection().has(item.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.approvals()
    .filter(item => this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.courseTitle, detail: `${item.courseId} · ${item.instructor}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(item => !this.selection().has(item.id))
    .map(item => ({ id: item.id, label: item.courseTitle, detail: `${item.courseId} · ${item.instructor}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'approve', label: 'Duyệt & phát hành', tone: 'primary' },
    { key: 'reject', label: 'Từ chối', tone: 'danger' },
    { key: 'export', label: 'Xuất đã chọn' }
  ]);
  readonly bulkRejectCharCount = computed(() => countChars(this.bulkRejectDetail()));
  readonly bulkRejectError = computed(() => this.bulkRejectTouched() && this.bulkRejectCharCount() < 20
    ? `Cần thêm ${20 - this.bulkRejectCharCount()} ký tự để đạt tối thiểu 20.`
    : '');
  readonly canBulkReject = computed(() => Boolean(this.bulkRejectReason()) && this.bulkRejectCharCount() >= 20);

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

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    const targetIds = ids ?? this.selectedIds();
    if (!targetIds.length) return;
    if (key === 'export') { this.exportSelection(targetIds); return; }
    if (key === 'reject') { this.openBulkReject(targetIds); return; }
    const chosen = new Set(targetIds);
    const targets = this.approvals().filter(item => chosen.has(item.id) && item.slaStatus !== 'approved');
    if (!targets.length) { this.notify('Các yêu cầu đã chọn đều đã được duyệt.', 'info'); return; }
    targets.forEach(item => this.store.approveApproval(item.id));
    this.clearSelection();
    this.notify(`Đã phê duyệt và phát hành ${targets.length} khóa học.`, 'success');
  }

  openBulkReject(ids: readonly string[]): void {
    this.bulkRejectIds.set(ids);
    this.bulkRejectReason.set('');
    this.bulkRejectDetail.set('');
    this.bulkRejectTouched.set(false);
  }

  closeBulkReject(): void { this.bulkRejectIds.set(null); }

  confirmBulkReject(): void {
    const ids = this.bulkRejectIds();
    this.bulkRejectTouched.set(true);
    if (!ids?.length || !this.canBulkReject()) return;
    const reason = this.bulkRejectReason();
    const detail = this.bulkRejectDetail().trim();
    ids.forEach(id => this.store.rejectApproval(id, reason, detail));
    this.bulkRejectIds.set(null);
    this.clearSelection();
    this.notify(`Đã từ chối ${ids.length} yêu cầu duyệt và gửi lý do tới giảng viên.`, 'success');
  }

  private exportSelection(ids: readonly string[]): void {
    const chosen = new Set(ids);
    const rows: (string | number)[][] = [
      ['Mã yêu cầu', 'Mã khóa học', 'Tên khóa học', 'Giảng viên', 'Cấp độ', 'Giá đề xuất', 'Thời gian nộp', 'Trạng thái SLA'],
      ...this.approvals().filter(item => chosen.has(item.id)).map(item => [
        item.id, item.courseId, item.courseTitle, item.instructor, item.level,
        item.suggestedPrice, formatDate(item.submittedAt), APPROVAL_SLA_LABELS[item.slaStatus]
      ])
    ];
    this.notify(`Đang tạo tệp XLSX cho ${ids.length} yêu cầu duyệt đã chọn.`, 'info');
    void downloadTable('xlsx', 'yeu-cau-duyet-da-chon', rows)
      .then(() => this.notify(`Đã xuất ${ids.length} yêu cầu duyệt đã chọn ra tệp XLSX.`, 'success'))
      .catch(() => this.notify('Không thể tạo tệp xuất. Vui lòng thử lại.', 'error'));
  }

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setCategory(value: string): void { this.category.set(value); this.page.set(1); }
  setLevel(value: string): void { this.level.set(value); this.page.set(1); }
  setComponent(value: string): void { this.component.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value as '' | ApprovalStatus); this.page.set(1); }
  setRange(value: string): void { this.range.set(value as QueueRange); this.page.set(1); }

  filterFor(key: ApprovalColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: ApprovalColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
  }

  sortFor(key: ApprovalColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: ApprovalColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: ApprovalItem, column: ApprovalColumn): string | number {
    switch (column) {
      case 'course': return item.courseTitle;
      case 'instructor': return item.instructor;
      case 'component': return item.components;
      case 'status': return this.statusLabel(item);
    }
  }

  clearFilters(): void {
    this.search.set(''); this.category.set(''); this.level.set(''); this.component.set('');
    this.status.set(''); this.range.set('');
    this.columnFilters.course.set([]); this.columnFilters.instructor.set([]);
    this.columnFilters.component.set([]); this.columnFilters.status.set([]);
    this.columnSort.set(null);
    this.page.set(1);
  }

  goToPage(value: number | '...'): void {
    if (value === '...') return;
    this.page.set(Math.min(Math.max(1, value), this.pages()));
  }

  open(item: ApprovalItem): void {
    this.router.navigate(['/courses/approvals', item.id]);
  }

  openHistory(item: ApprovalItem): void {
    this.historyItem.set(item);
  }

  closeHistory(): void {
    this.historyItem.set(null);
  }

  openHistoryDetail(): void {
    const item = this.historyItem();
    this.historyItem.set(null);
    if (item) this.router.navigate(['/courses/approvals', item.id]);
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
