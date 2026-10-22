import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

/** Đã đăng nhập thì không cho quay lại màn hình đăng nhập. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  if (auth.isTwoFactorPending()) {
    return router.createUrlTree(['/auth/two-factor']);
  }

  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
