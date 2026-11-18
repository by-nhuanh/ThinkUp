import { Component, HostListener, WritableSignal, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { BulkSelectionDialogComponent, BulkSelectionItem } from '../../../shared/components/bulk-selection-dialog/bulk-selection-dialog.component';
import { ColumnFilterComponent, ColumnFilterValue, DATE_SORT_OPTIONS, TEXT_SORT_OPTIONS, compareSortValues } from '../../../shared/components/column-filter/column-filter.component';
import { AdminPageSizeService } from '../../../core/services/admin-page-size.service';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SelectionAction, SelectionBarComponent } from '../../../shared/components/selection-bar/selection-bar.component';
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

type PostColumn = 'category' | 'author' | 'updated' | 'pin' | 'status';

const PIN_VALUES: ColumnFilterValue[] = [
  { value: 'on', label: 'Đã ghim' },
  { value: 'off', label: 'Chưa ghim' }
];

@Component({
  selector: 'app-content-post-list',
  standalone: true,
  imports: [RouterLink, AdminDialogComponent, BulkSelectionDialogComponent, ColumnFilterComponent, ContentToastComponent, CustomSelectComponent, ExportMenuComponent, SelectionBarComponent],
  templateUrl: './post-list.component.html',
  styleUrls: ['../content-page.css', './post-list.component.css']
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
  private readonly pageSizeService = inject(AdminPageSizeService);
  /** Số dòng mỗi trang đọc từ cấu hình hệ thống (`parameters.orders_per_page`). */
  get pageSize(): number { return this.pageSizeService.pageSize(); }
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly selectionListOpen = signal(false);
  readonly bulkDeleteIds = signal<readonly string[] | null>(null);

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

  private readonly columnFilters: Record<PostColumn, WritableSignal<string[]>> = {
    category: signal<string[]>([]),
    author: signal<string[]>([]),
    updated: signal<string[]>([]),
    pin: signal<string[]>([]),
    status: signal<string[]>([])
  };

  readonly categories = computed(() => [...new Set(this.posts().map(post => post.category))]);
  readonly authors = computed(() => [...new Set(this.posts().map(post => post.author))]);
  readonly categoryValues = computed<ColumnFilterValue[]>(() =>
    [...this.categories(), ...this.columnFilters.category()]
      .filter((item, index, all) => all.indexOf(item) === index)
      .map(item => ({ value: item, label: item })));
  readonly authorValues = computed<ColumnFilterValue[]>(() =>
    [...this.authors(), ...this.columnFilters.author()]
      .filter((item, index, all) => all.indexOf(item) === index)
      .map(item => ({ value: item, label: item })));
  readonly statusValues: ColumnFilterValue[] = (Object.keys(POST_STATUS_LABELS) as PostStatus[])
    .map(status => ({ value: status, label: POST_STATUS_LABELS[status] }));
  readonly updatedValues = computed<ColumnFilterValue[]>(() =>
    [...new Set(this.posts().map(post => formatDate(post.updatedAt)))]
      .map(date => ({ value: date, label: date })));
  readonly pinValues = PIN_VALUES;
  readonly textSorts = TEXT_SORT_OPTIONS;
  readonly dateSorts = DATE_SORT_OPTIONS;
  readonly columnSort = signal<{ column: PostColumn; direction: 'asc' | 'desc' } | null>(null);
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
    const statuses = this.columnFilters.status();
    const categories = this.columnFilters.category();
    const authors = this.columnFilters.author();
    const updatedDates = this.columnFilters.updated();
    const pins = this.columnFilters.pin();
    const items = this.posts().filter(post => {
      const matchesTerm = !term
        || post.title.toLowerCase().includes(term)
        || post.slug.toLowerCase().includes(term)
        || post.author.toLowerCase().includes(term);
      return matchesTerm
        && (!category || post.category === category)
        && (!status || post.status === status)
        && (!author || post.author === author)
        && (!statuses.length || statuses.includes(post.status))
        && (!categories.length || categories.includes(post.category))
        && (!authors.length || authors.includes(post.author))
        && (!updatedDates.length || updatedDates.includes(formatDate(post.updatedAt)))
        && (!pins.length || pins.includes(post.pinned ? 'on' : 'off'));
    });
    const columnSort = this.columnSort();
    if (columnSort) {
      const factor = columnSort.direction === 'asc' ? 1 : -1;
      return [...items].sort((a, b) => compareSortValues(this.sortValue(a, columnSort.column), this.sortValue(b, columnSort.column)) * factor);
    }
    return items;
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

  readonly selectedIds = computed(() => [...this.selection()]);
  readonly allVisibleSelected = computed(() => {
    const items = this.visible();
    const chosen = this.selection();
    return items.length > 0 && items.every(post => chosen.has(post.id));
  });
  readonly someVisibleSelected = computed(() => !this.allVisibleSelected() && this.visible().some(post => this.selection().has(post.id)));
  readonly selectionItems = computed<BulkSelectionItem[]>(() => this.posts()
    .filter(post => this.selection().has(post.id))
    .map(post => ({ id: post.id, label: post.title, detail: `${post.author} · ${POST_STATUS_LABELS[post.status]}` })));
  readonly selectionCandidates = computed<BulkSelectionItem[]>(() => this.filtered()
    .filter(post => !this.selection().has(post.id))
    .map(post => ({ id: post.id, label: post.title, detail: `${post.author} · ${POST_STATUS_LABELS[post.status]}` })));
  readonly selectionActions = computed<readonly SelectionAction[]>(() => [
    { key: 'published', label: 'Xuất bản', tone: 'primary' },
    { key: 'hidden', label: 'Tạm ẩn' },
    { key: 'delete', label: 'Xóa', tone: 'danger' }
  ]);

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
    this.columnSort.set(null);
    Object.values(this.columnFilters).forEach(filter => filter.set([]));
    this.page.set(1);
  }

  filterFor(key: PostColumn): readonly string[] {
    return this.columnFilters[key]();
  }

  updateColumnFilter(key: PostColumn, values: string[]): void {
    this.columnFilters[key].set(values);
    this.page.set(1);
  }

  sortFor(key: PostColumn): string {
    const current = this.columnSort();
    return current?.column === key ? current.direction : '';
  }

  updateColumnSort(key: PostColumn, direction: string): void {
    const current = this.columnSort();
    this.columnSort.set(!direction || (current?.column === key && current.direction === direction)
      ? null
      : { column: key, direction: direction as 'asc' | 'desc' });
    this.page.set(1);
  }

  private sortValue(item: ContentPost, column: PostColumn): string | number {
    switch (column) {
      case 'category': return item.category;
      case 'author': return item.author;
      case 'updated': return Date.parse(item.updatedAt);
      case 'pin': return item.pinned ? 'Đã ghim' : 'Chưa ghim';
      case 'status': return POST_STATUS_LABELS[item.status];
    }
  }

  goToPage(value: number | '...'): void {
    if (value === '...') return;
    this.page.set(value);
  }

  /* ---------- bulk selection ---------- */

  isSelected(id: string): boolean { return this.selection().has(id); }

  toggleSelect(id: string, checked: boolean): void {
    const next = new Set(this.selection());
    checked ? next.add(id) : next.delete(id);
    this.selection.set(next);
  }

  toggleSelectAll(): void {
    const next = new Set(this.selection());
    if (this.allVisibleSelected()) this.visible().forEach(post => next.delete(post.id));
    else this.visible().forEach(post => next.add(post.id));
    this.selection.set(next);
  }

  clearSelection(): void { this.selection.set(new Set()); }

  setSelectionIds(ids: string[]): void { this.selection.set(new Set(ids)); }

  bulkStatus(status: 'published' | 'hidden', ids: readonly string[] = this.selectedIds()): void {
    if (!ids.length) return;
    ids.forEach(id => this.store.updatePost(
      id,
      status === 'hidden' ? { status, pinned: false } : { status },
      status === 'hidden' ? 'Tạm ẩn hàng loạt và gỡ ghim Home.' : 'Xuất bản hàng loạt bài viết.'
    ));
    this.clearSelection();
    this.notify(
      status === 'hidden' ? `Đã tạm ẩn ${ids.length} bài viết và gỡ ghim Home.` : `Đã xuất bản ${ids.length} bài viết.`,
      'Thao tác hàng loạt đã được lưu vào nhật ký kiểm duyệt.',
      'success'
    );
  }

  bulkDelete(ids: readonly string[] = this.selectedIds()): void {
    if (!ids.length) return;
    this.bulkDeleteIds.set(ids);
  }

  confirmBulkDelete(): void {
    const ids = this.bulkDeleteIds();
    if (!ids?.length) return;
    this.store.removePosts([...ids]);
    this.clearSelection();
    this.bulkDeleteIds.set(null);
    this.page.set(Math.min(this.page(), this.pages()));
    this.notify(
      `Đã xóa ${ids.length} bài viết khỏi giao diện công khai.`,
      'Bình luận được giữ nội bộ; thao tác đã lưu vào nhật ký kiểm duyệt.',
      'success'
    );
  }

  runSelectionAction(key: string, ids?: readonly string[]): void {
    this.selectionListOpen.set(false);
    if (key === 'delete') this.bulkDelete(ids);
    else if (key === 'published' || key === 'hidden') this.bulkStatus(key, ids);
  }

  /* ---------- row menu ---------- */

  private menuTrigger: HTMLElement | null = null;

  openMenu(event: MouseEvent | KeyboardEvent, post: ContentPost): void {
    event.stopPropagation();
    if (this.isMenuOpen(post.id)) { this.closeMenu(); return; }
    this.menuTrigger = event.currentTarget as HTMLElement;
    const rect = this.menuTrigger.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 24);
    const height = Math.min(4 * 42 + 16, window.innerHeight - 24);
    const gap = 6;
    const margin = 12;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const openAbove = below < height && rect.top - gap - margin > height;
    const top = openAbove
      ? Math.max(margin, rect.top - gap - height)
      : Math.min(rect.bottom + gap, window.innerHeight - margin - height);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width));
    this.menu.set({ post, top, left });
    setTimeout(() => {
      if (this.isMenuOpen(post.id)) {
        document.querySelector<HTMLButtonElement>('#post-actions-menu button')?.focus();
      }
    });
  }

  openMenuFromKeyboard(event: Event, post: ContentPost): void {
    if (!(event instanceof KeyboardEvent)) return;
    event.preventDefault();
    if (!this.isMenuOpen(post.id)) this.openMenu(event, post);
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') { this.closeMenu(); return; }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }

  closeMenu(): void {
    if (!this.menu()) return;
    this.menu.set(null);
    this.menuTrigger?.focus({ preventScroll: true });
  }

  @HostListener('window:scroll', ['$event'])
  onWindowScroll(event: Event): void {
    if (event.target === document) this.closeMenu();
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
