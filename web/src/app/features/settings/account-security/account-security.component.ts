import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  LucideCircleAlert,
  LucideEye,
  LucideEyeOff,
  LucideLaptop,
  LucideMonitor,
  LucideSmartphone,
} from '@lucide/angular';
import { SettingsService } from '../services/settings.service';
import { AccountSecurityPayload } from '../models/settings.model';
import { SettingsBackButtonComponent } from '../components/settings-back-button/settings-back-button.component';

@Component({
  selector: 'app-account-security',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    SettingsBackButtonComponent,
    LucideCircleAlert,
    LucideEye,
    LucideEyeOff,
    LucideLaptop,
    LucideMonitor,
    LucideSmartphone,
  ],
  templateUrl: './account-security.component.html',
  styleUrl: './account-security.component.css',
})
export class AccountSecurityComponent {
  readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  readonly back = () => void this.router.navigate(['/main/settings']);
  readonly isSaving = signal(false);
  readonly saveStatus = signal<'idle' | 'success' | 'error'>('idle');

  readonly hideCurrent = signal(true);
  readonly hideNew = signal(true);
  readonly hideConfirm = signal(true);

  readonly form = signal<AccountSecurityPayload>({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  /** Chỉ báo lỗi khi người dùng đã nhập mật khẩu mới nhưng chưa đủ mạnh. */
  readonly passwordTooWeak = computed(() => {
    const value = this.form().newPassword;
    return value.length > 0 && !isStrongPassword(value);
  });

  readonly devices = [
    {
      name: 'Windows · Chrome',
      badge: 'Thiết bị hiện tại',
      badgeClass: 'bg-[#DCFCE7] text-[#16A34A]',
      location: 'Hồ Chí Minh, Việt Nam',
      ip: 'IP: 118.69.XXX.XXX',
      status: 'Đang hoạt động',
      statusClass: 'text-[#16A34A]',
      action: '',
    },
    {
      name: 'iPhone 13 · Safari',
      badge: '',
      badgeClass: '',
      location: 'Hà Nội, Việt Nam',
      ip: 'IP: 123.30.XXX.XXX',
      time: '20/05/2024, 14:30',
      status: 'Đăng xuất',
      statusClass: 'text-[#EF4444] border-[#FCA5A5] bg-[#FDF2F8]',
      action: 'Đăng xuất',
    },
    {
      name: 'MacBook Air · Chrome',
      badge: '',
      badgeClass: '',
      location: 'Đà Nẵng, Việt Nam',
      ip: 'IP: 171.244.XXX.XXX',
      time: '18/05/2024, 09:15',
      status: 'Đăng xuất',
      statusClass: 'text-[#EF4444] border-[#FCA5A5] bg-[#FDF2F8]',
      action: 'Đăng xuất',
    },
  ];

  readonly activities = [
    { icon: 'activity', title: 'Đăng nhập thành công', sub: 'Windows · Chrome · Hồ Chí Minh, Việt Nam', time: 'Hôm nay, 10:45', dotClass: 'bg-[#16A34A]' },
    { icon: 'lock', title: 'Đổi mật khẩu', sub: '· Hồ Chí Minh, Việt Nam', time: '20/05/2024, 09:30', dotClass: 'bg-[#3061EF]' },
    { icon: 'mail', title: 'Thêm số điện thoại dự phòng', sub: '· Hồ Chí Minh, Việt Nam', time: '20/05/2024, 09:25', dotClass: 'bg-[#EF4444]' },
  ];

  onSavePassword(): void {
    if (this.isSaving()) return;
    const payload = this.form();
    if (!payload.currentPassword || !payload.newPassword || !payload.confirmNewPassword) {
      this.saveStatus.set('error');
      return;
    }
    if (payload.newPassword !== payload.confirmNewPassword) {
      this.saveStatus.set('error');
      return;
    }
    if (!isStrongPassword(payload.newPassword)) {
      this.saveStatus.set('error');
      return;
    }
    this.isSaving.set(true);
    this.settingsService.changePassword(payload).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.saveStatus.set(res.success ? 'success' : 'error');
        if (res.success) {
          this.form.set({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.saveStatus.set('error');
      },
    });
  }

  trackByIdx = (_: number, item: { title: string }) => item.title;
}

/** Mật khẩu hợp lệ: tối thiểu 8 ký tự, có chữ hoa, chữ thường và số. */
function isStrongPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}
