import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import { formatDateTime, POST_STATUS_LABELS } from '../content-utils';
import { ContentCategory, ContentPost, PostStatus } from '../models/content.models';
import { ContentStore } from '../services/content.store';

const CATEGORIES: ContentCategory[] = [
  'Lập trình cơ bản', 'Web Development', 'Backend', 'DevOps', 'Thuật toán', 'Kinh nghiệm', 'Tài nguyên'
];

@Component({
  selector: 'app-content-post-editor',
  standalone: true,
  imports: [RouterLink, CustomSelectComponent, ContentToastComponent],
  templateUrl: './post-editor.component.html',
  styleUrl: '../content-page.css'
})
export class ContentPostEditorComponent {
  private readonly store = inject(ContentStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly editing = signal<ContentPost | null>(null);
  readonly title = signal('');
  readonly slug = signal('');
  readonly excerpt = signal('');
  readonly bodyText = signal('');
  readonly category = signal<ContentCategory>('Lập trình cơ bản');
  readonly tagsInput = signal('');
  readonly status = signal<PostStatus>('draft');
  readonly thumbnail = signal('/assets/content/posts/thumb-frontend.svg');
  readonly callout = signal('');
  readonly seoTitle = signal('');
  readonly seoDescription = signal('');
  readonly allowComments = signal(true);
  readonly loginRequired = signal(false);
  readonly featured = signal(false);
  readonly pinned = signal(false);
  readonly submitted = signal(false);
  readonly previewOpen = signal(false);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);
  readonly lastSaved = signal<string | null>(null);

