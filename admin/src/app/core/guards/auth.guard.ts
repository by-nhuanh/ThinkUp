import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

/**
 * Chặn truy cập phân hệ quản trị khi chưa đăng nhập.
 * Lưu lại URL đang muốn vào để quay lại sau khi đăng nhập thành công.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  if (auth.isTwoFactorPending()) {
    return router.createUrlTree(['/auth/two-factor']);
  }

  return router.createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {}
  });
};
