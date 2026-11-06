import { DecimalPipe } from '@angular/common';
import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideAward,
  LucideBookOpen,
  LucideChartColumn,
  LucideCheck,
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideCirclePlay,
  LucideCircleQuestionMark,
  LucideClock,
  LucideCode,
  LucideDownload,
  LucideEllipsisVertical,
  LucideFileText,
  LucideGlobe,
  LucideGripVertical,
  LucideListChecks,
  LucideMessageSquare,
  LucidePlay,
  LucideSearch,
  LucideSend,
  LucideStar,
  LucideThumbsUp,
  LucideVideo,
} from '@lucide/angular';
import { Observable, Subscription, finalize } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import {
  MOCK_REPORT_REASONS,
} from '../../../core/data/mock/learning-player.mock';
import { ReportModalComponent } from '../../learning/components/report-modal/report-modal.component';
import { ReviewModalComponent } from '../../learning/components/review-modal/review-modal.component';
import {
  CommunityPost,
  CourseDocument,
  CourseReviewSummary,
  DashboardQuestion,
  LearningChapter,
  LearningCourse,
  LearningLesson,
} from '../../learning/models/learning.model';
import { LearningEnrollment, LearningService } from '../../learning/services/learning.service';
import { Certificate } from '../../../core/models/certificate.model';
import { CertificateService } from '../../../core/services/certificate.service';
import { InstructorTriggerDirective } from '../../../shared/directives/instructor-trigger.directive';

type DashboardTab = 'content' | 'overview' | 'resources' | 'qa' | 'discussion';
type DocumentFilter = 'all' | 'lecture' | 'code' | 'exercise';

