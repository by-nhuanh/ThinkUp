import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideBadgeCheck,
  LucideCheck,
  LucideChevronRight,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideCircleQuestionMark,
  LucideCircleX,
  LucideClipboardList,
  LucideClock,
  LucideFlag,
  LucideLightbulb,
  LucideRotateCcw,
  LucideStar,
  LucideX,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { LearningChapter, LearningCourse, LearningLesson, QuizQuestion } from '../../models/learning.model';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LearningService } from '../../services/learning.service';
import { QuizAttemptDto, QuizOverviewDto } from '../../models/learning-api.model';

import { StudySidebarComponent } from '../study-sidebar/study-sidebar.component';

type QuizPhase = 'intro' | 'running' | 'result';

@Component({
  selector: 'app-quiz-workspace',
  standalone: true,
  imports: [
    RouterLink,
    StudySidebarComponent,
    LucideArrowLeft,
    LucideArrowRight,
    LucideBadgeCheck,
      LucideCheck,
    LucideChevronRight,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideCircleQuestionMark,
    LucideCircleX,
    LucideClipboardList,
    LucideClock,
    LucideFlag,
    LucideLightbulb,
      LucideRotateCcw,
    LucideStar,
    LucideX,
  ],
  templateUrl: './quiz-workspace.component.html',
})
export class QuizWorkspaceComponent implements OnChanges, OnDestroy {
  private readonly service = inject(LearningService);
  sidebarOpen = true;
  get openChapterIds(): string[] { return this.course.chapters.map(chapter => chapter.id); }
  busy = false;
  loading = false;
  errorMessage = '';
  private overview?: QuizOverviewDto;
  private apiQuestions: QuizQuestion[] = [];
  private attemptId = '';
  private revision = 0;
  private deadline = 0;
  private generation = 0;
  private saveQueue: Promise<void> = Promise.resolve();
  private saveFailed = false;
  private serverPassed = false;
  @Input({ required: true }) lesson!: LearningLesson;
  @Input({ required: true }) course!: LearningCourse;
  @Input({ required: true }) chapter!: LearningChapter;

  @Output() lessonSelected = new EventEmitter<LearningLesson>();
  @Output() completed = new EventEmitter<void>();
  @Output() backToCourse = new EventEmitter<void>();

  phase: QuizPhase = 'intro';
  currentIndex = 0;
  answers: Record<string, string> = {};
  flagged = new Set<string>();
  secondsLeft = 0;
  resultPercent = 0;
  correctCount = 0;
  wrongCount = 0;

