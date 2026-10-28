export interface SettingSection {
  id: 'account-security' | 'learning-options' | 'notifications' | 'payment';
  title: string;
  description: string;
  icon: 'Shield' | 'Bell' | 'GraduationCap' | 'CreditCard';
  iconColor: string;
  bgColor: string;
  href: string;
}

export interface AccountSecurityPayload {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface LearningOptions {
  language: string;
  timezone: string;
  videoQuality: string;
  playbackSpeed: string;
  downloadQuality: string;
  downloadLocation: string;
}

/** Giá trị mặc định dùng cho trạng thái cục bộ và nút "Khôi phục cài đặt mặc định". */
export const DEFAULT_LEARNING_OPTIONS: LearningOptions = {
  language: 'vi',
  timezone: 'GMT+07:00',
  videoQuality: 'auto',
  playbackSpeed: '1.0',
  downloadQuality: 'high',
  downloadLocation: 'downloads',
};

export type DndDuration = '15' | '1' | '8' | '24' | 'until';

export interface NotificationPrefs {
  web: boolean;
  email: boolean;
  newsletter: boolean;
  learning: boolean;
  community: boolean;
  courseUpdates: boolean;
  marketing: boolean;
  /** Chế độ "Không muốn bị làm phiền" (Figma node 3200:22823). */
  dnd: DndDuration;
}

/**
 * Trạng thái mặc định của trang Thông báo, dùng khi API chưa trả về đủ trường.
 * TODO(pre-deploy): đối chiếu lại danh sách trường với spec/Postman handoff của backend.
 */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  web: true,
  email: true,
  newsletter: false,
  learning: true,
  community: true,
  courseUpdates: true,
  marketing: false,
  dnd: '24',
};

export interface PaymentMethod {
  id: string;
  type: 'momo' | 'zalopay' | 'visa';
  last4: string;
  holder: string;
  expiredAt: string;
  isDefault: boolean;
  verified: boolean;
}

export interface SettingsApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}
