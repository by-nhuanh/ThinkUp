import { DOCUMENT } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LearningLesson, QuizResult } from '../../models/learning.model';
import { QuizAttemptService } from '../../services/quiz-attempt.service';

interface QuizDraft {
  startedAt: number;
  answers: Record<string, string>;
  markedIds: string[];
  currentIndex: number;
  attemptNumber: number;
}

interface QuizHistory {
  attemptCount: number;
  highestScore: number;
}

const QUIZ_DRAFT_PREFIX = 'thinkup_quiz_draft_';
const QUIZ_HISTORY_KEY = 'thinkup_quiz_history';

@Component({
  selector: 'app-lesson-quiz-player',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lesson-quiz-player.component.html',
  styleUrl: './lesson-quiz-player.component.css'
})
export class LessonQuizPlayerComponent implements OnInit, OnDestroy {
  private readonly attemptService = inject(QuizAttemptService);
  private readonly document = inject(DOCUMENT);

  readonly lesson = input.required<LearningLesson>();
  readonly completed = output<void>();
  readonly nextRequested = output<void>();
  readonly activeChange = output<boolean>();
  readonly stage = signal<'intro' | 'taking' | 'grading' | 'result'>('intro');
  readonly answers = signal<Record<string, string>>({});
  readonly markedIds = signal<Set<string>>(new Set());
  readonly currentIndex = signal(0);
  readonly remainingSeconds = signal(0);
  readonly attemptNumber = signal(0);
  readonly highestScore = signal(0);
  readonly result = signal<QuizResult | null>(null);
  readonly confirmSubmit = signal(false);
  readonly autoSubmitNotice = signal(false);

  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousRobotsContent: string | null = null;

  get quiz() { return this.lesson().quiz!; }
  get currentQuestion() { return this.quiz.questions[this.currentIndex()]; }
  get answeredCount(): number { return Object.keys(this.answers()).length; }
  get unansweredCount(): number { return this.quiz.questions.length - this.answeredCount; }
  get completionPercent(): number { return this.quiz.questions.length ? Math.round(this.answeredCount / this.quiz.questions.length * 100) : 0; }

  ngOnInit(): void {
    this.applyNoIndex();
    const history = this.readHistory();
    this.attemptNumber.set(history.attemptCount);
    this.highestScore.set(history.highestScore);
    const draft = this.readDraft();
    if (draft && this.secondsRemaining(draft.startedAt) > 0) {
      this.startedAt = draft.startedAt;
      this.answers.set(draft.answers);
      this.markedIds.set(new Set(draft.markedIds));
      this.currentIndex.set(Math.min(draft.currentIndex, this.quiz.questions.length - 1));
      this.attemptNumber.set(draft.attemptNumber);
      this.stage.set('taking');
      this.activeChange.emit(true);
      this.startTimer();
    } else if (draft) {
      this.answers.set(draft.answers);
      this.attemptNumber.set(draft.attemptNumber);
      this.autoSubmitNotice.set(true);
      this.submitQuiz(true);
    }
  }

  startQuiz(): void {
    const history = this.readHistory();
    this.startedAt = Date.now();
    this.attemptNumber.set(history.attemptCount + 1);
    this.answers.set({});
    this.markedIds.set(new Set());
    this.currentIndex.set(0);
    this.result.set(null);
    this.stage.set('taking');
    this.activeChange.emit(true);
    this.persistDraft();
    this.startTimer();
  }

  selectAnswer(questionId: string, optionId: string): void {
    if (this.stage() !== 'taking') return;
    this.answers.update(answers => ({ ...answers, [questionId]: optionId }));
    this.persistDraft();
  }

  toggleMarked(questionId: string): void {
    this.markedIds.update(ids => {
      const next = new Set(ids);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
    this.persistDraft();
  }

  goToQuestion(index: number): void {
    this.currentIndex.set(index);
    this.persistDraft();
  }

  requestSubmit(): void {
    this.confirmSubmit.set(true);
  }

  submitQuiz(autoSubmitted = false): void {
    if (this.stage() === 'grading' || this.stage() === 'result') return;
    this.confirmSubmit.set(false);
    this.autoSubmitNotice.set(autoSubmitted);
    this.clearTimer();
    this.stage.set('grading');
    this.activeChange.emit(false);
    this.attemptService.submit(this.lesson().id, this.answers(), this.quiz.questions.map(question => question.id), this.quiz.passingScore).subscribe(result => {
      this.result.set(result);
      this.stage.set('result');
      this.clearDraft();
      this.saveHistory(result.score);
      if (result.passed) this.completed.emit();
    });
  }

  retake(): void {
    this.autoSubmitNotice.set(false);
    this.startQuiz();
  }

  formatTimer(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`;
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.stage() !== 'taking') return;
    event.preventDefault();
    event.returnValue = true;
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.restoreRobotsMeta();
    this.activeChange.emit(false);
  }

  private startTimer(): void {
    this.updateTimer();
    this.clearTimer();
    this.timer = setInterval(() => this.updateTimer(), 1000);
  }

  private updateTimer(): void {
    const remaining = this.secondsRemaining(this.startedAt);
    this.remainingSeconds.set(remaining);
    if (remaining <= 0) this.submitQuiz(true);
  }

  private secondsRemaining(startedAt: number): number {
    return Math.max(0, this.quiz.timeLimit * 60 - Math.floor((Date.now() - startedAt) / 1000));
  }

  private persistDraft(): void {
    if (typeof sessionStorage === 'undefined') return;
    const draft: QuizDraft = { startedAt: this.startedAt, answers: this.answers(), markedIds: [...this.markedIds()], currentIndex: this.currentIndex(), attemptNumber: this.attemptNumber() };
    sessionStorage.setItem(`${QUIZ_DRAFT_PREFIX}${this.lesson().id}`, JSON.stringify(draft));
  }

  private readDraft(): QuizDraft | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(`${QUIZ_DRAFT_PREFIX}${this.lesson().id}`);
      return raw ? JSON.parse(raw) as QuizDraft : null;
    } catch {
      return null;
    }
  }

  private clearDraft(): void {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(`${QUIZ_DRAFT_PREFIX}${this.lesson().id}`);
  }

  private readHistory(): QuizHistory {
    if (typeof localStorage === 'undefined') return { attemptCount: 0, highestScore: 0 };
    try {
      const all = JSON.parse(localStorage.getItem(QUIZ_HISTORY_KEY) ?? '{}') as Record<string, QuizHistory>;
      return all[this.lesson().id] ?? { attemptCount: 0, highestScore: 0 };
    } catch {
      return { attemptCount: 0, highestScore: 0 };
    }
  }

  private saveHistory(score: number): void {
    if (typeof localStorage === 'undefined') return;
    let all: Record<string, QuizHistory> = {};
    try { all = JSON.parse(localStorage.getItem(QUIZ_HISTORY_KEY) ?? '{}') as Record<string, QuizHistory>; } catch { all = {}; }
    all[this.lesson().id] = { attemptCount: this.attemptNumber(), highestScore: Math.max(score, this.highestScore()) };
    this.highestScore.set(all[this.lesson().id].highestScore);
    localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(all));
  }

  private applyNoIndex(): void {
    let meta = this.document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = this.document.createElement('meta');
      meta.name = 'robots';
      this.document.head.appendChild(meta);
    }
    this.previousRobotsContent = meta.getAttribute('content');
    meta.content = 'noindex, nofollow';
  }

  private restoreRobotsMeta(): void {
    const meta = this.document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) return;
    if (this.previousRobotsContent === null) meta.remove();
    else meta.content = this.previousRobotsContent;
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
