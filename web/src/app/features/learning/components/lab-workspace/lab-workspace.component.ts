import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import {
  LucideCheck,
  LucideCircleHelp,
  LucideCornerDownRight,
  LucideCrown,
  LucideInbox,
  LucideInfo,
  LucideMaximize2,
  LucideMessageCircle,
  LucidePlay,
  LucideRotateCcw,
  LucideSend,
  LucideThumbsUp,
  LucideUserRound,
} from '@lucide/angular';
import { CourseOutlineComponent } from '../course-outline/course-outline.component';
import { ReportModalComponent } from '../report-modal/report-modal.component';
import {
  CommunityPost,
  CommunityReply,
  LabConfig,
  LabExercise,
  LabInstructionBlock,
  LabSubmission,
  LabTestCase,
  LearningChapter,
  LearningCourse,
  LearningLesson,
  ReportReason,
} from '../../models/learning.model';

type LabPanel = 'course' | 'exercise' | 'leaderboard' | 'results' | 'discussion' | 'guide';
type LabResult = 'none' | 'pass' | 'fail';
type DiscussionTab = 'qa' | 'discussion';

interface RailItem {
  id: LabPanel;
  label: string;
}

interface RichSegment {
  text: string;
  code: boolean;
}

const EMPTY_EXERCISE: LabExercise = {
  id: '',
  order: 0,
  title: '',
  language: '',
  knowledge: [],
  task: [],
  starterCode: '',
  tests: [],
  solutions: [],
  leaderboard: [],
  submissions: [],
};

@Component({
  selector: 'app-lab-workspace',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    CourseOutlineComponent,
    ReportModalComponent,
    LucideCheck,
    LucideCircleHelp,
    LucideCornerDownRight,
    LucideCrown,
    LucideInbox,
    LucideInfo,
    LucideMaximize2,
    LucideMessageCircle,
    LucidePlay,
    LucideRotateCcw,
    LucideSend,
    LucideThumbsUp,
    LucideUserRound,
  ],
  templateUrl: './lab-workspace.component.html',
  styleUrls: ['./lab-workspace.component.css'],
})
export class LabWorkspaceComponent implements OnChanges {
  @Input({ required: true }) lesson!: LearningLesson;
  @Input({ required: true }) course!: LearningCourse;
  @Input({ required: true }) chapter!: LearningChapter;
  @Input() qaPosts: CommunityPost[] = [];
  @Input() discussionPosts: CommunityPost[] = [];
  @Input() reportReasons: ReportReason[] = [];

  @Output() lessonSelected = new EventEmitter<LearningLesson>();
  @Output() completed = new EventEmitter<void>();
  @Output() backToCourse = new EventEmitter<void>();

  readonly railItems: RailItem[] = [
    { id: 'course', label: 'Nội dung khóa học' },
    { id: 'exercise', label: 'Kiến thức và đề bài' },
    { id: 'leaderboard', label: 'Bảng xếp hạng' },
    { id: 'results', label: 'Kết quả kiểm thử' },
    { id: 'discussion', label: 'Hỏi đáp và thảo luận' },
    { id: 'guide', label: 'Cách nộp bài' },
  ];

  readonly activePanel = signal<LabPanel | null>('course');
  readonly activeExerciseIndex = signal(0);
  readonly openChapterIds = signal<string[]>([]);
  readonly code = signal('');
  readonly tests = signal<LabTestCase[]>([]);
  readonly activeTestId = signal('');
  readonly running = signal(false);
  readonly result = signal<LabResult>('none');
  readonly submitted = signal(false);
  readonly testsOpen = signal(true);
  readonly submissionsMap = signal<Record<string, LabSubmission[]>>({});
  readonly hasNewResults = signal(false);
  readonly discussionTab = signal<DiscussionTab>('discussion');
  readonly qaThreads = signal<CommunityPost[]>([]);
  readonly discussionThreads = signal<CommunityPost[]>([]);
  readonly expandedPosts = signal<string[]>([]);
  readonly replyTarget = signal<string | null>(null);
  readonly reportTarget = signal<{ author: string; content: string } | null>(null);
  readonly gutterOffset = signal(0);

  readonly guideExamples = [
    { label: 'Với ngôn ngữ C++, Java, C#:', code: 'int add(int a, int b){\n    return a + b;\n}' },
    { label: 'Với ngôn ngữ JavaScript:', code: 'function add(a, b){\n    return a + b;\n}' },
    { label: 'Với ngôn ngữ Python:', code: 'def add(a, b):\n    return a + b' },
  ];

