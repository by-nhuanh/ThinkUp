import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import { formatDate, formatTime, paginationRange, POST_STATUS_LABELS, POST_STATUS_TONE, ROLE_TONE } from '../content-utils';
import { ContentPost, PostStatus } from '../models/content.models';
import { ContentStore } from '../services/content.store';

const PIN_LIMIT = 5;

const REVISION_REASONS = [
  'Lỗi chính tả, trình bày văn bản hoặc định dạng bài viết',
  'Hình ảnh mờ, vi phạm bản quyền hoặc thiếu nguồn',
  'Khối mã Code mẫu bị lỗi, chưa highlight hoặc thiếu giải thích',
  'Nội dung chưa đủ chiều sâu, cần bổ sung ví dụ',
  'Cấu hình SEO chưa đúng tiêu chuẩn',
  'Lý do khác...'
] as const;

const HIDE_REASONS = [
  'Nội dung cần cập nhật kiến thức mới',
  'Đang xác minh tranh chấp bản quyền',
  'Theo yêu cầu của tác giả',
  'Lý do khác...'
] as const;

interface ToastState { message: string; description: string; tone: ToastTone }

@Component({
  selector: 'app-content-post-list',
  standalone: true,
  imports: [RouterLink, ContentToastComponent, CustomSelectComponent, ExportMenuComponent],
  templateUrl: './post-list.component.html',
  styleUrl: '../content-page.css'
})
export class ContentPostListComponent {
  private readonly store = inject(ContentStore);
  private readonly router = inject(Router);

  readonly posts = this.store.posts;
  readonly search = signal('');
  readonly category = signal('');
  readonly status = signal('');
  readonly author = signal('');
  readonly page = signal(1);
  readonly pageSize = 5;

  readonly menu = signal<{ post: ContentPost; top: number; left: number } | null>(null);
  readonly viewTarget = signal<ContentPost | null>(null);
  readonly previewDevice = signal<'desktop' | 'mobile'>('desktop');

  readonly requestTarget = signal<ContentPost | null>(null);
  readonly requestReasons = signal<ReadonlySet<string>>(new Set());
  readonly requestNote = signal('');

  readonly hideTarget = signal<ContentPost | null>(null);
  readonly hideReason = signal<string>(HIDE_REASONS[0]);
  readonly hideNote = signal('');

  readonly restoreTarget = signal<ContentPost | null>(null);

  readonly deleteTarget = signal<ContentPost | null>(null);
  readonly deleteReason = signal('');
  readonly deleteNote = signal('');
  readonly deleteConfirm = signal('');

  readonly toast = signal<ToastState | null>(null);

  readonly revisionReasons = REVISION_REASONS;
  readonly hideReasons = HIDE_REASONS;

