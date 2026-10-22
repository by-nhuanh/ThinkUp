import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MOCK_ADMIN_ACCOUNT,
  MOCK_ADMIN_BACKUP_CODES
} from '../data/mock/admin-auth.mock';
import {
  AdminAuthError,
  AdminLoginRequest,
  AdminLoginResponse,
  AdminPasswordState,
  AdminRole,
  AdminTwoFactorChallenge,
  AdminUser
} from '../models/admin-user.model';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'thinkup_admin_user';
const CHALLENGE_KEY = 'thinkup_admin_2fa';
const REMINDER_KEY = 'thinkup_admin_password_reminder_dismissed';

/** Chính sách xoay vòng mật khẩu: 90 ngày, cảnh báo trước 7 ngày. */
const PASSWORD_LIFETIME_DAYS = 90;
const PASSWORD_WARNING_DAYS = 7;
/** Mã OTP có hiệu lực 5 phút kể từ lúc mở bước xác thực. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Quản lý phiên đăng nhập của phân hệ quản trị.
 *
 * Backend dùng chung endpoint `POST /api/auth/login` cho mọi vai trò, nên service
 * chỉ nhận phiên khi `user.role === 'admin'`. Khi môi trường local chưa có tài khoản
 * quản trị thật, cờ `environment.adminDemoLogin` cho phép dùng tài khoản demo.
 *
 * Các bước 2FA / đổi mật khẩu hiện chưa có API tương ứng ở backend; nhánh demo được
 * đánh dấu `TODO(pre-deploy)` và chỉ chạy khi bật `environment.adminDemoAuthFlow`.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly userState = signal<AdminUser | null>(null);
  private readonly challengeState = signal<AdminTwoFactorChallenge | null>(null);

  private readonly issuedCodesState = signal<readonly string[]>([]);

  readonly currentUser = this.userState.asReadonly();
  readonly pendingChallenge = this.challengeState.asReadonly();
  /** Mã dự phòng vừa cấp sau khi hoàn tất thiết lập 2FA. */
  readonly issuedBackupCodes = this.issuedCodesState.asReadonly();

  readonly passwordState = computed<AdminPasswordState>(() => {
    const expiresAt = this.userState()?.passwordExpiresAt;
    if (!expiresAt) return 'ok';

    const daysLeft = this.daysUntil(expiresAt);
    if (daysLeft <= 0) return 'expired';
    return daysLeft <= PASSWORD_WARNING_DAYS ? 'expiring' : 'ok';
  });

  readonly daysUntilPasswordExpiry = computed<number | null>(() => {
    const expiresAt = this.userState()?.passwordExpiresAt;
    return expiresAt ? this.daysUntil(expiresAt) : null;
  });

  constructor() {
    this.restoreSession();
    this.restoreChallenge();
  }

  isAuthenticated(): boolean {
    return !!this.getToken() && !!this.userState();
  }

  isTwoFactorPending(): boolean {
    return !!this.challengeState();
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Đăng nhập bước 1. Phát ra `null` khi tài khoản cần xác thực 2 bước —
   * khi đó component chuyển sang `/auth/two-factor`.
   */
  login(credentials: AdminLoginRequest): Observable<AdminUser | null> {
    const payload = {
      email: (credentials.email ?? '').trim().toLowerCase(),
      password: (credentials.password ?? '').trim(),
      rememberMe: !!credentials.rememberMe
    };

    return this.http.post<AdminLoginResponse>(`${this.apiUrl}/auth/login`, payload).pipe(
      map(response => {
        if (response.requiresTwoFactor) {
          this.startChallenge(payload.email, response.twoFactorToken ?? null, response.passwordExpiresAt ?? null);
          return null;
        }

        return this.mapLoginResponse(response, payload.email, payload.rememberMe);
      }),
      catchError((error: HttpErrorResponse) => this.handleError(error, payload))
    );
  }

  /** Xác thực mã OTP 6 số của bước đăng nhập thứ hai. */
  verifyTwoFactorCode(code: string): Observable<AdminUser> {
    const challenge = this.challengeState();
    if (!challenge) {
      return throwError(() => this.buildError('Phiên xác thực đã hết hiệu lực. Vui lòng đăng nhập lại.', 401, 'CHALLENGE_EXPIRED'));
    }
    if (Date.now() > challenge.expiresAt) {
      this.clearChallenge();
      return throwError(() => this.buildError('Mã xác thực không chính xác hoặc đã hết hạn. Vui lòng thử lại.', 401, 'CHALLENGE_EXPIRED'));
    }

    // TODO(pre-deploy): thay bằng POST /api/auth/2fa/verify { challengeToken, code }
    // khi backend triển khai xác thực 2 lớp.
    if (environment.adminDemoAuthFlow.twoFactorEnabled) {
      const expected = environment.adminDemoAuthFlow.twoFactorCode;
      if (code.trim() !== expected) {
        return throwError(() => this.buildError('Mã xác thực không chính xác hoặc đã hết hạn. Vui lòng thử lại.', 401, 'INVALID_OTP'));
      }
      return of(this.completeDemoChallenge());
    }

    return throwError(() => this.buildError('Máy chủ chưa hỗ trợ xác thực 2 lớp. Vui lòng liên hệ bộ phận IT.', 501, 'NOT_IMPLEMENTED'));
  }

  /** Xác thực bằng mã dự phòng (mỗi mã dùng đúng một lần). */
  verifyBackupCode(code: string): Observable<AdminUser> {
    if (!this.challengeState()) {
      return throwError(() => this.buildError('Phiên xác thực đã hết hiệu lực. Vui lòng đăng nhập lại.', 401, 'CHALLENGE_EXPIRED'));
    }

    // TODO(pre-deploy): thay bằng endpoint xác thực mã dự phòng của backend.
    const normalized = normalizeBackupCode(code);
    if (environment.adminDemoAuthFlow.twoFactorEnabled && MOCK_ADMIN_BACKUP_CODES.some(item => normalizeBackupCode(item) === normalized)) {
      return of(this.completeDemoChallenge());
    }

    return throwError(() => this.buildError('Mã dự phòng không chính xác. Vui lòng thử lại.', 401, 'INVALID_BACKUP_CODE'));
  }

  cancelChallenge(): void {
    this.clearChallenge();
  }

  /**
   * Đổi mật khẩu bắt buộc. OTP 2FA là bắt buộc theo đặc tả nghiệp vụ.
   * TODO(pre-deploy): thay bằng endpoint đổi mật khẩu của backend.
   */
  changePassword(input: { currentPassword: string; newPassword: string; otp: string }): Observable<void> {
    const user = this.userState();
    if (!user) {
      return throwError(() => this.buildError('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 401, 'NO_SESSION'));
    }

    if (environment.adminDemoAuthFlow.twoFactorEnabled && input.otp.trim() !== environment.adminDemoAuthFlow.twoFactorCode) {
      return throwError(() => this.buildError('Mã xác thực không chính xác hoặc đã hết hạn. Vui lòng thử lại.', 401, 'INVALID_OTP'));
    }

    const updatedUser: AdminUser = {
      ...user,
      passwordExpiresAt: this.addDays(new Date(), PASSWORD_LIFETIME_DAYS).toISOString()
    };

    this.persistUser(updatedUser);
    this.userState.set(updatedUser);
    this.clearReminderDismissal();
    return of(undefined);
  }

  /**
   * Kiểm tra mã 6 số ở bước cuối của quá trình thiết lập 2FA.
   * TODO(pre-deploy): thay bằng endpoint xác thực mã thiết lập của backend.
   */
  verifySetupCode(code: string): Observable<void> {
    if (environment.adminDemoAuthFlow.twoFactorEnabled && code.trim() !== environment.adminDemoAuthFlow.twoFactorCode) {
      return throwError(() => this.buildError('Mã xác thực không đúng hoặc đã hết hạn. Vui lòng thử lại.', 401, 'INVALID_OTP'));
    }

    return of(undefined);
  }

  /** Hoàn tất thiết lập 2FA, trả về danh sách mã dự phòng đã cấp. */
  completeTwoFactorSetup(): Observable<readonly string[]> {
    // TODO(pre-deploy): nhận bộ mã dự phòng từ backend thay vì dữ liệu mẫu.
    return of(MOCK_ADMIN_BACKUP_CODES).pipe(
      tap(codes => this.issuedCodesState.set(codes))
    );
  }

  passwordReminderDismissed(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(REMINDER_KEY) === '1';
  }

  dismissPasswordReminder(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(REMINDER_KEY, '1');
  }

  logout(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(CHALLENGE_KEY);
      sessionStorage.removeItem(REMINDER_KEY);
    }
    this.userState.set(null);
    this.challengeState.set(null);
  }

  private mapLoginResponse(response: AdminLoginResponse, fallbackEmail: string, rememberMe: boolean): AdminUser {
    const token = response.accessToken || response.token;
    const backendUser = response.user;

    if (!token || !backendUser) {
      throw this.buildError('Phản hồi đăng nhập không hợp lệ. Vui lòng thử lại.', 500, 'INVALID_RESPONSE');
    }

    if (backendUser.role !== 'admin') {
      throw this.buildError('Tài khoản này không được phép truy cập trang quản trị.', 403, 'FORBIDDEN_ROLE');
    }

    const user: AdminUser = {
      id: backendUser.id ?? '',
      email: backendUser.email ?? fallbackEmail,
      fullName: backendUser.name || backendUser.full_name || 'Quản trị viên',
      role: 'admin' as AdminRole,
      avatar: backendUser.avatar ?? backendUser.avatar_url ?? null,
      passwordExpiresAt: response.passwordExpiresAt ?? backendUser.password_expires_at ?? null
    };

    this.saveSession(token, user, rememberMe);
    return user;
  }

  private handleError(error: HttpErrorResponse, payload: { email: string; password: string }): Observable<AdminUser | null> {
    // TODO(pre-deploy): Bỏ nhánh fallback demo khi backend đã cấp tài khoản role 'admin' thật.
    if (environment.adminDemoLogin && this.isDemoAccount(payload)) {
      if (environment.adminDemoAuthFlow.twoFactorEnabled) {
        this.startChallenge(payload.email, null, this.demoPasswordExpiry());
        return of(null);
      }

      const demoUser: AdminUser = {
        id: 'demo-admin',
        email: MOCK_ADMIN_ACCOUNT.email,
        fullName: MOCK_ADMIN_ACCOUNT.fullName,
        role: 'admin',
        avatar: null,
        passwordExpiresAt: this.demoPasswordExpiry()
      };
      this.saveSession(`demo-token-${MOCK_ADMIN_ACCOUNT.email}`, demoUser, false);
      return of(demoUser);
    }

    return throwError(() => this.toAuthError(error));
  }

  private toAuthError(error: HttpErrorResponse): AdminAuthError {
    if (error.status === 0) {
      return this.buildError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền mạng.', 0, 'NETWORK_ERROR');
    }

    const body = error.error as { message?: string; code?: string; retryAfter?: number } | null;
    const message = body?.message?.trim();
    const retryAfter = body?.retryAfter;

    if (error.status === 401) {
      return this.buildError(message || 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!', 401, body?.code || 'INVALID_CREDENTIALS');
    }
    if (error.status === 403) {
      const code = body?.code || 'FORBIDDEN_ROLE';
      const authError = this.buildError(
        message || (code === 'BRUTE_FORCE_LOCKED'
          ? 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.'
          : 'Tài khoản của bạn không có quyền truy cập trang quản trị.'),
        403,
        code
      );
      authError.retryAfter = retryAfter;
      return authError;
    }
    if (error.status === 429) {
      const authError = this.buildError(message || 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.', 429, body?.code || 'BRUTE_FORCE_LOCKED');
      authError.retryAfter = retryAfter;
      return authError;
    }
    if (error.status >= 500) {
      return this.buildError('Máy chủ đang bận. Vui lòng thử lại sau ít phút.', error.status, 'SERVER_ERROR');
    }

    return this.buildError(message || 'Đăng nhập thất bại. Vui lòng thử lại.', error.status, body?.code || 'LOGIN_FAILED');
  }

  private buildError(message: string, status: number, code: string): AdminAuthError {
    const error = new Error(message) as AdminAuthError;
    error.status = status;
    error.code = code;
    return error;
  }

  private startChallenge(email: string, challengeToken: string | null, passwordExpiresAt: string | null): void {
    const challenge: AdminTwoFactorChallenge = {
      email,
      challengeToken,
      expiresAt: Date.now() + CHALLENGE_TTL_MS
    };

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
      if (passwordExpiresAt) {
        sessionStorage.setItem('thinkup_admin_pending_password_expiry', passwordExpiresAt);
      } else {
        sessionStorage.removeItem('thinkup_admin_pending_password_expiry');
      }
    }

    this.challengeState.set(challenge);
  }

  private completeDemoChallenge(): AdminUser {
    const pendingExpiry = typeof window === 'undefined'
      ? null
      : sessionStorage.getItem('thinkup_admin_pending_password_expiry');

    const user: AdminUser = {
      id: 'demo-admin',
      email: MOCK_ADMIN_ACCOUNT.email,
      fullName: MOCK_ADMIN_ACCOUNT.fullName,
      role: 'admin',
      avatar: null,
      passwordExpiresAt: pendingExpiry || this.demoPasswordExpiry()
    };

    this.saveSession(`demo-token-${MOCK_ADMIN_ACCOUNT.email}`, user, false);
    this.clearChallenge();
    return user;
  }

  private clearChallenge(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(CHALLENGE_KEY);
      sessionStorage.removeItem('thinkup_admin_pending_password_expiry');
    }
    this.challengeState.set(null);
  }

  private saveSession(token: string, user: AdminUser, rememberMe: boolean): void {
    if (typeof window === 'undefined') return;

    const primary = rememberMe ? localStorage : sessionStorage;
    const secondary = rememberMe ? sessionStorage : localStorage;

    primary.setItem(TOKEN_KEY, token);
    primary.setItem(USER_KEY, JSON.stringify(user));
    secondary.removeItem(TOKEN_KEY);
    secondary.removeItem(USER_KEY);

    this.userState.set(user);
  }

  private persistUser(user: AdminUser): void {
    if (typeof window === 'undefined') return;

    const target = sessionStorage.getItem(USER_KEY) ? sessionStorage : localStorage;
    target.setItem(USER_KEY, JSON.stringify(user));
  }

  private restoreSession(): void {
    if (typeof window === 'undefined') return;

    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    if (!raw || !this.getToken()) return;

    try {
      const user = JSON.parse(raw) as AdminUser;
      if (user?.role === 'admin') this.userState.set(user);
    } catch {
      sessionStorage.removeItem(USER_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  private restoreChallenge(): void {
    if (typeof window === 'undefined') return;

    const raw = sessionStorage.getItem(CHALLENGE_KEY);
    if (!raw) return;

    try {
      const challenge = JSON.parse(raw) as AdminTwoFactorChallenge;
      if (challenge?.email && challenge.expiresAt > Date.now()) {
        this.challengeState.set(challenge);
      } else {
        sessionStorage.removeItem(CHALLENGE_KEY);
      }
    } catch {
      sessionStorage.removeItem(CHALLENGE_KEY);
    }
  }

  private isDemoAccount(payload: { email: string; password: string }): boolean {
    return payload.email === MOCK_ADMIN_ACCOUNT.email && payload.password === MOCK_ADMIN_ACCOUNT.password;
  }

  private demoPasswordExpiry(): string | null {
    const daysLeft = environment.adminDemoAuthFlow.passwordDaysLeft;
    return daysLeft === null ? null : this.addDays(new Date(), daysLeft).toISOString();
  }

  private clearReminderDismissal(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(REMINDER_KEY);
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private daysUntil(expiresAt: string): number {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / 86_400_000);
  }
}

/** Mã dự phòng được so khớp bỏ qua dấu gạch nối/khoảng trắng: `A8F9-3B2C…` = `a8f93b2c…`. */
function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
