export type BlogStatus = 'draft' | 'published' | 'updated';
export type BlogReaction = 'like' | 'dislike' | 'none';
export interface BlogPost {
  id: string; title: string; slug: string; description: string; content: string;
  category: string; categoryId: string; author: string; authorAvatar?: string; date: string; readTime: string;
  coverImage: string; tags: string[]; views: number; topics?: string[]; status?: BlogStatus;
  ownerEmail?: string; updatedAt?: string; featuredContent?: string; seoTitle?: string;
  seoDescription?: string; keywords?: string[]; categories?: string[]; contentImages?: string[];
  commentsEnabled?: boolean; pinned?: boolean; showOnHome?: boolean;
}
export interface BlogCategory { id: string; label: string; }
export interface BlogTopic extends BlogCategory { count: number; }
export interface BlogListQuery { category?: string; topic?: string; search?: string; ownerEmail?: string; page: number; limit: number; }
export interface BlogListResponse { posts: BlogPost[]; total: number; hasMore: boolean; }
export interface BlogViewedArticle { id: string; title: string; coverImage: string; views: number | string; }
export type BlogRelatedArticle = Pick<BlogPost, 'id' | 'title' | 'coverImage' | 'readTime' | 'category'> & { categoryId?: string; };
export interface BlogSidebarData { popularTopics: BlogTopic[]; mostViewedArticles: BlogViewedArticle[]; }
export interface BlogNavigationPost { id: string; title: string; }
export interface BlogDetailResponse { post: BlogPost; prevPost: BlogNavigationPost | null; nextPost: BlogNavigationPost | null; relatedPosts: BlogRelatedArticle[]; userInteraction: BlogReaction | null; }
export interface BlogComment { id: string; authorName: string; content: string; createdAt: string; likesCount: number; authorAvatar?: string; }
export interface BlogAuthor { email: string; name: string; }
export interface BlogDraft {
  title: string; slug: string; content: string; featuredContent: string; seoTitle: string;
  seoDescription: string; keywords: string[]; categories: string[]; tags: string[]; summary: string;
  status: BlogStatus; commentsEnabled: boolean; pinned: boolean; showOnHome: boolean;
}
export interface BlogSaveRequest extends BlogDraft { id?: string; ownerEmail: string; author: string; coverImage: string; contentImages: string[]; }
export interface BlogSaveResponse { id: string; status: BlogStatus; }
export interface NewsletterResponse { success?: boolean; alreadySubscribed?: boolean; message?: string; }
