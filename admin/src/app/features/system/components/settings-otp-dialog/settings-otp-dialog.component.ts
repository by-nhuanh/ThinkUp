import { Component, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';

@Component({
  selector: 'app-system-settings-otp-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './settings-otp-dialog.component.html',
  styleUrls: ['../../system-page.css', './settings-otp-dialog.component.css']
})
export class SettingsOtpDialogComponent {
  readonly serverError = input('');

  readonly closed = output<void>();
  readonly submitted = output<string>();

  readonly otp = signal('');
  readonly localError = signal('');

  onOtp(value: string): void {
    this.otp.set(value.replace(/\D/g, '').slice(0, 6));
    this.localError.set('');
  }

  submit(): void {
    if (this.otp().length !== 6) {
      this.localError.set('Mã OTP phải gồm đủ 6 chữ số.');
      return;
    }
    this.submitted.emit(this.otp());
  }
}