import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
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
import { Subscription } from 'rxjs';
import {
  MOCK_COURSE_DOCUMENTS,
  MOCK_COURSE_QUESTIONS,
  MOCK_DISCUSSION_POSTS,
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

  readonly course = signal<LearningCourse | null>(null);
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

  readonly documents = MOCK_COURSE_DOCUMENTS;
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
    return this.documents.filter((document) => {
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

  readonly questions = signal<DashboardQuestion[]>([...MOCK_COURSE_QUESTIONS]);
  readonly discussions = signal<CommunityPost[]>([...MOCK_DISCUSSION_POSTS]);
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

  readonly outcomes = [
    'Hiểu và cài đặt môi trường Python',
    'Nắm vững cú pháp Python cơ bản',
    'Làm việc với biến, kiểu dữ liệu và toán tử',
    'Sử dụng cấu trúc điều khiển (if, for, while)',
    'Xây dựng và sử dụng hàm trong Python',
    'Làm việc với chuỗi, danh sách, tuple, dictionary',
    'Xử lý lỗi và ngoại lệ',
    'Đọc và ghi file',
    'Thực hành qua các bài tập và dự án thực tế',
  ];

  readonly requirements = [
    'Không yêu cầu kinh nghiệm lập trình trước đó.',
    'Chỉ cần máy tính có kết nối Internet.',
  ];

  constructor() {
    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => this.load(params.get('courseId') ?? 'python-co-ban'))
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

  load(courseId: string): void {
    this.status.set('loading');
    this.subscriptions.add(
      this.learningService.getCourse(courseId).subscribe({
        next: (course) => {
          this.course.set(course);
          this.expandedChapterIds.set(course.chapters.slice(0, 1).map((chapter) => chapter.id));
          this.status.set('ready');
          this.selectedLessonId = course.chapters[0]?.lessons[0]?.id ?? '';
        },
        error: () => this.status.set('error'),
      })
    );
  }

  selectTab(tab: DashboardTab): void {
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
    const blob = new Blob([`${document.name}\n${document.subtitle}\nTài liệu mẫu khóa ${this.course()?.title ?? ''}.`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${document.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  submitQuestion(): void {
    const body = this.questionDraft.trim();
    if (!body) return;
    const lessonTitle =
      this.course()
        ?.chapters.flatMap((chapter) => chapter.lessons)
        .find((lesson) => lesson.id === this.selectedLessonId)?.title ?? '';
    this.questions.set([
      {
        id: `dq-${Date.now()}`,
        author: 'Bạn',
        initials: 'B',
        role: 'Học viên',
        date: 'Vừa xong',
        body,
        relatedLessonTitle: lessonTitle,
        replies: [],
      },
      ...this.questions(),
    ]);
    this.questionDraft = '';
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

  avatarFor(author: string): string {
    const index = author.includes('Trần') ? 2 : author.includes('Lê') ? 3 : 1;
    return `/assets/learning/discussion-avatar-${index}.webp`;
  }

  quizQuestionCount(lesson: LearningLesson): number {
    return lesson.quiz?.questions.length ?? 0;
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
    const body = this.questionReplyDraft.trim();
    if (!body) return;
    this.questions.set(
      this.questions().map((item) =>
        item.id === question.id
          ? {
              ...item,
              replies: [
                ...item.replies,
                {
                  author: 'Bạn',
                  initials: 'B',
                  role: 'Học viên',
                  date: 'Vừa xong',
                  body,
                  relatedLessonTitle: question.relatedLessonTitle,
                },
              ],
            }
          : item
      )
    );
    this.questionReplyDraft = '';
    this.replyingQuestionId = null;
  }

  dashOffset(percent: number): number {
    const circumference = 2 * Math.PI * 32;
    return circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  }

  submitComment(): void {
    const body = this.commentDraft.trim();
    if (!body) return;
    this.discussions.set([
      {
        id: `d-${Date.now()}`,
        author: 'Bạn',
        initials: 'B',
        role: 'Học viên',
        body,
        createdAt: 'Vừa xong',
        likes: 0,
        replies: [],
      },
      ...this.discussions(),
    ]);
    this.commentDraft = '';
  }

  toggleLike(post: CommunityPost): void {
    this.discussions.set(
      this.discussions().map((item) =>
        item.id === post.id
          ? { ...item, liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) }
          : item
      )
    );
  }

  startReply(post: CommunityPost): void {
    this.replyingToId = this.replyingToId === post.id ? null : post.id;
    this.replyDraft = '';
  }

  submitReply(post: CommunityPost): void {
    const body = this.replyDraft.trim();
    if (!body) return;
    this.discussions.set(
      this.discussions().map((item) =>
        item.id === post.id
          ? {
              ...item,
              replies: [
                ...item.replies,
                {
                  id: `dr-${Date.now()}`,
                  author: 'Bạn',
                  initials: 'B',
                  role: 'Học viên',
                  body,
                  createdAt: 'Vừa xong',
                  likes: 0,
                },
              ],
            }
          : item
      )
    );
    this.replyDraft = '';
    this.replyingToId = null;
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
    if (course) void this.router.navigate(['/main/my-courses', course.id, 'review']);
  }

  submitReport(payload: { reasonId: string; detail: string }): void {
    this.learningService.submitReport([payload.reasonId], payload.detail).subscribe(() => {
      this.reportPost.set(null);
    });
  }

  lessonLabel(type: string): string {
    if (type === 'video') return 'Video';
    if (type === 'reading') return 'Bài đọc';
    if (type === 'quiz') return 'Trắc nghiệm';
    return 'Phòng lab';
  }
}