  private timer: ReturnType<typeof setInterval> | null = null;
  private initializedLessonId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lesson'] && this.lesson?.id !== this.initializedLessonId) {
      this.initializedLessonId = this.lesson.id;
      this.resetState();
      void this.loadOverview();
    }
  }

  ngOnDestroy(): void {
    this.generation++;
    this.stopTimer();
  }

  get quiz() {
    return this.overview ? {timeLimit:this.overview.time_limit_minutes,passingScore:this.overview.pass_score_percent} : undefined;
  }

  get questions(): QuizQuestion[] {
    return this.apiQuestions;
  }

  get totalQuestions(): number { return this.overview?.total_questions ?? 0; }

  get currentQuestion(): QuizQuestion | undefined {
    return this.questions[this.currentIndex];
  }

  get answeredCount(): number {
    return Object.keys(this.answers).length;
  }

  get progressPercent(): number {
    return this.questions.length ? Math.round((this.answeredCount / this.questions.length) * 100) : 0;
  }

  get questionProgress(): number {
    return this.questions.length ? ((this.currentIndex + 1) / this.questions.length) * 100 : 0;
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.secondsLeft / 60);
    const seconds = this.secondsLeft % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  get passed(): boolean {
    return this.serverPassed;
  }

  get nextLesson(): LearningLesson | null {
    const lessons = this.course.chapters.flatMap((item) => item.lessons);
    const index = lessons.findIndex((item) => item.id === this.lesson.id);
    return index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  }

  get quizDescription(): string {
    return (
      this.overview?.description?.trim() || this.lesson.summary?.trim() ||
      'Bài kiểm tra giúp bạn củng cố kiến thức đã học và chuẩn bị cho chương tiếp theo.'
    );
  }

  get completionStatus(): string {
    if (this.phase === 'running') return 'Đang làm bài';
    if (this.phase === 'result') return this.passed ? 'Đã hoàn thành' : 'Chưa đạt';
    return 'Chưa làm bài';
  }

  get completionStatusClass(): string {
    if (this.phase === 'running') return 'border-[#BFD4FF] bg-[#EFF6FF] text-[#2B7FFF]';
    if (this.phase === 'result') {
      return this.passed
        ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
        : 'border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]';
    }
    return 'border-[#FEF3C6] bg-[#FFFBEB] text-[#475C78]';
  }

  get completionDotClass(): string {
    if (this.phase === 'running') return 'bg-[#2B7FFF]';
    if (this.phase === 'result') return this.passed ? 'bg-[#16A34A]' : 'bg-[#DC2626]';
    return 'bg-[#FE9A00]';
  }

  private async loadOverview(): Promise<void> {
    const version = ++this.generation;
    this.loading = true;
    this.overview = undefined;
    this.apiQuestions = [];
    this.errorMessage = '';
    try {
      const overview = await firstValueFrom(this.service.getQuizOverview(this.lesson.id));
      if (version !== this.generation) return;
      this.overview = overview;
      this.secondsLeft = overview.time_limit_minutes * 60;
    } catch { if (version === this.generation) this.errorMessage = 'Không tải được bài kiểm tra. Vui lòng mở lại bài.'; }
    finally { if (version === this.generation) this.loading = false; }
  }

  private applyAttempt(attempt: QuizAttemptDto): void {
    this.apiQuestions = this.service.mapQuizAttempt(attempt).questions;
    this.attemptId = attempt.attempt_id;
    this.revision = attempt.revision;
    this.answers = {...attempt.answers};
    this.flagged = new Set(attempt.flagged_question_ids);
    this.secondsLeft = attempt.remaining_seconds;
    this.deadline = Date.now() + attempt.remaining_seconds * 1000;
  }

  async start(retry = false): Promise<void> {
    if (this.busy || this.loading || !this.overview || this.phase === 'running') return;
    const version=this.generation;
    this.busy=true;
    this.errorMessage='';
    try {
      const attempt=await firstValueFrom(this.service.startQuizAttempt(this.lesson.id,retry));
      if(version!==this.generation)return;
      this.applyAttempt(attempt);
      this.currentIndex=0;
      this.saveFailed=false;
      this.saveQueue=Promise.resolve();
      this.phase='running';
      this.startTimer();
    } catch { if(version===this.generation)this.errorMessage='Không bắt đầu được lượt làm bài. Vui lòng mở lại để tải trạng thái mới nhất.'; }
    finally { if(version===this.generation)this.busy=false; }
  }

  selectAnswer(questionId: string, optionId: string): void {
    if (this.busy || this.phase !== 'running' || this.saveFailed) return;
    this.answers = { ...this.answers, [questionId]: optionId };
    this.queueSave();
  }

  isSelected(optionId: string): boolean {
    const question = this.currentQuestion;
    return !!question && this.answers[question.id] === optionId;
  }

  isAnswered(question: QuizQuestion): boolean {
    return !!this.answers[question.id];
  }

  goTo(index: number): void {
    if (index >= 0 && index < this.questions.length) this.currentIndex = index;
  }

  nextQuestion(): void {
    if (this.currentIndex < this.questions.length - 1) this.currentIndex += 1;
  }

  previousQuestion(): void {
    if (this.currentIndex > 0) this.currentIndex -= 1;
  }

  toggleFlag(): void {
    if (this.busy || this.phase !== 'running' || this.saveFailed) return;
    const question = this.currentQuestion;
    if (!question) return;
    if (this.flagged.has(question.id)) this.flagged.delete(question.id);
    else this.flagged.add(question.id);
    this.queueSave();
  }

  isFlagged(question: QuizQuestion): boolean {
    return this.flagged.has(question.id);
  }

  private queueSave(): void {
    const version=this.generation, attemptId=this.attemptId;
    const answers={...this.answers}, flagged_question_ids=[...this.flagged];
    this.saveQueue=this.saveQueue.then(async()=>{
      if(version!==this.generation || this.saveFailed)return;
      try {
        const saved=await firstValueFrom(this.service.saveQuizAnswers(attemptId,{answers,flagged_question_ids,revision:this.revision}));
        if(version===this.generation)this.revision=saved.revision;
      } catch(error) {
        if(version!==this.generation)return;
        this.saveFailed=true;
        this.errorMessage='Không lưu được đáp án. Vui lòng mở lại bài để tải trạng thái đã lưu; chưa thể nộp bài.';
        // A conflict must reload authoritative state, never retry the mutation blindly.
        if ((error as {status?:number})?.status===409) {
          try { const current=await firstValueFrom(this.service.getQuizAttempt(attemptId)); if(version===this.generation)this.applyAttempt(current); } catch {}
        }
      }
    });
  }

  async submit(): Promise<void> {
    if (this.phase !== 'running' || this.busy) return;
    const version=this.generation;
    this.busy=true;
    try {
      await this.saveQueue;
      if(version!==this.generation || this.saveFailed)return;
      const result=await firstValueFrom(this.service.submitQuizAttempt(this.attemptId));
      if(version!==this.generation)return;
      this.stopTimer();
      this.correctCount=result.correct_count;
      this.wrongCount=result.wrong_count + result.unanswered_count;
      this.resultPercent=result.score_percent;
      this.serverPassed=result.passed;
      this.phase='result';
      if(result.passed)this.completed.emit();
    } catch { if(version===this.generation)this.errorMessage='Không nộp được bài. Kết quả chưa được xác nhận; vui lòng thử lại.'; }
    finally { if(version===this.generation)this.busy=false; }
  }

  retry(): void {
    if(this.busy || this.loading)return;
    this.resetState();
    void this.start(true);
  }

  continueLesson(): void {
    if (this.nextLesson) this.lessonSelected.emit(this.nextLesson);
    else this.backToCourse.emit();
  }

  get resultMessage(): string {
    const total = this.questions.length;
    return this.passed
      ? `Bạn đã đạt ${this.correctCount}/${total} câu đúng và hoàn thành bài kiểm tra.`
      : `Bạn đã đạt ${this.correctCount}/${total} câu đúng. Điểm tối thiểu để đạt là ${this.quiz?.passingScore ?? 70}%.`;
  }

  dashOffset(percent: number): number {
    const circumference = 2 * Math.PI * 32;
    return circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  }

  optionLetter(index: number): string {
    return String.fromCharCode(65 + index);
  }

  private resetState(): void {
    this.stopTimer();
    this.phase = 'intro';
    this.currentIndex = 0;
    this.answers = {};
    this.flagged.clear();
    this.secondsLeft = (this.quiz?.timeLimit ?? 10) * 60;
    this.resultPercent = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.serverPassed=false;
    this.busy=false;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      this.secondsLeft=Math.max(0,Math.ceil((this.deadline-Date.now())/1000));
      if (this.secondsLeft === 0) { this.stopTimer(); void this.submit(); }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