@Component({
  selector: 'app-course-dashboard',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    ReportModalComponent,
    ReviewModalComponent,
    InstructorTriggerDirective,
    LucideAward,
    LucideBookOpen,
    LucideChartColumn,
    LucideCheck,
    LucideChevronDown,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideCirclePlay,
    LucideCircleQuestionMark,
    LucideClock,
    LucideCode,
    LucideDownload,
    LucideEllipsisVertical,
    LucideFileText,
    LucideGlobe,
    LucideGripVertical,
    LucideListChecks,
    LucideMessageSquare,
    LucidePlay,
    LucideSearch,
    LucideSend,
    LucideStar,
    LucideThumbsUp,
    LucideVideo,
  ],
  templateUrl: './course-dashboard.component.html',
})
export class CourseDashboardComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly learningService = inject(LearningService);
  private readonly certificateService = inject(CertificateService);
  private readonly toast = inject(ToastService);
  private loadVersion = 0;
  private readonly pending = new Set<string>();

  readonly course = signal<LearningCourse | null>(null);
  readonly certificate = signal<Certificate | null>(null);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly activeTab = signal<DashboardTab>('content');

  readonly tabs: { id: DashboardTab; label: string }[] = [
    { id: 'content', label: 'Nội dung khóa học' },
    { id: 'overview', label: 'Tổng quan' },
    { id: 'resources', label: 'Tài liệu' },
    { id: 'qa', label: 'Hỏi đáp' },
    { id: 'discussion', label: 'Thảo luận' },
  ];

  readonly enrollment = computed<LearningEnrollment | null>(() => {
    const course = this.course();
    return course ? this.learningService.getEnrollment(course) : null;
  });

  readonly documents = signal<CourseDocument[]>([]);
  readonly documentFilters: { id: DocumentFilter; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'lecture', label: 'Tài liệu bài giảng' },
    { id: 'code', label: 'Mã nguồn' },
    { id: 'exercise', label: 'Bài tập' },
  ];

  readonly documentFilter = signal<DocumentFilter>('all');
  readonly documentSearch = signal('');
  readonly documentPage = signal(1);
  readonly pageSize = 6;

  readonly filteredDocuments = computed(() => {
    const query = this.documentSearch().trim().toLowerCase();
    const filter = this.documentFilter();
    return this.documents().filter((document) => {
      const matchesFilter = filter === 'all' || document.category === filter;
      const matchesQuery =
        !query ||
        document.name.toLowerCase().includes(query) ||
        document.subtitle.toLowerCase().includes(query);
      return matchesFilter && matchesQuery;
    });
  });

  readonly documentPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredDocuments().length / this.pageSize))
  );

  readonly pagedDocuments = computed(() => {
    const page = Math.min(this.documentPage(), this.documentPageCount());
    const start = (page - 1) * this.pageSize;
    return this.filteredDocuments().slice(start, start + this.pageSize);
  });

  readonly pageNumbers = computed<(number | 'ellipsis')[]>(() => {
    const total = this.documentPageCount();
    const current = Math.min(this.documentPage(), total);
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    if (current <= 3) return [1, 2, 3, 'ellipsis', total];
    if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
    return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
  });

  readonly questions = signal<DashboardQuestion[]>([]);
  readonly discussions = signal<CommunityPost[]>([]);
  readonly expandedChapterIds = signal<string[]>([]);
  discussionSort: 'newest' | 'popular' | 'oldest' = 'newest';

  readonly reviewOpen = signal(false);
  readonly reviewSummary = signal<CourseReviewSummary | null>(null);
  readonly reportPost = signal<CommunityPost | null>(null);
  readonly reasons = MOCK_REPORT_REASONS;

  questionDraft = '';
  selectedLessonId = '';
  commentDraft = '';
  replyDraft = '';
  replyingToId: string | null = null;
  questionReplyDraft = '';
  replyingQuestionId: string | null = null;

  private readonly subscriptions = new Subscription();

  outcomes: string[] = [];

  requirements: string[] = [];

  constructor() {
    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => this.load(params.get('courseId') ?? ''))
    );
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const tab = params.get('tab');
        if (tab === 'overview' || tab === 'resources' || tab === 'qa' || tab === 'discussion' || tab === 'content') {
          this.activeTab.set(tab);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  @HostListener('window:focus')
  @HostListener('document:visibilitychange')
  refreshLearningSummary(): void {
    if (document.hidden) return;
    const course = this.course();
    if (!course || this.status() !== 'ready' || this.pending.has('learning-summary')) return;
    const version = this.loadVersion;
    this.pending.add('learning-summary');
    this.subscriptions.add(this.learningService.getCourse(course.id).pipe(
      finalize(() => this.pending.delete('learning-summary'))
    ).subscribe({
      next: updated => {
        if (version === this.loadVersion && this.course()?.id === course.id) this.course.set(updated);
      },
      error: () => this.toast.showToast({ type: 'warning', message: 'Không tải lại được thời gian và tiến độ học. Vui lòng thử lại.' }),
    }));
  }

  load(courseId: string): void {
    const version = ++this.loadVersion;
    this.questions.set([]); this.discussions.set([]); this.documents.set([]);
    this.outcomes = []; this.requirements = [];
    this.status.set('loading');
    this.subscriptions.add(
      this.learningService.getCourse(courseId).subscribe({
        next: (course) => {
          if (version !== this.loadVersion) return;
          this.course.set(course);
          this.expandedChapterIds.set(course.chapters.slice(0, 1).map((chapter) => chapter.id));
          this.status.set('ready');
          this.loadAuxiliary(course);
          this.selectedLessonId = course.chapters[0]?.lessons[0]?.id ?? '';
        },
        error: () => {
          if (version === this.loadVersion) {
            this.status.set('error');
          }
        },
      })
    );
  }

  selectTab(tab: DashboardTab): void {
    if (this.isTabLocked(tab)) return;
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }

  continueLearning(): void {
    const course = this.course();
    const enrollment = this.enrollment();
    if (!course || !enrollment) return;
    void this.router.navigate(['/learning/learn', course.id], {
      queryParams: { lesson: enrollment.nextLessonId },
    });
  }

  openLesson(lessonId: string): void {
    const course = this.course();
    if (!course) return;
    void this.router.navigate(['/learning/learn', course.id], { queryParams: { lesson: lessonId } });
  }

  openPreview(): void {
    const course = this.course();
    const firstVideo = course?.chapters.flatMap((chapter) => chapter.lessons).find((lesson) => lesson.type === 'video');
    if (course && firstVideo) this.openLesson(firstVideo.id);
  }

  setDocumentFilter(filter: DocumentFilter): void {
    this.documentFilter.set(filter);
    this.documentPage.set(1);
  }

  setDocumentSearch(value: string): void {
    this.documentSearch.set(value);
    this.documentPage.set(1);
  }

  goToDocumentPage(page: number): void {
    this.documentPage.set(Math.min(Math.max(1, page), this.documentPageCount()));
  }

  downloadDocument(document: CourseDocument): void {
    this.perform('download:' + document.id, this.learningService.downloadDocument(document.id), () => undefined);
  }

  submitQuestion(): void {
    const course = this.course(); const body = this.questionDraft.trim();
    if (!course || !body) return;
    this.perform('qa-write', this.learningService.createCommunity(course.id, 'qa', body, this.selectedLessonId), posts => {
      this.setQuestions(posts); this.questionDraft = '';
    });
  }

  toggleChapter(chapterId: string): void {
    const current = this.expandedChapterIds();
    this.expandedChapterIds.set(
      current.includes(chapterId) ? current.filter((id) => id !== chapterId) : [...current, chapterId]
    );
  }

  isChapterExpanded(chapterId: string): boolean {
    return this.expandedChapterIds().includes(chapterId);
  }

  get sortedDiscussions(): CommunityPost[] {
    const posts = [...this.discussions()];
    if (this.discussionSort === 'oldest') return posts.reverse();
    if (this.discussionSort === 'popular') return posts.sort((a, b) => b.likes - a.likes);
    return posts;
  }

  chapterDuration(chapter: LearningChapter): string {
    const seconds = chapter.lessons.reduce((total, lesson) => total + this.durationInSeconds(lesson), 0);
    return this.durationLabel(seconds);
  }

  courseLessonCount(course: LearningCourse): number {
    return course.chapters.reduce((total, chapter) => total + chapter.lessons.length, 0);
  }

  courseDuration(course: LearningCourse): string {
    const seconds = course.chapters.reduce(
      (total, chapter) =>
        total + chapter.lessons.reduce((chapterTotal, lesson) => chapterTotal + this.durationInSeconds(lesson), 0),
      0
    );
    return this.durationLabel(seconds);
  }

  avatarFor(author: string, avatarUrl?: string): string {
    if (avatarUrl && avatarUrl.trim()) return avatarUrl;
    const cleanName = encodeURIComponent(author || 'ThinkUp User');
    return `https://ui-avatars.com/api/?name=${cleanName}&background=155DFC&color=fff&size=128&bold=true`;
  }

  quizQuestionCount(lesson: LearningLesson): number {
    return lesson.questionCount ?? lesson.quiz?.questions.length ?? 0;
  }

  private durationInSeconds(lesson: LearningLesson): number {
    const match = lesson.duration.match(/(\d+):(\d+)/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
    const minutes = lesson.duration.match(/(\d+)/);
    return minutes ? Number(minutes[1]) * 60 : 0;
  }

  private durationLabel(seconds: number): string {
    if (!seconds) return '';
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.round((seconds % 3600) / 60);
    if (minutes === 60) {
      hours += 1;
      minutes = 0;
    }
    return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`;
  }

  startQuestionReply(question: DashboardQuestion): void {
    this.replyingQuestionId = this.replyingQuestionId === question.id ? null : question.id;
    this.questionReplyDraft = '';
  }

  submitQuestionReply(question: DashboardQuestion): void {
    const course = this.course(); const body = this.questionReplyDraft.trim();
    if (!course || !body) return;
    this.perform('qa-write', this.learningService.createCommunity(course.id, 'qa', body, undefined, question.id), posts => {
      this.setQuestions(posts); this.questionReplyDraft = ''; this.replyingQuestionId = null;
    });
  }

  dashOffset(percent: number): number {
    const circumference = 2 * Math.PI * 32;
    return circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  }

  submitComment(): void {
    const course = this.course(); const body = this.commentDraft.trim();
    if (!course || !body) return;
    this.perform('discussion-write', this.learningService.createCommunity(course.id, 'discussion', body), posts => {
      this.discussions.set(posts); this.commentDraft = '';
    });
  }

  toggleLike(post: CommunityPost): void {
    this.perform('like:' + post.id, this.learningService.likeDiscussion(post.id), data => {
      this.discussions.update(posts => posts.map(item => item.id === post.id ? { ...item, liked: data.is_liked, likes: data.likes_count } : item));
    });
  }

  startReply(post: CommunityPost): void {
    this.replyingToId = this.replyingToId === post.id ? null : post.id;
    this.replyDraft = '';
  }

  submitReply(post: CommunityPost): void {
    const course = this.course(); const body = this.replyDraft.trim();
    if (!course || !body) return;
    this.perform('discussion-write', this.learningService.createCommunity(course.id, 'discussion', body, undefined, post.id), posts => {
      this.discussions.set(posts); this.replyDraft = ''; this.replyingToId = null;
    });
  }

  openReviews(): void {
    const course = this.course();
    if (!course) return;
    this.learningService.getReviews(course.id).subscribe((summary) => {
      this.reviewSummary.set(summary);
      this.reviewOpen.set(true);
    });
  }

  goToReviewForm(): void {
    const course = this.course();
    if (!course) return;
    this.learningService.getReviews(course.id).subscribe((summary) => {
      this.reviewSummary.set(summary);
      if (summary.hasUserReviewed || summary.reviews.some(r => r.mine)) {
        // Đã có đánh giá => mở Modal xem & chỉnh sửa, không chuyển hướng
        this.reviewOpen.set(true);
      } else {
        // Chưa đánh giá => chuyển sang trang form đánh giá lần đầu
        void this.router.navigate(['/main/my-courses', course.id, 'review']);
      }
    });
  }

  submitReport(payload: { reasonId: string; detail: string }): void {
    const post = this.reportPost(); if (!post) return;
    this.perform('report:' + post.id, this.learningService.reportDiscussion(post.id, payload.reasonId + ': ' + payload.detail), () => this.reportPost.set(null));
  }

  private perform<T>(key: string, request: Observable<T>, done: (value: T) => void): void {
    // Cho phép tải dữ liệu tab trong dashboard
    // if (!key.startsWith('overview:') && this.course()?.isPurchased !== true) return;
    if (this.pending.has(key)) return;
    const courseId = this.course()?.id;
    this.pending.add(key);
    this.subscriptions.add(request.pipe(finalize(() => this.pending.delete(key))).subscribe({
      next: value => { if (this.course()?.id === courseId) done(value); },
      error: () => this.toast.showToast({ type: 'warning', message: 'Không thực hiện được thao tác học tập. Vui lòng thử lại.' }),
    }));
  }

  private loadAuxiliary(course: LearningCourse): void {
    this.perform('overview:' + course.id, this.learningService.getOverview(course.id), data => {
      this.outcomes = data.what_you_will_learn; this.requirements = data.requirements;
      this.course.update(current => current ? { ...current, description: data.introduction.description } : current);
    });
    // if (course.isPurchased !== true) return;
    this.perform('documents:' + course.id, this.learningService.loadDocumentRows(course.id), rows => this.documents.set(rows));
    this.perform('discussion:' + course.id, this.learningService.getCommunity(course.id, 'discussion'), posts => this.discussions.set(posts));
    if (course.playerConfig?.allowQa) this.perform('qa:' + course.id, this.learningService.getCommunity(course.id, 'qa'), posts => this.setQuestions(posts));
    this.syncCertificate(course);
  }

  readonly isClaimingCertificate = signal<boolean>(false);
  readonly certificateError = signal<string | null>(null);

  syncCertificate(course?: LearningCourse | null): void {
    const targetCourse = course || this.course();
    if (!targetCourse) return;
    if (this.isClaimingCertificate()) return;
    this.certificateError.set(null);
    const norm = (s?: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

    this.certificateService.getMyCertificates().subscribe({
      next: certs => {
        const found = certs.find(c =>
          c.courseId === targetCourse.id ||
          (c.courseTitle && norm(c.courseTitle) === norm(targetCourse.title))
        );
        if (found) {
          this.certificate.set(found);
        } else if (targetCourse.progress >= 100 || (this.enrollment()?.totalLessons && this.enrollment()?.completedLessons === this.enrollment()?.totalLessons)) {
          this.isClaimingCertificate.set(true);
          this.certificateService.claimCertificate(targetCourse.id).pipe(
            finalize(() => this.isClaimingCertificate.set(false))
          ).subscribe({
            next: res => { if (res.certificate) this.certificate.set(res.certificate); },
            error: error => this.certificateError.set(error?.error?.message || error?.message || 'Không thể cấp chứng chỉ. Vui lòng thử lại.'),
          });
        }
      },
      error: error => this.certificateError.set(error?.error?.message || error?.message || 'Không thể kiểm tra chứng chỉ. Vui lòng thử lại.'),
    });
  }

  private setQuestions(posts: CommunityPost[]): void {
    this.questions.set(posts.map(post => ({ id: post.id, author: post.author, initials: post.initials,
      role: post.role || '', date: post.createdAt, body: post.body,
      avatarUrl: post.avatarUrl,
      relatedLessonTitle: this.course()?.chapters.flatMap(chapter => chapter.lessons).find(lesson => lesson.id === post.lessonId)?.title || '',
      replies: post.replies.map(reply => ({ author: reply.author, initials: reply.initials,
        role: reply.role || '', date: reply.createdAt, body: reply.body, avatarUrl: reply.avatarUrl })) })));
  }

  lessonLabel(type: string): string {
    if (type === 'video') return 'Video';
    if (type === 'reading') return 'Bài đọc';
    if (type === 'quiz') return 'Trắc nghiệm';
    return 'Phòng lab';
  }

  isTabLocked(tab: DashboardTab): boolean {
    // Khóa học nằm trong trang /main/my-courses là khóa học đã được sở hữu
    if (this.course()?.isPurchased === true) return false;
    return false;
  }
}
