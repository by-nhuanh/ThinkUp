import { FacebookAuthService } from '../../../core/services/facebook-auth.service';
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { OnboardingService } from '../../../core/services/onboarding.service';
import { AuthApiError } from '../../../core/models/user.model';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly onboardingService = inject(OnboardingService);
  private readonly toastService = inject(ToastService);
  private googleInitialized = false;
  private readonly facebook = inject(FacebookAuthService);
  private readonly facebookReady = this.facebook.prepare().catch(() => undefined);

  readonly email = signal('');
  readonly password = signal('');
  readonly rememberMe = signal(false);

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly hasAuthError = signal(false);
  readonly errorMessage = signal('');
  readonly networkToast = signal('');
  readonly activatedToast = signal('');

  // BR-AUTH-03 & AC-09: Quản lý Brute-force 5 lần sai
  readonly failedAttempts = signal(0);
  readonly lockoutRemainingSeconds = signal(0);
  private timerInterval: any = null;

  readonly showVerificationResend = signal(false);
  readonly resendingVerification = signal(false);
  readonly verificationCooldownSeconds = signal(0);
  private verificationTimer: ReturnType<typeof setInterval> | null = null;

  // BR-AUTH-01, AC-02, AC-03: Realtime computed checking
  readonly isEmailValid = computed(() => {
    const trimmed = this.email().trim();
    // RFC 5322 regex cơ bản
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  });

  readonly isPasswordValid = computed(() => {
    return this.password().trim().length >= 8;
  });

  readonly isLockedOut = computed(() => this.lockoutRemainingSeconds() > 0);

  readonly canSubmit = computed(() => {
    return this.isEmailValid() && this.isPasswordValid() && !this.isLockedOut() && !this.loading();
  });

  readonly lockoutRemainingFormatted = computed(() => {
    const totalSec = this.lockoutRemainingSeconds();
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  });

  ngOnInit(): void {
    // SPEC-REG-STU-01 Bước 4: Kiểm tra queryParams kích hoạt tài khoản
    const qParams = this.route.snapshot.queryParams;
    if (qParams['activated'] === 'true') {
      this.activatedToast.set('Kích hoạt tài khoản thành công! Vui lòng đăng nhập để bắt đầu học tập.');
    }
    if (qParams['registered'] === 'true') {
      this.activatedToast.set('Đăng ký thành công. Vui lòng kiểm tra email và bấm liên kết kích hoạt trước khi đăng nhập.');
      this.showVerificationResend.set(true);
      this.startVerificationCooldown(60);
    }
    if (qParams['email']) this.email.set(String(qParams['email']));
    if (qParams['error']) {
      this.networkToast.set(String(qParams['error']));
      this.showVerificationResend.set(true);
    }

    // Phục hồi lockout timer nếu trước đó đã bị khóa (lưu trong sessionStorage)
    if (typeof sessionStorage !== 'undefined') {
      const lockUntil = sessionStorage.getItem('thinkup_login_lock_until');
      if (lockUntil) {
        const remaining = Math.max(0, Math.floor((parseInt(lockUntil, 10) - Date.now()) / 1000));
        if (remaining > 0) {
          this.startLockoutTimer(remaining);
        } else {
          sessionStorage.removeItem('thinkup_login_lock_until');
        }
      }
    }
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.verificationTimer) clearInterval(this.verificationTimer);
  }

  onInputChange(): void {
    // BR-AUTH-01: Không hiện lỗi khi đang gõ. Nếu trước đó có viền đỏ submit sai, người dùng gõ lại thì reset viền đỏ.
    if (this.hasAuthError()) {
      this.hasAuthError.set(false);
      this.errorMessage.set('');
    }
    if (this.networkToast()) {
      this.networkToast.set('');
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  clearErrors(): void {
    this.hasAuthError.set(false);
    this.errorMessage.set('');
    this.networkToast.set('');
  }

  handleLogin(): void {
    if (!this.canSubmit() || this.loading()) return;

    this.loading.set(true);
    this.clearErrors();

    const cleanEmail = this.email().trim();
    const cleanPassword = this.password();

    this.authService.login({
      email: cleanEmail,
      password: cleanPassword,
      rememberMe: this.rememberMe()
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.failedAttempts.set(0);
        this.handleLoginSuccess();
      },
      error: (err) => {
        this.loading.set(false);
        this.handleLoginFailure(err);
      }
    });
  }

  private handleLoginSuccess(): void {
    if (!this.authService.isAuthenticated()) {
      this.hasAuthError.set(true);
      this.errorMessage.set('Không thể xác định tài khoản đăng nhập. Vui lòng thử lại.');
      return;
    }
    this.navigateAfterLogin();
  }

  private handleLoginFailure(err: AuthApiError): void {
    if (err.errorCode === 'ACCOUNT_PENDING') {
      this.showVerificationResend.set(true);
      this.hasAuthError.set(true);
      this.errorMessage.set(err.message);
      return;
    }
    if (err.errorCode === 'BRUTE_FORCE_LOCKED') {
      this.startLockoutTimer(err.retryAfter || 900);
      this.hasAuthError.set(true);
      this.errorMessage.set(err.message);
      return;
    }
    if (err.errorCode === 'ACCOUNT_SUSPENDED') {
      this.hasAuthError.set(true);
      this.errorMessage.set(err.message);
      return;
    }

    // EX-AUTH-01 & AC-16: Mất mạng hoặc Server Timeout
    if (err.errorCode === 'NETWORK_ERROR' || err.status === 0 || (err.status || 0) >= 500) {
      // Giữ nguyên form, không xóa dữ liệu
      this.networkToast.set('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền mạng!');
      return;
    }

    // BR-AUTH-03 & AC-09: Tăng số lần đăng nhập sai
    // BR-AUTH-02, AC-07, AC-08: Thông báo trung tính an toàn, viền đỏ cả 2 ô
    this.hasAuthError.set(true);
    this.errorMessage.set('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!');
  }

  private startLockoutTimer(seconds: number): void {
    this.lockoutRemainingSeconds.set(seconds);
    const lockUntil = Date.now() + seconds * 1000;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('thinkup_login_lock_until', lockUntil.toString());
    }

    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      const cur = this.lockoutRemainingSeconds();
      if (cur <= 1) {
        clearInterval(this.timerInterval);
        this.lockoutRemainingSeconds.set(0);
        this.failedAttempts.set(0);
        this.clearErrors();
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('thinkup_login_lock_until');
        }
      } else {
        this.lockoutRemainingSeconds.set(cur - 1);
      }
    }, 1000);
  }

  handleSocialLogin(provider: 'Google' | 'Facebook'): void {
    if (provider === 'Facebook') {
      if (this.loading()) return;
      this.facebook.login().then(accessToken => {
        this.loading.set(true); this.clearErrors();
        this.authService.loginWithFacebook(accessToken, this.rememberMe()).subscribe({
          next: () => { this.loading.set(false); this.handleLoginSuccess(); },
          error: (error: AuthApiError) => { this.loading.set(false); this.networkToast.set(error.message || 'Không đăng nhập được bằng Facebook.'); },
        });
      }).catch(error => this.toastService.showToast({ type: 'error', message: error.message }));
      return;
    }
    if (!environment.googleClientId) {
      this.toastService.showToast({ type: 'error', message: 'Google Sign-In chưa được cấu hình.' });
      return;
    }
    this.loadGoogleIdentity().then(() => {
      const google = (window as any).google;
      if (!this.googleInitialized) {
        google.accounts.id.initialize({
          client_id: environment.googleClientId,
          callback: (response: { credential?: string }) => this.submitGoogleLogin(response.credential),
        });
        this.googleInitialized = true;
      }
      google.accounts.id.prompt();
    }).catch(() => this.toastService.showToast({ type: 'error', message: 'Không thể khởi tạo đăng nhập Google. Vui lòng thử lại.' }));
  }

  private submitGoogleLogin(idToken?: string): void {
    if (!idToken || this.loading()) return;
    this.loading.set(true);
    this.clearErrors();
    this.authService.loginWithGoogle(idToken, this.rememberMe()).subscribe({
      next: () => { this.loading.set(false); this.handleLoginSuccess(); },
      error: (err: AuthApiError) => {
        this.loading.set(false);
        if (err.errorCode === 'NETWORK_ERROR' || err.status === 0 || (err.status || 0) >= 500) {
          this.networkToast.set(err.message || 'Không thể kết nối đến máy chủ. Vui lòng thử lại.');
          return;
        }
        const message = err.message || 'Không thể xác thực tài khoản Google. Vui lòng thử lại.';
        this.hasAuthError.set(true);
        this.errorMessage.set(message);
      },
    });
  }

  private loadGoogleIdentity(): Promise<void> {
    if ((window as any).google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
      if (existing) {
        if ((window as any).google?.accounts?.id) { resolve(); return; }
        existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(), { once: true }); return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true;
      script.dataset['googleIdentity'] = 'true'; script.onload = () => resolve(); script.onerror = () => reject();
      document.head.appendChild(script);
    });
  }

  resendVerification(): void {
    const email = this.email().trim();
    if (!this.isEmailValid() || this.resendingVerification() || this.verificationCooldownSeconds() > 0) return;
    this.resendingVerification.set(true);
    this.authService.resendVerification(email).subscribe({
      next: (res) => {
        this.resendingVerification.set(false);
        this.startVerificationCooldown(60);
        this.toastService.showToast({ type: 'success', message: res.message });
      },
      error: (err: AuthApiError) => {
        this.resendingVerification.set(false);
        this.networkToast.set(err.message);
        if (err.status === 429) {
          const seconds = Number(err.message.match(/(\d+)\s*giây/)?.[1]);
          this.startVerificationCooldown(Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
        }
      }
    });
  }

  private startVerificationCooldown(seconds: number): void {
    if (this.verificationTimer) clearInterval(this.verificationTimer);
    this.verificationCooldownSeconds.set(seconds);
    this.verificationTimer = setInterval(() => {
      this.verificationCooldownSeconds.update(remaining => Math.max(0, remaining - 1));
      if (this.verificationCooldownSeconds() === 0 && this.verificationTimer) {
        clearInterval(this.verificationTimer);
        this.verificationTimer = null;
      }
    }, 1000);
  }

  private navigateAfterLogin(): void {
    // BR-AUTH-05 & AC-15: Ưu tiên Return URL (hoặc queryParam 'next')
    const requested = this.route.snapshot.queryParams['returnUrl'] || this.route.snapshot.queryParams['next'];
    const queryReturn = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/auth/')
      ? requested : null;

    // Nếu học viên chưa hoàn thành khảo sát Onboarding: Ép chuyển hướng về /onboarding
    if (this.authService.currentUser()?.role === 'student' && !this.onboardingService.isOnboardingCompleted()) {
      // Bảo lưu returnUrl sau khi hoàn tất khảo sát
      if (queryReturn && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('thinkup_post_onboarding_return', queryReturn);
      }
      this.router.navigate(['/onboarding']);
      return;
    }

    const destination = queryReturn || '/main/courses';
    this.router.navigateByUrl(destination);
  }
}
