import { FacebookAuthService } from '../../../core/services/facebook-auth.service';
import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AuthApiError, AuthResponse } from '../../../core/models/user.model';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-sign-up',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './sign-up.component.html',
  styleUrl: './sign-up.component.css'
})
export class SignUpComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private googleInitialized = false;
  private googleLoadPromise: Promise<void> | null = null;
  @ViewChild('googleButtonHost') private googleButtonHost?: ElementRef<HTMLElement>;
  private readonly facebook = inject(FacebookAuthService);
  private readonly facebookReady = this.facebook.prepare().catch(() => undefined);

  // Form Fields as Signals for 100% reactive computed tracking
  readonly fullName = signal('');
  readonly phone = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly agreedToTerms = signal(false);

  // Touch States (BR-REG-01: Chỉ hiện lỗi khi touched && invalid)
  readonly fullNameTouched = signal(false);
  readonly phoneTouched = signal(false);
  readonly emailTouched = signal(false);

  // Server error overrides (EX-REG-01, AC-14)
  readonly serverEmailDuplicate = signal(false);
  readonly serverPhoneDuplicate = signal(false);
  readonly serverFieldErrors = signal<Partial<Record<'fullName' | 'phone' | 'email' | 'password' | 'confirmPassword' | 'terms', string>>>({});

  // UI States
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly loading = signal(false);
  readonly networkToast = signal('');
  readonly successToast = signal('');

  ngOnInit(): void {
    this.prepareGoogleButton();
  }

  // --- Real-time Validation Logics ---

  // BR-REG-02: Họ và tên (2-50 ký tự, chỉ chữ cái và khoảng trắng, cấm số và ký tự đặc biệt)
  readonly fullNameValidation = computed(() => {
    const trimmed = this.fullName().trim();
    if (!trimmed) {
      return { valid: false, message: 'Vui lòng nhập họ và tên.' };
    }
    if (trimmed.length < 2 || trimmed.length > 50) {
      return { valid: false, message: 'Họ và tên phải từ 2 đến 50 ký tự.' };
    }
    // Regex cho phép tiếng Việt có dấu, tiếng Anh và khoảng trắng
    const nameRegex = /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ\s]+$/;
    if (!nameRegex.test(trimmed)) {
      return { valid: false, message: 'Tên không được chứa số hoặc ký tự đặc biệt.' };
    }
    return { valid: true, message: '' };
  });

  readonly showFullNameError = computed(() => {
    return !!this.serverFieldErrors().fullName || (this.fullNameTouched() && !this.fullNameValidation().valid);
  });

  readonly fullNameErrorMessage = computed(() => {
    return this.serverFieldErrors().fullName || this.fullNameValidation().message;
  });

  // BR-REG-03: Số điện thoại (Đúng 10 số, bắt đầu bằng 03, 05, 07, 08, 09)
  readonly phoneValidation = computed(() => {
    if (this.serverPhoneDuplicate()) {
      return { valid: false, message: 'Số điện thoại này đã được đăng ký!' };
    }
    const cleanPhone = this.phone().trim().replace(/\s/g, '');
    if (!cleanPhone) {
      return { valid: false, message: 'Vui lòng nhập số điện thoại.' };
    }
    if (!/^[0-9]+$/.test(cleanPhone) || cleanPhone.length !== 10) {
      return { valid: false, message: 'Số điện thoại không hợp lệ' };
    }
    if (!/^(03|05|07|08|09)/.test(cleanPhone)) {
      return { valid: false, message: 'Số điện thoại phải bắt đầu bằng đầu số di động Việt Nam (03, 05, 07, 08, 09).' };
    }
    return { valid: true, message: '' };
  });

  readonly showPhoneError = computed(() => {
    return !!this.serverFieldErrors().phone || ((this.phoneTouched() || this.serverPhoneDuplicate()) && !this.phoneValidation().valid);
  });

  readonly phoneErrorMessage = computed(() => {
    return this.serverFieldErrors().phone || this.phoneValidation().message;
  });

  // BR-REG-04: Email (RFC 5322, kiểm tra trùng lặp)
  readonly emailValidation = computed(() => {
    if (this.serverEmailDuplicate()) {
      return { valid: false, message: 'Email này đã được sử dụng. Vui lòng đăng nhập hoặc đăng ký với email khác!' };
    }
    const cleanEmail = this.email().trim();
    if (!cleanEmail) {
      return { valid: false, message: 'Vui lòng nhập địa chỉ email.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { valid: false, message: 'Email không đúng định dạng (vd: example@gmail.com).' };
    }
    return { valid: true, message: '' };
  });

  readonly showEmailError = computed(() => {
    return !!this.serverFieldErrors().email || ((this.emailTouched() || this.serverEmailDuplicate()) && !this.emailValidation().valid);
  });

  readonly emailErrorMessage = computed(() => {
    return this.serverFieldErrors().email || this.emailValidation().message;
  });

  // BR-REG-05: Mật khẩu Real-time Checklist (8-64 ký tự, hoa, thường, số, ký tự đặc biệt)
  readonly passwordCriteria = computed(() => {
    const p = this.password().trim();
    const hasLength = p.length >= 8 && p.length <= 64;
    const hasUpper = /[A-Z]/.test(p);
    const hasLower = /[a-z]/.test(p);
    const hasNumber = /[0-9]/.test(p);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p);

    const missingParts: string[] = [];
    if (!hasLength) missingParts.push('8 ký tự');
    if (!hasUpper) missingParts.push('chữ hoa');
    if (!hasLower) missingParts.push('chữ thường');
    if (!hasNumber) missingParts.push('số');
    if (!hasSpecial) missingParts.push('ký tự đặc biệt');

    const isValid = hasLength && hasUpper && hasLower && hasNumber && hasSpecial;
    return {
      isValid,
      missingText: missingParts.join(', ')
    };
  });

  readonly passwordInputClass = computed(() => {
    if (this.password().length === 0) return 'border-[#C2C6D6] focus:border-[#006AB5]';
    return this.passwordCriteria().isValid
      ? 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20'
      : 'border-amber-500 focus:border-amber-500 focus:ring-amber-500/20';
  });

  // BR-REG-06, AC-08, AC-09: So khớp chéo Xác nhận mật khẩu
  readonly confirmPasswordStatus = computed(() => {
    const isDirty = this.confirmPassword().length > 0;
    const isMatch = isDirty && this.confirmPassword().trim() === this.password().trim();
    return { isDirty, isMatch };
  });

  readonly confirmPasswordInputClass = computed(() => {
    return this.confirmPassword().length === 0 || this.confirmPasswordStatus().isMatch
      ? 'border-[#C2C6D6] focus:border-[#006AB5]'
      : 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/20';
  });

  // AC-02, AC-10, AC-11: Nút Submit chỉ Enabled khi thỏa mãn toàn bộ điều kiện
  readonly canSubmit = computed(() => {
    const valid = this.fullNameValidation().valid &&
                  this.phoneValidation().valid &&
                  this.emailValidation().valid &&
                  this.passwordCriteria().isValid &&
                  this.confirmPasswordStatus().isMatch &&
                  this.agreedToTerms() &&
                  !this.loading();
    return valid;
  });

  // Reset Server Error khi người dùng gõ lại
  onFullNameChange(): void {
    this.clearFieldError('fullName');
    if (this.networkToast()) this.networkToast.set('');
  }

  onPhoneChange(): void {
    if (this.serverPhoneDuplicate()) this.serverPhoneDuplicate.set(false);
    this.clearFieldError('phone');
    if (this.networkToast()) this.networkToast.set('');
  }

  onEmailChange(): void {
    if (this.serverEmailDuplicate()) this.serverEmailDuplicate.set(false);
    this.clearFieldError('email');
    if (this.networkToast()) this.networkToast.set('');
  }

  onPasswordChange(): void {
    this.clearFieldError('password');
    this.clearFieldError('confirmPassword');
    if (this.networkToast()) this.networkToast.set('');
  }

  clearFieldError(field: 'fullName' | 'phone' | 'email' | 'password' | 'confirmPassword' | 'terms'): void {
    this.serverFieldErrors.update(errors => ({ ...errors, [field]: undefined }));
  }

  // --- Submit Luồng Đăng Ký (AC-13, AC-14, AC-15, EX-REG-01, EX-REG-02) ---
  handleSignUp(): void {
    if (!this.canSubmit() || this.loading()) return;

    this.loading.set(true);
    this.networkToast.set('');
    this.successToast.set('');
    this.serverFieldErrors.set({});

    const payload = {
      fullName: this.fullName().trim(),
      phone: this.phone().trim().replace(/\s/g, ''),
      email: this.email().trim(),
      password: this.password().trim(),
      confirmPassword: this.confirmPassword().trim(),
      termsAccepted: this.agreedToTerms()
    };

    this.authService.signUp(payload).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.handleSignUpSuccess(res);
      },
      error: (err) => {
        this.loading.set(false);
        this.handleSignUpFailure(err);
      }
    });
  }

  private handleSignUpSuccess(res: AuthResponse): void {
    this.successToast.set(res.message || 'Đăng ký thành công. Vui lòng kiểm tra email để kích hoạt tài khoản.');

    // Chỉ liên kết trong email mới kích hoạt tài khoản; chưa tạo phiên đăng nhập.
    setTimeout(() => {
      this.router.navigate(['/auth/login'], {
        queryParams: { registered: 'true', email: res.email || this.email().trim() }
      });
    }, 1500);
  }

  private handleSocialAuthSuccess(res: AuthResponse): void {
    const user = res.user;
    if (!res.token || !user) {
      this.handleSignUpFailure(new Error('Phản hồi đăng nhập mạng xã hội không hợp lệ.') as AuthApiError);
      return;
    }

    this.toastService.showToast({ type: 'success', message: res.message || 'Đăng nhập thành công.' });
    const destination = user.role === 'student' && !user.onboarding_completed
      ? '/onboarding'
      : '/main/home';
    void this.router.navigateByUrl(destination);
  }

  private handleSignUpFailure(err: AuthApiError): void {
    // EX-REG-02 & AC-18: Mất kết nối mạng
    if (err.errorCode === 'NETWORK_ERROR' || err.status === 0 || (err.status || 0) >= 500) {
      this.networkToast.set('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng Internet!');
      return;
    }

    // EX-REG-01 & AC-14: Trùng lặp Email
    if (err?.errorCode === 'DUPLICATE_EMAIL') {
      this.emailTouched.set(true);
      this.serverEmailDuplicate.set(true);
      return;
    }

    // EX-REG-01 & AC-14: Trùng lặp Số điện thoại
    if (err?.errorCode === 'DUPLICATE_PHONE') {
      this.phoneTouched.set(true);
      this.serverPhoneDuplicate.set(true);
      return;
    }

    if (err.field && ['fullName', 'phone', 'email', 'password', 'confirmPassword', 'terms'].includes(err.field)) {
      this.serverFieldErrors.set({ [err.field]: err.message });
      if (err.field === 'fullName') this.fullNameTouched.set(true);
      if (err.field === 'phone') this.phoneTouched.set(true);
      if (err.field === 'email') this.emailTouched.set(true);
      return;
    }

    this.networkToast.set(err.message || 'Không thể đăng ký. Vui lòng thử lại.');
  }

  handleSocialSignUp(provider: 'Google' | 'Facebook'): void {
    if (provider === 'Facebook') {
      if (this.loading()) return;
      this.facebook.login().then(accessToken => {
        this.loading.set(true);
        this.authService.signUpWithFacebook(accessToken).subscribe({
          next: result => { this.loading.set(false); this.handleSocialAuthSuccess(result); },
          error: (error: AuthApiError) => { this.loading.set(false); this.handleSignUpFailure(error); },
        });
      }).catch(error => this.toastService.showToast({ type: 'error', message: error.message }));
      return;
    }
    this.prepareGoogleButton();
  }

  private prepareGoogleButton(): void {
    if (!environment.googleClientId) {
      this.toastService.showToast({ type: 'error', message: 'Google Sign-In chưa được cấu hình.' });
      return;
    }
    this.loadGoogleIdentity().then(() => {
      const google = (window as any).google;
      if (!this.googleInitialized) {
        google.accounts.id.initialize({
          client_id: environment.googleClientId,
          callback: (response: { credential?: string }) => this.submitGoogleSignUp(response.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        this.googleInitialized = true;
      }
      const host = this.googleButtonHost?.nativeElement;
      const clickTarget = host?.querySelector<HTMLElement>('.google-gis-click-target');
      if (clickTarget && !clickTarget.childElementCount) {
        google.accounts.id.renderButton(clickTarget, { type: 'standard', theme: 'outline', size: 'large', text: 'signup_with', shape: 'rectangular', logo_alignment: 'left', width: Math.max(120, Math.floor(clickTarget.getBoundingClientRect().width)) });
      }
    }).catch((error: unknown) => {
      console.error('[Google Sign-Up] Could not load Google Identity Services.', error);
      this.toastService.showToast({ type: 'error', message: 'Không thể tải dịch vụ Google. Hãy kiểm tra kết nối hoặc cho phép accounts.google.com rồi tải lại trang.' });
    });
  }

  private submitGoogleSignUp(idToken?: string): void {
    if (!idToken || this.loading()) return;
    this.loading.set(true);
    this.networkToast.set('');
    this.successToast.set('');
    this.authService.signUpWithGoogle(idToken).subscribe({
      next: (res) => { this.loading.set(false); this.handleSocialAuthSuccess(res); },
      error: (err: AuthApiError) => { this.loading.set(false); this.handleSignUpFailure(err); },
    });
  }

  private loadGoogleIdentity(): Promise<void> {
    if ((window as any).google?.accounts?.id) return Promise.resolve();
    if (this.googleLoadPromise) return this.googleLoadPromise;
    this.googleLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
      if (existing) {
        if ((window as any).google?.accounts?.id) { resolve(); return; }
        existing.addEventListener('load', () => (window as any).google?.accounts?.id ? resolve() : reject(new Error('Google Identity Services loaded without an API')), { once: true });
        existing.addEventListener('error', () => reject(new Error('Google Identity Services failed to load')), { once: true }); return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true;
      script.dataset['googleIdentity'] = 'true';
      script.onload = () => (window as any).google?.accounts?.id ? resolve() : reject(new Error('Google Identity Services loaded without an API'));
      script.onerror = () => reject(new Error('Google Identity Services failed to load'));
      document.head.appendChild(script);
    });
    return this.googleLoadPromise;
  }

}
