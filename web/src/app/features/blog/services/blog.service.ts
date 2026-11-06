import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { from, map, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BLOG_DATA_SOURCE, BlogDataSource } from './blog-data-source';
import { BlogAuthor, BlogCategory, BlogComment, BlogDetailResponse, BlogListQuery, BlogListResponse, BlogPost, BlogReaction, BlogSaveRequest, BlogSaveResponse, BlogSidebarData, NewsletterResponse } from '../models/blog.model';
import { AuthService } from '../../../core/services/auth.service';

// Backend payloads are normalized here so components keep a stable model.
type BlogPostPayload = Omit<BlogPost, 'id' | 'views'> & { id: string | number; views: number | string; summary?: string; publishedDate?: string; author_avatar?: string; };
function mapPost(post: BlogPostPayload): BlogPost {
  return { ...post, id: String(post.id), description: post.description ?? post.summary ?? '', date: post.date ?? post.publishedDate ?? '', views: typeof post.views === 'number' ? post.views : Number.parseInt(post.views, 10) || 0, coverImage: post.coverImage || '/assets/blog/article-1.jpg', tags: post.tags ?? [], content: post.content ?? '', authorAvatar: post.authorAvatar || post.author_avatar };
}
@Injectable({ providedIn: 'root' })
export class HttpBlogDataSource implements BlogDataSource {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;
  list(query: BlogListQuery) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params = params.set(key, String(value));
    const path = query.ownerEmail ? '/blog/manage/posts' : '/blog';
    return this.http.get<Omit<BlogListResponse, 'posts'> & { posts: BlogPostPayload[] }>(`${this.base}${path}`, { params, withCredentials: true }).pipe(map(result => ({ ...result, posts: result.posts.map(mapPost) })));
  }
  categories() { return this.http.get<{ topics: BlogCategory[] }>(`${this.base}/blog/topics/popular`).pipe(map(result => [{ id: 'all', label: 'Tất cả' }, ...result.topics])); }
  sidebar() { return this.http.get<BlogSidebarData>(`${this.base}/blog/sidebar`).pipe(map(result => ({ ...result, mostViewedArticles: result.mostViewedArticles.map(post => ({ ...post, id: String(post.id) })) }))); }
  detail(id: string) { return this.http.get<Omit<BlogDetailResponse, 'post'> & { post: BlogPostPayload }>(`${this.base}/blog/${encodeURIComponent(id)}`, { withCredentials: true }).pipe(map(result => ({ ...result, post: mapPost(result.post) }))); }
  comments(id: string) { return this.http.get<{ comments: BlogComment[] }>(`${this.base}/blog/${encodeURIComponent(id)}/comments`).pipe(map(result => result.comments.map(comment => ({ ...comment, id: String(comment.id) })))); }
  addComment(id: string, authorName: string, content: string) { return this.http.post<{ comment: BlogComment }>(`${this.base}/blog/${encodeURIComponent(id)}/comments`, { authorName, content }, { withCredentials: true }).pipe(map(result => result.comment)); }
  react(id: string, action: BlogReaction) { return this.http.post(`${this.base}/blog/${encodeURIComponent(id)}/like`, { action }, { withCredentials: true }); }
  save(request: BlogSaveRequest) {
    const isDraft = !request.id && request.status === 'draft';
    const url = request.id
      ? `${this.base}/blog/${encodeURIComponent(request.id)}`
      : isDraft ? `${this.base}/blog/draft` : `${this.base}/blog`;
    const call = request.id
      ? this.http.put<BlogSaveResponse>(url, request, { withCredentials: true })
      : this.http.post<BlogSaveResponse>(url, request, { withCredentials: true });
    return call.pipe(map(result => ({ ...result, id: String(result.id) })));
  }
  upload(file: File, type: 'thumbnail' | 'content' = 'thumbnail') {
    const encoded = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không thể đọc ảnh.'));
      reader.onerror = () => reject(new Error('Không thể đọc ảnh.'));
      reader.readAsDataURL(file);
    });
    return from(encoded).pipe(switchMap(base64 => this.http.post<{ url: string }>(`${this.base}/blog/upload`, {
      base64, fileName: file.name, sizeBytes: file.size, type,
    }, { withCredentials: true })), map(result => result.url));
  }
  subscribe(email: string) { return this.http.post<NewsletterResponse>(`${this.base}/blog/newsletter`, { email }); }
}
@Injectable({ providedIn: 'root' })
export class BlogService {
  private readonly source = inject(BLOG_DATA_SOURCE, { optional: true }) ?? inject(HttpBlogDataSource);
  private readonly auth = inject(AuthService);
  list(query: BlogListQuery) { return this.source.list(query); }
  categories() { return this.source.categories(); }
  sidebar() { return this.source.sidebar(); }
  detail(id: string) { return this.source.detail(id); }
  comments(id: string) { return this.source.comments(id); }
  addComment(id: string, authorName: string, content: string) { return this.source.addComment(id, authorName, content); }
  react(id: string, action: BlogReaction) { return this.source.react(id, action); }
  save(request: BlogSaveRequest) { return this.source.save(request); }
  upload(file: File, type?: 'thumbnail' | 'content') { return this.source.upload(file, type); }
  subscribe(email: string) { return this.source.subscribe(email); }
  currentAuthor(): BlogAuthor | null {
    if (!this.auth.isAuthenticated()) return null;
    const user = this.auth.currentUser();
    return user?.email ? { email: user.email.toLowerCase(), name: user.full_name || user.email } : null;
  }
}