  readonly categories = computed(() => [...new Set(this.posts().map(post => post.category))]);
  readonly authors = computed(() => [...new Set(this.posts().map(post => post.author))]);
  readonly categoryOptions = computed<CustomSelectOption[]>(() => [
    { value: '', label: 'Tất cả chuyên mục' },
    ...this.categories().map(item => ({ value: item, label: item }))
  ]);
  readonly authorOptions = computed<CustomSelectOption[]>(() => [
    { value: '', label: 'Tất cả tác giả' },
    ...this.authors().map(item => ({ value: item, label: item }))
  ]);
  readonly statusOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    ...(Object.keys(POST_STATUS_LABELS) as PostStatus[]).map(status => ({ value: status, label: POST_STATUS_LABELS[status] }))
  ];

  readonly counts = computed(() => {
    const items = this.posts();
    return {
      total: items.length,
      published: items.filter(post => post.status === 'published').length,
      pending: items.filter(post => post.status === 'pending').length,
      hidden: items.filter(post => post.status === 'hidden').length
    };
  });
  readonly pinnedCount = computed(() => this.posts().filter(post => post.pinned).length);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.category();
    const status = this.status();
    const author = this.author();
    return this.posts().filter(post => {
      const matchesTerm = !term
        || post.title.toLowerCase().includes(term)
        || post.slug.toLowerCase().includes(term)
        || post.author.toLowerCase().includes(term);
      return matchesTerm
        && (!category || post.category === category)
        && (!status || post.status === status)
        && (!author || post.author === author);
    });
  });

  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (!total) return 'Không có bài viết nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start}–${Math.min(start + this.pageSize - 1, total)} trong ${total} bài viết`;
  });

  readonly canRequestEdit = computed(() => this.requestReasons().size > 0 || this.requestNote().trim().length >= 15);
  readonly canDelete = computed(() => this.deleteReason().trim().length > 0
    && this.deleteNote().trim().length >= 15
    && this.deleteConfirm() === 'XOA');
  readonly hideHasPinNotice = computed(() => this.hideTarget()?.pinned === true);

  setSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  setCategory(value: string): void {
    this.category.set(value);
    this.page.set(1);
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
  }

  setAuthor(value: string): void {
    this.author.set(value);
    this.page.set(1);
  }

  clearFilters(): void {
    this.search.set('');
    this.category.set('');
    this.status.set('');
    this.author.set('');
    this.page.set(1);
  }

  goToPage(value: number | '...'): void {
    if (value === '...') return;
    this.page.set(value);
  }

  /* ---------- row menu ---------- */

  openMenu(event: MouseEvent, post: ContentPost): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 300;
    const height = 100;
    const gap = 6;
    const margin = 12;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const openAbove = below < height && rect.top - gap - margin > height;
    const top = openAbove
      ? Math.max(margin, rect.top - gap - height)
      : Math.min(rect.bottom + gap, window.innerHeight - margin - height);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width));
    this.menu.set({ post, top, left });
  }

  closeMenu(): void {
    this.menu.set(null);
  }

  isMenuOpen(id: string): boolean {
    return this.menu()?.post.id === id;
  }

  /* ---------- row actions ---------- */

  togglePin(post: ContentPost): void {
    if (!post.pinned && this.pinnedCount() >= PIN_LIMIT) {
      this.notify(
        'Đã đạt giới hạn tối đa 5 bài ghim trang chủ.',
        'Vui lòng bỏ ghim bài cũ trước khi ghim bài mới.',
        'error'
      );
      return;
    }
    this.store.updatePost(
      post.id,
      { pinned: !post.pinned },
      post.pinned ? 'Bỏ ghim bài viết khỏi trang chủ.' : 'Ghim bài viết lên trang chủ.'
    );
    this.notify(
      post.pinned ? 'Đã bỏ ghim bài viết khỏi trang chủ.' : 'Đã ghim bài viết lên trang chủ.',
      post.title,
      'success'
    );
  }

  openView(post: ContentPost): void {
    this.closeMenu();
    this.previewDevice.set('desktop');
    this.viewTarget.set(post);
  }

  edit(post: ContentPost): void {
    this.closeMenu();
    this.viewTarget.set(null);
    void this.router.navigate(['/content/posts', post.id, 'edit']);
  }

  /* ---------- request revision ---------- */

  askRequestEdit(post: ContentPost): void {
    this.closeMenu();
    this.requestReasons.set(new Set());
    this.requestNote.set('');
    this.requestTarget.set(post);
  }

  toggleRequestReason(reason: string): void {
    const next = new Set(this.requestReasons());
    next.has(reason) ? next.delete(reason) : next.add(reason);
    this.requestReasons.set(next);
  }

  submitRequestEdit(): void {
    const post = this.requestTarget();
    if (!post || !this.canRequestEdit()) return;
    const reasons = [...this.requestReasons()];
    const note = this.requestNote().trim();
    const summary = [reasons.join('; '), note].filter(Boolean).join(' — ');
    this.store.updatePost(post.id, { status: 'revision', moderationNote: summary }, 'Yêu cầu tác giả chỉnh sửa bài viết.');
    this.requestTarget.set(null);
    this.notify(
      'Đã gửi yêu cầu chỉnh sửa cho tác giả.',
      'Bài chuyển sang Cần chỉnh sửa; tác giả nhận email và thông báo.',
      'success'
    );
  }

  /* ---------- hide ---------- */

  askHide(post: ContentPost): void {
    this.closeMenu();
    this.hideReason.set(HIDE_REASONS[0]);
    this.hideNote.set('');
    this.hideTarget.set(post);
  }

  submitHide(): void {
    const post = this.hideTarget();
    if (!post) return;
    const reason = this.hideReason();
    this.store.updatePost(
      post.id,
      { status: 'hidden', pinned: false, moderationNote: reason },
      `Tạm ẩn bài viết: ${reason}`
    );
    this.hideTarget.set(null);
    this.notify(
      'Đã tạm ẩn bài viết và gỡ ghim Home.',
      'Tác giả đã nhận thông báo; thao tác được lưu vào nhật ký.',
      'success'
    );
  }

  /* ---------- restore ---------- */

  askRestore(post: ContentPost): void {
    this.closeMenu();
    this.restoreTarget.set(post);
  }

  submitRestore(): void {
    const post = this.restoreTarget();
    if (!post) return;
    this.store.updatePost(post.id, { status: 'published' }, 'Khôi phục xuất bản bài viết.');
    this.restoreTarget.set(null);
    this.notify('Đã khôi phục xuất bản bài viết.', 'Bài viết đã hiển thị công khai trở lại.', 'success');
  }

  /* ---------- delete ---------- */

  askDelete(post: ContentPost): void {
    this.closeMenu();
    this.deleteReason.set('');
    this.deleteNote.set('');
    this.deleteConfirm.set('');
    this.deleteTarget.set(post);
  }

  submitDelete(): void {
    const post = this.deleteTarget();
    if (!post || !this.canDelete()) return;
    this.store.removePosts([post.id]);
    this.deleteTarget.set(null);
    this.notify(
      'Đã xóa bài viết khỏi giao diện công khai.',
      'Bình luận được giữ nội bộ; lý do đã gửi tác giả và lưu nhật ký.',
      'success'
    );
  }

  exportList(format: string): void {
    this.notify(`Đang chuẩn bị tệp ${format.toUpperCase()} cho ${this.filtered().length} bài viết.`, '', 'info');
  }

  notify(message: string, description: string, tone: ToastTone): void {
    this.toast.set({ message, description, tone });
    setTimeout(() => {
      if (this.toast()?.message === message) this.toast.set(null);
    }, 5000);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.closeMenu();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.closeMenu();
    this.viewTarget.set(null);
    this.requestTarget.set(null);
    this.hideTarget.set(null);
    this.restoreTarget.set(null);
    this.deleteTarget.set(null);
  }

  statusLabel(status: PostStatus): string { return POST_STATUS_LABELS[status]; }
  statusTone(status: PostStatus): string { return POST_STATUS_TONE[status]; }
  roleTone(role: string): string { return ROLE_TONE[role] ?? 'neutral'; }
  date = formatDate;
  time = formatTime;
}
