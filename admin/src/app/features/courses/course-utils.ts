import { ApprovalStatus, CourseLevel, CourseStatus, LessonKind, RoadmapNodeType } from './models/course.models';

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  published: 'Đang xuất bản',
  pending: 'Chờ duyệt',
  hidden: 'Tạm ẩn',
  archived: 'Đã lưu trữ'
};

export const COURSE_STATUS_TONE: Record<CourseStatus, string> = {
  published: 'success',
  pending: 'pending',
  hidden: 'warning',
  archived: 'neutral'
};

export const LEVEL_TONE: Record<CourseLevel, string> = {
  'Cơ bản': 'info',
  'Trung cấp': 'pending',
  'Nâng cao': 'danger'
};

export const APPROVAL_SLA_LABELS: Record<ApprovalStatus, string> = {
  overdue: 'Quá hạn',
  'due-soon': 'Sắp hạn',
  remaining: 'Còn lại',
  waiting: 'Chờ GV sửa',
  approved: 'Đã duyệt'
};

export const APPROVAL_SLA_TONE: Record<ApprovalStatus, string> = {
  overdue: 'danger',
  'due-soon': 'pending',
  remaining: 'info',
  waiting: 'warning',
  approved: 'success'
};

export const ROADMAP_NODE_TYPES: RoadmapNodeType[] = ['Framework', 'Ngôn ngữ', 'Công cụ', 'Kỹ năng', 'Dự án'];

export const LESSON_ICON: Record<LessonKind, string> = {
  video: '▶',
  reading: '≡',
  quiz: '?',
  ide: '⌘',
  doc: '▤'
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'decimal', maximumFractionDigits: 0 }).format(value) + ' ₫';
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Page numbers with ellipsis markers, sized for a compact admin pagination bar. */
export function paginationRange(page: number, pages: number): Array<number | '...'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '...', pages];
  if (page >= pages - 3) return [1, '...', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, '...', page - 1, page, page + 1, '...', pages];
}

export function countChars(value: string): number {
  return [...value.trim()].length;
}

export function courseStatusLabel(status: CourseStatus): string {
  return COURSE_STATUS_LABELS[status];
}
