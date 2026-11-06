import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import {
  LucideArrowLeft,
  LucideCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideClock3,
  LucideCodeXml,
  LucideFlag,
  LucideListChecks,
  LucideX
} from '@lucide/angular';
import { ToastService } from '../../../core/services/toast.service';
import { LearningActivityService } from '../../../core/services/learning-activity.service';
import { AuthService } from '../../../core/services/auth.service';
import { RoadmapTest, RoadmapTestQuestion } from '../models/roadmap.model';
import { RoadmapTestService } from '../services/roadmap-test.service';
import { RoadmapService } from '../services/roadmap.service';
import { RoadmapSurveyStepsComponent } from '../components/roadmap-survey-steps/roadmap-survey-steps.component';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

@Component({
  selector: 'app-roadmap-test',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowLeft,
    LucideCheck,
    LucideChevronLeft,
    LucideChevronRight,
    LucideClock3,
    LucideCodeXml,
    LucideFlag,
    LucideListChecks,
    LucideX,
    RoadmapSurveyStepsComponent
  ],
  templateUrl: './roadmap-test.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './roadmap-test.component.css']
})
export class RoadmapTestComponent implements OnInit, OnDestroy {
  private readonly roadmapService = inject(RoadmapService);
  private readonly testService = inject(RoadmapTestService);
  private readonly toastService = inject(ToastService);
  private readonly learningActivity = inject(LearningActivityService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  readonly roadmapId = this.params.get('roadmapId') ?? '';
  readonly stageId = this.params.get('stageId') ?? '';

  readonly roadmap = computed(() => this.roadmapService.getRoadmapById(this.roadmapId));
  readonly test = signal<RoadmapTest | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly currentIndex = signal(0);
  readonly answers = signal<Record<string, string>>({});
  readonly markedIds = signal<ReadonlySet<string>>(new Set());
  readonly remainingSeconds = signal(0);
  readonly panelOpen = signal(true);
  readonly showIncomplete = signal(false);

  private timerId: ReturnType<typeof setInterval> | null = null;
  private expiresAt = 0;
  private draftOwnerId: string | undefined;
  private draftFinished = false;
  private storageWarningShown = false;
  private submissionAttempted = false;

  readonly question = computed<RoadmapTestQuestion | null>(() => {
    const test = this.test();
    if (!test) return null;
    return test.questions[this.currentIndex()] ?? null;
  });
  readonly totalQuestions = computed(() => this.test()?.questions.length ?? 0);
  readonly answeredCount = computed(() => {
    const test = this.test();
    if (!test) return 0;
    return test.questions.filter((question) => Boolean(this.answers()[question.id])).length;
  });
  readonly markedCount = computed(() => this.markedIds().size);
  readonly codeLines = computed(() => (this.question()?.code ?? '').split('\n'));
  readonly timeLabel = computed(() => {
    const total = Math.max(0, this.remainingSeconds());
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  });
  readonly canSubmit = computed(() => this.totalQuestions() > 0 && this.answeredCount() === this.totalQuestions());

  ngOnInit(): void {
    this.draftOwnerId = this.auth.currentUser()?.id;
    this.roadmapService
      .loadRoadmap(this.roadmapId)
      .pipe(
        switchMap(() => this.testService.loadTest(this.roadmapId, this.stageId)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: test => {
          this.loading.set(false);
          if (this.draftOwnerId !== this.auth.currentUser()?.id) {
            this.error.set('Phiên đăng nhập đã thay đổi. Vui lòng mở lại bài test.');
            return;
          }
          this.test.set(test);
          const draft = this.testService.loadDraft(test);
          if (draft) {
            this.answers.set(draft.answers);
            this.currentIndex.set(draft.currentIndex);
            this.markedIds.set(new Set(draft.markedIds));
            this.submissionAttempted = draft.submissionAttempted;
          }
          this.expiresAt = draft?.expiresAt ?? Date.now() + test.durationMinutes * 60_000;
          this.saveDraft();
          this.startTimer();
          void this.learningActivity.startRoadmapQuiz(this.stageId);
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.loading.set(false);
          this.error.set(
            error?.error?.message ?? error?.message ?? 'Không tải được bài test. Vui lòng thử lại sau.'
          );
        }
      });
  }

  private startTimer(): void {
    this.stopTimer();
    const updateRemaining = () => this.remainingSeconds.set(Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1000)));
    updateRemaining();
    if (this.remainingSeconds() === 0) {
      this.handleExpiry();
      return;
    }
    this.timerId = setInterval(() => {
      updateRemaining();
      if (this.remainingSeconds() === 0) {
        this.stopTimer();
        this.handleExpiry();
      }
    }, 1000);
  }

  private handleExpiry(): void {
    // A refresh must not automatically repeat a POST whose outcome is unknown.
    if (this.submissionAttempted) {
      this.toastService.showToast({ type: 'warning', message: 'Thời gian đã hết. Bài làm tạm vẫn được giữ; hãy kiểm tra kết quả trước khi nộp lại.' });
      return;
    }
    this.finish(true);
  }

  private saveDraft(): void {
    const test = this.test();
    if (!test || this.draftFinished || this.submitting() || this.draftOwnerId !== this.auth.currentUser()?.id) return;
    const saved = this.testService.saveDraft(test, {
      answers: this.answers(), currentIndex: this.currentIndex(),
      markedIds: [...this.markedIds()], expiresAt: this.expiresAt,
      submissionAttempted: this.submissionAttempted
    });
    if (!saved && !this.storageWarningShown) {
      this.storageWarningShown = true;
      this.toastService.showToast({ type: 'warning', message: 'Trình duyệt không lưu được bài làm tạm. Vui lòng giữ trang mở đến khi nộp bài.' });
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
    void this.learningActivity.finish();
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  optionLetter(index: number): string {
    return OPTION_LETTERS[index] ?? `${index + 1}`;
  }

  isSelected(question: RoadmapTestQuestion, optionId: string): boolean {
    return this.answers()[question.id] === optionId;
  }

  selectOption(question: RoadmapTestQuestion, optionId: string): void {
    if (this.submitting() || this.draftFinished) return;
    this.answers.update((answers) => ({ ...answers, [question.id]: optionId }));
    this.showIncomplete.set(false);
    this.saveDraft();
  }

  isMarked(question: RoadmapTestQuestion): boolean {
    return this.markedIds().has(question.id);
  }

  toggleMark(): void {
    if (this.submitting() || this.draftFinished) return;
    const question = this.question();
    if (!question) return;

    const next = new Set(this.markedIds());
    if (next.has(question.id)) {
      next.delete(question.id);
      this.toastService.showToast({ type: 'info', message: 'Đã bỏ đánh dấu câu hỏi.' });
    } else {
      next.add(question.id);
      this.toastService.showToast({ type: 'info', message: 'Đã đánh dấu câu hỏi để xem lại.' });
    }
    this.markedIds.set(next);
    this.saveDraft();
  }

  goTo(index: number): void {
    if (this.submitting() || this.draftFinished) return;
    const total = this.totalQuestions();
    if (index < 0 || index >= total) return;
    this.currentIndex.set(index);
    this.saveDraft();
  }

  previous(): void {
    this.goTo(this.currentIndex() - 1);
  }

  next(): void {
    this.goTo(this.currentIndex() + 1);
  }

  isAnswered(question: RoadmapTestQuestion): boolean {
    return Boolean(this.answers()[question.id]);
  }

  submit(): void {
    if (this.submitting()) return;
    if (!this.canSubmit()) {
      this.showIncomplete.set(true);
      return;
    }
    this.finish(false);
  }

  private finish(auto: boolean): void {
    const test = this.test();
    if (!test || this.submitting() || this.draftFinished) return;
    if (this.draftOwnerId !== this.auth.currentUser()?.id) {
      this.toastService.showToast({ type: 'warning', message: 'Phiên đăng nhập đã thay đổi. Vui lòng mở lại bài test.' });
      return;
    }

    if (!this.canSubmit()) {
      this.showIncomplete.set(true);
      this.toastService.showToast({
        type: 'warning',
        message: auto
          ? 'Đã hết giờ. Bài làm tạm được giữ lại; cần trả lời đủ câu hỏi trước khi nộp bài.'
          : 'Vui lòng trả lời đầy đủ câu hỏi trước khi nộp bài.'
      });
      return;
    }

    this.stopTimer();
    this.submissionAttempted = true;
    this.saveDraft();
    this.submitting.set(true);

    this.testService
      .submit(test, this.answers())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async () => {
          this.draftFinished = true;
          this.submitting.set(false);
          if (auto) {
            this.toastService.showToast({
              type: 'warning',
              message: 'Hết giờ làm bài. Hệ thống đã nộp bài của bạn.'
            });
          }
          await this.learningActivity.finish();
          this.router.navigate(['/learning/roadmap', this.roadmapId, 'test', this.stageId, 'processing']);
        },
        error: (error: { error?: { message?: string } }) => {
          this.submitting.set(false);
          if (Date.now() < this.expiresAt) this.startTimer();
          this.toastService.showToast({
            type: 'warning',
            message: error?.error?.message ?? 'Nộp bài thất bại. Vui lòng thử lại.'
          });
        }
      });
  }
}
