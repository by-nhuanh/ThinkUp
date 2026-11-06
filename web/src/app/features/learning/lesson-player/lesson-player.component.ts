import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { LucideChevronLeft, LucideChevronRight, LucideCircleCheck } from '@lucide/angular';
import { ToastService } from '../../../core/services/toast.service';
import { LabWorkspaceComponent } from '../components/lab-workspace/lab-workspace.component';
import { QuizWorkspaceComponent } from '../components/quiz-workspace/quiz-workspace.component';
import { ReadingViewComponent } from '../components/reading-view/reading-view.component';
import { ReportModalComponent } from '../components/report-modal/report-modal.component';
import { ReviewModalComponent } from '../components/review-modal/review-modal.component';
import { StudySidebarComponent } from '../components/study-sidebar/study-sidebar.component';
import { UtilityPanelComponent } from '../components/utility-panel/utility-panel.component';
import { VideoViewComponent } from '../components/video-view/video-view.component';
import {
  CommunityPost,
  CourseReviewSummary,
  LearningChapter,
  LearningCourse,
  LearningLesson,
  UtilityTab,
} from '../models/learning.model';
import { LearningService } from '../services/learning.service';
import { LearningActivityService } from '../../../core/services/learning-activity.service';
import { CertificateService } from '../../../core/services/certificate.service';

