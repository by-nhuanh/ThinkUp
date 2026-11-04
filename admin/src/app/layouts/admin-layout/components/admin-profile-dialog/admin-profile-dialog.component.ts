import { Component, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { AdminUser } from '../../../../core/models/admin-user.model';
import type { AdminProfileField } from '../../../../core/services/admin-profile.presenter';
import {
  buildProfileSections,
  initials,
  roleLabel,
  statusLabel
} from '../../../../core/services/admin-profile.presenter';
import { AdminPreferencesService } from '../../../../core/services/admin-preferences.service';
import { copyText } from '../../../../shared/utils/clipboard';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';

interface CopyFeedback {
  key: string;
  ok: boolean;
}

/**
 * Hồ sơ quản trị viên ở chế độ chỉ xem.
 *
 * Ba nhóm thông tin theo BA: định danh hệ thống & tổ chức, vai trò & thẩm quyền,
 * bảo mật & phiên làm việc. Chỉ render giá trị thật từ `/api/admin/auth/me`;
 * Organization ID, SSO, ngày cấp quyền và permission matrix chưa có trong
 * contract nên hiển thị trạng thái "chưa được cung cấp" (không sinh dữ liệu giả).
 */
@Component({
  selector: 'app-admin-profile-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './admin-profile-dialog.component.html',
  styleUrl: './admin-profile-dialog.component.css'
})
export class AdminProfileDialogComponent implements OnDestroy {
  private readonly preferences = inject(AdminPreferencesService);

  readonly user = input.required<AdminUser>();
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly closed = output<void>();
  readonly retry = output<void>();

  readonly copyFeedback = signal<CopyFeedback | null>(null);
  readonly copyAnnouncement = signal('');
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  readonly avatarText = computed(() => initials(this.user().fullName));
  readonly roleText = computed(() => roleLabel(this.user().role));
  readonly accountStatus = computed(() => statusLabel(this.user().status));
  /** Phiên demo local không được trình bày như tài khoản vận hành thật. */
  readonly isDemo = computed(() => environment.adminDemoLogin || this.user().id.startsWith('demo-'));

  readonly sections = computed(() => buildProfileSections(this.user(), {
    timezone: this.preferences.applied().timezone,
    isDemo: this.isDemo()
  }));

  isCopied(field: AdminProfileField): boolean {
    const feedback = this.copyFeedback();
    return feedback?.key === field.key && feedback.ok;
  }

  hasCopyError(field: AdminProfileField): boolean {
    const feedback = this.copyFeedback();
    return feedback?.key === field.key && feedback.ok === false;
  }

  async copyField(field: AdminProfileField): Promise<void> {
    if (!field.copyable || !field.value) return;

    const copied = await copyText(field.value);
    this.copyFeedback.set({ key: field.key, ok: copied });
    this.copyAnnouncement.set(
      copied ? `Đã sao chép ${field.label}` : `Không thể sao chép ${field.label}`
    );

    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyFeedback.set(null), 2500);
  }

  ngOnDestroy(): void {
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }
}
