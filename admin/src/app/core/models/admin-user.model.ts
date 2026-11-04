/** Vai trò được phép truy cập phân hệ quản trị. */
export type AdminRole = 'admin';

/** Thông tin lần đăng nhập gần nhất, lấy từ audit log nếu có. */
export interface AdminLastLogin {
  at: string;
  ipMasked: string | null;
  userAgent: string | null;
}

/** Thông tin phiên đang thực hiện request `/me`. */
export interface AdminCurrentSession {
  ipMasked: string | null;
  userAgent: string | null;
}

/** Hồ sơ quản trị đang đăng nhập. */
export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  avatar?: string | null;
  /** Thời điểm mật khẩu hết hạn (ISO). Không có nghĩa là chính sách xoay vòng đang tắt. */
  passwordExpiresAt?: string | null;
  /** Bắt buộc đổi mật khẩu mặc định trước khi sử dụng hệ thống. */
  mustChangePassword?: boolean;
  /** Bắt buộc hoàn tất thiết lập ứng dụng 2FA và lưu mã dự phòng. */
  twoFactorSetupRequired?: boolean;
  /** Trạng thái tài khoản do backend trả về; chỉ hiển thị khi có giá trị. */
  status?: string;
  /** Trạng thái 2FA do backend trả về; chỉ hiển thị khi có giá trị. */
  is2faEnabled?: boolean;
  /** Thời điểm tạo tài khoản (ISO) nếu backend có lưu. */
  createdAt?: string | null;
  /** Lần đăng nhập gần nhất từ audit log. */
  lastLogin?: AdminLastLogin | null;
  /** Phiên hiện tại theo request `/me`. */
  currentSession?: AdminCurrentSession | null;
}

/** Phản hồi additive của `GET /api/admin/auth/me`. */
export interface AdminProfileResponse {
  success: boolean;
  admin: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    status?: string;
    is_2fa_enabled?: boolean;
    created_at?: string | null;
    last_login_at?: string | null;
    lastLogin?: AdminLastLogin | null;
    currentSession?: AdminCurrentSession | null;
    passwordStatus?: {
      isExpired: boolean;
      isWarning: boolean;
      daysLeft: number;
      message?: string;
    };
  };
}

/** Payload gửi lên API đăng nhập. */
export interface AdminLoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/** Phản hồi bước 1 từ `POST /api/admin/auth/login`. */
export interface AdminLoginResponse {
  success: boolean;
  message?: string;
  requires2FA: boolean;
  twoFactorToken: string;
  expiresInSeconds?: number;
}

/** Phản hồi hoàn tất từ `POST /api/admin/auth/verify-2fa`. */
export interface AdminVerifyTwoFactorResponse {
  success: boolean;
  message?: string;
  accessToken: string;
  admin: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };
  passwordStatus?: {
    isExpired: boolean;
    isWarning: boolean;
    daysLeft: number;
    message?: string;
  };
}

/** Dữ liệu riêng của từng tài khoản dùng để ghép ứng dụng Authenticator. */
export interface AdminTwoFactorSetup {
  setupKey: string;
  qrUri: string;
}

/** Phần dữ liệu 2FA backend trả về sau bước khởi tạo mật khẩu onboarding. */
export interface AdminOnboardingSetupResponse {
  success: boolean;
  onboardingToken: string;
  secretKey: string;
  qrUri: string;
}

/** Lỗi API đã được chuẩn hoá để component hiển thị thông điệp tiếng Việt. */
export interface AdminAuthError extends Error {
  status?: number;
  code?: string;
  /** Số giây còn phải chờ khi tài khoản bị tạm khoá. */
  retryAfter?: number;
}

/**
 * Phiên chờ xác thực 2 bước. Chỉ tồn tại giữa bước đăng nhập và bước nhập OTP,
 * chưa cấp access token cho tới khi xác thực xong.
 */
export interface AdminTwoFactorChallenge {
  email: string;
  /** Token tạm do backend cấp để đổi lấy access token sau khi xác thực. */
  twoFactorToken: string;
  /** Thời điểm hết hiệu lực của mã xác thực. */
  expiresAt: number;
  rememberMe: boolean;
}

/** Trạng thái chính sách mật khẩu của hồ sơ đang đăng nhập. */
export type AdminPasswordState = 'ok' | 'expiring' | 'expired';

/** Bước hiện tại của luồng đăng nhập, dùng cho điều hướng sau khi xác thực. */
export type AdminAuthStep = 'two-factor' | 'password-changed' | 'ready';
