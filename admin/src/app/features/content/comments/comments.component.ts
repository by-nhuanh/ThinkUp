import { Component, computed, inject, signal } from '@angular/core';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import {
  COMMENT_STATUS_LABELS, COMMENT_STATUS_TONE, formatDateTime, initials, number, paginationRange, relativeTime, ROLE_TONE
} from '../content-utils';
import { CommentSource, CommentStatus, ContentComment } from '../models/content.models';
import { ContentStore } from '../services/content.store';

@Component({
  selector: 'app-content-comments',
  standalone: true,
  imports: [CustomSelectComponent, ExportMenuComponent, ContentToastComponent],
  templateUrl: './comments.component.html',
  styleUrl: '../content-page.css'
})
export class ContentCommentsComponent {
  private readonly store = inject(ContentStore);
  readonly loadError = this.store.loadError;

  readonly comments = this.store.comments;
  readonly search = signal('');
  readonly source = signal<'all' | CommentSource>('all');
  readonly role = signal('');
  readonly timeRange = signal<'7d' | '30d' | '90d' | 'all'>('30d');
  readonly status = signal('');
  readonly sort = signal<'newest' | 'oldest' | 'reports'>('newest');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly detailId = signal<string | null>(null);
  readonly deleteTarget = signal<ContentComment | null>(null);
  readonly replyId = signal<string | null>(null);
  readonly replyText = signal('');
  readonly replyTouched = signal(false);
  readonly spamTarget = signal<ContentComment | null>(null);
  readonly spamDuration = signal<'24h' | '7d' | 'forever'>('24h');
  readonly transferTarget = signal<ContentComment | null>(null);
  readonly transferSeverity = signal<'low' | 'medium' | 'high'>('high');
  readonly transferReason = signal('');
  readonly transferTouched = signal(false);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);

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
    const source = this.source();
    const role = this.role();
    const timeRange = this.timeRange();
    const status = this.status();
    const sort = this.sort();
    const cutoff = timeRange === 'all' ? 0 : Date.now() - Number(timeRange.replace('d', '')) * 86_400_000;
    const items = this.comments().filter(item => {
      const matches = !term
        || item.author.toLowerCase().includes(term)
        || item.content.toLowerCase().includes(term)
        || item.contextTitle.toLowerCase().includes(term);
      return matches
        && (source === 'all' || item.contextType === source)
        && (!role || item.authorRole === role)
        && (!status || item.status === status)
        && (timeRange === 'all' || Date.parse(item.createdAt) >= cutoff);
    });
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
  readonly selectedList = computed(() => [...this.selected()]);
  readonly replyError = computed(() => this.replyTouched() && this.replyText().trim().length < 10 ? 'Phản hồi cần tối thiểu 10 ký tự.' : '');
  readonly transferError = computed(() => this.transferTouched() && this.transferReason().trim().length < 15 ? 'Lý do chuyển hồ sơ cần tối thiểu 15 ký tự.' : '');

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setSource(value: string): void { this.source.set(value as 'all' | CommentSource); this.page.set(1); this.selected.set(new Set()); }
  setRole(value: string): void { this.role.set(value); this.page.set(1); }
  setTime(value: string): void { this.timeRange.set(value as '7d' | '30d' | '90d' | 'all'); this.page.set(1); }
  setStatus(value: string): void { this.status.set(value); this.page.set(1); this.selected.set(new Set()); }
  setSort(value: string): void { this.sort.set(value as 'newest' | 'oldest' | 'reports'); }

  clearFilters(): void {
    this.search.set('');
    this.source.set('all');
    this.role.set('');
    this.timeRange.set('30d');
    this.status.set('');
    this.sort.set('newest');
    this.page.set(1);
    this.selected.set(new Set());
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

  bulkStatus(status: CommentStatus): void {
    const ids = this.selectedList();
    if (!ids.length) return;
    ids.forEach(id => this.store.updateComment(id, { status }, `Cập nhật hàng loạt sang ${COMMENT_STATUS_LABELS[status]}.`));
    this.selected.set(new Set());
    this.notify(`Đã cập nhật ${ids.length} bình luận.`, 'success');
  }

  bulkDelete(): void {
    const ids = this.selectedList();
    if (!ids.length) return;
    this.store.removeComments(ids);
    this.selected.set(new Set());
    this.notify(`Đã xóa ${ids.length} bình luận.`, 'success');
  }

  confirmDelete(): void {
    const item = this.deleteTarget();
    if (!item) return;
    this.store.removeComments([item.id]);
    this.deleteTarget.set(null);
    this.detailId.set(null);
    this.notify(`Đã xóa bình luận ${item.id}.`, 'success');
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
    this.store.updateComment(target.id, { status: 'hidden', moderationNote: `Đánh dấu spam — hạn chế bình luận ${label}.` }, `Đánh dấu spam và hạn chế bình luận ${label}.`);
    this.spamTarget.set(null);
    this.notify(`Đã đánh dấu spam và hạn chế bình luận ${label}.`, 'success');
  }

  openTransfer(item: ContentComment): void {
    this.transferTarget.set(item);
    this.transferSeverity.set('high');
    this.transferReason.set('');
    this.transferTouched.set(false);
  }

  sendTransfer(): void {
    this.transferTouched.set(true);
    const target = this.transferTarget();
    if (!target || this.transferError()) return;
    const code = `RP-2026-${String(300 + Math.floor(Math.random() * 699)).padStart(4, '0')}`;
    this.store.updateComment(target.id, { status: 'flagged', moderationNote: `Đã chuyển hồ sơ ${code} (mức độ ${this.transferSeverity()}).` }, `Chuyển hồ sơ vi phạm ${code}.`);
    this.transferTarget.set(null);
    this.notify(`Đã bàn giao hồ sơ ${code} cho bộ phận xử lý vi phạm.`, 'success');
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
  initials = initials;
  number = number;
  dateTime = formatDateTime;
  ago = relativeTime;
  truncate(value: string): string { return value.length > 90 ? `${value.slice(0, 90)}…` : value; }
}
