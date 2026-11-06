import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
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
} from '@lucide/angular';
import { CourseOutlineComponent } from '../course-outline/course-outline.component';
import { ReportModalComponent } from '../report-modal/report-modal.component';
import { inject, OnDestroy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LearningService } from '../../services/learning.service';
import { LabRunDto } from '../../models/learning-api.model';
import {
  CommunityPost,
  CommunityReply,
  LabConfig,
  LabLeaderboardEntry,
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
    RouterLink,
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
  ],
  templateUrl: './lab-workspace.component.html',
  styleUrls: ['./lab-workspace.component.css'],
})
export class LabWorkspaceComponent implements OnChanges, OnDestroy {
  readonly currentUser = inject(AuthService).currentUser;
  get myInitials(): string { return (this.currentUser()?.full_name || 'Bạn').split(/\s+/).slice(-2).map(part => part[0]).join(''); }
  private readonly service = inject(LearningService);
  loading = false;
  errorMessage = '';

  private config?: LabConfig;
  private attemptId = '';
  private revision = 0;
  private generation = 0;
  private draftTimer?: ReturnType<typeof setTimeout>;
  private draftQueue: Promise<void> = Promise.resolve();
  private draftFailed = false;
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
  readonly leaderboard = signal<LabLeaderboardEntry[]>([]);
  readonly executionMs = signal<number | null>(null);
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
  readonly reportTarget = signal<{ id: string; author: string; content: string } | null>(null);
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
      void this.loadWorkspace();
      void this.loadCommunity();
      this.leaderboard.set([]);
    }
  }

  private async loadCommunity(): Promise<void> {
    const lessonId = this.lesson.id;
    try {
      const [qa, discussion] = await Promise.all([
        firstValueFrom(this.service.getCommunity(this.course.id, 'qa')),
        firstValueFrom(this.service.getCommunity(this.course.id, 'discussion')),
      ]);
      if (this.lesson.id !== lessonId) return;
      this.qaThreads.set(qa); this.discussionThreads.set(discussion);
    } catch { if (this.lesson.id === lessonId) this.errorMessage = 'Không tải được hỏi đáp và thảo luận.'; }
  }

  get lab(): LabConfig | undefined {
    return this.config;
  }

  ngOnDestroy(): void { this.generation++; clearTimeout(this.draftTimer); }

  private async loadWorkspace(): Promise<void> {
    const version=++this.generation;
    clearTimeout(this.draftTimer);
    this.loading=true;
    this.running.set(false);
    this.config=undefined;
    this.attemptId='';
    this.code.set('');
    this.tests.set([]);
    this.errorMessage='';
    
    this.draftQueue=Promise.resolve();
    this.draftFailed=false;
    try {
      const content=await firstValueFrom(this.service.getLessonContent(this.lesson.id));
      if(version!==this.generation)return;
      this.config=this.service.mapLabContent(content);
      const attempt=await firstValueFrom(this.service.startLabAttempt(this.lesson.id));
      if(version!==this.generation)return;
      this.attemptId=attempt.attempt_id;
      this.revision=attempt.exercise.revision;
      this.resetEditorState();
      this.code.set(attempt.exercise.source_code);
      if (attempt.exercise.test_results?.length) {
        this.tests.set(this.service.mapLabTests(attempt.exercise.test_results));
        this.result.set(attempt.exercise.test_results.every(test => test.passed) ? 'pass' : 'fail');
        this.executionMs.set(attempt.exercise.execution_ms ?? null);
      }
      this.activeTestId.set(this.tests()[0]?.id || '');
      await this.loadActivity(version);
    } catch { if(version===this.generation)this.errorMessage='Không tải được workspace. Vui lòng mở lại bài lab.'; }
    finally { if(version===this.generation)this.loading=false; }
  }

  private async loadActivity(version = this.generation): Promise<void> {
    const data = await firstValueFrom(this.service.getLabActivity(this.lesson.id));
    if (version !== this.generation) return;
    this.leaderboard.set(data.leaderboard);
    this.submissionsMap.set({ [this.activeExercise.id]: data.submissions });
  }

  onCodeChange(value: string): void {
    this.code.set(value);
    this.result.set('none');
    this.tests.update(tests => tests.map(({ actual, passed, ...test }) => test));
    this.executionMs.set(null);
    clearTimeout(this.draftTimer);
    this.draftTimer=setTimeout(()=>this.saveDraft(),600);
  }

  saveDraft(): void {
    clearTimeout(this.draftTimer);
    if(this.loading || this.running() || !this.attemptId || this.draftFailed)return;
    const version=this.generation, lessonId=this.lesson.id, attemptId=this.attemptId, source_code=this.code();
    this.draftQueue=this.draftQueue.then(async()=>{
      if(version!==this.generation || this.draftFailed)return;
      try {
        const saved=await firstValueFrom(this.service.saveLabDraft(lessonId,attemptId,'1',{source_code,revision:this.revision}));
        if(version===this.generation)this.revision=saved.revision;
      } catch {
        if(version===this.generation){this.draftFailed=true;this.errorMessage='Không lưu được code nháp hoặc phiên bản đã thay đổi. Sao chép code và mở lại bài để tải trạng thái mới nhất.';}
      }
    });
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
        leaderboard: this.leaderboard(),
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

  async reset(): Promise<void> {
    if (!this.attemptId && this.submitted() && !this.running() && !this.loading) { await this.loadWorkspace(); return; }
    if(this.running() || this.loading || !this.attemptId || this.draftFailed)return;
    const version=this.generation;
    clearTimeout(this.draftTimer);
    this.running.set(true);
    try {
      await this.draftQueue;
      if(version!==this.generation || this.draftFailed)return;
      const reset=await firstValueFrom(this.service.resetLabExercise(this.lesson.id,this.attemptId,'1',this.revision));
      if(version!==this.generation)return;
      this.revision=reset.revision;
      this.codeByExercise.delete(this.activeExercise.id);
      this.resetEditorState();
      this.code.set(reset.source_code);

      
    } catch { if(version===this.generation)this.errorMessage='Không khôi phục được code mẫu. Vui lòng tải lại trạng thái bài lab.'; }
    finally { if(version===this.generation)this.running.set(false); }
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

  private communityBusy = false;

  async addPost(): Promise<void> {
    const body = this.draft.trim();
    if (!body || this.communityBusy) return;
    await this.writeCommunity(body);
  }

  async addReply(postId: string): Promise<void> {
    const body = this.replyDraft.trim();
    if (!body || this.communityBusy) return;
    await this.writeCommunity(body, postId);
  }

  private async writeCommunity(body: string, parentId?: string): Promise<void> {
    const mode = this.discussionTab(), lessonId = this.lesson.id;
    this.communityBusy = true;
    try {
      const posts = await firstValueFrom(this.service.createCommunity(this.course.id, mode, body, lessonId, parentId));
      if (this.lesson.id !== lessonId) return;
      (mode === 'qa' ? this.qaThreads : this.discussionThreads).set(posts);
      if (parentId) { this.replyDraft = ''; this.replyTarget.set(null); } else this.draft = '';
    } catch { this.errorMessage = 'Không gửi được nội dung. Vui lòng thử lại.'; }
    finally { this.communityBusy = false; }
  }

  async toggleLike(id: string): Promise<void> {
    if (this.discussionTab() !== 'discussion') return;
    const lessonId = this.lesson.id;
    try {
      const result = await firstValueFrom(this.service.likeDiscussion(id));
      if (this.lesson.id !== lessonId) return;
      const update = <T extends CommunityReply>(item: T): T => item.id === id
        ? { ...item, liked: result.is_liked, likes: result.likes_count } : item;
      this.discussionThreads.update(posts => posts.map(post => ({ ...update(post), replies: post.replies.map(update) })));
    } catch { this.errorMessage = 'Không cập nhật được lượt thích.'; }
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

  report(id: string, author: string, content: string): void {
    if (this.discussionTab() !== 'discussion') return;
    this.reportTarget.set({ id, author, content });
  }

  async submitReport(payload: { reasonId: string; detail: string }): Promise<void> {
    const target = this.reportTarget();
    if (!target) return;
    try {
      await firstValueFrom(this.service.reportDiscussion(target.id, payload.reasonId + ': ' + payload.detail));
      this.reportTarget.set(null);
    } catch { this.errorMessage = 'Không gửi được báo cáo.'; }
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
    this.executionMs.set(null);
    this.submitted.set(false);
    this.gutterOffset.set(0);
  }

  private async execute(isSubmission: boolean): Promise<void> {
    if (this.running() || this.loading || (!this.attemptId && !this.submitted()) || this.draftFailed) return;
    const version=this.generation, lessonId=this.lesson.id, source_code=this.code();
    clearTimeout(this.draftTimer);
    this.running.set(true);
    this.result.set('none');
    this.errorMessage='';
    try {
      await this.draftQueue;
      if(version!==this.generation || this.draftFailed)return;
      if (!this.attemptId) {
        const next=await firstValueFrom(this.service.startLabAttempt(lessonId));
        if(version!==this.generation)return;
        this.attemptId=next.attempt_id;
        this.revision=next.exercise.revision;
        this.submitted.set(false);
      }
      const attemptId=this.attemptId;
      const result=await firstValueFrom(this.service.runLabExercise(lessonId,attemptId,'1',{source_code,revision:this.revision}));
      if(version!==this.generation)return;
      this.revision=result.revision;
      this.tests.set(this.service.mapLabTests(result.test_results));
      this.activeTestId.set(this.tests()[0]?.id || '');
      this.result.set(result.passed?'pass':'fail');
      this.executionMs.set(result.execution_ms);
      this.recordSubmission(result, new Date().toISOString());
      this.testsOpen.set(true);
      this.hasNewResults.set(true);
      if (isSubmission) {
        const submitted=await firstValueFrom(this.service.submitLabAttempt(lessonId,attemptId));
        if(version!==this.generation)return;
        this.submitted.set(true);
        this.result.set(submitted.passed?'pass':'fail');
        this.attemptId='';
        try { await this.loadActivity(version); } catch { this.errorMessage='Đã nộp bài nhưng chưa tải lại được bảng xếp hạng.'; }
        this.activePanel.set('results');
        this.hasNewResults.set(false);
        this.completed.emit();
        // Submitted attempts are closed. A subsequent run must open a new workspace.
        this.attemptId='';
      }
    } catch { if(version===this.generation)this.errorMessage='Không chạy hoặc nộp được bài lab. Kết quả chưa được xác nhận; vui lòng mở lại để tải trạng thái mới nhất.'; }
    finally { if(version===this.generation)this.running.set(false); }
  }

  private recordSubmission(run: LabRunDto, submittedAt: string): void {
    const exercise = this.activeExercise;
    const now = new Date(submittedAt);
    const pad = (value: number) => value.toString().padStart(2, '0');
    const submission: LabSubmission = {
      id: run.run_id,
      submittedAt: `${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
      testsPassed: this.passedCount,
      testsTotal: this.tests().length,
      status: run.passed ? 'pass' : 'fail',
      execTime: `${run.execution_ms} ms`,
    };

    this.submissionsMap.update((map) => ({
      ...map,
      [exercise.id]: [submission, ...(map[exercise.id] ?? [])],
    }));
  }
}
