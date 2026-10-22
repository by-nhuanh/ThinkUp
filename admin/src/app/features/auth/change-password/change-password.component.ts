import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthError } from '../../../core/models/admin-user.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { AuthShellComponent } from '../components/auth-shell/auth-shell.component';
import { OtpInputComponent } from '../components/otp-input/otp-input.component';
import { PasswordStrengthComponent } from '../components/password-strength/password-strength.component';

/**
 * Đổi mật khẩu bắt buộc (Figma: 4061-19577, các biến thể độ mạnh 4098-18070 / 4099-18139).
 *
 * Thẻ 560×668, nội dung 480px: mật khẩu hiện tại, mật khẩu mới + thanh đo độ mạnh,
 * nhập lại mật khẩu và mã OTP 2FA trước khi cập nhật.
 */
@Component({
  selector: 'app-admin-change-password',
  standalone: true,
  imports: [ReactiveFormsModule, AuthShellComponent, OtpInputComponent, PasswordStrengthComponent],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.css'
})
export class ChangePasswordComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly formError = signal('');
  readonly otpError = signal('');

  readonly showCurrent = signal(false);
  readonly showNew = signal(false);
  readonly showRepeat = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(12),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        ]
      ],
      repeatPassword: ['', [Validators.required]],
      otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    },
    { validators: [matchPasswords] }
  );

  private readonly newPasswordValue = toSignal(this.form.controls.newPassword.valueChanges, {
    initialValue: ''
  });

  protected readonly strengthValue = computed(() => this.newPasswordValue());

  submit(): void {
    if (this.loading()) return;

    this.formError.set('');
    this.otpError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    this.auth
      .changePassword({
        currentPassword: this.form.getRawValue().currentPassword,
        newPassword: this.form.getRawValue().newPassword,
        otp: this.form.getRawValue().otp
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          void this.router.navigateByUrl(this.returnUrl());
        },
        error: (error: AdminAuthError) => {
          this.loading.set(false);

          if (error.code === 'INVALID_OTP') {
            this.otpError.set(error.message);
            return;
          }

          this.formError.set(error.message || 'Không thể cập nhật mật khẩu. Vui lòng thử lại.');
        }
      });
  }

  toggle(field: 'current' | 'new' | 'repeat'): void {
    if (field === 'current') this.showCurrent.update(value => !value);
    if (field === 'new') this.showNew.update(value => !value);
    if (field === 'repeat') this.showRepeat.update(value => !value);
  }

  /** Chỉ chấp nhận đường dẫn nội bộ để tránh open-redirect từ query param. */
  private returnUrl(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
  }
}

/** Hai lần nhập mật khẩu mới phải giống nhau. */
function matchPasswords(control: AbstractControl): ValidationErrors | null {
  const password = control.get('newPassword')?.value;
  const repeat = control.get('repeatPassword')?.value;

  if (!password || !repeat) return null;
  return password === repeat ? null : { passwordMismatch: true };
}
