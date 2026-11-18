import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
import { ColumnFilterComponent, ColumnFilterValue, NUMBER_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { Component, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { downloadTable, ExportFormat } from '../../../shared/utils/export-formats';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import {
  formatDateTime, npsBand, number, paginationRange, relativeTime,
  REVIEW_STATUS_LABELS, REVIEW_STATUS_TONE, ratingLabel as ratingWord
} from '../content-utils';
import { ContentReview, ReviewStatus } from '../models/content.models';
import { ContentStore } from '../services/content.store';
import { ReviewLearningDialogComponent } from '../components/review-learning-dialog/review-learning-dialog.component';

const HIDE_REASONS = [
  'Chứa từ ngữ xúc phạm, thô tục, công kích cá nhân',
  'Spam quảng cáo, chèn liên kết ngoài trái phép',
  'Nội dung hoàn toàn không liên quan đến bài giảng',
  'Phát hiện gian lận, cố ý dìm điểm đánh giá',
  'Lý do khác'
] as const;

type ReviewColumn = 'learner' | 'course' | 'instructor' | 'rating' | 'nps' | 'tag' | 'status';

const REVIEW_STATUS_VALUES: ColumnFilterValue[] = (Object.keys(REVIEW_STATUS_LABELS) as ReviewStatus[])
  .map(status => ({ value: status, label: REVIEW_STATUS_LABELS[status] }));

const RATING_VALUES: ColumnFilterValue[] = [5, 4, 3, 2, 1].map(rating => ({ value: String(rating), label: `${rating} sao` }));

const NPS_VALUES: ColumnFilterValue[] = [
  { value: 'promoter', label: 'Người ủng hộ · 9-10' },
  { value: 'passive', label: 'Trung lập · 7-8' },
  { value: 'detractor', label: 'Người phản đối · 0-6' }
];

@Component({
  selector: 'app-content-reviews',
  standalone: true,
  imports: [AdminDialogComponent, BulkSelectionDialogComponent, ColumnFilterComponent, CustomSelectComponent, SearchFieldComponent, SelectionBarComponent, ContentToastComponent, ReviewLearningDialogComponent],
  templateUrl: './reviews.component.html',
  styleUrls: ['../content-page.css', '../content-moderation.css', './reviews.component.css']
})
export class ContentReviewsComponent {
  private readonly store = inject(ContentStore);
  readonly loadError = this.store.loadError;

  readonly rowMenu = signal<{ item: ContentReview; top: number; left: number } | null>(null);
  private rowMenuTrigger: HTMLElement | null = null;

  readonly reviews = this.store.reviews;
  readonly search = signal('');
  readonly status = signal('');
  readonly rating = signal('');
  readonly nps = signal('');
  readonly response = signal('');
  readonly timeRange = signal('all');
  readonly exportOpen = signal(false);
  readonly exportBusy = signal(false);
  readonly exportFormat = signal<ExportFormat>('xlsx');
  readonly exportError = signal('');
  readonly exportItems = signal<readonly ContentReview[]>([]);
  readonly exportScope = signal<readonly { label: string; value: string }[]>([]);
  readonly page = signal(1);
  private readonly pageSizeService = inject(AdminPageSizeService);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkDeleteIds = signal<readonly string[] | null>(null);
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly detailId = signal<string | null>(null);
  readonly progressTarget = signal<ContentReview | null>(null);
  readonly deleteTarget = signal<ContentReview | null>(null);
  readonly hideTarget = signal<ContentReview | null>(null);
  readonly hideReason = signal<string>(HIDE_REASONS[0]);
  readonly hideNote = signal('');
  readonly hideTouched = signal(false);
  readonly replyText = signal('');
  readonly replyTouched = signal(false);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  private readonly columnFilters: Record<ReviewColumn, WritableSignal<string[]>> = {
    learner: signal<string[]>([]),
    course: signal<string[]>([]),
    instructor: signal<string[]>([]),
    rating: signal<string[]>([]),
    nps: signal<string[]>([]),
    tag: signal<string[]>([]),
    status: signal<string[]>([])
  };

  readonly reviewStatusValues = REVIEW_STATUS_VALUES;
  readonly ratingValues = RATING_VALUES;
  readonly npsValues = NPS_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly numberSorts = NUMBER_SORT_OPTIONS;
  readonly columnSort = signal<{ column: ReviewColumn; direction: 'asc' | 'desc' } | null>(null);
  readonly learnerValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reviews().map(item => item.learner))], this.columnFilters.learner())
      .map(item => ({ value: item, label: item })));
  readonly courseValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reviews().map(item => item.courseTitle))], this.columnFilters.course())
      .map(item => ({ value: item, label: item })));
  readonly instructorValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reviews().map(item => item.instructor))], this.columnFilters.instructor())
      .map(item => ({ value: item, label: item })));
  readonly tagValues = computed<ColumnFilterValue[]>(() =>
    this.withSelected([...new Set(this.reviews().flatMap(item => item.feedbackTags))], this.columnFilters.tag())
      .map(item => ({ value: item, label: item })));

  readonly counts = computed(() => {
    const items = this.reviews();
    const approved = items.filter(item => item.status === 'approved');
    const promoters = items.filter(item => item.nps >= 9).length;
    const detractors = items.filter(item => item.nps <= 6).length;
    return {
      total: items.length,
      pending: items.filter(item => item.status === 'pending').length,
      approved: approved.length,
      average: approved.length ? approved.reduce((sum, item) => sum + item.rating, 0) / approved.length : 0,
      nps: items.length ? Math.round(((promoters - detractors) / items.length) * 100) : 0,
      negative: items.filter(item => item.rating <= 2).length,
      replied: items.filter(item => !!item.reply).length,
      responseRate: items.length ? Math.round((items.filter(item => !!item.reply).length / items.length) * 100) : 0
    };
  });
  readonly averageLabel = computed(() => `${this.counts().average.toFixed(1)} / 5.0`);
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Công khai' },
    { value: 'rejected', label: 'Bị từ chối' },
    { value: 'hidden', label: 'Tạm ẩn' }
  ];
  readonly ratingOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả số sao' },
    { value: 'negative', label: '≤ 2 sao (tiêu cực)' },
    { value: '5', label: '5 sao' }, { value: '4', label: '4 sao' },
    { value: '3', label: '3 sao' }, { value: '2', label: '2 sao' }, { value: '1', label: '1 sao' }
  ];
  readonly npsOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả điểm NPS' },
    { value: 'promoter', label: 'Người ủng hộ · 9-10' },
    { value: 'passive', label: 'Trung lập · 7-8' },
    { value: 'detractor', label: 'Người phản đối · 0-6' }
  ];
  readonly responseOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả phản hồi' },
    { value: 'unreplied', label: 'Chưa phản hồi' },
    { value: 'replied', label: 'Đã phản hồi' }
  ];
  readonly timeOptions: CustomSelectOption[] = [
    { value: 'all', label: 'Tất cả thời gian' },
    { value: '7d', label: '7 ngày qua' },
    { value: '30d', label: '30 ngày qua' },
    { value: '90d', label: '90 ngày qua' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const rating = this.rating();
    const nps = this.nps();
    const response = this.response();
    const timeRange = this.timeRange();
    const learners = this.columnFilters.learner();
    const courses = this.columnFilters.course();
    const instructors = this.columnFilters.instructor();
    const columnRatings = this.columnFilters.rating();
    const columnNps = this.columnFilters.nps();
    const tags = this.columnFilters.tag();
    const statuses = this.columnFilters.status();
    const cutoff = timeRange === 'all' ? 0 : Date.now() - Number(timeRange.replace('d', '')) * 86_400_000;
    const items = this.reviews().filter(item => {
      const matches = !term
        || item.learner.toLowerCase().includes(term)
        || item.learnerEmail.toLowerCase().includes(term)
        || item.title.toLowerCase().includes(term)
        || item.content.toLowerCase().includes(term)
        || item.courseTitle.toLowerCase().includes(term)
        || item.instructor.toLowerCase().includes(term);
      const ratingMatch = !rating
        || (rating === 'negative' ? item.rating <= 2 : item.rating === Number(rating));
      const npsMatch = !nps
        || (nps === 'promoter' && item.nps >= 9)
        || (nps === 'passive' && item.nps >= 7 && item.nps <= 8)
        || (nps === 'detractor' && item.nps <= 6);
      const responseMatch = !response || (response === 'replied' ? !!item.reply : !item.reply);
      return matches && (!status || item.status === status) && ratingMatch && npsMatch && responseMatch
        && (timeRange === 'all' || Date.parse(item.createdAt) >= cutoff)
        && (!learners.length || learners.includes(item.learner))
        && (!courses.length || courses.includes(item.courseTitle))
        && (!instructors.length || instructors.includes(item.instructor))
        && (!columnRatings.length || columnRatings.includes(String(item.rating)))
        && (!columnNps.length || columnNps.includes(this.npsBandKey(item.nps)))
        && (!tags.length || item.feedbackTags.some(tag => tags.includes(tag)))
        && (!statuses.length || statuses.includes(item.status));
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'Không có đánh giá nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start} - ${Math.min(start + this.pageSize - 1, total)} của ${total} đánh giá`;
  });
  readonly detail = computed(() => this.reviews().find(item => item.id === this.detailId()) ?? null);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selected();
    return items.length > 0 && items.every(item => chosen.has(item.id));
  });
  readonly selectedList = computed(() => [...this.selected()]);
  readonly someVisibleSelected = computed(() => this.visible().some(item => this.selected().has(item.id)) && !this.allVisibleSelected());
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.reviews()
    .filter(item => this.selected().has(item.id))
    .map(item => ({ id: item.id, label: item.learner, detail: `${item.id} · ${item.courseTitle}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(item => !this.selected().has(item.id))
    .map(item => ({ id: item.id, label: item.learner, detail: `${item.id} · ${item.courseTitle}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'approved', label: 'Duyệt' },
    { key: 'hidden', label: 'Ẩn' },
    { key: 'delete', label: 'Xóa', tone: 'danger' }
  ]);
  readonly replyError = computed(() => this.replyTouched() && this.replyText().trim().length < 20 ? 'Phản hồi cần tối thiểu 20 ký tự.' : '');
  readonly hideReasons = HIDE_REASONS;
  readonly hideError = computed(() => {
    if (!this.hideTouched()) return '';
    if (this.hideReason() === 'Lý do khác' && this.hideNote().trim().length < 15) {
      return 'Giải trình cho lý do khác cần tối thiểu 15 ký tự.';
    }
    return '';
  });
  readonly canHide = computed(() => !!this.hideReason()
    && (this.hideReason() !== 'Lý do khác' || this.hideNote().trim().length >= 15));
  readonly stars = [1, 2, 3, 4, 5];

  isRowMenuOpen(id: string): boolean { return this.rowMenu()?.item.id === id; }

  openRowMenu(event: MouseEvent | KeyboardEvent, item: ContentReview): void {
    event.stopPropagation();
    if (this.rowMenu()?.item.id === item.id) { this.closeRowMenu(); return; }
    this.rowMenuTrigger = event.currentTarget as HTMLElement;
    const rect = this.rowMenuTrigger.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(260, window.innerWidth - margin * 2);
    const count = 4;
    const height = Math.min(count * 42 + 16, window.innerHeight - margin * 2);
    const below = window.innerHeight - rect.bottom - 6 - margin;
    const top = Math.max(margin, below >= height ? rect.bottom + 6 : rect.top - 6 - height);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width));
    this.rowMenu.set({ item, top, left });
    setTimeout(() => {
      if (this.rowMenu()?.item.id === item.id) document.querySelector<HTMLButtonElement>('#review-row-menu button')?.focus();
    });
  }

  openRowMenuFromKeyboard(event: Event, item: ContentReview): void {
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
  setStatus(value: string): void { this.status.set(value); this.page.set(1); this.selected.set(new Set()); }
  setRating(value: string): void { this.rating.set(value); this.page.set(1); }
  setNps(value: string): void { this.nps.set(value); this.page.set(1); }
  setResponse(value: string): void { this.response.set(value); this.page.set(1); }
  setTime(value: string): void { this.timeRange.set(value); this.page.set(1); }

  clearFilters(): void {
    this.search.set(''); this.status.set(''); this.rating.set(''); this.nps.set('');
    this.response.set(''); this.timeRange.set('all');
    this.columnSort.set(null);
    Object.values(this.columnFilters).forEach(filter => filter.set([]));
    this.page.set(1); this.selected.set(new Set());
  }

  filterFor(key: ReviewColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: ReviewColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
    this.selected.set(new Set());
  }

  sortFor(key: ReviewColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: ReviewColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: ContentReview, column: ReviewColumn): string | number {
    switch (column) {
      case 'learner': return item.learner;
      case 'course': return item.courseTitle;
      case 'instructor': return item.instructor;
      case 'rating': return item.rating;
      case 'nps': return item.nps;
      case 'tag': return item.feedbackTags.join(', ');
      case 'status': return REVIEW_STATUS_LABELS[item.status];
    }
  }

  private withSelected(values: string[], selected: readonly string[]): string[] {
    return [...new Set([...values, ...selected])];
  }

  private npsBandKey(nps: number): string {
    return nps >= 9 ? 'promoter' : nps >= 7 ? 'passive' : 'detractor';
  }

  toggleExpanded(item: ContentReview): void {
    const next = new Set(this.expanded());
    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
    this.expanded.set(next);
  }

  isExpanded(id: string): boolean { return this.expanded().has(id); }
  openProgress(item: ContentReview): void { this.progressTarget.set(item); }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  toggle(item: ContentReview): void {
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
  openDetail(item: ContentReview): void { this.detailId.set(item.id); this.replyText.set(''); this.replyTouched.set(false); }
  closeDetail(): void { this.detailId.set(null); }

  changeStatus(item: ContentReview, status: ReviewStatus): void {
    if (status === 'hidden') {
      this.askHide(item);
      return;
    }
    this.store.updateReview(item.id, { status, rejectionReason: status === 'rejected' ? 'Vi phạm tiêu chuẩn đánh giá của ThinkUp.' : undefined },
      `Chuyển trạng thái sang ${REVIEW_STATUS_LABELS[status]}.`);
    this.notify(`Đã chuyển đánh giá ${item.id} sang ${REVIEW_STATUS_LABELS[status]}.`, 'success');
  }

  askHide(item: ContentReview): void {
    this.hideTarget.set(item);
    this.hideReason.set(HIDE_REASONS[0]);
    this.hideNote.set('');
    this.hideTouched.set(false);
  }

  submitHide(): void {
    this.hideTouched.set(true);
    const item = this.hideTarget();
    if (!item || !this.canHide()) {
      if (item) document.getElementById('review-hide-note')?.focus();
      return;
    }
    const reason = this.hideNote().trim()
      ? `${this.hideReason()}: ${this.hideNote().trim()}`
      : this.hideReason();
    this.store.updateReview(item.id, { status: 'hidden', rejectionReason: reason },
      `Ẩn đánh giá: ${reason}`);
    this.hideTarget.set(null);
    this.notify(`Đã ẩn đánh giá ${item.id} và khóa phản hồi công khai.`, 'success');
  }

  bulkStatus(status: ReviewStatus, ids: readonly string[] = this.selectedList()): void {
    if (!ids.length) return;
    ids.forEach(id => this.store.updateReview(id, { status }, `Cập nhật hàng loạt sang ${REVIEW_STATUS_LABELS[status]}.`));
    this.selected.set(new Set());
    this.notify(`Đã cập nhật ${ids.length} đánh giá.`, 'success');
  }

  bulkDelete(ids: readonly string[] = this.selectedList()): void {
    if (!ids.length) return;
    this.bulkDeleteIds.set(ids);
  }

  confirmBulkDelete(): void {
    const ids = this.bulkDeleteIds();
    if (!ids?.length) return;
    this.store.removeReviews([...ids]);
    this.selected.set(new Set());
    this.bulkDeleteIds.set(null);
    this.notify(`Đã xóa ${ids.length} đánh giá.`, 'success');
  }

  setSelectionIds(ids: string[]): void {
    this.selected.set(new Set(ids));
  }

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    if (key === 'delete') this.bulkDelete(ids);
    else this.bulkStatus(key as ReviewStatus, ids);
  }

  confirmDelete(): void {
    const item = this.deleteTarget();
    if (!item) return;
    this.store.removeReviews([item.id]);
    this.deleteTarget.set(null);
    this.detailId.set(null);
    this.notify(`Đã xóa đánh giá ${item.id}.`, 'success');
  }

  sendReply(): void {
    this.replyTouched.set(true);
    const item = this.detail();
    if (!item || this.replyText().trim().length < 20) return;
    this.store.replyReview(item.id, this.replyText().trim(), 'Quản trị viên');
    this.replyText.set('');
    this.replyTouched.set(false);
    this.notify(`Đã gửi phản hồi tới ${item.learner}.`, 'success');
  }

  retryLoad(): void {
    this.store.retry();
  }

  openExport(): void {
    if (this.exportBusy()) return;
    const label = (options: readonly CustomSelectOption[], value: string) => options.find(option => option.value === value)?.label ?? value;
    this.exportItems.set(structuredClone(this.filtered()));
    this.exportScope.set([
      { label: 'Số sao', value: label(this.ratingOptions, this.rating()) },
      { label: 'Trạng thái', value: label(this.statusOptions, this.status()) },
      { label: 'Điểm NPS', value: label(this.npsOptions, this.nps()) },
      { label: 'Thời gian', value: label(this.timeOptions, this.timeRange()) },
      { label: 'Phản hồi', value: label(this.responseOptions, this.response()) },
      { label: 'Từ khóa', value: this.search().trim() || 'Không áp dụng' }
    ]);
    this.exportFormat.set('xlsx');
    this.exportError.set('');
    this.exportOpen.set(true);
  }

  async exportList(): Promise<void> {
    if (this.exportBusy() || !this.exportItems().length) return;
    this.exportBusy.set(true);
    this.exportError.set('');
    const format = this.exportFormat();
    const items = this.exportItems();
    try {
      // Allow the progress dialog to render before serializing the snapshot.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const rows: (string | number)[][] = [
        ['Mã đánh giá', 'Mã học viên/Email', 'Học viên', 'Mã khóa học', 'Khóa học', 'Giảng viên', 'Số sao', 'NPS', 'Thẻ phản hồi', 'Tiêu đề', 'Nhận xét', 'Trạng thái', 'Ngày đánh giá', 'Phản hồi', 'Người phản hồi', 'Ngày phản hồi'],
        ...items.map(item => [item.id, item.learnerEmail, item.learner, item.courseId, item.courseTitle, item.instructor, item.rating, item.nps, item.feedbackTags.join('; '), item.title, item.content, this.statusLabel(item.status), this.dateTime(item.createdAt), item.reply?.content ?? '', item.reply?.by ?? '', item.reply ? this.dateTime(item.reply.at) : ''])
      ];
      await downloadTable(format, 'bao-cao-danh-gia-khoa-hoc', rows);
      this.exportOpen.set(false);
      this.notify(`Đã tạo tệp ${format.toUpperCase()} gồm ${items.length} đánh giá và gửi yêu cầu tải xuống.`, 'success');
    } catch {
      this.exportError.set('Không thể tạo tệp. Vui lòng thử lại.');
      if (!this.exportOpen()) this.notify('Không thể tạo tệp đánh giá. Vui lòng thử lại.', 'error');
    } finally {
      this.exportBusy.set(false);
    }
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  statusLabel(status: ReviewStatus): string { return REVIEW_STATUS_LABELS[status]; }
  statusTone(status: ReviewStatus): string { return REVIEW_STATUS_TONE[status]; }
  ratingWord = ratingWord;
  npsBand = npsBand;
  npsLabel(value: number): string { return value >= 50 ? 'Xuất sắc' : value >= 0 ? 'Tốt' : 'Cần cải thiện'; }
  npsTone(value: number): string { return value >= 9 ? 'success' : value >= 7 ? 'pending' : 'danger'; }
  number = number;
  dateTime = formatDateTime;
  ago = relativeTime;
  truncate(value: string): string { return value.length > 80 ? `${value.slice(0, 80)}…` : value; }
}
