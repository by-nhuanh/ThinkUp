/**
 * Mô hình dữ liệu dùng chung cho Trung tâm thông báo (Figma section "thông báo" - 3188:19571).
 * Dùng chung giữa service lõi, popover trên header và trang Trung tâm thông báo.
 */

/** Ba nhóm thông báo tương ứng 3 tab chuyên đề trong thiết kế. */
export type NotificationCategory = 'learning' | 'transactions' | 'security';

/** Loại chi tiết của từng bản ghi - quyết định icon và nhãn badge của dòng. */
export type NotificationKind =
  | 'progress'
  | 'milestone'
  | 'reminder'
  | 'quiz'
  | 'certificate'
  | 'course-update'
  | 'achievement'
  | 'purchase'
  | 'payment'
  | 'promotion'
  | 'voucher'
  | 'refund'
  | 'login'
  | 'password'
  | 'email'
  | 'system'
  | 'alert'
  | 'backup';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  kind: NotificationKind;
  title: string;
  message: string;
  /** ISO timestamp. */
  createdAt: string;
  /** null = chưa đọc. */
  readAt: string | null;
  /** Đích đến khi bấm vào dòng thông báo. */
  href?: string;
}

/** Dữ liệu tối thiểu để tạo một thông báo mới (dùng cho các luồng khác trong app). */
export interface NotificationInput {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  href?: string;
  category?: NotificationCategory;
  kind?: NotificationKind;
  readAt?: string | null;
}

export interface NotificationKindMeta {
  /** Nhãn badge hiển thị dưới nội dung (Figma: Tiến độ, Nhắc nhở, ...). */
  label: string;
  /** Nền icon tròn 52px. */
  background: string;
  /** Màu icon + chữ badge. */
  color: string;
}

/** Bảng màu icon/badge lấy trực tiếp từ Figma section "thông báo". */
export const NOTIFICATION_KIND_META: Readonly<Record<NotificationKind, NotificationKindMeta>> = {
  progress: { label: 'Tiến độ', background: '#E8F8F1', color: '#13A673' },
  milestone: { label: 'Tiến độ', background: '#F0EBFF', color: '#7C4DFF' },
  reminder: { label: 'Nhắc nhở', background: '#FFF0E4', color: '#F47A23' },
  quiz: { label: 'Kết quả', background: '#EAF1FF', color: '#2563EB' },
  certificate: { label: 'Chứng chỉ', background: '#FFF6D8', color: '#E6A400' },
  'course-update': { label: 'Cập nhật', background: '#E7F9F8', color: '#0AA8A8' },
  achievement: { label: 'Thành tích', background: '#FDEAF4', color: '#E93C8C' },
  purchase: { label: 'Mua hàng', background: '#E8F8F1', color: '#13A673' },
  payment: { label: 'Giao dịch', background: '#FDECEC', color: '#E5484D' },
  promotion: { label: 'Khuyến mãi', background: '#FFF0E4', color: '#F47A23' },
  voucher: { label: 'Voucher', background: '#F0EBFF', color: '#7C4DFF' },
  refund: { label: 'Hoàn tiền', background: '#E8F8F1', color: '#13A673' },
  login: { label: 'Bảo mật', background: '#EAF1FF', color: '#2563EB' },
  password: { label: 'Bảo mật', background: '#E8F8F1', color: '#13A673' },
  email: { label: 'Bảo mật', background: '#FFF6D8', color: '#E6A400' },
  system: { label: 'Hệ thống', background: '#F0EBFF', color: '#7C4DFF' },
  alert: { label: 'Bảo mật', background: '#FDECEC', color: '#E5484D' },
  backup: { label: 'Hệ thống', background: '#EAF1FF', color: '#2563EB' },
};

export interface NotificationCategoryMeta {
  id: NotificationCategory;
  /** Tên đầy đủ dùng cho tab và breadcrumb. */
  label: string;
  /** Nhãn badge khi xem tab "Tất cả" (badge theo nhóm). */
  badgeBackground: string;
  badgeColor: string;
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategoryMeta[] = [
  {
    id: 'learning',
    label: 'Học tập & Tiến độ',
    badgeBackground: '#EFF6FF',
    badgeColor: '#155DFC',
  },
  {
    id: 'transactions',
    label: 'Giao dịch & Khuyến mãi',
    badgeBackground: '#FFF7ED',
    badgeColor: '#F47A23',
  },
  {
    id: 'security',
    label: 'Bảo mật & Hệ thống',
    badgeBackground: '#FAF5FF',
    badgeColor: '#7C4DFF',
  },
];

export function notificationKindMeta(kind: NotificationKind): NotificationKindMeta {
  return NOTIFICATION_KIND_META[kind];
}

export function notificationCategoryMeta(category: NotificationCategory): NotificationCategoryMeta {
  return NOTIFICATION_CATEGORIES.find((item) => item.id === category) ?? NOTIFICATION_CATEGORIES[0];
}
