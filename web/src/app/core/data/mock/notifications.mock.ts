import {
  AppNotification,
  NotificationCategory,
  NotificationKind,
} from '../../models/notification.model';

/**
 * TODO(pre-deploy): Dữ liệu demo cho Trung tâm thông báo.
 * Thay bằng dữ liệu API thật (`GET /user/notifications`) khi backend chốt spec/Postman handoff.
 * Nội dung bám theo Figma section "thông báo" (3188:19571) - 24 thông báo, 3 chưa đọc.
 */

interface SeedNotification {
  id: string;
  category: NotificationCategory;
  kind: NotificationKind;
  title: string;
  message: string;
  /** 0 = hôm nay, 1 = hôm qua, ... */
  day: number;
  hour: number;
  minute: number;
  href?: string;
  unread?: boolean;
}

const SEED: readonly SeedNotification[] = [
  // ---------------------------- Học tập & Tiến độ (10) ----------------------------
  {
    id: 'ntf-learning-progress-chapter-5',
    category: 'learning',
    kind: 'progress',
    title: 'Hoàn thành chương 5',
    message: 'Chúc mừng! Bạn đã hoàn thành Chương 5 của khóa học “React.js từ A đến Z”.',
    day: 0,
    hour: 10,
    minute: 30,
    href: '/main/my-courses',
    unread: true,
  },
  {
    id: 'ntf-learning-milestone-90',
    category: 'learning',
    kind: 'milestone',
    title: 'Sắp hoàn thành khóa học',
    message:
      'Bạn đã hoàn thành 90% khóa học “Python cho Data Science”. Chỉ còn một chút nữa thôi để nhận chứng chỉ!',
    day: 0,
    hour: 9,
    minute: 15,
    href: '/main/my-courses',
    unread: true,
  },
  {
    id: 'ntf-learning-reminder-3-days',
    category: 'learning',
    kind: 'reminder',
    title: 'Nhắc nhở học tập',
    message:
      'Đã 3 ngày bạn chưa vào học khóa “UI/UX Design cơ bản”. Hãy quay lại để duy trì tiến độ nhé!',
    day: 1,
    hour: 21,
    minute: 30,
    href: '/main/my-courses',
  },
  {
    id: 'ntf-learning-quiz-usestate',
    category: 'learning',
    kind: 'quiz',
    title: 'Bài tập React - useState đã chấm điểm',
    message: 'Bài tập “React - useState” của bạn đã có điểm: 90/100 (Đạt). Xem chi tiết ngay!',
    day: 1,
    hour: 16,
    minute: 20,
    href: '/main/my-courses',
  },
  {
    id: 'ntf-learning-certificate-html-css',
    category: 'learning',
    kind: 'certificate',
    title: 'Chúc mừng! Bạn đã nhận chứng chỉ',
    message:
      'Bạn đã hoàn thành xuất sắc khóa học “HTML, CSS & JavaScript cho người mới bắt đầu”.',
    day: 2,
    hour: 15,
    minute: 40,
    href: '/main/certificates',
  },
  {
    id: 'ntf-learning-course-update-js',
    category: 'learning',
    kind: 'course-update',
    title: 'Cập nhật khóa học mới',
    message:
      'Giảng viên F8 Official vừa cập nhật thêm 3 bài học mới vào khóa “JavaScript nâng cao”.',
    day: 2,
    hour: 14,
    minute: 5,
    href: '/main/courses',
  },
  {
    id: 'ntf-learning-achievement-streak',
    category: 'learning',
    kind: 'achievement',
    title: 'Mục tiêu tuần đạt được 🎉',
    message:
      'Tuyệt vời! Bạn đã hoàn thành mục tiêu học tập 5 ngày liên tiếp. Hãy giữ vững phong độ nhé!',
    day: 3,
    hour: 19,
    minute: 0,
    href: '/main/my-courses',
  },
  {
    id: 'ntf-learning-progress-new-lesson',
    category: 'learning',
    kind: 'progress',
    title: 'Bài học mới đã sẵn sàng',
    message:
      'Bài học “React Hooks cơ bản” trong khóa học “React.js từ A đến Z” đã được mở khóa.',
    day: 4,
    hour: 17,
    minute: 45,
    href: '/main/courses',
  },
  {
    id: 'ntf-learning-quiz-javascript-basics',
    category: 'learning',
    kind: 'quiz',
    title: 'Bài kiểm tra đã được chấm điểm',
    message: 'Kết quả bài kiểm tra “JavaScript Basics Quiz” của bạn đã có. Điểm số: 9/10.',
    day: 5,
    hour: 20,
    minute: 15,
    href: '/main/my-courses',
  },
  {
    id: 'ntf-learning-milestone-roadmap-80',
    category: 'learning',
    kind: 'milestone',
    title: 'Bạn đã hoàn thành 80% lộ trình',
    message: 'Tuyệt vời! Bạn đã hoàn thành 80% lộ trình “Trở thành Front-end Developer”.',
    day: 6,
    hour: 18,
    minute: 30,
    href: '/learning/roadmap',
  },

  // --------------------------- Giao dịch & Khuyến mãi (8) --------------------------
  {
    id: 'ntf-transaction-promotion-20',
    category: 'transactions',
    kind: 'promotion',
    title: 'Giảm 20% cho khóa học bất kỳ!',
    message: 'Ưu đãi đặc biệt dành riêng cho bạn. Hạn sử dụng đến 31/05/2026.',
    day: 0,
    hour: 8,
    minute: 0,
    href: '/main/courses',
  },
  {
    id: 'ntf-transaction-refund-uiux',
    category: 'transactions',
    kind: 'refund',
    title: 'Hoàn tiền thành công',
    message: 'Khoản hoàn tiền cho khóa học “UI/UX Design cơ bản” đã được xử lý thành công.',
    day: 1,
    hour: 18,
    minute: 20,
    href: '/main/profile/billing',
  },
  {
    id: 'ntf-transaction-purchase-react',
    category: 'transactions',
    kind: 'purchase',
    title: 'Mua hàng thành công',
    message: 'Thanh toán thành công khóa học “React.js từ A đến Z”. Bấm để vào học ngay!',
    day: 2,
    hour: 11,
    minute: 30,
    href: '/main/my-courses',
  },
  {
    id: 'ntf-transaction-payment-failed',
    category: 'transactions',
    kind: 'payment',
    title: 'Giao dịch thất bại',
    message: 'Thanh toán khóa học “Node.js Express - Xây dựng REST API” thất bại.',
    day: 2,
    hour: 9,
    minute: 10,
    href: '/main/profile/billing',
  },
  {
    id: 'ntf-transaction-voucher-20',
    category: 'transactions',
    kind: 'voucher',
    title: 'Bạn vừa nhận được voucher',
    message: 'Bạn vừa nhận được mã giảm giá 20% cho mọi khóa học. Hạn sử dụng: 3 ngày.',
    day: 3,
    hour: 13,
    minute: 15,
    href: '/main/courses',
  },
  {
    id: 'ntf-transaction-promotion-flash-sale',
    category: 'transactions',
    kind: 'promotion',
    title: 'Lớp học flash sale sắp diễn ra!',
    message: 'Đừng bỏ lỡ Flash Sale 11.11: Giảm đến 60% cho hơn 200 khóa học.',
    day: 4,
    hour: 12,
    minute: 20,
    href: '/main/courses',
  },
  {
    id: 'ntf-transaction-promotion-python',
    category: 'transactions',
    kind: 'promotion',
    title: 'Giảm giá đặc biệt cho bạn',
    message: 'Khóa học “Python cho Data Science” đang giảm giá 50%. Mua ngay!',
    day: 5,
    hour: 16,
    minute: 40,
    href: '/main/courses',
  },
  {
    id: 'ntf-transaction-refund-nodejs',
    category: 'transactions',
    kind: 'refund',
    title: 'Hoàn tiền thành công',
    message: 'Giao dịch hoàn tiền cho khóa học “Node.js Express - Xây dựng REST API” đã thành công.',
    day: 6,
    hour: 21,
    minute: 10,
    href: '/main/profile/billing',
  },

  // --------------------------- Bảo mật & Hệ thống (6) -----------------------------
  {
    id: 'ntf-security-login-new-device',
    category: 'security',
    kind: 'login',
    title: 'Đăng nhập thiết bị mới',
    message:
      'Tài khoản của bạn vừa được đăng nhập trên thiết bị Windows - Chrome vào lúc 10:15 AM (Hồ Chí Minh, Việt Nam).',
    day: 0,
    hour: 7,
    minute: 45,
    href: '/main/settings/account-security',
    unread: true,
  },
  {
    id: 'ntf-security-password-changed',
    category: 'security',
    kind: 'password',
    title: 'Cập nhật mật khẩu thành công',
    message: 'Mật khẩu của bạn đã được thay đổi thành công vào lúc 09:45 AM.',
    day: 1,
    hour: 20,
    minute: 10,
    href: '/main/settings/account-security',
  },
  {
    id: 'ntf-security-email-verified',
    category: 'security',
    kind: 'email',
    title: 'Xác minh email thành công',
    message: 'Địa chỉ email của bạn (nguyenvana@gmail.com) đã được xác minh thành công.',
    day: 2,
    hour: 8,
    minute: 25,
    href: '/main/settings/account-security',
  },
  {
    id: 'ntf-security-system-update',
    category: 'security',
    kind: 'system',
    title: 'Cập nhật hệ thống',
    message:
      'Hệ thống vừa được cập nhật phiên bản mới (v2.8.0) với nhiều cải tiến về hiệu suất và bảo mật.',
    day: 3,
    hour: 10,
    minute: 5,
    href: '/main/settings/account-security',
  },
  {
    id: 'ntf-security-unusual-login',
    category: 'security',
    kind: 'alert',
    title: 'Cảnh báo đăng nhập lạ',
    message:
      'Chúng tôi phát hiện một lần đăng nhập bất thường từ IP 113.160.xxx.xxx vào lúc 07:50 AM. Nếu không phải bạn, vui lòng đổi mật khẩu ngay.',
    day: 4,
    hour: 7,
    minute: 30,
    href: '/main/settings/account-security',
  },
  {
    id: 'ntf-security-backup-done',
    category: 'security',
    kind: 'backup',
    title: 'Sao lưu dữ liệu thành công',
    message: 'Dữ liệu học tập của bạn đã được sao lưu tự động vào lúc 02:00 AM.',
    day: 6,
    hour: 9,
    minute: 50,
    href: '/main/settings/account-security',
  },
];

function buildTimestamp(dayOffset: number, hour: number, minute: number, now: Date): string {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - dayOffset);
  date.setHours(hour, minute, 0, 0);
  // Tránh tạo thông báo ở tương lai khi chạy demo vào sáng sớm.
  if (date.getTime() > now.getTime()) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString();
}

/** Sinh danh sách thông báo demo, sắp xếp mới nhất trước. */
export function buildSeedNotifications(now: Date = new Date()): AppNotification[] {
  return SEED
    .map((item) => {
      const createdAt = buildTimestamp(item.day, item.hour, item.minute, now);
      return {
        id: item.id,
        category: item.category,
        kind: item.kind,
        title: item.title,
        message: item.message,
        createdAt,
        readAt: item.unread ? null : createdAt,
        href: item.href,
      } satisfies AppNotification;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
