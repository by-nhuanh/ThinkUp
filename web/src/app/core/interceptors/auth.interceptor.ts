import { inject } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl + '/')) return next(req);
  const token = typeof window === 'undefined' ? null :
    sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
  const request = req.clone({ withCredentials: true });
  if (token) return next(request.clone({ setHeaders: { Authorization: 'Bearer ' + token } }));
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next(request);
  // A fresh CSRF token is bound to the active HttpOnly cookie. Bypass this
  // interceptor for its GET; never retry the mutation after an ambiguous result.
  const transport = new HttpClient(inject(HttpBackend));
  return transport.get<{ csrfToken: string }>(environment.apiUrl + '/auth/csrf', { withCredentials: true }).pipe(
    catchError(error => error instanceof HttpErrorResponse && error.status === 401
      ? of(null) : throwError(() => error)),
    switchMap(response => {
      if (response === null) return next(request); // No authenticated cookie (public login/register).
      if (!/^[a-f0-9]{64}$/.test(response.csrfToken)) return throwError(() => new Error('Không xác minh được phiên bảo mật.'));
      return next(request.clone({ setHeaders: { 'X-CSRF-Token': response.csrfToken } }));
    })
  );
};
