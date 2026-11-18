import { Injectable, signal } from '@angular/core';
import {
  MOCK_CONTENT_COMMENTS,
  MOCK_CONTENT_LOGS,
  MOCK_CONTENT_POSTS,
  MOCK_CONTENT_REPORTS,
  MOCK_CONTENT_REVIEWS
} from '../../../core/data/mock/content.mock';
import { ContentComment, ContentPost, ContentReport, ContentReview, ModerationLog, ReportSeverity } from '../models/content.models';
import { ContentStore } from './content.store';

// TODO(pre-deploy): Nhớ thay ContentDemoService bằng adapter HTTP khi backend cung cấp API quản lý nội dung.
@Injectable()
export class ContentDemoService extends ContentStore {
  private readonly postState = signal<ContentPost[]>(clone(MOCK_CONTENT_POSTS));
  private readonly commentState = signal<ContentComment[]>(clone(MOCK_CONTENT_COMMENTS));
  private readonly reviewState = signal<ContentReview[]>(clone(MOCK_CONTENT_REVIEWS));
  private readonly reportState = signal<ContentReport[]>(clone(MOCK_CONTENT_REPORTS));
  private readonly logState = signal<ModerationLog[]>(clone(MOCK_CONTENT_LOGS));
  private readonly errorState = signal(readDemoLoadError());

  readonly posts = this.postState.asReadonly();
  readonly comments = this.commentState.asReadonly();
  readonly reviews = this.reviewState.asReadonly();
  readonly reports = this.reportState.asReadonly();
  readonly logs = this.logState.asReadonly();
  readonly loadError = this.errorState.asReadonly();

  retry(): void {
    this.errorState.set(false);
  }

