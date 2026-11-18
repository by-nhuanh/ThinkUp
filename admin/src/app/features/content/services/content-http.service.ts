import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ContentComment, ContentPost, ContentReport, ContentReview, ModerationLog, ReportSeverity } from '../models/content.models';
import { ContentStore } from './content.store';

type ApiPage = { items?: Array<Record<string, unknown>>; pagination?: { total?: number; pages?: number } };

/** Base HTTP adapter for the content handoff. Blog UI remains intentionally incomplete while another developer revises it. */
@Injectable()
export class ContentHttpService extends ContentStore {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/content`;
  private readonly postState = signal<ContentPost[]>([]);
  private readonly commentState = signal<ContentComment[]>([]);
  private readonly reviewState = signal<ContentReview[]>([]);
  private readonly reportState = signal<ContentReport[]>([]);
  private readonly logState = signal<ModerationLog[]>([]);
  private readonly errorState = signal(false);
  readonly posts = this.postState.asReadonly(); readonly comments = this.commentState.asReadonly();
  readonly reviews = this.reviewState.asReadonly(); readonly reports = this.reportState.asReadonly();
  readonly logs = this.logState.asReadonly(); readonly loadError = this.errorState.asReadonly();

  constructor() { super(); void this.load(); }

  retry(): void { void this.load(); }
  async load(): Promise<void> {
    this.errorState.set(false);
    try {
      const [posts, comments, reviews, reports] = await Promise.all([
        this.page('posts'), this.page('comments'), this.page('reviews'), this.page('reports')
      ]);
      this.postState.set(posts.map(toPost)); this.commentState.set(comments.map(toComment));
      this.reviewState.set(reviews.map(toReview)); this.reportState.set(reports.map(toReport));
    } catch { this.errorState.set(true); }
  }

  private async page(path: string): Promise<Array<Record<string, unknown>>> {
    const all: Array<Record<string, unknown>> = [];
    let page = 1; let pages = 1;
    do {
      const response = await firstValueFrom(this.http.get<ApiPage>(`${this.base}/${path}`, {
        params: new HttpParams().set('page', page).set('pageSize', 100)
      }));
      all.push(...(response.items ?? [])); pages = response.pagination?.pages ?? 1; page += 1;
    } while (page <= pages);
    return all;
  }

  updatePost(id: string, patch: Partial<ContentPost>, note: string): void { void this.postAction(id, patch, note); }
  createPost(post: ContentPost): void { void this.request('posts', 'POST', post); }
  removePosts(ids: string[]): void { void Promise.all(ids.map(id => this.postAction(id, { status: 'archived' }, 'Xóa bài viết'))); }
  updateComment(id: string, patch: Partial<ContentComment>, note: string): void { void this.commentAction(id, patch, note); }
  removeComments(ids: string[]): void { void Promise.all(ids.map(id => this.commentAction(id, { status: 'deleted' }, 'Xóa bình luận'))); }
  replyComment(id: string, content: string): void { void this.commentAction(id, { content }, 'Phản hồi bình luận'); }
  updateReview(id: string, patch: Partial<ContentReview>, note: string): void { void this.reviewAction(id, patch, note); }
  replyReview(id: string, content: string): void { void this.reviewAction(id, { content }, 'Phản hồi đánh giá'); }
  removeReviews(ids: string[]): void { void Promise.all(ids.map(id => this.reviewAction(id, { status: 'hidden' }, 'Xóa đánh giá'))); }
  updateReport(id: string, patch: Partial<ContentReport>, note: string): void { void this.request(`reports/${id}/resolve`, 'POST', { ...patch, note }); }
  // TODO(pre-deploy): backend chưa có API chuyển bình luận thành hồ sơ vi phạm; giữ luồng trong bộ nhớ như adapter demo.
  transferComment(id: string, severity: ReportSeverity, note: string): ContentReport | null {
    const comment = this.commentState().find(item => item.id === id);
    const trimmed = note.trim();
    if (!comment || trimmed.length < 15 || trimmed.length > 500) return null;
    if (comment.transferredReportId) return this.reportState().find(item => item.id === comment.transferredReportId) ?? null;
    const now = new Date();
    let sequence = Math.max(0, ...this.reportState().map(item => Number(item.code.split('-').at(-1)) || 0)) + 1;
    while (this.reportState().some(item => item.id === `VP-${sequence}`)) sequence += 1;
    const report: ContentReport = {
      id: `VP-${sequence}`, code: `RP-${now.getFullYear()}-${String(sequence).padStart(4, '0')}`,
      type: comment.contextType === 'course' ? 'Bình luận khóa học' : 'Bình luận Blog',
      targetId: comment.id, targetTitle: comment.contextTitle, targetAuthor: comment.author,
      priorOffenses: 0, reportedBy: 'Quản trị viên', reason: 'Chuyển từ kiểm duyệt bình luận',
      description: trimmed, evidenceSnippet: comment.content, severity, status: 'new',
      createdAt: now.toISOString(), slaDueAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      assignee: 'Chưa phân công', evidence: []
    };
    this.reportState.update(items => [report, ...items]);
    this.commentState.update(items => items.map(item => item.id === id
      ? { ...item, status: 'flagged', transferredReportId: report.id, moderationNote: trimmed } : item));
    return report;
  }
  reset(): void { void this.load(); }

  private async postAction(id: string, patch: Partial<ContentPost>, note: string): Promise<void> {
    const action = patch['status'] === 'archived' ? 'archive' : patch['status'] === 'hidden' ? 'hide' : patch['status'] === 'published' ? 'approve' : null;
    if (action) await this.request(`posts/${encodeURIComponent(id)}/${action}`, 'POST', { reason: note });
    else await this.request(`posts/${encodeURIComponent(id)}`, 'PATCH', patch);
    await this.load();
  }
  private async commentAction(id: string, patch: Record<string, unknown>, note: string): Promise<void> {
    const action = patch['status'] === 'deleted' ? 'remove' : patch['status'] === 'hidden' ? 'hide' : 'update';
    await this.request(`comments/${encodeURIComponent(id)}/${action}`, 'POST', { ...patch, reason: note, source: 'blog' });
    await this.load();
  }
  private async reviewAction(id: string, patch: Record<string, unknown>, note: string): Promise<void> {
    const action = patch['status'] === 'hidden' ? 'hide' : patch['content'] ? 'reply' : 'update';
    await this.request(`reviews/${encodeURIComponent(id)}/${action}`, 'POST', { ...patch, reason: note });
    await this.load();
  }
  private request(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<unknown> {
    return firstValueFrom(method === 'POST' ? this.http.post(`${this.base}/${path}`, body) : this.http.patch(`${this.base}/${path}`, body));
  }
}

const text = (row: Record<string, unknown>, ...keys: string[]): string => String(keys.map(key => row[key]).find(value => value != null) ?? '');
const num = (row: Record<string, unknown>, ...keys: string[]): number => Number(keys.map(key => row[key]).find(value => value != null) ?? 0);
function toPost(row: Record<string, unknown>): ContentPost { return { id: text(row, 'id'), title: text(row, 'title'), slug: text(row, 'slug'), category: text(row, 'category') as ContentPost['category'], author: text(row, 'author'), authorRole: 'Tác giả', tags: Array.isArray(row['tags']) ? row['tags'].map(String) : [], status: text(row, 'status') as ContentPost['status'] || 'published', excerpt: text(row, 'excerpt'), body: text(row, 'content').split('\n'), thumbnail: text(row, 'coverImage'), views: num(row, 'views'), commentCount: 0, createdAt: text(row, 'createdAt'), updatedAt: text(row, 'updatedAt'), featured: false, pinned: Boolean(row['pinned']), allowComments: row['allowComments'] !== false, loginRequired: Boolean(row['loginRequired']) }; }
function toComment(row: Record<string, unknown>): ContentComment { return { id: text(row, 'id'), postId: text(row, 'postId'), postTitle: text(row, 'contextTitle'), contextTitle: text(row, 'contextTitle'), contextType: row['source'] === 'blog' ? 'blog' : 'course', author: text(row, 'author'), authorRole: 'Học viên', email: '', content: text(row, 'content'), status: text(row, 'status') as ContentComment['status'] || 'visible', safety: 'clean', reportCount: num(row, 'reportCount'), likeCount: 0, replyCount: 0, createdAt: text(row, 'createdAt') }; }
function toReview(row: Record<string, unknown>): ContentReview { return { id: text(row, 'id'), courseId: text(row, 'courseId'), courseTitle: text(row, 'courseTitle'), instructor: text(row, 'instructor'), learner: text(row, 'learner'), learnerEmail: '', completion: 0, rating: num(row, 'rating'), nps: num(row, 'nps'), feedbackTags: [], title: text(row, 'title'), content: text(row, 'content'), status: text(row, 'status') as ContentReview['status'] || 'approved', helpfulCount: num(row, 'helpfulCount'), reportCount: num(row, 'reportCount'), createdAt: text(row, 'createdAt') }; }
function toReport(row: Record<string, unknown>): ContentReport { return { id: text(row, 'id'), code: text(row, 'code'), type: text(row, 'type') as ContentReport['type'], targetId: text(row, 'targetId'), targetTitle: text(row, 'targetTitle'), targetAuthor: text(row, 'targetAuthor'), priorOffenses: 0, reportedBy: text(row, 'reportedBy'), reason: text(row, 'reason'), description: text(row, 'description'), evidenceSnippet: text(row, 'evidenceSnippet'), severity: text(row, 'severity') as ContentReport['severity'] || 'medium', status: text(row, 'status') as ContentReport['status'] || 'new', createdAt: text(row, 'createdAt'), slaDueAt: text(row, 'slaDueAt'), assignee: text(row, 'assignee'), evidence: [] }; }
