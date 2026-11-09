import { CommentStatus, PostStatus, ReportSeverity, ReportStatus, ReviewStatus } from './models/content.models';

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  published: 'Đã xuất bản', draft: 'Bản nháp', pending: 'Chờ duyệt', revision: 'Cần chỉnh sửa',
  rejected: 'Bị từ chối', scheduled: 'Đã lên lịch', hidden: 'Tạm ẩn', archived: 'Lưu trữ'
};

export const POST_STATUS_TONE: Record<PostStatus, string> = {
  published: 'success', draft: 'neutral', pending: 'pending', revision: 'pending',
  rejected: 'danger', scheduled: 'info', hidden: 'neutral', archived: 'neutral'
};

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  visible: 'Hiển thị', pending: 'Chờ duyệt', hidden: 'Đã ẩn', flagged: 'Bị báo cáo', spam: 'Spam', deleted: 'Đã xóa'
};

export const COMMENT_STATUS_TONE: Record<CommentStatus, string> = {
  visible: 'success', pending: 'pending', hidden: 'neutral', flagged: 'pending', spam: 'danger', deleted: 'neutral'
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Chờ duyệt', approved: 'Công khai', rejected: 'Bị từ chối', hidden: 'Tạm ẩn'
};

export const REVIEW_STATUS_TONE: Record<ReviewStatus, string> = {
  pending: 'pending', approved: 'success', rejected: 'danger', hidden: 'neutral'
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  new: 'Chờ xử lý', processing: 'Đang điều tra', resolved: 'Đã giải quyết', dismissed: 'Bác bỏ', escalated: 'Đã leo thang'
};

export const REPORT_STATUS_TONE: Record<ReportStatus, string> = {
  new: 'pending', processing: 'info', resolved: 'success', dismissed: 'neutral', escalated: 'danger'
};

export const SEVERITY_LABELS: Record<ReportSeverity, string> = {
  low: 'Thấp', medium: 'Trung bình', high: 'Cao', critical: 'Khẩn cấp'
};

export const SEVERITY_TONE: Record<ReportSeverity, string> = {
  low: 'neutral', medium: 'info', high: 'pending', critical: 'danger'
};

export const ROLE_TONE: Record<string, string> = {
  Admin: 'info', 'Giảng viên': 'success', 'Học viên': 'info', 'Tác giả': 'info',
  'Biên tập viên': 'neutral', 'Cộng tác viên': 'neutral'
};

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function relativeTime(value: string): string {
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return formatDate(value);
}

export function ratingLabel(rating: number): string {
  if (rating <= 1) return 'Rất kém';
  if (rating < 3) return 'Chưa tốt';
  if (rating < 4) return 'Trung bình';
  if (rating < 5) return 'Rất tốt';
  return 'Xuất sắc';
}

export function npsBand(nps: number): string {
  if (nps >= 9) return 'Ủng hộ';
  if (nps >= 7) return 'Trung lập';
  return 'Phản đối';
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** Page numbers with ellipsis markers, sized for a compact admin pagination bar. */
export function paginationRange(page: number, pages: number): Array<number | '...'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '...', pages];
  if (page >= pages - 3) return [1, '...', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, '...', page - 1, page, page + 1, '...', pages];
}

export function number(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}
