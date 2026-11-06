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

  private readonly overview = signal<import('../services/settings.service').AccountSecurityOverview | null>(null);
  private readonly revoking = new Set<string>();
  readonly devices = computed(() => (this.overview()?.sessions.items ?? []).map(d => ({
    id: d.id, name: d.os + ' · ' + d.browser,
    badge: d.isCurrent ? 'Thiết bị hiện tại' : '', badgeClass: d.isCurrent ? 'bg-[#DCFCE7] text-[#16A34A]' : '',
    location: d.location, ip: 'IP: ' + d.maskedIp, time: new Date(d.lastSeenAt).toLocaleString('vi-VN'),
    status: d.isCurrent ? 'Đang hoạt động' : 'Đăng xuất',
    statusClass: d.isCurrent ? 'text-[#16A34A]' : 'text-[#EF4444] border-[#FCA5A5] bg-[#FDF2F8]',
    action: d.isCurrent ? '' : 'Đăng xuất',
  })));
  readonly activities = computed(() => (this.overview()?.logs.items ?? []).map(log => ({
    id: log.id, icon: log.type === 'PASSWORD_CHANGED' ? 'lock' : 'activity', title: log.title,
    sub: [log.device.os, log.device.browser, log.device.location].filter(Boolean).join(' · '),
    time: new Date(log.createdAt).toLocaleString('vi-VN'), dotClass: 'bg-[#3061EF]',
  })));

  constructor() { this.loadSecurity(); }

  private loadSecurity(): void {
    this.settingsService.getAccountSecurity().subscribe({
      next: value => this.overview.set(value),
      error: () => this.saveStatus.set('error'),
    });
  }

  revokeDevice(id: string): void {
    if (this.revoking.has(id)) return;
    this.revoking.add(id);
    this.settingsService.revokeSession(id).subscribe({
      next: () => { this.revoking.delete(id); this.loadSecurity(); },
      error: () => { this.revoking.delete(id); this.saveStatus.set('error'); },
    });
  }

  onSavePassword(): void {
    if (this.isSaving()) return;
    const security = this.overview();
    if (!security || !security.canChangePassword || (security.passwordLockedUntil && Date.parse(security.passwordLockedUntil) > Date.now())) {
      this.saveStatus.set('error'); return;
    }
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
          this.loadSecurity();
        }
      },
      error: (error) => {
        if (error?.error?.code === 'CURRENT_PASSWORD_INVALID') this.form.update(value => ({ ...value, currentPassword: '' }));
        this.loadSecurity();
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
    value.length >= 8 && value.length <= 32 && new TextEncoder().encode(value).length <= 72 && value.trim() === value &&
    /[!@#$%^&*()_+={}\[\];':"\\|,.<>/?-]/.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}
