import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, from, map, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MOCK_ADMIN_ACCOUNT, MOCK_ADMIN_BACKUP_CODES, MOCK_FIRST_LOGIN_ADMIN_ACCOUNT } from '../data/mock/admin-auth.mock';
import {
  AdminAuthError,
  AdminLoginRequest,
  AdminLoginResponse,
  AdminPasswordState,
  AdminOnboardingSetupResponse,
  AdminRole,
  AdminTwoFactorSetup,
  AdminTwoFactorChallenge,
  AdminUser,
  AdminVerifyTwoFactorResponse
} from '../models/admin-user.model';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'thinkup_admin_user';
const CHALLENGE_KEY = 'thinkup_admin_2fa';
const REMINDER_KEY = 'thinkup_admin_password_reminder_dismissed';
const TWO_FACTOR_SETUP_KEY = 'thinkup_admin_2fa_setup';

/** Chính sách xoay vòng mật khẩu: 90 ngày, cảnh báo trước 7 ngày. */
const PASSWORD_LIFETIME_DAYS = 90;
const PASSWORD_WARNING_DAYS = 7;
/** TTL mặc định khi backend không trả `expiresInSeconds`. */
const CHALLENGE_TTL_SECONDS = 5 * 60;

/**
 * Quản lý phiên đăng nhập của phân hệ quản trị.
 *
 * Luồng đăng nhập dùng API riêng của Admin: thông tin đăng nhập tạo một token tạm,
 * sau đó OTP hoặc mã dự phòng đổi token tạm lấy access token.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly userState = signal<AdminUser | null>(null);
  private readonly challengeState = signal<AdminTwoFactorChallenge | null>(null);

  private readonly issuedCodesState = signal<readonly string[]>([]);
  private readonly twoFactorSetupState = signal<AdminTwoFactorSetup | null>(null);

  readonly currentUser = this.userState.asReadonly();
  readonly pendingChallenge = this.challengeState.asReadonly();
  /** Mã dự phòng vừa cấp sau khi hoàn tất thiết lập 2FA. */
  readonly issuedBackupCodes = this.issuedCodesState.asReadonly();
  readonly twoFactorSetup = this.twoFactorSetupState.asReadonly();

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
    this.restoreTwoFactorSetup();
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
      password: credentials.password ?? ''
    };

    // TODO(pre-deploy): Nhớ xóa nhánh đăng nhập local này khi backend Admin sẵn sàng.
    // Không gửi email/mật khẩu ra mạng trong chế độ demo.
    if (environment.adminDemoLogin) {
      const account = [MOCK_ADMIN_ACCOUNT, MOCK_FIRST_LOGIN_ADMIN_ACCOUNT]
        .find(item => item.email === payload.email && item.password === payload.password);
      if (!account) {
        return throwError(() => this.buildError('Email hoặc mật khẩu không chính xác. Vui lòng thử lại.', 401, 'INVALID_CREDENTIALS'));
      }

      const user: AdminUser = {
        id: `demo-${account.email}`,
        email: account.email,
        fullName: account.fullName,
        role: 'admin',
        avatar: null,
        passwordExpiresAt: null,
        mustChangePassword: false,
        twoFactorSetupRequired: false
      };
      this.saveSession('demo-local-access-token', user, false);
      return of(user);
    }

    return this.http.post<AdminLoginResponse>(`${this.apiUrl}/admin/auth/login`, payload).pipe(
      map(response => {
        if (!response.success || !response.requires2FA || !response.twoFactorToken) {
          throw this.buildError('Phản hồi đăng nhập không hợp lệ. Vui lòng thử lại.', 500, 'INVALID_RESPONSE');
        }

        this.startChallenge(
          payload.email,
          response.twoFactorToken,
          response.expiresInSeconds ?? CHALLENGE_TTL_SECONDS,
          !!credentials.rememberMe
        );
        return null;
      }),
      catchError((error: unknown) => throwError(() => this.normalizeError(error)))
    );
  }

  /** Xác thực mã OTP 6 số của bước đăng nhập thứ hai. */
  verifyTwoFactorCode(code: string): Observable<AdminUser> {
    const challenge = this.challengeState();
    if (!challenge) {
      return throwError(() => this.buildError('Phiên xác thực đã hết hiệu lực. Vui lòng đăng nhập lại.', 401, '2FA_SESSION_EXPIRED'));
    }
    if (Date.now() > challenge.expiresAt) {
      this.clearChallenge();
      return throwError(() => this.buildError('Phiên xác thực đã hết hiệu lực. Vui lòng đăng nhập lại.', 401, '2FA_SESSION_EXPIRED'));
    }

    return this.verifyTwoFactor({ otp: code.trim() });
  }

  /** Xác thực bằng mã dự phòng (mỗi mã dùng đúng một lần). */
  verifyBackupCode(code: string): Observable<AdminUser> {
    if (!this.challengeState()) {
      return throwError(() => this.buildError('Phiên xác thực đã hết hiệu lực. Vui lòng đăng nhập lại.', 401, '2FA_SESSION_EXPIRED'));
    }

    return this.verifyTwoFactor({ backupCode: formatBackupCode(code) });
  }

  cancelChallenge(): void {
    this.clearChallenge();
  }

  /**
   * Nhận dữ liệu QR thật từ response của `onboarding/setup-password`.
   * `secretKey` của backend được chuẩn hoá thành `setupKey` cho view model FE.
   */
  captureTwoFactorSetup(response: AdminOnboardingSetupResponse): AdminTwoFactorSetup {
    if (!response.success || !response.secretKey?.trim() || !response.qrUri?.startsWith('otpauth://')) {
      throw this.buildError('Dữ liệu thiết lập 2FA từ máy chủ không hợp lệ.', 500, 'INVALID_2FA_SETUP');
    }

    const setup = {
      setupKey: response.secretKey.trim(),
      qrUri: response.qrUri
    };
    this.persistTwoFactorSetup(setup);
    return setup;
  }

  /** Lấy đúng dữ liệu thiết lập của phiên/tài khoản hiện tại. */
  getTwoFactorSetup(): Observable<AdminTwoFactorSetup> {
    const existing = this.twoFactorSetupState();
    if (existing) return of(existing);

    // TODO(pre-deploy): Xóa nhánh tạo dữ liệu local khi toàn bộ màn đổi mật khẩu
    // onboarding đã gọi `onboarding/setup-password` và capture response phía trên.
    if (environment.adminDemoAuthFlow.twoFactorEnabled) {
      const setupKey = createDemoSetupKey();
      const account = encodeURIComponent(this.userState()?.email || 'admin@thinkup.edu.vn');
      const setup = {
        setupKey,
        qrUri: `otpauth://totp/ThinkUp:${account}?secret=${setupKey}&issuer=ThinkUp&algorithm=SHA1&digits=6&period=30`
      };
      this.persistTwoFactorSetup(setup);
      return of(setup);
    }

    return throwError(() => this.buildError(
      'Không tìm thấy dữ liệu thiết lập 2FA. Vui lòng thực hiện lại bước tạo mật khẩu.',
      409,
      'TWO_FACTOR_SETUP_MISSING'
    ));
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

    if (!user.mustChangePassword && environment.adminDemoAuthFlow.twoFactorEnabled && input.otp.trim() !== environment.adminDemoAuthFlow.twoFactorCode) {
      return throwError(() => this.buildError('Mã xác thực không chính xác hoặc đã hết hạn. Vui lòng thử lại.', 401, 'INVALID_OTP'));
    }

    const updatedUser: AdminUser = {
      ...user,
      passwordExpiresAt: this.addDays(new Date(), PASSWORD_LIFETIME_DAYS).toISOString(),
      mustChangePassword: false
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
    if (environment.adminDemoAuthFlow.twoFactorEnabled) {
      return from(this.verifyDemoTotp(code.trim())).pipe(
        map(valid => {
          if (!valid) {
            throw this.buildError('Mã xác thực không đúng hoặc đã hết hạn. Vui lòng thử lại.', 401, 'INVALID_OTP');
          }
        })
      );
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

  /** Xác nhận quản trị viên đã lưu mã dự phòng và hoàn tất onboarding bảo mật. */
  confirmBackupCodesSaved(): void {
    const user = this.userState();
    if (!user) return;

    const updatedUser: AdminUser = { ...user, twoFactorSetupRequired: false };
    this.persistUser(updatedUser);
    this.userState.set(updatedUser);
    if (typeof window !== 'undefined') sessionStorage.removeItem(TWO_FACTOR_SETUP_KEY);
    this.twoFactorSetupState.set(null);
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
      sessionStorage.removeItem(TWO_FACTOR_SETUP_KEY);
    }
    this.userState.set(null);
    this.challengeState.set(null);
    this.twoFactorSetupState.set(null);
  }

  private verifyTwoFactor(input: { otp: string } | { backupCode: string }): Observable<AdminUser> {
    const challenge = this.challengeState();
    if (!challenge) {
      return throwError(() => this.buildError('Phiên xác thực đã hết hiệu lực. Vui lòng đăng nhập lại.', 401, '2FA_SESSION_EXPIRED'));
    }

    return this.http.post<AdminVerifyTwoFactorResponse>(`${this.apiUrl}/admin/auth/verify-2fa`, {
      twoFactorToken: challenge.twoFactorToken,
      ...input
    }).pipe(
      map(response => this.completeChallenge(response, challenge)),
      catchError((error: unknown) => {
        const normalized = this.normalizeError(error);
        if (normalized.code === '2FA_SESSION_EXPIRED') this.clearChallenge();
        return throwError(() => normalized);
      })
    );
  }

  private completeChallenge(response: AdminVerifyTwoFactorResponse, challenge: AdminTwoFactorChallenge): AdminUser {
    if (!response.success || !response.accessToken || !response.admin) {
      throw this.buildError('Phản hồi xác thực không hợp lệ. Vui lòng thử lại.', 500, 'INVALID_RESPONSE');
    }

    if (response.admin.role.toUpperCase() !== 'ADMIN') {
      throw this.buildError('Tài khoản này không được phép truy cập trang quản trị.', 403, 'FORBIDDEN_ROLE');
    }

    const daysLeft = response.passwordStatus?.daysLeft;
    const passwordExpiresAt = typeof daysLeft === 'number'
      ? this.addDays(new Date(), response.passwordStatus?.isExpired ? -1 : daysLeft).toISOString()
      : null;
    const user: AdminUser = {
      id: response.admin.id,
      email: response.admin.email || challenge.email,
      fullName: response.admin.full_name || 'Quản trị viên',
      role: 'admin' as AdminRole,
      avatar: null,
      passwordExpiresAt,
      mustChangePassword: false,
      twoFactorSetupRequired: false
    };

    this.saveSession(response.accessToken, user, challenge.rememberMe);
    this.clearChallenge();
    return user;
  }

  private normalizeError(error: unknown): AdminAuthError {
    return error instanceof HttpErrorResponse ? this.toAuthError(error) : error as AdminAuthError;
  }

  private toAuthError(error: HttpErrorResponse): AdminAuthError {
    if (error.status === 0) {
      return this.buildError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền mạng.', 0, 'NETWORK_ERROR');
    }

    const body = error.error as { message?: string; code?: string; retryAfter?: number; remainingSeconds?: number } | null;
    const message = body?.message?.trim();
    const retryAfter = body?.remainingSeconds ?? body?.retryAfter;

    if (error.status === 401) {
      return this.buildError(message || 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!', 401, body?.code || 'INVALID_CREDENTIALS');
    }
    if (error.status === 403) {
      const code = body?.code || 'FORBIDDEN_ROLE';
      const authError = this.buildError(
        message || (code === 'ACCOUNT_LOCKED'
          ? 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.'
          : 'Tài khoản của bạn không có quyền truy cập trang quản trị.'),
        403,
        code
      );
      authError.retryAfter = retryAfter;
      return authError;
    }
    if (error.status === 429) {
      const authError = this.buildError(message || 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.', 429, body?.code || 'ACCOUNT_LOCKED');
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

  private startChallenge(email: string, twoFactorToken: string, expiresInSeconds: number, rememberMe: boolean): void {
    const challenge: AdminTwoFactorChallenge = {
      email,
      twoFactorToken,
      expiresAt: Date.now() + Math.max(1, expiresInSeconds) * 1000,
      rememberMe
    };

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
    }

    this.challengeState.set(challenge);
  }

  private clearChallenge(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(CHALLENGE_KEY);
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
      if (challenge?.email && challenge.twoFactorToken && challenge.expiresAt > Date.now()) {
        this.challengeState.set(challenge);
      } else {
        sessionStorage.removeItem(CHALLENGE_KEY);
      }
    } catch {
      sessionStorage.removeItem(CHALLENGE_KEY);
    }
  }

  private clearReminderDismissal(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(REMINDER_KEY);
  }

  private persistTwoFactorSetup(setup: AdminTwoFactorSetup): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(TWO_FACTOR_SETUP_KEY, JSON.stringify({
        ownerId: this.userState()?.id ?? null,
        setup
      }));
    }
    this.twoFactorSetupState.set(setup);
  }

  private restoreTwoFactorSetup(): void {
    if (typeof window === 'undefined') return;

    const raw = sessionStorage.getItem(TWO_FACTOR_SETUP_KEY);
    if (!raw) return;

    try {
      const stored = JSON.parse(raw) as { ownerId: string | null; setup: AdminTwoFactorSetup };
      const setup = stored.setup;
      if (
        stored.ownerId === (this.userState()?.id ?? null) &&
        setup.setupKey?.trim() &&
        setup.qrUri?.startsWith('otpauth://')
      ) {
        this.twoFactorSetupState.set(setup);
      } else {
        sessionStorage.removeItem(TWO_FACTOR_SETUP_KEY);
      }
    } catch {
      sessionStorage.removeItem(TWO_FACTOR_SETUP_KEY);
    }
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  /** Xác minh TOTP thật cho tài khoản demo; chấp nhận lệch một chu kỳ 30 giây. */
  private async verifyDemoTotp(code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code) || typeof crypto === 'undefined' || !crypto.subtle) return false;

    const key = await crypto.subtle.importKey(
      'raw',
      decodeBase32(this.twoFactorSetupState()?.setupKey ?? ''),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const currentCounter = Math.floor(Date.now() / 30_000);

    for (const offset of [-1, 0, 1]) {
      const counter = new ArrayBuffer(8);
      new DataView(counter).setBigUint64(0, BigInt(currentCounter + offset));
      const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
      const index = signature[signature.length - 1] & 0x0f;
      const value = (
        ((signature[index] & 0x7f) << 24)
        | ((signature[index + 1] & 0xff) << 16)
        | ((signature[index + 2] & 0xff) << 8)
        | (signature[index + 3] & 0xff)
      ) % 1_000_000;

      if (value.toString().padStart(6, '0') === code) return true;
    }

    return false;
  }

  private daysUntil(expiresAt: string): number {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / 86_400_000);
  }
}

/** Chuẩn hoá mã dự phòng về định dạng backend `XXXX-XXXX`. */
function formatBackupCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

function decodeBase32(value: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';

  for (const character of value.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }
  return bytes.buffer;
}

function createDemoSetupKey(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
}
