import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthError } from '../../../core/models/admin-user.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { AuthShellComponent } from '../components/auth-shell/auth-shell.component';

const CODE_LENGTH = 16;

/**
 * Xác thực bằng mã dự phòng khi không có ứng dụng sinh mã
 * (Figma: 4061-18666 trạng thái thường, 4061-18814 trạng thái mã sai).
 *
 * Mã gồm 16 ký tự, hiển thị theo nhóm 4 ký tự cho dễ đọc và chỉ dùng được một lần.
 */
@Component({
  selector: 'app-admin-backup-code',
  standalone: true,
  imports: [AuthShellComponent],
  templateUrl: './backup-code.component.html',
  styleUrl: './backup-code.component.css'
})
export class BackupCodeComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  private readonly code = signal('');

  protected readonly display = computed(() => formatGroups(this.code()));
  protected readonly canSubmit = computed(() => this.code().length === CODE_LENGTH);

  constructor() {
    if (!this.auth.isTwoFactorPending()) {
      void this.router.navigateByUrl('/login');
    }
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

    this.code.set(raw);
    input.value = formatGroups(raw);

    if (this.errorMessage()) this.errorMessage.set('');
  }

  submit(event?: Event): void {
    event?.preventDefault();

    if (this.loading() || !this.canSubmit()) return;

    this.loading.set(true);
    this.errorMessage.set('');

    this.auth.verifyBackupCode(this.code()).subscribe({
      next: () => {
        this.loading.set(false);
        this.goToNextStep();
      },
      error: (error: AdminAuthError) => {
        this.loading.set(false);
        this.errorMessage.set(error.message || 'Mã dự phòng không chính xác. Vui lòng thử lại.');
      }
    });
  }

  backToTwoFactor(): void {
    void this.router.navigate(['/auth/two-factor'], {
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

/** Nhóm 4 ký tự: `ABCD-EFGH-IJKL-MNOP`. */
function formatGroups(value: string): string {
  return value.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}