  draft = '';
  replyDraft = '';

  private readonly codeByExercise = new Map<string, string>();
  private initializedLessonId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lesson'] && this.lesson && this.lesson.id !== this.initializedLessonId) {
      this.initializedLessonId = this.lesson.id;
      this.codeByExercise.clear();
      this.activeExerciseIndex.set(0);
      this.activePanel.set('course');
      this.openChapterIds.set(this.course.chapters.map((chapter) => chapter.id));
      this.submissionsMap.set({});
      this.hasNewResults.set(false);
      this.discussionTab.set('discussion');
      this.qaThreads.set(structuredClone(this.qaPosts));
      this.discussionThreads.set(structuredClone(this.discussionPosts));
      this.expandedPosts.set([]);
      this.replyTarget.set(null);
      this.reportTarget.set(null);
      this.draft = '';
      this.replyDraft = '';
      this.resetEditorState();
    }
  }

  get lab(): LabConfig | undefined {
    return this.lesson?.lab;
  }

  get exercises(): LabExercise[] {
    const lab = this.lab;
    if (!lab) return [];
    if (lab.exercises?.length) return lab.exercises;
    return [
      {
        id: `${this.lesson.id}-exercise-1`,
        order: 1,
        title: lab.taskTitle,
        language: lab.language,
        knowledge: lab.instructions,
        task: [],
        starterCode: lab.starterCode,
        tests: lab.tests,
        solutions: lab.solutions,
        leaderboard: [],
        submissions: [],
      },
    ];
  }

  get activeExercise(): LabExercise {
    return this.exercises[this.activeExerciseIndex()] ?? EMPTY_EXERCISE;
  }

  get activeTest(): LabTestCase | undefined {
    return this.tests().find((test) => test.id === this.activeTestId()) ?? this.tests()[0];
  }

  get passedCount(): number {
    return this.tests().filter((test) => test.passed).length;
  }

  get lines(): number[] {
    return Array.from({ length: Math.max(this.code().split('\n').length, 14) }, (_, index) => index + 1);
  }

  get threads(): CommunityPost[] {
    return this.discussionTab() === 'qa' ? this.qaThreads() : this.discussionThreads();
  }

  get threadCount(): number {
    return this.qaThreads().length + this.discussionThreads().length;
  }

  get submissions(): LabSubmission[] {
    return this.submissionsMap()[this.activeExercise.id] ?? [];
  }

  togglePanel(panel: LabPanel): void {
    const next = this.activePanel() === panel ? null : panel;
    this.activePanel.set(next);
    if (next === 'results') this.hasNewResults.set(false);
  }

  toggleChapter(chapterId: string): void {
    const current = this.openChapterIds();
    this.openChapterIds.set(
      current.includes(chapterId) ? current.filter((id) => id !== chapterId) : [...current, chapterId]
    );
  }

  selectExercise(index: number): void {
    if (index < 0 || index >= this.exercises.length || index === this.activeExerciseIndex()) return;
    this.codeByExercise.set(this.activeExercise.id, this.code());
    this.activeExerciseIndex.set(index);
    this.resetEditorState();
  }

  previousExercise(): void {
    this.selectExercise(this.activeExerciseIndex() - 1);
  }

  nextExercise(): void {
    this.selectExercise(this.activeExerciseIndex() + 1);
  }

  run(): void {
    this.execute(false);
  }

  submit(): void {
    this.execute(true);
  }

  reset(): void {
    const exercise = this.activeExercise;
    this.codeByExercise.delete(exercise.id);
    this.resetEditorState();
  }

  richTextSegments(text: string): RichSegment[] {
    return text
      .split(/(`[^`]*`)/g)
      .filter((part) => part.length > 0)
      .map((part) =>
        part.startsWith('`') && part.endsWith('`')
          ? { text: part.slice(1, -1), code: true }
          : { text: part, code: false }
      );
  }

  onCodeScroll(event: Event): void {
    this.gutterOffset.set((event.target as HTMLElement).scrollTop);
  }

  avatarFor(author: string): string {
    let hash = 0;
    for (let index = 0; index < author.length; index += 1) hash = (hash + author.charCodeAt(index)) % 3;
    return `/assets/learning/discussion-avatar-${hash + 1}.webp`;
  }

  addPost(): void {
    const body = this.draft.trim();
    if (!body) return;
    this.updateThreads((threads) => [
      {
        id: `lab-post-${Date.now()}`,
        author: 'Bạn',
        initials: 'B',
        body,
        createdAt: 'Vừa xong',
        likes: 0,
        replies: [],
      },
      ...threads,
    ]);
    this.draft = '';
  }

  addReply(postId: string): void {
    const body = this.replyDraft.trim();
    if (!body) return;
    this.updateThreads((threads) =>
      threads.map((post) =>
        post.id === postId
          ? {
              ...post,
              replies: [
                ...post.replies,
                {
                  id: `lab-reply-${Date.now()}`,
                  author: 'Bạn',
                  initials: 'B',
                  body,
                  createdAt: 'Vừa xong',
                  likes: 0,
                },
              ],
            }
          : post
      )
    );
    this.replyDraft = '';
    this.replyTarget.set(null);
  }

  toggleLike(id: string): void {
    const toggle = <T extends CommunityReply>(item: T): T => ({
      ...item,
      liked: !item.liked,
      likes: item.likes + (item.liked ? -1 : 1),
    });

    this.updateThreads((threads) =>
      threads.map((post) =>
        post.id === id
          ? toggle(post)
          : { ...post, replies: post.replies.map((reply) => (reply.id === id ? toggle(reply) : reply)) }
      )
    );
  }

  visibleReplies(post: CommunityPost): CommunityReply[] {
    return this.isExpanded(post.id) ? post.replies : post.replies.slice(0, 1);
  }

  hiddenReplyCount(post: CommunityPost): number {
    return Math.max(0, post.replies.length - 1);
  }

  isExpanded(postId: string): boolean {
    return this.expandedPosts().includes(postId);
  }

  toggleReplies(postId: string): void {
    const expanded = this.expandedPosts();
    this.expandedPosts.set(
      expanded.includes(postId) ? expanded.filter((id) => id !== postId) : [...expanded, postId]
    );
  }

  report(author: string, content: string): void {
    this.reportTarget.set({ author, content });
  }

  submitReport(): void {
    this.reportTarget.set(null);
  }

  submittedTime(entry: { submittedAt: string }): string {
    return entry.submittedAt.split(' ')[0] ?? entry.submittedAt;
  }

  submittedDate(entry: { submittedAt: string }): string {
    return entry.submittedAt.split(' ').slice(1).join(' ');
  }

  private updateThreads(change: (threads: CommunityPost[]) => CommunityPost[]): void {
    if (this.discussionTab() === 'qa') this.qaThreads.update(change);
    else this.discussionThreads.update(change);
  }

  private resetEditorState(): void {
    const exercise = this.activeExercise;
    this.code.set(this.codeByExercise.get(exercise.id) ?? exercise.starterCode);
    this.tests.set(exercise.tests.map((test) => ({ ...test })));
    this.activeTestId.set(exercise.tests[0]?.id ?? '');
    this.result.set('none');
    this.submitted.set(false);
    this.gutterOffset.set(0);
  }

  private execute(isSubmission: boolean): void {
    if (this.running()) return;
    const exercise = this.activeExercise;
    this.running.set(true);
    this.result.set('none');

    window.setTimeout(() => {
      const passed = this.evaluate(exercise);
      this.tests.update((tests) =>
        tests.map((test, index) => ({
          ...test,
          passed,
          actual: passed ? test.expected : index === 0 ? 'Chưa có kết quả trả về' : undefined,
        }))
      );
      this.running.set(false);
      this.result.set(passed ? 'pass' : 'fail');
      this.submitted.set(isSubmission);
      this.recordSubmission(passed);
      this.hasNewResults.set(true);

      if (isSubmission) {
        this.activePanel.set('results');
        this.hasNewResults.set(false);
        if (passed) this.completed.emit();
      }
    }, 700);
  }

  private evaluate(exercise: LabExercise): boolean {
    const code = this.code().trim();
    if (!code || code === exercise.starterCode.trim()) return false;
    return /\breturn\b/.test(code);
  }

  private recordSubmission(passed: boolean): void {
    const exercise = this.activeExercise;
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const submission: LabSubmission = {
      id: `lab-submission-${Date.now()}`,
      submittedAt: `${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
      testsPassed: passed ? this.tests().length : this.passedCount,
      testsTotal: this.tests().length,
      status: passed ? 'pass' : 'fail',
      execTime: `${40 + Math.floor(Math.random() * 30)} ms`,
    };

    this.submissionsMap.update((map) => ({
      ...map,
      [exercise.id]: [submission, ...(map[exercise.id] ?? [])],
    }));
  }
}