  updatePost(id: string, patch: Partial<ContentPost>, note: string): void {
    this.postState.update(items => items.map(item => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
    this.log(`Bài viết ${id}`, patch.status ? statusAction(patch.status) : 'Cập nhật', note);
  }

  createPost(post: ContentPost): void {
    this.postState.update(items => [post, ...items]);
    this.log(`Bài viết ${post.id}`, 'Tạo mới', 'Tạo bài viết ở trạng thái ' + statusAction(post.status) + '.');
  }

  removePosts(ids: string[]): void {
    this.postState.update(items => items.filter(item => !ids.includes(item.id)));
    ids.forEach(id => this.log(`Bài viết ${id}`, 'Xóa', 'Xóa vĩnh viễn bài viết khỏi hệ thống.'));
  }

  updateComment(id: string, patch: Partial<ContentComment>, note: string): void {
    this.commentState.update(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
    this.log(`Bình luận ${id}`, patch.status === 'hidden' ? 'Ẩn' : patch.status === 'visible' ? 'Hiện lại' : 'Cập nhật', note);
  }

  removeComments(ids: string[], reason: string): void {
    this.commentState.update(items => items.filter(item => !ids.includes(item.id)));
    ids.forEach(id => this.log(`Bình luận ${id}`, 'Xóa', `Xóa vĩnh viễn: ${reason}`));
  }

  replyComment(id: string, content: string, actor: string): void {
    this.commentState.update(items => items.map(item => item.id === id ? { ...item, replyCount: item.replyCount + 1 } : item));
    this.log(`Bình luận ${id}`, 'Phản hồi', `${actor}: ${content}`);
  }

  updateReview(id: string, patch: Partial<ContentReview>, note: string): void {
    this.reviewState.update(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
    this.log(`Đánh giá ${id}`, patch.status ? statusAction(patch.status) : 'Cập nhật', note);
  }

  replyReview(id: string, content: string, actor: string): void {
    this.reviewState.update(items => items.map(item => item.id === id
      ? { ...item, reply: { content, by: actor, at: new Date().toISOString() } }
      : item));
    this.log(`Đánh giá ${id}`, 'Phản hồi', `${actor}: ${content}`);
  }

  removeReviews(ids: string[]): void {
    this.reviewState.update(items => items.filter(item => !ids.includes(item.id)));
    ids.forEach(id => this.log(`Đánh giá ${id}`, 'Xóa', 'Xóa đánh giá vi phạm tiêu chuẩn.'));
  }

  updateReport(id: string, patch: Partial<ContentReport>, note: string): void {
    const resolved = patch.status === 'resolved' || patch.status === 'dismissed';
    this.reportState.update(items => items.map(item => item.id === id
      ? {
          ...item,
          ...patch,
          resolutionNote: resolved ? note : item.resolutionNote,
          resolvedAt: resolved ? new Date().toISOString() : item.resolvedAt
        }
      : item));
    this.log(`Báo cáo ${id}`, patch.status ? statusAction(patch.status) : 'Cập nhật', note);
  }

  // TODO(pre-deploy): Nhớ thay bàn giao demo bằng API tạo hồ sơ và chuyển hàng đợi nguyên tử.
  transferComment(id: string, severity: ReportSeverity, note: string): ContentReport | null {
    const comment = this.commentState().find(item => item.id === id);
    if (!comment || note.trim().length < 15 || note.trim().length > 500) return null;
    if (comment.transferredReportId) {
      return this.reportState().find(item => item.id === comment.transferredReportId) ?? null;
    }
    const now = new Date();
    let sequence = Math.max(0, ...this.reportState().map(item => Number(item.code.split('-').at(-1)) || 0)) + 1;
    while (this.reportState().some(item => item.id === `VP-${sequence}`)) sequence += 1;
    const report: ContentReport = {
      id: `VP-${sequence}`, code: `RP-${now.getFullYear()}-${String(sequence).padStart(4, '0')}`,
      type: comment.contextType === 'course' ? 'Bình luận khóa học' : 'Bình luận Blog',
      targetId: comment.id, targetTitle: comment.contextTitle, targetAuthor: comment.author,
      priorOffenses: 0, reportedBy: 'Quản trị viên', reason: 'Chuyển từ kiểm duyệt bình luận',
      description: note.trim(), evidenceSnippet: comment.content, severity, status: 'new',
      createdAt: now.toISOString(), slaDueAt: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      assignee: 'Chưa phân công', evidence: []
    };
    this.reportState.update(items => [report, ...items]);
    this.commentState.update(items => items.map(item => item.id === id
      ? { ...item, status: 'flagged', transferredReportId: report.id, moderationNote: note.trim() } : item));
    this.log(`Báo cáo ${report.id}`, 'Chuyển hồ sơ', `${comment.id} → ${report.code}: ${note.trim()}`);
    return report;
  }

  reset(): void {
    this.postState.set(clone(MOCK_CONTENT_POSTS));
    this.commentState.set(clone(MOCK_CONTENT_COMMENTS));
    this.reviewState.set(clone(MOCK_CONTENT_REVIEWS));
    this.reportState.set(clone(MOCK_CONTENT_REPORTS));
    this.logState.set(clone(MOCK_CONTENT_LOGS));
  }

  private log(entity: string, action: string, note: string): void {
    this.logState.update(items => [{
      id: `LOG-${Date.now()}-${items.length}`,
      entity,
      action,
      actor: 'Quản trị viên',
      at: new Date().toISOString(),
      note
    }, ...items].slice(0, 40));
  }
}

function statusAction(status: string): string {
  const map: Record<string, string> = {
    published: 'Xuất bản', draft: 'Lưu nháp', pending: 'Gửi duyệt', rejected: 'Từ chối',
    scheduled: 'Lên lịch', hidden: 'Ẩn', archived: 'Lưu trữ', visible: 'Hiện lại',
    approved: 'Duyệt', resolved: 'Xử lý xong', dismissed: 'Bỏ qua', escalated: 'Leo thang',
    processing: 'Tiếp nhận', new: 'Mở lại', deleted: 'Xóa'
  };
  return map[status] ?? 'Cập nhật';
}

// TODO(pre-deploy): Nhớ xóa cờ demo ?contentError=1 khi nối API thật, lỗi sẽ lấy từ HTTP response.
function readDemoLoadError(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('contentError') === '1';
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
