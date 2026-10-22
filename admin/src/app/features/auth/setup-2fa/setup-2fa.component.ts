import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MOCK_ADMIN_SETUP_KEY } from '../../../core/data/mock/admin-auth.mock';
import { AdminAuthError } from '../../../core/models/admin-user.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { AuthBrandBarComponent } from '../components/auth-brand-bar/auth-brand-bar.component';
import { OtpInputComponent } from '../components/otp-input/otp-input.component';

type SetupStep = 1 | 2 | 3;
type AuthenticatorApp = 'google' | 'microsoft';
type StepState = 'done' | 'current' | 'todo';

/**
 * Thiết lập xác thực 2 lớp lần đầu (Figma: 4061-21077 bước 1, 4061-21315 bước 2,
 * 4061-20514 bước 3).
 *
 * Bố cục 1920px: khối nội dung rộng 1440px, tiến trình 340px bên trái,
 * thẻ nội dung 720×560 bên phải; thu gọn theo viewport laptop bằng biến CSS.
 */
@Component({
  selector: 'app-admin-setup-2fa',
  standalone: true,
  imports: [ReactiveFormsModule, AuthBrandBarComponent, OtpInputComponent],
  templateUrl: './setup-2fa.component.html',
  styleUrl: './setup-2fa.component.css'
})
export class SetupTwoFactorComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly step = signal<SetupStep>(1);
  readonly selectedApp = signal<AuthenticatorApp | null>(null);
  readonly setupKey = MOCK_ADMIN_SETUP_KEY;
  readonly copied = signal(false);
  readonly loading = signal(false);
  readonly otpError = signal('');

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  private readonly codeValue = toSignal(this.form.controls.code.valueChanges, { initialValue: '' });
  protected readonly canSubmit = computed(() => this.codeValue().length === 6);

  private readonly otp = viewChild(OtpInputComponent);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  /** Trạng thái của từng bước trên thanh tiến trình. */
  stepState(step: SetupStep): StepState {
    if (step < this.step()) return 'done';
    return step === this.step() ? 'current' : 'todo';
  }

  selectApp(app: AuthenticatorApp): void {
    this.selectedApp.set(app);
    this.step.set(2);
  }

  /** Quay lại bước đã hoàn tất từ thanh tiến trình. */
  goToStep(step: SetupStep): void {
    if (this.stepState(step) !== 'done') return;

    this.step.set(step);

    if (step === 1) {
      this.otpError.set('');
      this.form.reset({ code: '' });
    }
  }

  continueToVerify(): void {
    this.otpError.set('');
    this.step.set(3);
  }

  async copySetupKey(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.setupKey);
      this.copied.set(true);

      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Trình duyệt chặn clipboard (không phải HTTPS): để người dùng tự chọn mã.
      this.copied.set(false);
    }
  }

  verify(): void {
    if (this.loading() || !this.canSubmit()) return;

    this.loading.set(true);
    this.otpError.set('');

    this.auth.verifySetupCode(this.form.getRawValue().code).subscribe({
      next: () => {
        this.auth.completeTwoFactorSetup().subscribe({
          next: () => {
            this.loading.set(false);
            void this.router.navigateByUrl('/auth/backup-codes');
          },
          error: () => {
            this.loading.set(false);
            this.otpError.set('Không thể hoàn tất thiết lập. Vui lòng thử lại.');
          }
        });
      },
      error: (error: AdminAuthError) => {
        this.loading.set(false);
        this.otpError.set(error.message || 'Mã xác thực không đúng hoặc đã hết hạn. Vui lòng thử lại.');
        this.form.reset({ code: '' });
        this.otp()?.focusFirst();
      }
    });
  }
}
