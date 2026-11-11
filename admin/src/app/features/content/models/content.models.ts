export type PostStatus = 'published' | 'draft' | 'pending' | 'revision' | 'rejected' | 'scheduled' | 'hidden' | 'archived';

export type ContentCategory = 'Lập trình cơ bản' | 'Web Development' | 'Backend' | 'DevOps' | 'Thuật toán' | 'Kinh nghiệm' | 'Tài nguyên';

export type AuthorRole = 'Admin' | 'Giảng viên' | 'Học viên' | 'Tác giả' | 'Biên tập viên' | 'Cộng tác viên';

export interface ContentPost {
  id: string;
  title: string;
  slug: string;
  category: ContentCategory;
  author: string;
  authorRole: AuthorRole;
  tags: string[];
  status: PostStatus;
  excerpt: string;
  body: string[];
  thumbnail: string;
  views: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string;
  rejectionReason?: string;
  moderationNote?: string;
  featured: boolean;
  pinned: boolean;
  callout?: string;
  seoTitle?: string;
  seoDescription?: string;
  allowComments?: boolean;
  loginRequired?: boolean;
}

export type CommentStatus = 'visible' | 'pending' | 'hidden' | 'flagged' | 'spam' | 'deleted';

export type CommentSource = 'course' | 'blog';

export interface ContentComment {
  id: string;
  postId: string;
  postTitle: string;
  contextTitle: string;
  contextType: CommentSource;
  author: string;
  authorRole: AuthorRole;
  email: string;
  content: string;
  status: CommentStatus;
  safety: 'clean' | 'reported' | 'blocked';
  reportCount: number;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  parentId?: string;
  moderationNote?: string;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export interface ContentReview {
  id: string;
  courseId: string;
  courseTitle: string;
  instructor: string;
  learner: string;
  learnerEmail: string;
  completion: number;
  rating: number;
  nps: number;
  feedbackTags: string[];
  title: string;
  content: string;
  status: ReviewStatus;
  helpfulCount: number;
  reportCount: number;
  createdAt: string;
  reply?: { content: string; by: string; at: string };
  rejectionReason?: string;
}

export type ReportStatus = 'new' | 'processing' | 'resolved' | 'dismissed' | 'escalated';
export type ReportType = 'Bình luận khóa học' | 'Bài viết' | 'Bình luận Blog' | 'Đánh giá';
export type ReportSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ContentReport {
  id: string;
  code: string;
  type: ReportType;
  targetId: string;
  targetTitle: string;
  targetAuthor: string;
  priorOffenses: number;
  reportedBy: string;
  reason: string;
  description: string;
  evidenceSnippet: string;
  severity: ReportSeverity;
  status: ReportStatus;
  createdAt: string;
  slaDueAt: string;
  assignee: string;
  evidence: string[];
  resolutionNote?: string;
  resolvedAt?: string;
}

export interface ModerationLog {
  id: string;
  entity: string;
  action: string;
  actor: string;
  at: string;
  note?: string;
}

export interface ContentStats {
  postsTotal: number;
  postsPublished: number;
  postsPending: number;
  postsHidden: number;
  commentsTotal: number;
  commentsPending: number;
  commentsHidden: number;
  reviewsTotal: number;
  reviewsPending: number;
  reviewsAverage: number;
  reportsOpen: number;
  reportsOverdue: number;
}

export interface ContentDataSource {
  posts: ContentPost[];
  comments: ContentComment[];
  reviews: ContentReview[];
  reports: ContentReport[];
  logs: ModerationLog[];

  updatePost(id: string, patch: Partial<ContentPost>, note: string): void;
  createPost(post: ContentPost): void;
  removePosts(ids: string[]): void;
  updateComment(id: string, patch: Partial<ContentComment>, note: string): void;
  removeComments(ids: string[]): void;
  replyComment(id: string, content: string, actor: string): void;
  updateReview(id: string, patch: Partial<ContentReview>, note: string): void;
  replyReview(id: string, content: string, actor: string): void;
  removeReviews(ids: string[]): void;
  updateReport(id: string, patch: Partial<ContentReport>, note: string): void;
  reset(): void;
}
