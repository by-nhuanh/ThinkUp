import { Component, computed, inject, signal } from '@angular/core';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import {
  formatDateTime, paginationRange, relativeTime, REVIEW_STATUS_LABELS, REVIEW_STATUS_TONE
} from '../content-utils';
import { ContentReview, ReviewStatus } from '../models/content.models';
import { ContentStore } from '../services/content.store';

@Component({
  selector: 'app-content-reviews',
  standalone: true,
  imports: [CustomSelectComponent, SearchFieldComponent, ExportMenuComponent, ContentToastComponent],
  templateUrl: './reviews.component.html',
  styleUrl: '../content-page.css'
})
export class ContentReviewsComponent {
  private readonly store = inject(ContentStore);
  readonly loadError = this.store.loadError;

  readonly reviews = this.store.reviews;
  readonly search = signal('');
  readonly course = signal('');
  readonly status = signal('');
  readonly rating = signal('');
  readonly sort = signal<'newest' | 'oldest' | 'rating' | 'reports'>('newest');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly detailId = signal<string | null>(null);
  readonly deleteTarget = signal<ContentReview | null>(null);
  readonly replyText = signal('');
  readonly replyTouched = signal(false);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

  readonly counts = computed(() => {
    const items = this.reviews();
    const approved = items.filter(item => item.status === 'approved');
    return {
      total: items.length,
      pending: items.filter(item => item.status === 'pending').length,
      approved: approved.length,
      average: approved.length ? approved.reduce((sum, item) => sum + item.rating, 0) / approved.length : 0
    };
  });
  readonly courseOptions = computed<CustomSelectOption[]>(() => {
    const seen = new Map<string, string>();
    this.reviews().forEach(item => seen.set(item.courseId, item.courseTitle));
    return [{ value: '', label: 'Tất cả khóa học' }, ...[...seen].map(([value, label]) => ({ value, label }))];
  });
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'pending', label: 'Chờ duyệt' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'rejected', label: 'Bị từ chối' },
    { value: 'hidden', label: 'Đã ẩn' }
  ];
  readonly ratingOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả số sao' },
    { value: '5', label: '5 sao' }, { value: '4', label: '4 sao' },
    { value: '3', label: '3 sao' }, { value: '2', label: '2 sao' }, { value: '1', label: '1 sao' }
  ];
  readonly sortOptions: CustomSelectOption[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'oldest', label: 'Cũ nhất' },
    { value: 'rating', label: 'Điểm cao nhất' },
    { value: 'reports', label: 'Nhiều báo cáo' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const course = this.course();
    const status = this.status();
    const rating = this.rating();
    const sort = this.sort();
    const items = this.reviews().filter(item => {
      const matches = !term
        || item.learner.toLowerCase().includes(term)
        || item.title.toLowerCase().includes(term)
        || item.content.toLowerCase().includes(term)
        || item.courseTitle.toLowerCase().includes(term);
      return matches && (!course || item.courseId === course) && (!status || item.status === status)
        && (!rating || item.rating === Number(rating));
    });
    return [...items].sort((a, b) => {
      if (sort === 'rating') return b.rating - a.rating;
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
  readonly replyError = computed(() => this.replyTouched() && this.replyText().trim().length < 5 ? 'Phản hồi cần tối thiểu 5 ký tự.' : '');
  readonly stars = [1, 2, 3, 4, 5];

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setCourse(value: string): void { this.course.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value); this.page.set(1); this.selected.set(new Set()); }
  setRating(value: string): void { this.rating.set(value); this.page.set(1); }
  setSort(value: string): void { this.sort.set(value as 'newest' | 'oldest' | 'rating' | 'reports'); }

  clearFilters(): void {
    this.search.set(''); this.course.set(''); this.status.set(''); this.rating.set('');
    this.sort.set('newest'); this.page.set(1); this.selected.set(new Set());
  }

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
    this.store.updateReview(item.id, { status, rejectionReason: status === 'rejected' ? 'Vi phạm tiêu chuẩn đánh giá của ThinkUp.' : undefined },
      `Chuyển trạng thái sang ${REVIEW_STATUS_LABELS[status]}.`);
    this.notify(`Đã chuyển đánh giá ${item.id} sang ${REVIEW_STATUS_LABELS[status]}.`, 'success');
  }

  bulkStatus(status: ReviewStatus): void {
    const ids = this.selectedList();
    if (!ids.length) return;
    ids.forEach(id => this.store.updateReview(id, { status }, `Cập nhật hàng loạt sang ${REVIEW_STATUS_LABELS[status]}.`));
    this.selected.set(new Set());
    this.notify(`Đã cập nhật ${ids.length} đánh giá.`, 'success');
  }

  bulkDelete(): void {
    const ids = this.selectedList();
    if (!ids.length) return;
    this.store.removeReviews(ids);
    this.selected.set(new Set());
    this.notify(`Đã xóa ${ids.length} đánh giá.`, 'success');
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
    if (!item || this.replyError()) return;
    this.store.replyReview(item.id, this.replyText().trim(), 'Quản trị viên');
    this.replyText.set('');
    this.replyTouched.set(false);
    this.notify(`Đã gửi phản hồi tới ${item.learner}.`, 'success');
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.filtered().length} đánh giá.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.filtered().length} đánh giá ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  statusLabel(status: ReviewStatus): string { return REVIEW_STATUS_LABELS[status]; }
  statusTone(status: ReviewStatus): string { return REVIEW_STATUS_TONE[status]; }
  ratingLabel(value: number): string { return `${value.toFixed(1)}/5`; }
  dateTime = formatDateTime;
  ago = relativeTime;
  truncate(value: string): string { return value.length > 80 ? `${value.slice(0, 80)}…` : value; }
}
