import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

/**
 * Chặn toàn bộ phân hệ quản trị khi mật khẩu đã hết hạn (BR: xoay vòng 90 ngày).
 * Người dùng chỉ có thể đi tiếp bằng cách đổi mật khẩu.
 */
export const passwordPolicyGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  if (auth.passwordState() === 'expired') {
    return router.createUrlTree(['/auth/password-expired']);
  }

  return true;
};
