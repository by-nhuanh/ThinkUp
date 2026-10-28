import { NotificationCategory } from '../../../core/models/notification.model';

export interface NotificationGroupAside {
  /** Ảnh minh họa 3D trong card "Về nhóm thông báo này". */
  illustration: string;
  description: string;
  supportText: string;
}

/** Nội dung cột phải theo từng tab chuyên đề (Figma 3188:19630 / 19796 / 19948). */
export const NOTIFICATION_GROUP_ASIDE: Readonly<Record<NotificationCategory, NotificationGroupAside>> = {
  learning: {
    illustration: '/assets/notifications/illustration-learning.png',
    description:
      'Nhận thông tin về tiến độ học tập, kết quả bài tập, chứng chỉ và các cập nhật quan trọng để bạn không bỏ lỡ hành trình chinh phục kiến thức.',
    supportText: 'Gặp vấn đề với thông báo học tập? Chúng tôi luôn sẵn sàng hỗ trợ bạn!',
  },
  transactions: {
    illustration: '/assets/notifications/illustration-transactions.png',
    description:
      'Nhận thông tin về giao dịch, đơn hàng, hoàn tiền, khuyến mãi và voucher. Đừng bỏ lỡ ưu đãi hấp dẫn dành riêng cho bạn!',
    supportText: 'Gặp vấn đề với giao dịch hoặc mã khuyến mãi? Chúng tôi luôn sẵn sàng hỗ trợ bạn!',
  },
  security: {
    illustration: '/assets/notifications/illustration-security.png',
    description:
      'Nhận thông tin quan trọng về bảo mật tài khoản và các cập nhật hệ thống để bạn luôn học tập an toàn và hiệu quả.',
    supportText: 'Gặp vấn đề về bảo mật hoặc tài khoản? Chúng tôi luôn sẵn sàng hỗ trợ bạn!',
  },
};

export type NotificationTabId = NotificationCategory | 'all';

export interface NotificationTab {
  id: NotificationTabId;
  label: string;
  /** Đường dẫn tuyệt đối của từng màn hình. */
  path: string;
}

export const NOTIFICATION_TABS: readonly NotificationTab[] = [
  { id: 'all', label: 'Tất cả', path: '/main/notifications' },
  { id: 'learning', label: 'Học tập & Tiến độ', path: '/main/notifications/learning' },
  { id: 'transactions', label: 'Giao dịch & Khuyến mãi', path: '/main/notifications/transactions' },
  { id: 'security', label: 'Bảo mật & Hệ thống', path: '/main/notifications/security' },
];

export const NOTIFICATION_SETTINGS_PATH = '/main/settings/notifications';
