/** Vai trò được phép truy cập phân hệ quản trị. */
export type AdminRole = 'admin';

/** Hồ sơ quản trị đang đăng nhập. */
export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  avatar?: string | null;
  /** Thời điểm mật khẩu hết hạn (ISO). Không có nghĩa là chính sách xoay vòng đang tắt. */
  passwordExpiresAt?: string | null;
}

/** Payload gửi lên API đăng nhập. */
export interface AdminLoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Shape JSON trả về từ `POST /api/auth/login` của backend.
 * Backend dùng chung endpoint cho học viên và quản trị, phân biệt bằng `user.role`.
 *
 * `requiresTwoFactor`, `twoFactorToken` và `passwordExpiresAt` là các trường tuỳ chọn:
 * backend hiện tại chưa trả về, frontend đọc nếu có và bỏ qua nếu không.
 */
export interface AdminLoginResponse {
  message?: string;
  accessToken?: string;
  refreshToken?: string;
  token?: string;
  requiresTwoFactor?: boolean;
  twoFactorToken?: string;
  passwordExpiresAt?: string | null;
  user?: {
    id?: string;
    studentId?: string | null;
    name?: string | null;
    full_name?: string | null;
    email?: string;
    phone?: string | null;
    role?: string;
    avatar?: string | null;
    avatar_url?: string | null;
    email_verified?: boolean;
    password_expires_at?: string | null;
  };
}

/** Lỗi API đã được chuẩn hoá để component hiển thị thông điệp tiếng Việt. */
export interface AdminAuthError extends Error {
  status?: number;
  code?: string;
  /** Số giây còn phải chờ khi tài khoản bị tạm khoá (backend trả về `retryAfter`). */
  retryAfter?: number;
}

/**
 * Phiên chờ xác thực 2 bước. Chỉ tồn tại giữa bước đăng nhập và bước nhập OTP,
 * chưa cấp access token cho tới khi xác thực xong.
 */
export interface AdminTwoFactorChallenge {
  email: string;
  /** Token tạm do backend cấp (nếu có) để đổi lấy access token sau khi xác thực. */
  challengeToken: string | null;
  /** Thời điểm hết hiệu lực của mã xác thực. */
  expiresAt: number;
}

/** Trạng thái chính sách mật khẩu của hồ sơ đang đăng nhập. */
export type AdminPasswordState = 'ok' | 'expiring' | 'expired';

/** Bước hiện tại của luồng đăng nhập, dùng cho điều hướng sau khi xác thực. */
export type AdminAuthStep = 'two-factor' | 'password-changed' | 'ready';
