/** P3 — Admin notifications shared between transport, service and panel. */

export type AdminNotificationType =
  | 'security'
  | 'order'
  | 'ticket'
  | 'complaint'
  | 'payout'
  | 'course';

export type AdminNotificationSeverity = 'info' | 'warning' | 'critical';

export interface AdminNotificationItem {
  id: string;
  type: AdminNotificationType;
  severity: AdminNotificationSeverity;
  title: string;
  message: string;
  href: string | null;
  eventKey: string;
  createdAt: string;
  createdAtLocal: string | null;
  readAt: string | null;
}

export interface AdminNotificationTypeSummary {
  total: number;
  unread: number;
}

export interface AdminNotificationSummary {
  total: number;
  unread: number;
  read: number;
  byType: Record<AdminNotificationType, AdminNotificationTypeSummary>;
}

export interface AdminNotificationPage {
  items: AdminNotificationItem[];
  pageSize: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface AdminNotificationListQuery {
  limit?: number;
  cursor?: string | null;
  type?: AdminNotificationType | 'all';
  unread?: boolean;
}

export const EMPTY_NOTIFICATION_SUMMARY: AdminNotificationSummary = {
  total: 0,
  unread: 0,
  read: 0,
  byType: {
    security: { total: 0, unread: 0 },
    order: { total: 0, unread: 0 },
    ticket: { total: 0, unread: 0 },
    complaint: { total: 0, unread: 0 },
    payout: { total: 0, unread: 0 },
    course: { total: 0, unread: 0 }
  }
};

export const NOTIFICATION_TYPE_LABELS: Record<AdminNotificationType, string> = {
  security: 'Bảo mật',
  order: 'Đơn hàng',
  ticket: 'Hỗ trợ',
  complaint: 'Khiếu nại',
  payout: 'Chi trả',
  course: 'Khóa học'
};

export const NOTIFICATION_PAGE_SIZE = 20;
