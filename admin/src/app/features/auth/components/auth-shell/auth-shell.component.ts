import { Component, input } from '@angular/core';
import { AuthBrandBarComponent } from '../auth-brand-bar/auth-brand-bar.component';

/**
 * Khung chung cho các màn hình xác thực đứng riêng (2FA, đổi mật khẩu, thiết lập 2FA…).
 * Gồm thanh thương hiệu phía trên và vùng nội dung canh giữa theo cả hai trục.
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [AuthBrandBarComponent],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.css'
})
export class AuthShellComponent {
  /** Nền xanh nhạt cho các màn hình thiết lập 2FA / mã dự phòng. */
  readonly tinted = input(false);
}
