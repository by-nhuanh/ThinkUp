import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { AuthBrandBarComponent } from '../components/auth-brand-bar/auth-brand-bar.component';

type ExpiryMode = 'expiring' | 'expired';

/**
 * Hai màn hình nhắc hạn mật khẩu:
 * - `expiring` (Figma 4220-18371): còn 5 ngày, có nút nhắc lại sau.
 * - `expired` (Figma 4220-18523): đã hết hạn, phủ nền tối và chỉ còn một lối đi.
 *
 * Cùng một thẻ nội dung, khác nhau ở kích thước thẻ và nút hành động.
 */
@Component({
  selector: 'app-admin-password-expiry',
  standalone: true,
  imports: [AuthBrandBarComponent],
  templateUrl: './password-expiry.component.html',
  styleUrl: './password-expiry.component.css'
})
export class PasswordExpiryComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly mode: ExpiryMode = this.route.snapshot.data['mode'] === 'expired' ? 'expired' : 'expiring';
  readonly isExpired = computed(() => this.mode === 'expired');

  readonly title = this.mode === 'expired' ? 'Mật khẩu đã hết hạn' : 'Mật khẩu sắp hết hạn';

  readonly message =
    this.mode === 'expired'
      ? 'Mật khẩu của bạn đã hết hạn. Vui lòng thay đổi ngay.'
      : `Mật khẩu của bạn sẽ hết hạn sau ${this.auth.daysUntilPasswordExpiry() ?? 5} ngày. Vui lòng thay đổi ngay.`;

  changePassword(): void {
    void this.router.navigateByUrl('/auth/change-password');
  }

  /** Chỉ hoãn được ở trạng thái sắp hết hạn; nhắc lại ở lần đăng nhập kế tiếp. */
  remindLater(): void {
    this.auth.dismissPasswordReminder();
    void this.router.navigateByUrl('/');
  }
}
