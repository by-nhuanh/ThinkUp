import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { environment } from '../../../../environments/environment';

export interface ForgotPasswordErrors {
  email?: string;
  api?: string;
  code?: string;
  provider?: string;
}

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css',
})
export class ForgotPasswordComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly email = signal('');
  readonly loading = signal(false);
  readonly errors = signal<ForgotPasswordErrors>({});

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const emailParam = params['email'];
      if (emailParam) {
        this.email.set(emailParam);
      }
    });
  }

  onEmailChange(value: string): void {
    this.email.set(value);
    if (this.errors().email) {
      this.errors.update(prev => ({ ...prev, email: undefined }));
    }
  }

  validate(): ForgotPasswordErrors {
    const newErrors: ForgotPasswordErrors = {};
    const emailVal = this.email().trim();
    if (!emailVal) {
      newErrors.email = 'Vui lòng nhập email';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      newErrors.email = 'Email không hợp lệ';
    }
    return newErrors;
  }

  onSubmit(): void {
    const validationErrors = this.validate();
    if (Object.keys(validationErrors).length > 0) {
      this.errors.set(validationErrors);
      return;
    }

    const emailVal = this.email().trim();
    this.loading.set(true);

    this.authService.forgotPassword(emailVal).subscribe({
      next: (result) => {
        if (result.accountExists === false && !environment.production) {
          this.loading.set(false);
          const message = 'Không tìm thấy tài khoản';
          this.errors.set({ api: message });
          this.toastService.showToast({ type: 'error', message });
          return;
        }
        if (result.accountExists === false) {
          this.loading.set(false);
          const message = 'Không tìm thấy tài khoản';
          this.errors.set({ api: message });
          this.toastService.showToast({ type: 'error', message });
          return;
        }
        this.toastService.showToast({ type: 'success', message: 'Yêu cầu đã được tiếp nhận. Vui lòng kiểm tra email nếu tài khoản của bạn đã đăng ký.' });
        const emailToVerify = result?.email || emailVal;
        this.router.navigate(['/auth/verify-otp'], {
          queryParams: { email: emailToVerify }
        });
      },
      error: (err) => {
        const message = err.message || 'Gửi yêu cầu thất bại. Vui lòng thử lại.';
        if (err.code === 'OAUTH_ACCOUNT') {
          this.errors.set({ api: message, code: 'OAUTH_ACCOUNT', provider: err.provider });
        } else {
          this.errors.set({ api: message });
        }
        this.toastService.showToast({ type: 'error', message });
        this.loading.set(false);
      }
    });
  }
}
