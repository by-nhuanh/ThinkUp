import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { AdminPerson } from '../../models/system.models';
import { SYSTEM_STORE } from '../../data/system.store';
import { RoleDialogResult } from '../role-dialog/role-dialog.component';

export type AccountDialogKind = 'lock' | 'unlock' | 'reset';

const SERVER_FAILURE_OTP = '000000';

interface KindCopy {
  title: string;
  subtitle: string;
  noticeKind: 'info' | 'warning' | 'danger';
  noticeTitle: string;
  noticeBody: string;
  reasonLabel: string;
  confirmLabel: string;
  toastTitle: string;
}

const COPY: Record<AccountDialogKind, KindCopy> = {
  lock: {
    title: 'Khóa tài khoản Quản trị viên',
    subtitle: 'Xác nhận giới hạn quyền truy cập của nhân sự.',
    noticeKind: 'danger',
    noticeTitle: 'Cảnh báo thu hồi truy cập',
    noticeBody: 'Tài khoản sẽ bị đăng xuất ngay khỏi tất cả thiết bị và chặn toàn bộ quyền truy cập trang quản trị.',
    reasonLabel: 'Lý do thực hiện',
    confirmLabel: 'Xác nhận Khóa tài khoản',
    toastTitle: 'Đã khóa tài khoản thành công'
  },
  unlock: {
    title: 'Mở khóa tài khoản Quản trị viên',
    subtitle: 'Khôi phục quyền truy cập của nhân sự.',
    noticeKind: 'info',
    noticeTitle: 'Khôi phục truy cập',
    noticeBody: 'Tài khoản sẽ hoạt động trở lại. Nhân sự có thể đăng nhập Cổng Quản trị theo vai trò hiện tại.',
    reasonLabel: 'Lý do thực hiện',
    confirmLabel: 'Xác nhận Mở khóa',
    toastTitle: 'Đã mở khóa tài khoản thành công'
  },
  reset: {
    title: 'Đặt lại xác thực 2 lớp (Reset 2FA)',
    subtitle: 'Xóa cấu hình xác thực cũ theo yêu cầu của nhân sự.',
    noticeKind: 'warning',
    noticeTitle: 'Bắt buộc thiết lập lại 2FA',
    noticeBody: 'Cấu hình bảo mật cũ sẽ bị xóa. Lần đăng nhập tiếp theo, nhân sự phải quét mã QR mới để vào Cổng Quản trị.',
    reasonLabel: 'Lý do đặt lại',
    confirmLabel: 'Xác nhận xóa và Đặt lại 2FA',
    toastTitle: 'Đã đặt lại 2FA thành công'
  }
};

@Component({
  selector: 'app-system-account-dialog',
  standalone: true,
  imports: [FormsModule, AdminDialogComponent],
  templateUrl: './account-dialog.component.html',
  styleUrls: ['../../system-page.css', './account-dialog.component.css']
})
export class AccountDialogComponent {
  private readonly store = inject(SYSTEM_STORE);

  readonly kind = input.required<AccountDialogKind>();
  readonly person = input.required<AdminPerson>();
  readonly closed = output<void>();
  readonly saved = output<RoleDialogResult>();

  readonly reason = signal('');
  readonly otp = signal('');
  readonly reasonError = signal('');
  readonly otpError = signal('');
  readonly serverError = signal(false);

  readonly copy = computed(() => COPY[this.kind()]);
  readonly reasonCount = computed(() => this.reason().trim().length);
  readonly confirmLabel = computed(() => this.serverError() ? 'Thử lại' : this.copy().confirmLabel);
  readonly summaryLine = computed(() => {
    const person = this.person();
    const role = this.store.roles.find((item) => item.code === person.role)?.label ?? person.role;
    return `${person.code} · ${role} · ${person.twoFactor === 'active' ? 'Đã kích hoạt 2FA' : 'Chưa kích hoạt 2FA'}`;
  });

  initials(name: string): string {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '')).toUpperCase();
  }

  onReason(value: string): void {
    this.reason.set(value);
    this.reasonError.set('');
  }

  onOtp(value: string): void {
    this.otp.set(value.replace(/\D/g, '').slice(0, 6));
    this.otpError.set('');
    this.serverError.set(false);
  }

  submit(): void {
    this.reasonError.set('');
    this.otpError.set('');
    if (this.reasonCount() < 10) {
      this.reasonError.set('Nhập tối thiểu 10 ký tự sau khi bỏ khoảng trắng thừa.');
      return;
    }
    if (this.otp().length !== 6) {
      this.otpError.set('Vui lòng nhập đủ mã xác thực 6 số.');
      return;
    }
    // TODO(pre-deploy): Nhớ xóa mô phỏng lỗi máy chủ bằng OTP 000000 khi nối API thật.
    if (this.otp() === SERVER_FAILURE_OTP) {
      this.serverError.set(true);
      return;
    }

    const person = this.person();
    const reason = this.reason().trim();
    const otp = this.otp();
    const result = this.kind() === 'reset'
      ? this.store.resetTwoFactor(person.id, reason, otp)
      : this.store.setAccountLocked(person.id, this.kind() === 'lock', reason, otp);
    if (!result.ok) {
      if (result.message.startsWith('Mã xác thực')) this.otpError.set(result.message);
      else if (result.message.startsWith('Lý do')) this.reasonError.set(result.message);
      else this.otpError.set(result.message);
      return;
    }

    const detail = this.kind() === 'lock'
      ? `${person.name} đã bị đăng xuất khỏi mọi thiết bị và chặn truy cập trang quản trị.`
      : this.kind() === 'unlock'
        ? `${person.name} có thể đăng nhập lại Cổng Quản trị theo vai trò hiện tại.`
        : `${person.name} phải quét mã QR mới ở lần đăng nhập tiếp theo.`;
    this.saved.emit({ title: this.copy().toastTitle, detail });
  }
}