  readonly categoryOptions: CustomSelectOption[] = CATEGORIES.map(item => ({ value: item, label: item }));
  readonly statusOptions: CustomSelectOption[] = [
    { value: 'draft', label: 'Bản nháp' },
    { value: 'pending', label: 'Gửi duyệt' },
    { value: 'published', label: 'Xuất bản ngay' },
    { value: 'scheduled', label: 'Lên lịch' }
  ];
  readonly coverOptions = [
    '/assets/content/posts/thumb-frontend.svg', '/assets/content/posts/thumb-code.svg',
    '/assets/content/posts/thumb-study.svg', '/assets/content/posts/thumb-career.svg',
    '/assets/content/posts/thumb-ux.svg', '/assets/content/posts/thumb-news.svg'
  ];
  readonly tags = computed(() => this.tagsInput().split(',').map(tag => tag.trim()).filter(Boolean));
  readonly bodyParagraphs = computed(() => this.bodyText().split('\n').map(line => line.trim()).filter(Boolean));
  readonly wordCount = computed(() => this.bodyText().trim().split(/\s+/).filter(Boolean).length);
  readonly titleError = computed(() => this.submitted() && this.title().trim().length < 10 ? 'Tiêu đề cần tối thiểu 10 ký tự.' : '');
  readonly excerptError = computed(() => this.submitted() && this.excerpt().trim().length < 30 ? 'Mô tả ngắn cần tối thiểu 30 ký tự.' : '');
  readonly bodyError = computed(() => this.submitted() && this.bodyText().trim().length < 50 ? 'Nội dung cần tối thiểu 50 ký tự.' : '');
  readonly valid = computed(() => this.title().trim().length >= 10 && this.excerpt().trim().length >= 30 && this.bodyText().trim().length >= 50);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || id === 'new') return;
    const post = this.store.posts().find(item => item.id === id) ?? null;
    this.editing.set(post);
    if (!post) return;
    this.title.set(post.title);
    this.slug.set(post.slug);
    this.excerpt.set(post.excerpt);
    this.bodyText.set(post.body.join('\n'));
    this.category.set(post.category);
    this.tagsInput.set(post.tags.join(', '));
    this.status.set(post.status);
    this.thumbnail.set(post.thumbnail);
    this.callout.set(post.callout ?? '');
    this.seoTitle.set(post.seoTitle ?? '');
    this.seoDescription.set(post.seoDescription ?? '');
    this.allowComments.set(post.allowComments ?? true);
    this.loginRequired.set(post.loginRequired ?? false);
    this.featured.set(post.featured);
    this.pinned.set(post.pinned);
  }

  updateTitle(value: string): void {
    this.title.set(value);
    if (!this.editing()) this.slug.set(slugify(value));
  }

  updateStatus(value: string): void {
    this.status.set(value as PostStatus);
  }

  updateCategory(value: string): void {
    this.category.set(value as ContentCategory);
  }

  save(overrideStatus?: PostStatus): void {
    this.submitted.set(true);
    if (!this.valid()) {
      this.notify('Vui lòng hoàn thiện các trường bắt buộc trước khi lưu.', 'error');
      return;
    }
    const status = overrideStatus ?? this.status();
    if (this.pinned()) {
      const editingId = this.editing()?.id;
      const pinnedCount = this.store.posts().filter(post => post.pinned && post.id !== editingId).length;
      if (pinnedCount >= 5) {
        this.notify('Chỉ được ghim tối đa 5 bài viết trên trang chủ. Hãy bỏ ghim một bài khác trước.', 'error');
        return;
      }
    }
    const now = new Date().toISOString();
    const existing = this.editing();
    if (existing) {
      this.store.updatePost(existing.id, {
        title: this.title().trim(),
        slug: this.slug() || slugify(this.title()),
        excerpt: this.excerpt().trim(),
        body: this.bodyParagraphs(),
        category: this.category(),
        tags: this.tags(),
        status,
        thumbnail: this.thumbnail(),
        callout: this.callout().trim(),
        seoTitle: this.seoTitle().trim(),
        seoDescription: this.seoDescription().trim(),
        allowComments: this.allowComments(),
        loginRequired: this.loginRequired(),
        featured: this.featured(),
        pinned: this.pinned(),
        scheduledAt: status === 'scheduled' ? now : undefined,
        rejectionReason: undefined
      }, `Lưu bài viết ở trạng thái ${POST_STATUS_LABELS[status]}.`);
      this.lastSaved.set(now);
      this.notify(`Đã lưu “${this.title().trim()}”.`, 'success');
    } else {
      const id = `BV-${String(this.store.posts().length + 1).padStart(3, '0')}`;
      this.store.createPost({
        id,
        title: this.title().trim(),
        slug: this.slug() || slugify(this.title()),
        category: this.category(),
        author: 'Quản trị viên',
        authorRole: 'Biên tập viên',
        tags: this.tags(),
        status,
        excerpt: this.excerpt().trim(),
        body: this.bodyParagraphs(),
        thumbnail: this.thumbnail(),
        callout: this.callout().trim(),
        seoTitle: this.seoTitle().trim(),
        seoDescription: this.seoDescription().trim(),
        allowComments: this.allowComments(),
        loginRequired: this.loginRequired(),
        views: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
        scheduledAt: status === 'scheduled' ? now : undefined,
        featured: this.featured(),
        pinned: this.pinned()
      });
      this.notify('Đã tạo bài viết mới.', 'success');
      setTimeout(() => void this.router.navigate(['/content/posts']), 500);
    }
  }

  readonly missing = computed(() => {
    const id = this.route.snapshot.paramMap.get('id');
    return !!id && id !== 'new' && !this.editing();
  });

  duplicate(): void {
    this.editing.set(null);
    this.submitted.set(false);
    this.notify('Đã tạo bản sao nội dung. Lưu để hoàn tất bài viết mới.', 'info');
  }

  reset(): void {
    const post = this.editing();
    if (!post) {
      this.updateTitle('');
      this.excerpt.set('');
      this.bodyText.set('');
      this.tagsInput.set('');
      this.callout.set('');
      this.seoTitle.set('');
      this.seoDescription.set('');
      this.allowComments.set(true);
      this.loginRequired.set(false);
      this.submitted.set(false);
      return;
    }
    this.title.set(post.title);
    this.excerpt.set(post.excerpt);
    this.bodyText.set(post.body.join('\n'));
    this.tagsInput.set(post.tags.join(', '));
    this.callout.set(post.callout ?? '');
    this.seoTitle.set(post.seoTitle ?? '');
    this.seoDescription.set(post.seoDescription ?? '');
    this.allowComments.set(post.allowComments ?? true);
    this.loginRequired.set(post.loginRequired ?? false);
    this.status.set(post.status);
    this.submitted.set(false);
    this.notify('Đã khôi phục nội dung đã lưu gần nhất.', 'info');
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => {
      if (this.toast()?.message === message) this.toast.set(null);
    }, 4200);
  }

  dateTime = formatDateTime;
  truncate(value: string): string { return value.length > 60 ? `${value.slice(0, 60)}…` : value; }
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
