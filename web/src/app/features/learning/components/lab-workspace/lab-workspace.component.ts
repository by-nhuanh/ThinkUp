import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideArrowRight,
  LucideBookOpen,
  LucideCheck,
  LucideChevronDown,
  LucideChevronUp,
  LucideCircleAlert,
  LucideCopy,
  LucideFlaskConical,
  LucideLightbulb,
  LucidePanelLeft,
  LucidePlay,
  LucideRotateCcw,
  LucideSend,
  LucideX,
} from '@lucide/angular';
import {
  LabSolution,
  LabTestCase,
  LearningChapter,
  LearningCourse,
  LearningLesson,
} from '../../models/learning.model';

type LabResult = 'none' | 'pass' | 'fail';

@Component({
  selector: 'app-lab-workspace',
  standalone: true,
  imports: [
    FormsModule,
    LucideArrowRight,
    LucideBookOpen,
    LucideCheck,
    LucideChevronDown,
    LucideChevronUp,
    LucideCircleAlert,
    LucideCopy,
    LucideFlaskConical,
    LucideLightbulb,
    LucidePanelLeft,
    LucidePlay,
    LucideRotateCcw,
    LucideSend,
    LucideX,
  ],
  templateUrl: './lab-workspace.component.html',
})
export class LabWorkspaceComponent implements OnChanges {
  @Input({ required: true }) lesson!: LearningLesson;
  @Input({ required: true }) course!: LearningCourse;
  @Input({ required: true }) chapter!: LearningChapter;

  @Output() lessonSelected = new EventEmitter<LearningLesson>();
  @Output() completed = new EventEmitter<void>();
  @Output() backToCourse = new EventEmitter<void>();

  code = '';
  tests: LabTestCase[] = [];
  activeTestId = '';
  result: LabResult = 'none';
  running = false;
  submitted = false;
  testsOpen = true;
  solutionOpen = false;
  activeSolutionId = '';
  copied = false;

  private initializedLessonId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lesson'] && this.lesson?.id !== this.initializedLessonId) {
      this.initializedLessonId = this.lesson.id;
      this.code = this.lesson.lab?.starterCode ?? '';
      this.tests = (this.lesson.lab?.tests ?? []).map((test) => ({ ...test }));
      this.activeTestId = this.tests[0]?.id ?? '';
      this.result = 'none';
      this.running = false;
      this.submitted = false;
      this.solutionOpen = false;
      this.activeSolutionId = this.lesson.lab?.solutions[0]?.id ?? '';
      this.copied = false;
    }
  }

  get lab() {
    return this.lesson.lab;
  }

  get lines(): number[] {
    return Array.from({ length: Math.max(this.code.split('\n').length, 12) }, (_, index) => index + 1);
  }

  get passedCount(): number {
    return this.tests.filter((test) => test.passed).length;
  }

  get activeTest(): LabTestCase | undefined {
    return this.tests.find((test) => test.id === this.activeTestId) ?? this.tests[0];
  }

  get activeSolution(): LabSolution | undefined {
    return this.lab?.solutions.find((solution) => solution.id === this.activeSolutionId) ?? this.lab?.solutions[0];
  }

  get previousLesson(): LearningLesson | null {
    const lessons = this.course.chapters.flatMap((item) => item.lessons);
    const index = lessons.findIndex((item) => item.id === this.lesson.id);
    return index > 0 ? lessons[index - 1] : null;
  }

  get nextLesson(): LearningLesson | null {
    const lessons = this.course.chapters.flatMap((item) => item.lessons);
    const index = lessons.findIndex((item) => item.id === this.lesson.id);
    return index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  }

  run(): void {
    if (this.running) return;
    this.running = true;
    setTimeout(() => {
      const hasBody = this.code.trim().length > (this.lab?.starterCode.trim().length ?? 0) + 5;
      const looksComplete = /return\s+/.test(this.code) && /<[a-zA-Z0-9]/.test(this.code);
      const passed = hasBody && looksComplete;

      this.tests = this.tests.map((test, index) => ({
        ...test,
        passed,
        actual: passed ? test.expected : index === 0 ? 'Chưa có kết quả trả về' : test.actual,
      }));
      this.running = false;
    }, 650);
  }

  submit(): void {
    this.run();
    setTimeout(() => {
      const passed = this.tests.every((test) => test.passed);
      this.result = passed ? 'pass' : 'fail';
      this.submitted = true;
      if (passed) this.completed.emit();
    }, 750);
  }

  reset(): void {
    this.code = this.lab?.starterCode ?? '';
    this.tests = (this.lab?.tests ?? []).map((test) => ({ ...test }));
    this.result = 'none';
    this.submitted = false;
  }

  openSolution(): void {
    this.solutionOpen = true;
    this.activeSolutionId = this.lab?.solutions[0]?.id ?? '';
  }

  copySolution(): void {
    const solution = this.activeSolution;
    if (!solution) return;
    void navigator.clipboard?.writeText(solution.code);
    this.copied = true;
    setTimeout(() => (this.copied = false), 1500);
  }

  solutionName(solution: LabSolution): string {
    const parts = solution.label.split('·');
    return parts.length > 1 ? parts[1].trim() : solution.label;
  }

  next(): void {
    if (this.nextLesson) this.lessonSelected.emit(this.nextLesson);
  }
}
