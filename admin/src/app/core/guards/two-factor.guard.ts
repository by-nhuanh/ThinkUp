import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

/**
 * Chỉ cho vào bước xác thực 2 bước khi thật sự có phiên chờ.
 * Đã đăng nhập xong thì về trang chủ, chưa đăng nhập thì về màn hình đăng nhập.
 */
export const twoFactorGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  if (auth.isTwoFactorPending()) return true;
  return router.createUrlTree([auth.isAuthenticated() ? '/' : '/login']);
};
