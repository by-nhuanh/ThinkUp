import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'thinkup_admin_user';

/**
 * Gắn Bearer token vào mọi request gọi tới API của backend.
 * Token được đọc từ sessionStorage trước, fallback sang localStorage (khi bật "Ghi nhớ đăng nhập").
 * Khi token hết hạn (401) ở các API nghiệp vụ, phiên được xoá và đưa về màn hình đăng nhập.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = typeof window === 'undefined'
    ? null
    : sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);

  const isApiRequest = req.url.startsWith(environment.apiUrl);
  const isPublicAuthRequest = req.url.includes('/admin/auth/login') ||
    req.url.includes('/admin/auth/verify-2fa') ||
    req.url.includes('/admin/auth/forgot-password-guide');

  if (token && isApiRequest) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && isApiRequest && !isPublicAuthRequest && typeof window !== 'undefined') {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
