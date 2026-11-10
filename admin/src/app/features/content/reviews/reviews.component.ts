import { Component, computed, inject, signal } from '@angular/core';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import {
  formatDateTime, initials, npsBand, number, paginationRange, relativeTime,
  REVIEW_STATUS_LABELS, REVIEW_STATUS_TONE, ratingLabel as ratingWord
} from '../content-utils';
import { ContentReview, ReviewStatus } from '../models/content.models';
import { ContentStore } from '../services/content.store';

const HIDE_REASONS = [
  'Nội dung sai lệch so với trải nghiệm khóa học',
  'Ngôn từ xúc phạm, quấy rối hoặc phân biệt đối xử',
  'Nội dung quảng cáo, spam hoặc chèn liên kết',
  'Thông tin cá nhân của người khác',
  'Lý do khác'
] as const;

@Component({
  selector: 'app-content-reviews',
  standalone: true,
  imports: [CustomSelectComponent, ExportMenuComponent, ContentToastComponent],
  templateUrl: './reviews.component.html',
  styleUrl: '../content-page.css'
})
export class ContentReviewsComponent {
  private readonly store = inject(ContentStore);
  readonly loadError = this.store.loadError;

  readonly reviews = this.store.reviews;
  readonly search = signal('');
  readonly status = signal('');
  readonly rating = signal('');
  readonly nps = signal('');
  readonly response = signal('');
  readonly timeRange = signal('all');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly selected = signal<ReadonlySet<string>>(new Set());
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
        && (timeRange === 'all' || Date.parse(item.createdAt) >= cutoff);
    });
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

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value); this.page.set(1); this.selected.set(new Set()); }
  setRating(value: string): void { this.rating.set(value); this.page.set(1); }
  setNps(value: string): void { this.nps.set(value); this.page.set(1); }
  setResponse(value: string): void { this.response.set(value); this.page.set(1); }
  setTime(value: string): void { this.timeRange.set(value); this.page.set(1); }

  clearFilters(): void {
    this.search.set(''); this.status.set(''); this.rating.set(''); this.nps.set('');
    this.response.set(''); this.timeRange.set('all'); this.page.set(1); this.selected.set(new Set());
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
    if (!item || !this.canHide()) return;
    const reason = this.hideReason() === 'Lý do khác'
      ? `${this.hideReason()}: ${this.hideNote().trim()}`
      : this.hideReason();
    this.store.updateReview(item.id, { status: 'hidden', rejectionReason: reason },
      `Ẩn đánh giá: ${reason}`);
    this.hideTarget.set(null);
    this.notify(`Đã ẩn đánh giá ${item.id} và khóa phản hồi công khai.`, 'success');
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
    if (!item || this.replyText().trim().length < 20) return;
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
  ratingWord = ratingWord;
  npsBand = npsBand;
  npsLabel(value: number): string { return value >= 50 ? 'Xuất sắc' : value >= 0 ? 'Tốt' : 'Cần cải thiện'; }
  npsTone(value: number): string { return value >= 9 ? 'success' : value >= 7 ? 'pending' : 'danger'; }
  initials = initials;
  number = number;
  dateTime = formatDateTime;
  ago = relativeTime;
  truncate(value: string): string { return value.length > 80 ? `${value.slice(0, 80)}…` : value; }
}
