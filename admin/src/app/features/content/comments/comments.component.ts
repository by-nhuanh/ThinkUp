import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, NUMBER_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { Component, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import {
  COMMENT_STATUS_LABELS, COMMENT_STATUS_TONE, formatDate, formatDateTime, number, paginationRange, relativeTime, ROLE_TONE
} from '../content-utils';
import { CommentSource, CommentStatus, ContentComment, ReportSeverity } from '../models/content.models';
import { ContentStore } from '../services/content.store';

type CommentColumn = 'author' | 'context' | 'source' | 'time' | 'safety' | 'status';

const SAFETY_VALUES: ColumnFilterValue[] = [
  { value: 'clean', label: 'Sạch' },
  { value: 'reported', label: 'Bị báo cáo' },
  { value: 'blocked', label: 'Đã chặn' }
];

const COMMENT_STATUS_VALUES: ColumnFilterValue[] = (Object.keys(COMMENT_STATUS_LABELS) as CommentStatus[])
  .map(status => ({ value: status, label: COMMENT_STATUS_LABELS[status] }));

const COMMENT_SOURCE_VALUES: ColumnFilterValue[] = [
  { value: 'course', label: 'Khóa học và Bài giảng' },
  { value: 'blog', label: 'Bài viết Blog' }
];

@Component({
  selector: 'app-content-comments',
  standalone: true,
  imports: [AdminDialogComponent, BulkSelectionDialogComponent, ColumnFilterComponent, CustomSelectComponent, SearchFieldComponent, ExportMenuComponent, SelectionBarComponent, ContentToastComponent],
  templateUrl: './comments.component.html',
  styleUrls: ['../content-page.css', '../content-moderation.css', './comments.component.css']
})
export class ContentCommentsComponent {
  private readonly store = inject(ContentStore);
  readonly loadError = this.store.loadError;

  readonly rowMenu = signal<{ item: ContentComment; top: number; left: number } | null>(null);
  private rowMenuTrigger: HTMLElement | null = null;

  readonly comments = computed(() => this.store.comments().filter(item => !item.transferredReportId));
  readonly search = signal('');
  readonly role = signal('');
  readonly timeRange = signal<'7d' | '30d' | '90d' | 'all'>('30d');
  readonly status = signal('');
  readonly sort = signal<'newest' | 'oldest' | 'reports'>('newest');
  readonly page = signal(1);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  private readonly pageSizeService = inject(AdminPageSizeService);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkDeleteIds = signal<readonly string[] | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly deleteTarget = signal<ContentComment | null>(null);
  readonly deleteReason = signal('');
  readonly deleteReasonTouched = signal(false);
  readonly deleteReasonError = computed(() => this.deleteReasonTouched() && this.deleteReason().trim().length < 10 ? 'Lý do xóa cần tối thiểu 10 ký tự.' : '');
  readonly canConfirmDelete = computed(() => {
    const reason = this.deleteReason().trim();
    return reason.length >= 10 && reason.length <= 500;
  });
  readonly replyId = signal<string | null>(null);
  readonly replyText = signal('');
  readonly replyTouched = signal(false);
  readonly spamTarget = signal<ContentComment | null>(null);
  readonly spamDuration = signal<'24h' | '7d' | 'forever'>('24h');
  readonly transferTarget = signal<ContentComment | null>(null);
  readonly transferSeverity = signal<'' | ReportSeverity>('');
  readonly transferReason = signal('');
  readonly transferTouched = signal(false);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  private readonly columnFilters: Record<CommentColumn, WritableSignal<string[]>> = {
    author: signal<string[]>([]),
    context: signal<string[]>([]),
    source: signal<string[]>([]),
    time: signal<string[]>([]),
    safety: signal<string[]>([]),
    status: signal<string[]>([])
  };

  readonly safetyValues = SAFETY_VALUES;
  readonly commentStatusValues = COMMENT_STATUS_VALUES;
  readonly sourceValues = COMMENT_SOURCE_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly numberSorts = NUMBER_SORT_OPTIONS;
  readonly columnSort = signal<{ column: CommentColumn; direction: 'asc' | 'desc' } | null>(null);
  readonly authorValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.comments().map(item => item.author))], this.columnFilters.author())
      .map(item => ({ value: item, label: item })));
  readonly contextValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.comments().map(item => item.contextTitle))], this.columnFilters.context())
      .map(item => ({ value: item, label: item })));
  readonly timeValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.comments().map(item => formatDate(item.createdAt)))], this.columnFilters.time())
      .map(item => ({ value: item, label: item })));

  readonly counts = computed(() => {
    const items = this.comments();
    return {
      total: items.length,
      visible: items.filter(item => item.status === 'visible').length,
      pending: items.filter(item => item.status === 'pending').length,
      flagged: items.filter(item => item.status === 'flagged').length,
      hidden: items.filter(item => item.status === 'hidden' || item.status === 'spam').length,
      course: items.filter(item => item.contextType === 'course').length,
      blog: items.filter(item => item.contextType === 'blog').length
    };
  });
  readonly roleOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả vai trò' },
    { value: 'Học viên', label: 'Học viên' },
    { value: 'Giảng viên', label: 'Giảng viên' },
    { value: 'Tác giả', label: 'Tác giả' },
    { value: 'Admin', label: 'Admin' }
  ];
  readonly timeOptions: CustomSelectOption[] = [
    { value: '7d', label: '7 ngày qua' },
    { value: '30d', label: '30 ngày qua' },
    { value: '90d', label: '90 ngày qua' },
    { value: 'all', label: 'Tất cả thời gian' }
  ];
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'visible', label: 'Đang hiển thị' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'flagged', label: 'Bị báo cáo' },
    { value: 'hidden', label: 'Đã ẩn' },
    { value: 'spam', label: 'Spam' }
  ];
  readonly sortOptions: CustomSelectOption[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'oldest', label: 'Cũ nhất' },
    { value: 'reports', label: 'Nhiều báo cáo' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.role();
    const timeRange = this.timeRange();
    const status = this.status();
    const sort = this.sort();
    const authorFilters = this.columnFilters.author();
    const contextFilters = this.columnFilters.context();
    const sourceFilters = this.columnFilters.source();
    const timeFilters = this.columnFilters.time();
    const safetyFilters = this.columnFilters.safety();
    const statusFilters = this.columnFilters.status();
    const cutoff = timeRange === 'all' ? 0 : Date.now() - Number(timeRange.replace('d', '')) * 86_400_000;
    const items = this.comments().filter(item => {
      const matches = !term
        || item.author.toLowerCase().includes(term)
        || item.content.toLowerCase().includes(term)
        || item.contextTitle.toLowerCase().includes(term);
      return matches
        && (!role || item.authorRole === role)
        && (!status || item.status === status)
        && (timeRange === 'all' || Date.parse(item.createdAt) >= cutoff)
        && (!authorFilters.length || authorFilters.includes(item.author))
        && (!contextFilters.length || contextFilters.includes(item.contextTitle))
        && (!sourceFilters.length || sourceFilters.includes(item.contextType))
        && (!timeFilters.length || timeFilters.includes(formatDate(item.createdAt)))
        && (!safetyFilters.length || safetyFilters.includes(item.safety))
        && (!statusFilters.length || statusFilters.includes(item.status));
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return [...items].sort((a, b) => {
      if (sort === 'reports') return b.reportCount - a.reportCount;
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return sort === 'oldest' ? -delta : delta;
    });
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'Không có bình luận nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start} - ${Math.min(start + this.pageSize - 1, total)} của ${total} bình luận`;
  });
  readonly detail = computed(() => this.comments().find(item => item.id === this.detailId()) ?? null);
  readonly replyTarget = computed(() => this.comments().find(item => item.id === this.replyId()) ?? null);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selected();
    return items.length > 0 && items.every(item => chosen.has(item.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(item => this.selected().has(item.id)));
  readonly selectedList = computed(() => [...this.selected()]);
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.comments()
    .filter(item => this.selected().has(item.id))
    .map(item => ({ id: item.id, label: item.author, detail: `${item.id} · ${this.truncate(item.content)}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(item => !this.selected().has(item.id))
    .map(item => ({ id: item.id, label: item.author, detail: `${item.id} · ${this.truncate(item.content)}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'visible', label: 'Hiện' },
    { key: 'hidden', label: 'Ẩn' },
    { key: 'delete', label: 'Xóa', tone: 'danger' }
  ]);
  readonly replyError = computed(() => this.replyTouched() && this.replyText().trim().length < 10 ? 'Phản hồi cần tối thiểu 10 ký tự.' : '');
  readonly canTransfer = computed(() => !!this.transferSeverity() && this.transferReason().trim().length >= 15 && this.transferReason().trim().length <= 500);
  readonly transferError = computed(() => this.transferTouched() && this.transferReason().trim().length < 15 ? 'Lý do chuyển hồ sơ cần tối thiểu 15 ký tự.' : '');

  isRowMenuOpen(id: string): boolean { return this.rowMenu()?.item.id === id; }

  openRowMenu(event: MouseEvent | KeyboardEvent, item: ContentComment): void {
    event.stopPropagation();
    if (this.rowMenu()?.item.id === item.id) { this.closeRowMenu(); return; }
    this.rowMenuTrigger = event.currentTarget as HTMLElement;
    const rect = this.rowMenuTrigger.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(260, window.innerWidth - margin * 2);
    const count = item.status === 'pending' || item.status === 'flagged' ? 5 : 4;
    const height = Math.min(count * 42 + 16, window.innerHeight - margin * 2);
    const below = window.innerHeight - rect.bottom - 6 - margin;
    const top = Math.max(margin, below >= height ? rect.bottom + 6 : rect.top - 6 - height);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width));
    this.rowMenu.set({ item, top, left });
    setTimeout(() => {
      if (this.rowMenu()?.item.id === item.id) document.querySelector<HTMLButtonElement>('#comment-row-menu button')?.focus();
    });
  }

  openRowMenuFromKeyboard(event: Event, item: ContentComment): void {
    if (!(event instanceof KeyboardEvent)) return;
    event.preventDefault();
    if (!this.rowMenu()) this.openRowMenu(event, item);
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
  setRole(value: string): void { this.role.set(value); this.page.set(1); }
  setTime(value: string): void { this.timeRange.set(value as '7d' | '30d' | '90d' | 'all'); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value); this.page.set(1); this.selected.set(new Set()); }
  setSort(value: string): void { this.sort.set(value as 'newest' | 'oldest' | 'reports'); this.columnSort.set(null); }

  clearFilters(): void {
    this.search.set('');
    this.role.set('');
    this.timeRange.set('30d');
    this.status.set('');
    this.sort.set('newest');
    this.columnSort.set(null);
    Object.values(this.columnFilters).forEach(filter => filter.set([]));
    this.page.set(1);
    this.selected.set(new Set());
  }

  filterFor(key: CommentColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: CommentColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
    this.selected.set(new Set());
  }

  sortFor(key: CommentColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: CommentColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: ContentComment, column: CommentColumn): string | number {
    switch (column) {
      case 'author': return item.author;
      case 'context': return item.contextTitle;
      case 'source': return this.sourceLabel(item.contextType);
      case 'time': return Date.parse(item.createdAt);
      case 'safety': return item.reportCount;
      case 'status': return COMMENT_STATUS_LABELS[item.status];
    }
  }

  private withSelected(values: string[], selected: readonly string[]): string[] {
    return [...new Set([...values, ...selected])];
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  toggle(item: ContentComment): void {
    const next = new Set(this.selected());
    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
    this.selected.set(next);
  }

  toggleAll(): void {
    const next = new Set(this.selected());
    if (this.allVisibleSelected()) this.visible().forEach(item => next.delete(item.id));
    else this.visible().forEach(item => next.add(item.id));
    this.selected.set(next);
  }

  isSelected(id: string): boolean { return this.selected().has(id); }
  openDetail(item: ContentComment): void { this.detailId.set(item.id); }
  closeDetail(): void { this.detailId.set(null); }

  changeStatus(item: ContentComment, status: CommentStatus): void {
    this.store.updateComment(item.id, { status }, `Chuyển trạng thái sang ${COMMENT_STATUS_LABELS[status]}.`);
    this.notify(`Đã chuyển bình luận ${item.id} sang ${COMMENT_STATUS_LABELS[status]}.`, 'success');
  }

  bulkStatus(status: CommentStatus, ids: readonly string[] = this.selectedList()): void {
    if (!ids.length) return;
    ids.forEach(id => this.store.updateComment(id, { status }, `Cập nhật hàng loạt sang ${COMMENT_STATUS_LABELS[status]}.`));
    this.selected.set(new Set());
    this.notify(`Đã cập nhật ${ids.length} bình luận.`, 'success');
  }

  bulkDelete(ids: readonly string[] = this.selectedList()): void {
    if (!ids.length) return;
    this.deleteReason.set('');
    this.deleteReasonTouched.set(false);
    this.bulkDeleteIds.set(ids);
  }

  confirmBulkDelete(): void {
    const ids = this.bulkDeleteIds();
    if (!ids?.length || !this.canConfirmDelete()) return;
    this.store.removeComments([...ids], this.deleteReason().trim());
    this.selected.set(new Set());
    this.bulkDeleteIds.set(null);
    this.notify(`Đã xóa ${ids.length} bình luận. Lý do đã lưu vào nhật ký kiểm duyệt.`, 'success');
  }

  setSelectionIds(ids: string[]): void {
    this.selected.set(new Set(ids));
  }

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    if (key === 'delete') this.bulkDelete(ids);
    else this.bulkStatus(key as CommentStatus, ids);
  }

  askDelete(item: ContentComment): void {
    this.deleteReason.set('');
    this.deleteReasonTouched.set(false);
    this.deleteTarget.set(item);
  }

  confirmDelete(): void {
    const item = this.deleteTarget();
    if (!item || !this.canConfirmDelete()) return;
    this.store.removeComments([item.id], this.deleteReason().trim());
    this.deleteTarget.set(null);
    this.detailId.set(null);
    this.notify(`Đã xóa bình luận ${item.id}. Lý do đã lưu vào nhật ký kiểm duyệt.`, 'success');
  }

  openReply(item: ContentComment): void {
    this.replyId.set(item.id);
    this.replyText.set('');
    this.replyTouched.set(false);
  }

  sendReply(): void {
    this.replyTouched.set(true);
    const target = this.replyTarget();
    if (!target || this.replyText().trim().length < 10) return;
    this.store.replyComment(target.id, this.replyText().trim(), 'Quản trị viên');
    this.replyId.set(null);
    this.notify(`Đã gửi phản hồi cho ${target.author}.`, 'success');
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.filtered().length} bình luận.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.filtered().length} bình luận ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  openSpam(item: ContentComment): void {
    this.spamTarget.set(item);
    this.spamDuration.set('24h');
  }

  sendSpam(): void {
    const target = this.spamTarget();
    if (!target) return;
    const duration = this.spamDuration();
    const label = duration === '24h' ? '24 giờ' : duration === '7d' ? '7 ngày' : 'vĩnh viễn';
    this.store.updateComment(target.id, { status: 'spam', moderationNote: `Đánh dấu spam — hạn chế bình luận ${label}.` }, `Đánh dấu spam và hạn chế bình luận ${label}.`);
    this.spamTarget.set(null);
    this.notify(`Đã đánh dấu spam và hạn chế bình luận ${label}.`, 'success');
  }

  openTransfer(item: ContentComment): void {
    this.transferTarget.set(item);
    this.transferSeverity.set('');
    this.transferReason.set('');
    this.transferTouched.set(false);
  }

  sendTransfer(): void {
    this.transferTouched.set(true);
    const target = this.transferTarget();
    const severity = this.transferSeverity();
    if (!target || !severity || !this.canTransfer()) return;
    const report = this.store.transferComment(target.id, severity, this.transferReason());
    if (!report) { this.notify('Không thể chuyển hồ sơ. Vui lòng thử lại.', 'error'); return; }
    this.selected.update(ids => new Set([...ids].filter(id => id !== target.id)));
    this.page.set(Math.min(this.page(), this.pages()));
    this.transferTarget.set(null);
    this.detailId.set(null);
    this.notify(`Đã chuyển hồ sơ ${report.code} sang Báo cáo vi phạm.`, 'success');
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  statusLabel(status: CommentStatus): string { return COMMENT_STATUS_LABELS[status]; }
  statusTone(status: CommentStatus): string { return COMMENT_STATUS_TONE[status]; }
  sourceLabel(type: CommentSource): string { return type === 'course' ? 'Khóa học và Bài giảng' : 'Bài viết Blog'; }
  safetyLabel(item: ContentComment): string {
    if (item.safety === 'blocked') return 'Đã chặn';
    if (item.reportCount) return `Bị báo cáo (${item.reportCount})`;
    return 'Sạch';
  }
  safetyTone(item: ContentComment): string {
    if (item.safety === 'blocked') return 'danger';
    if (item.reportCount) return 'pending';
    return 'success';
  }
  roleTone(role: string): string { return ROLE_TONE[role] ?? 'neutral'; }

  number = number;
  dateTime = formatDateTime;
  ago = relativeTime;
  truncate(value: string): string { return value.length > 90 ? `${value.slice(0, 90)}…` : value; }
}
