import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Observable, Subscription, finalize } from 'rxjs';
import { LearningService } from '../../services/learning.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../../core/services/auth.service';
import { FormsModule } from '@angular/forms';
import {
  LucideCheck,
  LucideChevronDown,
  LucideFileDown,
  LucideFileText,
  LucideFlag,
  LucideGlobe,
  LucideLock,
  LucideMessageSquare,
  LucideSend,
  LucideThumbsUp,
} from '@lucide/angular';
import {
  CommunityPost,
  LearningCourse,
  LearningLesson,
  LearningResource,
  UtilityTab,
} from '../../models/learning.model';

@Component({
  selector: 'app-utility-panel',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    LucideCheck,
    LucideChevronDown,
    LucideFileDown,
    LucideFileText,
    LucideFlag,
    LucideGlobe,
    LucideLock,
    LucideMessageSquare,
    LucideSend,
    LucideThumbsUp,
  ],
  templateUrl: './utility-panel.component.html',
})
export class UtilityPanelComponent implements OnChanges, OnDestroy {
  readonly currentUser = inject(AuthService).currentUser;
  get myInitials(): string { return (this.currentUser()?.full_name || 'Bạn').split(/\s+/).slice(-2).map(part => part[0]).join(''); }
  private readonly api = inject(LearningService);
  private readonly toast = inject(ToastService);
  private requests = new Subscription();
  private loadedCourseId = '';
  private readonly pending = new Set<string>();
  @Input({ required: true }) course!: LearningCourse;
  @Input({ required: true }) lesson!: LearningLesson;
  @Input() activeTab: UtilityTab = 'overview';
  @Input() resources: LearningResource[] = [];
  @Input() qaPosts: CommunityPost[] = [];
  @Input() discussionPosts: CommunityPost[] = [];
  @Input() discussionRestrictedUntil?: string;

  get discussionRestricted(): boolean {
    const until = this.discussionRestrictedUntil;
    if (!until) return false;
    const time = new Date(until).getTime();
    return Number.isFinite(time) ? time > Date.now() : true;
  }

  @Output() tabChange = new EventEmitter<UtilityTab>();
  @Output() reportRequested = new EventEmitter<CommunityPost>();

  questionDraft = '';
  commentDraft = '';
  replyDraft = '';
  replyingToId: string | null = null;

  questions: CommunityPost[] = [];
  discussions: CommunityPost[] = [];

  readonly tabs: { id: UtilityTab; label: string }[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'resources', label: 'Tài liệu' },
    { id: 'qa', label: 'Hỏi đáp' },
    { id: 'discussion', label: 'Thảo luận' },
  ];

  goals: string[] = [];
  private courseResources: LearningResource[] = [];

  private filterResources(): void {
    this.resources = this.courseResources.filter(resource => resource.lessonId === this.lesson.id);
  }

  isTabLocked(tab: UtilityTab): boolean {
    return tab !== 'overview' && this.course?.isPurchased !== true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lesson']) this.filterResources();
    if (changes['qaPosts']) this.questions = [...this.qaPosts];
    if (changes['discussionPosts']) this.discussions = [...this.discussionPosts];
    const accessKey = `${this.course?.id}:${this.course?.isPurchased === true}`;
    if (this.course?.id && this.loadedCourseId !== accessKey) {
      this.loadedCourseId = accessKey;
      this.requests.unsubscribe();
      this.requests = new Subscription();
      this.questions = []; this.discussions = []; this.resources = []; this.goals = [];
      this.questionDraft = ''; this.commentDraft = ''; this.replyDraft = ''; this.replyingToId = null;
      this.perform('overview', this.api.getOverview(this.course.id), data => {
        this.goals = data.what_you_will_learn;
        this.course = { ...this.course, description: data.introduction.description };
      });
      if (this.course.isPurchased === true) {
        this.perform('resources', this.api.loadResources(this.course.id), data => { this.courseResources = data; this.filterResources(); });
        this.perform('discussions', this.api.getCommunity(this.course.id, 'discussion'), data => this.discussions = data);
        this.perform('questions', this.api.getCommunity(this.course.id, 'qa'), data => this.questions = data);
      }
    }
  }

  ngOnDestroy(): void { this.requests.unsubscribe(); }

  private perform<T>(key: string, request: Observable<T>, done: (data: T) => void): void {
    if (key !== 'overview' && this.course?.isPurchased !== true) return;
    if (this.pending.has(key)) return;
    this.pending.add(key);
    const courseId = this.course.id;
    this.requests.add(request.pipe(finalize(() => this.pending.delete(key))).subscribe({
      next: data => { if (this.course.id === courseId) done(data); },
      error: () => this.toast.showToast({ type: 'warning', message: 'Không thực hiện được thao tác học tập. Vui lòng thử lại.' }),
    }));
  }

  selectTab(tab: UtilityTab): void {
    if (this.isTabLocked(tab)) return;
    this.tabChange.emit(tab);
  }

  submitQuestion(): void {
    const body = this.questionDraft.trim();
    if (!body) return;
    this.perform('question-write', this.api.createCommunity(this.course.id, 'qa', body, this.lesson.id), data => {
      this.questions = data; this.questionDraft = '';
    });
  }

  submitComment(): void {
    const body = this.commentDraft.trim();
    if (!body) return;
    this.perform('discussion-write', this.api.createCommunity(this.course.id, 'discussion', body, this.lesson.id), data => {
      this.discussions = data; this.commentDraft = '';
    });
  }

  startReply(post: CommunityPost): void {
    if (this.course?.isPurchased !== true) return;
    this.replyingToId = this.replyingToId === post.id ? null : post.id;
    this.replyDraft = '';
  }

  submitReply(post: CommunityPost): void {
    const body = this.replyDraft.trim();
    if (!body) return;
    this.perform('discussion-write', this.api.createCommunity(this.course.id, 'discussion', body, this.lesson.id, post.id), data => {
      this.discussions = data; this.replyDraft = ''; this.replyingToId = null;
    });
  }

  toggleLike(post: CommunityPost): void {
    this.perform('like:' + post.id, this.api.likeDiscussion(post.id), data => {
      this.discussions = this.discussions.map(item => item.id === post.id ? { ...item, liked: data.is_liked, likes: data.likes_count } : item);
    });
  }

  downloadResource(resource: LearningResource): void {
    this.perform('download:' + resource.id, this.api.downloadDocument(resource.id), () => undefined);
  }
}
