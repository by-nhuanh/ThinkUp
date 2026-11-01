import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthError } from '../../../core/models/admin-user.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { environment } from '../../../../environments/environment';
import { MOCK_ADMIN_ACCOUNT } from '../../../core/data/mock/admin-auth.mock';
import { AuthBrandBarComponent } from '../components/auth-brand-bar/auth-brand-bar.component';
import { AuthModalComponent } from '../components/auth-modal/auth-modal.component';

const LOCK_STORAGE_KEY = 'thinkup_admin_lock_until';
const DEFAULT_LOCK_SECONDS = 15 * 60;

/**
 * Màn hình đăng nhập phân hệ quản trị (Figma: node 4053-17063, khung 1920px).
 *
 * Bố cục: thanh thương hiệu phía trên + hai cột (minh hoạ 920px / biểu mẫu 1000px).
 * Tỉ lệ cột và kích thước thành phần giữ nguyên theo thiết kế, chỉ co giãn theo
 * viewport laptop qua biến CSS `--login-*` khai báo trong file CSS của component.
 *
 * Các trạng thái bổ sung theo thiết kế:
 * - Nhập sai thông tin: viền đỏ cả hai trường + thông điệp phía trên biểu mẫu (node 4061-18385).
 * - Sai quá 5 lần: hộp thoại đếm ngược 15 phút (node 4058-17173).
 * - Quên mật khẩu: hộp thoại hướng dẫn liên hệ IT (node 4061-18965).
 */
@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule, AuthBrandBarComponent, AuthModalComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly credentialsError = signal(false);
  readonly showPassword = signal(false);
  readonly helpOpen = signal(false);

  readonly demoMode = environment.adminDemoLogin;
  readonly lockSeconds = signal(0);
  readonly lockActive = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  private lockTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.errorMessage()) this.errorMessage.set('');
      if (this.credentialsError()) this.credentialsError.set(false);
    });

    this.restoreLock();

    this.destroyRef.onDestroy(() => this.stopLockTimer());
  }

  get email() {
    return this.form.controls.email;
  }

  fillDemoAccount(): void {
    this.form.patchValue({
      email: MOCK_ADMIN_ACCOUNT.email,
      password: MOCK_ADMIN_ACCOUNT.password
    });
  }

  get password() {
    return this.form.controls.password;
  }

  submit(): void {
    if (this.loading() || this.lockActive()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.credentialsError.set(false);
    this.loading.set(true);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: user => {
        this.loading.set(false);
        if (user) {
          this.goToNextStep();
        } else {
          void this.router.navigate(['/auth/two-factor'], {
            queryParams: { returnUrl: this.returnUrl() }
          });
        }
      },
      error: (error: AdminAuthError) => {
        this.loading.set(false);
        this.password.reset('');

        if (error.code === 'ACCOUNT_LOCKED') {
          this.startLock(error.retryAfter ?? DEFAULT_LOCK_SECONDS);
          return;
        }

        this.credentialsError.set(error.status === 401);
        this.errorMessage.set(
          error.status === 401
            ? 'Email hoặc mật khẩu không chính xác. Vui lòng thử lại.'
            : error.message || 'Đăng nhập thất bại. Vui lòng thử lại.'
        );
      }
    });
  }

  togglePassword(): void {
    this.showPassword.update(value => !value);
  }

  openHelp(): void {
    this.helpOpen.set(true);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  /** mm:ss cho đồng hồ đếm ngược của hộp thoại tạm khoá. */
  lockLabel(): string {
    const total = this.lockSeconds();
    const minutes = Math.floor(total / 60).toString().padStart(2, '0');
    const seconds = (total % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  /** Điều hướng theo bước kế tiếp của luồng: hạn mật khẩu → 2FA → trang đích. */
  private goToNextStep(): void {
    const user = this.auth.currentUser();
    if (user?.mustChangePassword) {
      void this.router.navigateByUrl('/auth/change-password');
      return;
    }

    if (user?.twoFactorSetupRequired) {
      void this.router.navigateByUrl('/auth/setup-2fa');
      return;
    }

    const state = this.auth.passwordState();

    if (state === 'expired') {
      void this.router.navigateByUrl('/auth/password-expired');
      return;
    }

    if (state === 'expiring' && !this.auth.passwordReminderDismissed()) {
      void this.router.navigateByUrl('/auth/password-expiring');
      return;
    }

    void this.router.navigateByUrl(this.returnUrl());
  }

  /** Chỉ chấp nhận đường dẫn nội bộ để tránh open-redirect từ query param. */
  private returnUrl(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
  }

  private startLock(seconds: number): void {
    const safeSeconds = Math.max(1, Math.floor(seconds));
    const until = Date.now() + safeSeconds * 1000;

    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCK_STORAGE_KEY, String(until));
    }

    this.lockActive.set(true);
    this.lockSeconds.set(safeSeconds);
    this.stopLockTimer();
    this.lockTimer = setInterval(() => this.tickLock(), 1000);
  }

  private tickLock(): void {
    const remaining = Math.max(0, this.lockSeconds() - 1);
    this.lockSeconds.set(remaining);

    if (remaining === 0) {
      this.endLock();
    }
  }

  private endLock(): void {
    this.stopLockTimer();
    this.lockActive.set(false);
    this.lockSeconds.set(0);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCK_STORAGE_KEY);
    }
  }

  private stopLockTimer(): void {
    if (this.lockTimer) {
      clearInterval(this.lockTimer);
      this.lockTimer = null;
    }
  }

  /** Khôi phục trạng thái tạm khoá sau khi tải lại trang. */
  private restoreLock(): void {
    if (typeof window === 'undefined') return;

    const raw = localStorage.getItem(LOCK_STORAGE_KEY);
    if (!raw) return;

    const until = Number(raw);
    const remaining = Math.ceil((until - Date.now()) / 1000);

    if (!Number.isFinite(until) || remaining <= 0) {
      localStorage.removeItem(LOCK_STORAGE_KEY);
      return;
    }

    this.lockActive.set(true);
    this.lockSeconds.set(remaining);
    this.lockTimer = setInterval(() => this.tickLock(), 1000);
  }
}
