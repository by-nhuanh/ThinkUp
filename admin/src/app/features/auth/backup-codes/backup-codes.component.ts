import { DOCUMENT, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { MOCK_ADMIN_BACKUP_CODES } from '../../../core/data/mock/admin-auth.mock';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { AuthBrandBarComponent } from '../components/auth-brand-bar/auth-brand-bar.component';

/**
 * Danh sách mã dự phòng sau khi thiết lập 2FA (Figma: 4111-21553).
 *
 * Trang rộng 1440px đặt giữa khung 1920px: khối cảnh báo 100px, thẻ danh sách
 * 10 mã (2 cột × 5 dòng) và thanh xác nhận trước khi hoàn tất.
 */
@Component({
  selector: 'app-admin-backup-codes',
  standalone: true,
  imports: [AuthBrandBarComponent],
  templateUrl: './backup-codes.component.html',
  styleUrl: './backup-codes.component.css'
})
export class BackupCodesComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  readonly confirmed = signal(false);
  readonly liveMessage = signal('');

  readonly codes = computed<readonly string[]>(() => {
    const issued = this.auth.issuedBackupCodes();
    if (issued.length) return issued;

    // TODO(pre-deploy): bỏ dữ liệu mẫu khi backend trả bộ mã dự phòng thật.
    return environment.adminDemoAuthFlow.twoFactorEnabled ? MOCK_ADMIN_BACKUP_CODES : [];
  });

  toggleConfirm(event: Event): void {
    this.confirmed.set((event.target as HTMLInputElement).checked);
  }

  async copy(code: string, index?: number): Promise<void> {
    const ok = await this.writeClipboard(code);
    this.liveMessage.set(ok ? `Đã sao chép mã${index ? ` ${index}` : ' dự phòng'}.` : 'Không thể sao chép. Vui lòng chọn mã và sao chép thủ công.');
  }

  async copyAll(): Promise<void> {
    const ok = await this.writeClipboard(this.codes().join('\n'));
    this.liveMessage.set(ok ? 'Đã sao chép toàn bộ mã dự phòng.' : 'Không thể sao chép. Vui lòng tải xuống tệp thay thế.');
  }

  downloadCodes(): void {
    const content = [
      'THINKUP — MÃ DỰ PHÒNG KHÔI PHỤC TÀI KHOẢN QUẢN TRỊ',
      'Mỗi mã chỉ sử dụng được một lần. Cất giữ ở nơi an toàn.',
      '',
      ...this.codes().map((code, index) => `${index + 1}. ${code}`)
    ].join('\r\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');

    anchor.href = url;
    anchor.download = 'thinkup-backup-codes.txt';
    anchor.click();

    URL.revokeObjectURL(url);
    this.liveMessage.set('Đã tải xuống tệp mã dự phòng.');
  }

  printCodes(): void {
    window.print();
  }

  finish(): void {
    if (!this.confirmed()) return;
    void this.router.navigateByUrl('/');
  }

  private async writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
