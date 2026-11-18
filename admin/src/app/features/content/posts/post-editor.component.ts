import { AdminDialogComponent } from '../../../shared/components/admin-dialog/admin-dialog.component';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ContentToastComponent, ToastTone } from '../components/content-toast.component';
import { formatDateTime, POST_STATUS_LABELS } from '../content-utils';
import { ContentCategory, ContentPost, PostStatus } from '../models/content.models';
import { ContentStore } from '../services/content.store';
import { MOCK_COURSES } from '../../../core/data/mock/course.mock';

const CATEGORIES: ContentCategory[] = [
  'Lập trình cơ bản', 'Web Development', 'Backend', 'DevOps', 'Thuật toán', 'Kinh nghiệm', 'Tài nguyên'
];

const LECTURER_NAMES: readonly string[] = [...new Set(MOCK_COURSES.map(course => course.instructor))];

@Component({
  selector: 'app-content-post-editor',
  standalone: true,
  imports: [AdminDialogComponent, DateTimePickerComponent, RouterLink, CustomSelectComponent, ContentToastComponent],
  templateUrl: './post-editor.component.html',
  styleUrls: ['../content-page.css', './post-editor.component.css']
})
export class ContentPostEditorComponent {
  private readonly store = inject(ContentStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly editing = signal<ContentPost | null>(null);
  readonly missing = signal(false);
  readonly scheduledAt = signal('');
  readonly title = signal('');
  readonly slug = signal('');
  readonly excerpt = signal('');
  readonly bodyText = signal('');
  readonly category = signal<ContentCategory>('Lập trình cơ bản');
  readonly author = signal(LECTURER_NAMES[0]);
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
  readonly authorOptions = computed<CustomSelectOption[]>(() => {
    const current = this.author();
    const names = LECTURER_NAMES.includes(current) ? LECTURER_NAMES : [...LECTURER_NAMES, current];
    return names.map(name => ({ value: name, label: name }));
  });
  readonly authorRole = computed<ContentPost['authorRole']>(() =>
    LECTURER_NAMES.includes(this.author()) ? 'Giảng viên' : (this.editing()?.authorRole ?? 'Giảng viên'));
  readonly statusOptions: CustomSelectOption[] = [
    { value: 'draft', label: 'Bản nháp' },
    { value: 'pending', label: 'Gửi duyệt' },
    { value: 'published', label: 'Xuất bản ngay' },
    { value: 'scheduled', label: 'Lên lịch' },
    ...(['hidden', 'archived', 'revision', 'rejected'] as PostStatus[]).map(value => ({ value, label: POST_STATUS_LABELS[value] }))
  ];
  readonly coverOptions = [
    '/assets/content/posts/thumb-frontend.svg', '/assets/content/posts/thumb-code.svg',
    '/assets/content/posts/thumb-study.svg', '/assets/content/posts/thumb-career.svg',
    '/assets/content/posts/thumb-ux.svg', '/assets/content/posts/thumb-news.svg'
  ];
  readonly tags = computed(() => [...new Set(this.tagsInput().split(',').map(tag => tag.trim()).filter(Boolean))]);
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
    if (!post) { this.missing.set(true); return; }
    this.loadPost(post);
  }

  private loadPost(post: ContentPost): void {
    this.title.set(post.title);
    this.slug.set(post.slug);
    this.excerpt.set(post.excerpt);
    this.bodyText.set(post.body.join('\n'));
    this.category.set(post.category);
    this.author.set(post.author);
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
    this.scheduledAt.set(post.scheduledAt ? localDateTime(post.scheduledAt) : '');
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
    if (this.missing()) return;
    this.submitted.set(true);
    if (!this.valid()) {
      this.notify('Vui lòng hoàn thiện các trường bắt buộc trước khi lưu.', 'error');
      return;
    }
    const status = overrideStatus ?? this.status();
    if (status === 'scheduled' && (!this.scheduledAt() || !Number.isFinite(new Date(this.scheduledAt()).getTime()) || new Date(this.scheduledAt()).getTime() <= Date.now())) {
      this.notify('Vui lòng chọn thời gian xuất bản trong tương lai.', 'error');
      return;
    }
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
        author: this.author(),
        authorRole: this.authorRole(),
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
        scheduledAt: status === 'scheduled' ? new Date(this.scheduledAt()).toISOString() : undefined,
        rejectionReason: undefined
      }, `Lưu bài viết ở trạng thái ${POST_STATUS_LABELS[status]}.`);
      this.editing.set(this.store.posts().find(post => post.id === existing.id) ?? existing);
      this.lastSaved.set(now);
      this.notify(`Đã lưu “${this.title().trim()}”.`, 'success');
    } else {
      const nextId = Math.max(0, ...this.store.posts().map(post => Number(post.id.replace('BV-', '')) || 0)) + 1;
      const id = `BV-${String(nextId).padStart(3, '0')}`;
      this.store.createPost({
        id,
        title: this.title().trim(),
        slug: this.slug() || slugify(this.title()),
        category: this.category(),
        author: this.author(),
        authorRole: this.authorRole(),
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
        scheduledAt: status === 'scheduled' ? new Date(this.scheduledAt()).toISOString() : undefined,
        featured: this.featured(),
        pinned: this.pinned()
      });
      this.notify('Đã tạo bài viết mới.', 'success');
      setTimeout(() => void this.router.navigate(['/content/posts']), 500);
    }
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

function localDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