@Component({
  selector: 'app-lesson-player',
  standalone: true,
  imports: [
    RouterLink,
    LabWorkspaceComponent,
    QuizWorkspaceComponent,
    ReadingViewComponent,
    ReportModalComponent,
    ReviewModalComponent,
    StudySidebarComponent,
    UtilityPanelComponent,
    VideoViewComponent,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCircleCheck,
  ],
  templateUrl: './lesson-player.component.html',
})
export class LessonPlayerComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly learningService = inject(LearningService);
  private readonly learningActivity = inject(LearningActivityService);
  private readonly certificateService = inject(CertificateService);
  private readonly toast = inject(ToastService);
  private readonly claimedCourses = new Set<string>();
  private claimingCertificate = false;
  private loadVersion = 0;
  private savingProgress = false;

  readonly course = signal<LearningCourse | null>(null);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly loadError = signal('');
  readonly activeLessonId = signal('');
  readonly sidebarOpen = signal(true);
  readonly previewMode = signal(false);
  readonly openChapterIds = signal<string[]>([]);
  readonly activeTab = signal<UtilityTab>('overview');
  readonly reviewOpen = signal(false);
  readonly reviewSummary = signal<CourseReviewSummary | null>(null);
  readonly reportPost = signal<CommunityPost | null>(null);

  readonly resources = this.learningService.getResources();
  readonly reportReasons = this.learningService.getReportReasons();
  readonly qaPosts: CommunityPost[] = [];
  readonly discussionPosts: CommunityPost[] = [];

  private readonly subscriptions = new Subscription();
  private activityTarget: string | null = null;

  readonly activeLesson = computed<LearningLesson | null>(() => {
    const course = this.course();
    if (!course) return null;
    const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
    const selected = lessons.find((lesson) => lesson.id === this.activeLessonId());
    return selected ?? lessons.find((lesson) => !lesson.completed) ?? lessons[0] ?? null;
  });

  readonly activeChapter = computed<LearningChapter | null>(() => {
    const course = this.course();
    const lesson = this.activeLesson();
    if (!course || !lesson) return null;
    return course.chapters.find((chapter) => chapter.lessons.some((item) => item.id === lesson.id)) ?? null;
  });

  readonly previousLesson = computed<LearningLesson | null>(() => {
    const course = this.course();
    const lesson = this.activeLesson();
    if (!course || !lesson) return null;
    const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
    const index = lessons.findIndex((item) => item.id === lesson.id);
    return index > 0 ? lessons[index - 1] : null;
  });

  readonly nextLesson = computed<LearningLesson | null>(() => {
    const course = this.course();
    const lesson = this.activeLesson();
    if (!course || !lesson) return null;
    const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
    const index = lessons.findIndex((item) => item.id === lesson.id);
    return index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  });

  constructor() {
    this.previewMode.set(this.route.snapshot.queryParamMap.get('preview') === 'true' || this.route.snapshot.queryParamMap.get('trial') === 'true');
    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => this.loadCourse(params.get('courseId') ?? ''))
    );
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const lessonId = params.get('lesson') ?? '';
        if (lessonId) this.activeLessonId.set(lessonId);
        const preview = params.get('preview') === 'true' || params.get('trial') === 'true';
        if (preview !== this.previewMode()) {
          this.previewMode.set(preview);
          this.loadCourse(this.route.snapshot.paramMap.get('courseId') || '');
        }

        const course = this.course();
        if (course) this.setInitialOpenChapters(course);
        this.syncLearningActivity();
      })
    );
  }

  ngOnDestroy(): void {
    this.activityTarget = null;
    this.subscriptions.unsubscribe();
    void this.learningActivity.finish();
  }

  loadCourse(courseId: string): void {
    const version = ++this.loadVersion;
    this.activityTarget = null;
    void this.learningActivity.finish();
    this.status.set('loading');
    this.course.set(null);
    this.loadError.set('');
    this.subscriptions.add(
      this.learningService.getCourse(courseId, this.previewMode()).subscribe({
        next: (course) => {
          if (version !== this.loadVersion) return;
          this.course.set(course);
          if (!this.activeLessonId()) this.activeLessonId.set(this.activeLesson()?.id || '');
          this.setInitialOpenChapters(course);
          this.status.set('ready');
          this.syncLearningActivity();
          const lesson = this.activeLesson();
          if (lesson) this.loadLessonVideo(lesson);
        },
        error: (error) => {
          if (version !== this.loadVersion) return;
          const message = error?.status === 404
            ? 'Không tìm thấy mã khóa học này. Hãy mở khóa học từ danh sách Khóa học của tôi.'
            : error?.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
            : error?.status === 403 ? 'Tài khoản chưa có quyền truy cập khóa học này.'
            : 'Không tải được nội dung học tập. Vui lòng thử lại sau.';
          this.loadError.set(message);
          this.status.set('error');
        },
      })
    );
  }

  private syncLearningActivity(): void {
    const course = this.course();
    const lesson = this.activeLesson();
    if (!course || !lesson || this.status() !== 'ready' || this.previewMode() || lesson.isLocked || course.isPurchased !== true) return;
    const target = `${course.id}:${lesson.id}`;
    if (this.activityTarget === target) return;
    this.activityTarget = target;
    void this.learningActivity.startLesson(course.id, lesson.id);
  }

  selectLesson(lesson: LearningLesson): void {
    this.activeLessonId.set(lesson.id);
    this.loadLessonVideo(lesson);
    const chapter = this.course()?.chapters.find((item) =>
      item.lessons.some((chapterLesson) => chapterLesson.id === lesson.id)
    );
    if (chapter) {
      this.openChapterIds.set(
        this.previewMode()
          ? [chapter.id]
          : Array.from(new Set([...this.openChapterIds(), chapter.id]))
      );
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { lesson: lesson.id },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleChapter(chapterId: string): void {
    const current = this.openChapterIds();
    if (this.previewMode()) {
      this.openChapterIds.set(current.includes(chapterId) ? [] : [chapterId]);
      return;
    }

    this.openChapterIds.set(
      current.includes(chapterId) ? current.filter((id) => id !== chapterId) : [...current, chapterId]
    );
  }

  private setInitialOpenChapters(course: LearningCourse): void {
    if (!this.previewMode()) {
      this.openChapterIds.set(course.chapters.map((chapter) => chapter.id));
      return;
    }

    const activeChapter = course.chapters.find((chapter) =>
      chapter.lessons.some((lesson) => lesson.id === this.activeLessonId())
    );
    this.openChapterIds.set([activeChapter?.id ?? course.chapters[0]?.id].filter(Boolean) as string[]);
  }

  private loadLessonVideo(lesson: LearningLesson): void {
    const course = this.course();
    if (!course || lesson.type !== 'video' || lesson.playback || lesson.isLocked) return;

    this.subscriptions.add(this.learningService.loadLessonVideo(course.id, lesson.id).subscribe({ next: video => {
      if (!video) return;
      this.course.update(current => {
        if (!current || current.id !== course.id) return current;
        return {
          ...current,
          chapters: current.chapters.map(chapter => ({
            ...chapter,
            lessons: chapter.lessons.map(item =>
              item.id === video.lessonId ? { ...item, videoUrl: video.videoUrl, playback: video.playback } : item
            ),
          })),
        };
      });
    }, error: () => this.toast.showToast({ type: 'warning', message: 'Không tải được video. Vui lòng kiểm tra quyền truy cập khóa học.' }) }));
  }

  onVideoEnded(): void {
    if (!this.activeLesson()?.playback?.effective.autoNext) return;
    const next = this.nextLesson();
    if (next && !next.isLocked) this.selectLesson(next);
  }

  markCompleted(): void {
    const course = this.course();
    const lesson = this.activeLesson();
    if (!course || !lesson || this.savingProgress) return;
    if (course.playerConfig?.allowMarkCompleted === false) return;
    if (['reading', 'video'].includes(lesson.type)) this.saveCompletion(!lesson.completed);
  }

  completeLesson(): void {
    const lesson = this.activeLesson();
    const course = this.course();
    if (lesson && course && ['quiz', 'lab'].includes(lesson.type)) {
      // Submission already updates progress on the server; do not invoke manual completion.
      const version = this.loadVersion;
      this.subscriptions.add(this.learningService.refreshLessonProgress(course.id, lesson.id).subscribe({
        next: updated => { if (version === this.loadVersion && this.course()?.id === course.id) this.mergeProgress(updated); },
        error: () => this.toast.showToast({type:'warning',message:'Không tải lại được tiến độ đã lưu.'}),
      }));
      return;
    }
    if (!lesson || lesson.completed) return;
    this.saveCompletion(true);
  }

  private saveCompletion(completed: boolean): void {
    const lesson = this.activeLesson();
    const course = this.course();
    if (!lesson || !['reading', 'video'].includes(lesson.type)) return;
    if (!course || this.savingProgress || course.playerConfig?.allowMarkCompleted === false) return;
    this.savingProgress = true;
    const version = this.loadVersion;
    this.subscriptions.add(this.learningService.completeLessonManual(lesson.id, completed).pipe(
      finalize(() => this.savingProgress = false)
    ).subscribe({
      next: saved => {
        if (saved.lesson_id !== lesson.id) return;
        if (version !== this.loadVersion || this.course()?.id !== course.id) return;
        this.course.update(current => {
          if (!current) return current;
          const chapters = current.chapters.map(chapter => ({ ...chapter, lessons: chapter.lessons.map(item =>
            item.id === lesson.id ? { ...item, completed: saved.completed, status: saved.completed ? 'done' as const : 'in-progress' as const } : item) }));
          const lessons = chapters.flatMap(chapter => chapter.lessons);
          const completed = lessons.filter(item => item.completed).length;
          const percent = Math.round(completed / Math.max(1, lessons.length) * 100);
          if (percent === 100) this.checkAndAutoClaimCertificate(course.id, percent);
          return { ...current, chapters, progress: percent, enrollment: current.enrollment ? {
            ...current.enrollment, completedLessons: completed, completed, remaining: lessons.length - completed, percent,
          } : undefined };
        });
      },
      error: error => this.toast.showToast({ type: 'warning', message: error?.status === 0
        ? 'Không kết nối được máy chủ để lưu tiến độ. Vui lòng kiểm tra máy chủ đang chạy.'
        : error?.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : error?.error?.message || error?.message || 'Không lưu được tiến độ bài học.' }),
    }));
  }

  private checkAndAutoClaimCertificate(courseId: string, currentPercent: number): void {
    if (currentPercent < 100 || this.claimedCourses.has(courseId) || this.claimingCertificate) return;
    this.claimingCertificate = true;
    this.subscriptions.add(
      this.certificateService.claimCertificate(courseId).pipe(
        finalize(() => { this.claimingCertificate = false; })
      ).subscribe({
        next: (res) => {
          this.claimedCourses.add(courseId);
          this.toast.showToast({
            type: 'success',
            message: `Chúc mừng bạn đã hoàn thành khóa học! Chứng chỉ ThinkUp đã được cấp thành công (Mã: ${res.certificate.code}).`,
          });
        },
        error: (err) => {
          if (err?.error?.code === 'CERTIFICATE_REVOKED') {
            this.toast.showToast({ type: 'warning', message: 'Chứng chỉ khóa học này đã bị thu hồi.' });
          }
        }
      })
    );
  }

  private mergeProgress(updated: LearningCourse): void {
    this.course.update(current => {
      if (!current || current.id !== updated.id) return current;
      const progress = new Map(updated.chapters.flatMap(chapter => chapter.lessons).map(lesson => [lesson.id, lesson]));
      if (updated.progress === 100) this.checkAndAutoClaimCertificate(updated.id, updated.progress);
      return { ...current, progress: updated.progress, enrollment: updated.enrollment,
        chapters: current.chapters.map(chapter => ({ ...chapter, lessons: chapter.lessons.map(lesson => {
          const saved = progress.get(lesson.id);
          return saved ? { ...lesson, completed: saved.completed, status: saved.status } : lesson;
        }) })),
      };
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
    if (course) void this.router.navigate(['/main/my-courses', course.id, 'review']);
  }

  openReport(post: CommunityPost): void {
    this.reportPost.set(post);
  }

  submitReport(payload: { reasonId: string; detail: string }): void {
    const post = this.reportPost();
    if (!post) return;
    this.subscriptions.add(this.learningService.reportDiscussion(post.id, `${payload.reasonId}: ${payload.detail}`).subscribe({
      next: () => this.reportPost.set(null),
      error: () => this.toast.showToast({ type: 'warning', message: 'Không gửi được báo cáo. Vui lòng thử lại.' }),
    }));
  }
}
