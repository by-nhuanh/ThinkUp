import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideBadgeCheck,
  LucideBookOpen,
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
  LucidePanelLeft,
  LucideRotateCcw,
  LucideStar,
  LucideX,
} from '@lucide/angular';
import { LearningChapter, LearningCourse, LearningLesson, QuizQuestion } from '../../models/learning.model';

type QuizPhase = 'intro' | 'running' | 'result';

@Component({
  selector: 'app-quiz-workspace',
  standalone: true,
  imports: [
    LucideArrowLeft,
    LucideArrowRight,
    LucideBadgeCheck,
    LucideBookOpen,
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
    LucidePanelLeft,
    LucideRotateCcw,
    LucideStar,
    LucideX,
  ],
  templateUrl: './quiz-workspace.component.html',
})
export class QuizWorkspaceComponent implements OnChanges, OnDestroy {
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
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  get quiz() {
    return this.lesson.quiz;
  }

  get questions(): QuizQuestion[] {
    return this.quiz?.questions ?? [];
  }

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
    return this.resultPercent >= (this.quiz?.passingScore ?? 70);
  }

  get nextLesson(): LearningLesson | null {
    const lessons = this.course.chapters.flatMap((item) => item.lessons);
    const index = lessons.findIndex((item) => item.id === this.lesson.id);
    return index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  }

  get quizDescription(): string {
    return (
      this.lesson.summary?.trim() ||
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

  start(): void {
    this.phase = 'running';
    this.currentIndex = 0;
    this.answers = {};
    this.flagged.clear();
    this.secondsLeft = (this.quiz?.timeLimit ?? 10) * 60;
    this.startTimer();
  }

  selectAnswer(questionId: string, optionId: string): void {
    this.answers = { ...this.answers, [questionId]: optionId };
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
    const question = this.currentQuestion;
    if (!question) return;
    if (this.flagged.has(question.id)) this.flagged.delete(question.id);
    else this.flagged.add(question.id);
  }

  isFlagged(question: QuizQuestion): boolean {
    return this.flagged.has(question.id);
  }

  submit(): void {
    if (this.phase !== 'running') return;
    this.stopTimer();
    this.correctCount = this.questions.filter(
      (question) => this.answers[question.id] === question.correctOptionId
    ).length;
    this.wrongCount = this.questions.length - this.correctCount;
    this.resultPercent = this.questions.length
      ? Math.round((this.correctCount / this.questions.length) * 100)
      : 0;
    this.phase = 'result';
    if (this.passed) this.completed.emit();
  }

  retry(): void {
    this.resetState();
    this.start();
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
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      if (this.secondsLeft > 0) this.secondsLeft -= 1;
      else this.submit();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
