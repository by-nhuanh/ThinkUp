import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { LucideChevronLeft, LucideChevronRight, LucideCircleCheck } from '@lucide/angular';
import {
  MOCK_DISCUSSION_POSTS,
  MOCK_QA_POSTS,
  MOCK_REPORT_REASONS,
} from '../../../core/data/mock/learning-player.mock';
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

  readonly course = signal<LearningCourse | null>(null);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly activeLessonId = signal('');
  readonly sidebarOpen = signal(true);
  readonly openChapterIds = signal<string[]>([]);
  readonly activeTab = signal<UtilityTab>('overview');
  readonly reviewOpen = signal(false);
  readonly reviewSummary = signal<CourseReviewSummary | null>(null);
  readonly reportPost = signal<CommunityPost | null>(null);

  readonly resources = this.learningService.getResources();
  readonly reportReasons = this.learningService.getReportReasons();
  readonly qaPosts = MOCK_QA_POSTS;
  readonly discussionPosts = MOCK_DISCUSSION_POSTS;

  private readonly subscriptions = new Subscription();

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
    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => this.loadCourse(params.get('courseId') ?? 'python-co-ban'))
    );
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const lessonId = params.get('lesson') ?? '';
        if (lessonId) this.activeLessonId.set(lessonId);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadCourse(courseId: string): void {
    this.status.set('loading');
    this.subscriptions.add(
      this.learningService.getCourse(courseId).subscribe({
        next: (course) => {
          this.course.set(course);
          this.openChapterIds.set(course.chapters.map((chapter) => chapter.id));
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      })
    );
  }

  selectLesson(lesson: LearningLesson): void {
    this.activeLessonId.set(lesson.id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { lesson: lesson.id },
      queryParamsHandling: 'merge',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleChapter(chapterId: string): void {
    const current = this.openChapterIds();
    this.openChapterIds.set(
      current.includes(chapterId) ? current.filter((id) => id !== chapterId) : [...current, chapterId]
    );
  }

  markCompleted(): void {
    const course = this.course();
    const lesson = this.activeLesson();
    if (!course || !lesson) return;

    this.learningService.setLessonCompleted(lesson.id, !lesson.completed);

    const updatedChapters = course.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((item) =>
        item.id === lesson.id ? { ...item, completed: !item.completed, status: !item.completed ? ('done' as const) : ('not-started' as const) } : item
      ),
    }));
    const lessons = updatedChapters.flatMap((chapter) => chapter.lessons);
    const done = lessons.filter((item) => item.completed).length;
    this.course.set({
      ...course,
      chapters: updatedChapters,
      progress: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
    });
  }

  completeLesson(): void {
    const lesson = this.activeLesson();
    if (!lesson || lesson.completed) return;
    this.markCompleted();
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
    this.learningService.submitReport([payload.reasonId], payload.detail).subscribe(() => {
      this.reportPost.set(null);
    });
  }
}
