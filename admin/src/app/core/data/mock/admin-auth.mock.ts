/**
 * Dữ liệu dùng cho môi trường demo local của luồng xác thực quản trị.
 *
 * TODO(pre-deploy): Xóa toàn bộ file này cùng các nhánh đọc `environment.adminDemoLogin`
 * / `environment.adminDemoAuthFlow` khi backend đã cung cấp: đăng nhập 2 lớp, bộ mã dự
 * phòng, đổi mật khẩu và hạn xoay vòng mật khẩu.
 */
export const MOCK_ADMIN_EMAIL = 'admin@thinkup.edu.vn';
export const MOCK_ADMIN_PASSWORD = 'Admin@123';
export const MOCK_ADMIN_NAME = 'Quản trị viên ThinkUp';

export interface MockAdminAccount {
  email: string;
  password: string;
  fullName: string;
}

export const MOCK_ADMIN_ACCOUNT: MockAdminAccount = {
  email: MOCK_ADMIN_EMAIL,
  password: MOCK_ADMIN_PASSWORD,
  fullName: MOCK_ADMIN_NAME
};

/** Mã OTP hợp lệ của luồng demo (backend thật sẽ sinh mã theo TOTP). */
export const MOCK_ADMIN_TWO_FACTOR_CODE = '123456';

/** Khoá thiết lập hiển thị ở bước quét QR (chuỗi mẫu chuẩn của RFC 4226). */
export const MOCK_ADMIN_SETUP_KEY = 'JBSWY3DPEHPK3PXP';

/** 10 mã dự phòng mẫu, lấy nguyên văn từ thiết kế Figma. */
export const MOCK_ADMIN_BACKUP_CODES: readonly string[] = [
  'A8F9-3B2C-7Q6K-1MNP',
  'H7KD-9P2L-4X8C-6RTA',
  'M4QX-T7BN-2F9D-5KLP',
  'R2BV-6C1K-8W3H-9YQE',
  'Z9LP-4D7W-1N6F-3BKC',
  'N3FH-8J5M-7Q2A-4XDV',
  'Q1RT-2Y6U-5C8P-9MKW',
  'K8XC-5V9A-3H1D-7FQB',
  'D6PN-1L4S-8T2R-6YJM',
  'T5GW-7H3E-9K4N-2VCA'
];
