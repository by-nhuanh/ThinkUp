import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthError } from '../../../core/models/admin-user.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { AuthShellComponent } from '../components/auth-shell/auth-shell.component';
import { OtpInputComponent } from '../components/otp-input/otp-input.component';

/**
 * Bước xác thực 2 lớp sau khi nhập đúng email/mật khẩu
 * (Figma: 4061-18519 trạng thái thường, 4062-17376 trạng thái mã sai).
 *
 * Thẻ nội dung 620×520 đặt giữa trang, ô mã 56×64, nút xác nhận chỉ bật khi đủ 6 chữ số.
 */
@Component({
  selector: 'app-admin-two-factor',
  standalone: true,
  imports: [ReactiveFormsModule, AuthShellComponent, OtpInputComponent],
  templateUrl: './two-factor.component.html',
  styleUrl: './two-factor.component.css'
})
export class TwoFactorComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  private readonly codeValue = toSignal(this.form.controls.code.valueChanges, { initialValue: '' });
  protected readonly canSubmit = computed(() => this.codeValue().length === 6);

  private readonly otp = viewChild(OtpInputComponent);

  constructor() {
    if (!this.auth.isTwoFactorPending()) {
      void this.router.navigateByUrl('/login');
    }
  }

  submit(): void {
    if (this.loading() || !this.canSubmit()) return;

    this.loading.set(true);
    this.errorMessage.set('');

    this.auth.verifyTwoFactorCode(this.form.getRawValue().code).subscribe({
      next: () => {
        this.loading.set(false);
        this.goToNextStep();
      },
      error: (error: AdminAuthError) => {
        this.loading.set(false);
        this.errorMessage.set(
          error.message || 'Mã xác thực không chính xác hoặc đã hết hạn. Vui lòng thử lại.'
        );
        this.form.reset({ code: '' });
        this.otp()?.focusFirst();
      }
    });
  }

  goToBackupCode(): void {
    void this.router.navigate(['/auth/backup-code'], {
      queryParams: { returnUrl: this.returnUrl() }
    });
  }

  private goToNextStep(): void {
    const state = this.auth.passwordState();

    if (state === 'expired') {
      void this.router.navigateByUrl('/auth/password-expired');
      return;
    }

    if (state === 'expiring' && !this.auth.passwordReminderDismissed()) {
      void this.router.navigate(['/auth/password-expiring'], {
        queryParams: { returnUrl: this.returnUrl() }
      });
      return;
    }

    void this.router.navigateByUrl(this.returnUrl());
  }

  /** Chỉ chấp nhận đường dẫn nội bộ để tránh open-redirect từ query param. */
  private returnUrl(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
  }
}
