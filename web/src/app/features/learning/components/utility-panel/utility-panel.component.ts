import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
export class UtilityPanelComponent implements OnChanges {
  @Input({ required: true }) course!: LearningCourse;
  @Input({ required: true }) lesson!: LearningLesson;
  @Input() activeTab: UtilityTab = 'overview';
  @Input() resources: LearningResource[] = [];
  @Input() qaPosts: CommunityPost[] = [];
  @Input() discussionPosts: CommunityPost[] = [];

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

  readonly goals = [
    'Nắm vững kiến thức nền tảng và nâng cao của Python',
    'Áp dụng kiến thức vào dự án thực tế',
    'Nhận biết và xử lý các lỗi phổ biến',
    'Tự tin làm bài kiểm tra và phỏng vấn',
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['qaPosts']) this.questions = [...this.qaPosts];
    if (changes['discussionPosts']) this.discussions = [...this.discussionPosts];
  }

  selectTab(tab: UtilityTab): void {
    this.tabChange.emit(tab);
  }

  submitQuestion(): void {
    const body = this.questionDraft.trim();
    if (!body) return;
    this.questions = [
      ...this.questions,
      {
        id: `qa-${Date.now()}`,
        author: 'Bạn',
        initials: 'B',
        body,
        createdAt: 'Vừa xong',
        likes: 0,
        replies: [],
      },
    ];
    this.questionDraft = '';
  }

  submitComment(): void {
    const body = this.commentDraft.trim();
    if (!body) return;
    this.discussions = [
      ...this.discussions,
      {
        id: `d-${Date.now()}`,
        author: 'Bạn',
        initials: 'B',
        role: 'Học viên',
        body,
        createdAt: 'Vừa xong',
        likes: 0,
        replies: [],
      },
    ];
    this.commentDraft = '';
  }

  startReply(post: CommunityPost): void {
    this.replyingToId = this.replyingToId === post.id ? null : post.id;
    this.replyDraft = '';
  }

  submitReply(post: CommunityPost): void {
    const body = this.replyDraft.trim();
    if (!body) return;
    const reply = {
      id: `r-${Date.now()}`,
      author: 'Bạn',
      initials: 'B',
      role: 'Học viên',
      body,
      createdAt: 'Vừa xong',
      likes: 0,
    };
    this.discussions = this.discussions.map((item) =>
      item.id === post.id ? { ...item, replies: [...item.replies, reply] } : item
    );
    this.replyDraft = '';
    this.replyingToId = null;
  }

  toggleLike(post: CommunityPost): void {
    this.discussions = this.discussions.map((item) =>
      item.id === post.id
        ? { ...item, liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) }
        : item
    );
  }

  downloadResource(resource: LearningResource): void {
    const blob = new Blob([`${resource.title}\nTài liệu mẫu của khóa ${this.course.title}.`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${resource.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
