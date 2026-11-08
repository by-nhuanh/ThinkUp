import { Component, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';

@Component({
  selector: 'app-system-secret-reveal-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './secret-reveal-dialog.component.html',
  styleUrls: ['../../system-page.css', './secret-reveal-dialog.component.css']
})
export class SecretRevealDialogComponent {
  readonly closed = output<void>();
  readonly verified = output<void>();

  readonly password = signal('');
  readonly error = signal('');

  /**
   * TODO(pre-deploy): Nhớ thay bằng API xác thực lại phiên Super Admin trước khi trả khóa bí mật.
   * Demo: chấp nhận mật khẩu từ 6 ký tự để kiểm tra luồng mở khóa.
   */
  submit(): void {
    if (this.password().trim().length < 6) {
      this.error.set('Mật khẩu phiên không đúng. Vui lòng kiểm tra và thử lại.');
      return;
    }
    this.verified.emit();
  }
}