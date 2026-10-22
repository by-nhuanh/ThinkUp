export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  // TODO(pre-deploy): tắt cờ này khi backend đã cấp tài khoản role 'admin' thật.
  adminDemoLogin: true,
  /**
   * TODO(pre-deploy): xoá nhánh demo khi backend hỗ trợ 2FA và hạn xoay vòng mật khẩu.
   * Chỉ dùng để dựng/kiểm thử luồng thiết kế ở môi trường local.
   */
  adminDemoAuthFlow: {
    twoFactorEnabled: true,
    twoFactorCode: '123456',
    /** Số ngày còn lại tới khi mật khẩu hết hạn; null = không hiện thông báo. */
    passwordDaysLeft: 5 as number | null,
    setupRequired: false
  }
};
