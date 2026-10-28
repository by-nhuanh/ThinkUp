import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { RoadmapTestQuestion } from '../models/roadmap.model';
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
  private readonly router = inject(Router);

  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  readonly roadmapId = this.params.get('roadmapId') ?? '';
  readonly stageId = this.params.get('stageId') ?? '';

  readonly roadmap = computed(() => this.roadmapService.getRoadmapById(this.roadmapId));
  readonly test = computed(() => this.testService.getTest(this.roadmapId, this.stageId));

  readonly currentIndex = signal(0);
  readonly answers = signal<Record<string, string>>({});
  readonly markedIds = signal<ReadonlySet<string>>(new Set());
  readonly remainingSeconds = signal(0);
  readonly panelOpen = signal(true);
  readonly showIncomplete = signal(false);

  private timerId: ReturnType<typeof setInterval> | null = null;

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
    const test = this.test();
    if (!test) return;

    this.remainingSeconds.set(test.durationMinutes * 60);
    this.timerId = setInterval(() => {
      this.remainingSeconds.update((value) => Math.max(0, value - 1));
      if (this.remainingSeconds() === 0) {
        this.finish(true);
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    this.stopTimer();
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
    this.answers.update((answers) => ({ ...answers, [question.id]: optionId }));
    this.showIncomplete.set(false);
  }

  isMarked(question: RoadmapTestQuestion): boolean {
    return this.markedIds().has(question.id);
  }

  toggleMark(): void {
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
  }

  goTo(index: number): void {
    const total = this.totalQuestions();
    if (index < 0 || index >= total) return;
    this.currentIndex.set(index);
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
    if (!this.canSubmit()) {
      this.showIncomplete.set(true);
      return;
    }
    this.finish(false);
  }

  private finish(auto: boolean): void {
    const test = this.test();
    if (!test) return;

    this.stopTimer();
    this.testService.submit(test, this.answers());

    if (auto) {
      this.toastService.showToast({ type: 'warning', message: 'Hết giờ làm bài. Hệ thống đã nộp bài của bạn.' });
    }

    this.router.navigate(['/learning/roadmap', this.roadmapId, 'test', this.stageId, 'processing']);
  }
}
