import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { SystemOtpInputComponent } from '../otp-input/otp-input.component';
import { AdminPerson, AdminRoleCode, AdminRoleDefinition, InternalStaff } from '../../models/system.models';
import { SYSTEM_STORE } from '../../data/system.store';

export interface RoleDialogResult {
  title: string;
  detail: string;
}

const SERVER_FAILURE_OTP = '000000';
const MAX_WRONG_OTP = 3;
const LOCK_MINUTES = 15;

@Component({
  selector: 'app-system-role-dialog',
  standalone: true,
  imports: [FormsModule, AdminDialogComponent, SystemOtpInputComponent],
  templateUrl: './role-dialog.component.html',
  styleUrls: ['../../system-page.css', './role-dialog.component.css']
})
export class RoleDialogComponent {
  private readonly store = inject(SYSTEM_STORE);

  readonly mode = input.required<'assign' | 'change'>();
  readonly person = input<AdminPerson | null>(null);
  readonly closed = output<void>();
  readonly saved = output<RoleDialogResult>();

  readonly staffSearch = signal('');
  readonly selectedStaff = signal<InternalStaff | null>(null);
  readonly pickerOpen = signal(false);
  readonly roleMenuOpen = signal(false);
  readonly selectedRole = signal<AdminRoleCode | ''>('');
  readonly reason = signal('');
  readonly otp = signal('');
  readonly reasonError = signal('');
  readonly otpError = signal('');
  readonly formError = signal('');
  readonly serverError = signal(false);
  readonly lockedUntil = signal<Date | null>(null);

  private wrongAttempts = 0;

  readonly title = computed(() => this.mode() === 'assign' ? 'Phân bổ vai trò quản trị' : 'Thay đổi vai trò Admin');
  readonly subtitle = computed(() => this.mode() === 'assign'
    ? 'Thiết lập quyền quản trị cho nhân sự nội bộ đã có tài khoản.'
    : 'Điều chuyển trách nhiệm và phạm vi quyền của nhân sự quản trị.');
  readonly confirmLabel = computed(() => this.serverError()
    ? 'Thử lại'
    : this.mode() === 'assign' ? 'Xác nhận gán quyền' : 'Xác nhận đổi vai trò');

  readonly candidates = computed(() => {
    const query = this.staffSearch().trim().toLowerCase();
    const list = this.store.candidates();
    if (!query) return list;
    return list.filter((staff) => `${staff.name} ${staff.email}`.toLowerCase().includes(query));
  });

  readonly roleChoices = computed<readonly AdminRoleDefinition[]>(() => {
    const current = this.person()?.role;
    return this.store.roles.filter((role) => role.code !== 'SA' && (this.mode() === 'assign' || role.code !== current));
  });
  readonly roleOptions = computed(() => this.roleChoices().map((role) => ({ value: role.code, label: role.label })));
  readonly selectedRoleDef = computed(() => this.roleChoices().find((role) => role.code === this.selectedRole()) ?? null);
  readonly currentRoleDef = computed(() => this.store.roles.find((role) => role.code === this.person()?.role) ?? null);

  readonly reasonCount = computed(() => this.reason().trim().length);
  readonly securityNote = computed(() => this.selectedRole()
    ? 'Nhân sự phải đăng nhập lại và hoàn tất 2FA sau khi được gán quyền.'
    : 'Nhân sự bắt buộc hoàn tất xác thực 2 bước (2FA) trước khi truy cập Cổng Quản trị.');
  readonly locked = computed(() => {
    const until = this.lockedUntil();
    return until !== null && until.getTime() > Date.now();
  });
  readonly retryLabel = computed(() => {
    const until = this.lockedUntil();
    if (!until) return '';
    return `${String(until.getHours()).padStart(2, '0')}:${String(until.getMinutes()).padStart(2, '0')}`;
  });

  initials(name: string): string {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '')).toUpperCase();
  }

  onStaffSearch(value: string): void {
    this.staffSearch.set(value);
    this.pickerOpen.set(true);
    this.formError.set('');
  }

  pickStaff(staff: InternalStaff): void {
    this.selectedStaff.set(staff);
    this.staffSearch.set(`${staff.name} · ${staff.email}`);
    this.pickerOpen.set(false);
    this.formError.set('');
  }

  clearStaff(): void {
    this.selectedStaff.set(null);
    this.staffSearch.set('');
    this.pickerOpen.set(true);
  }

  selectRole(code: string): void {
    this.selectedRole.set(code as AdminRoleCode);
    this.roleMenuOpen.set(false);
    this.formError.set('');
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
    if (this.locked()) return;
    this.formError.set('');
    this.reasonError.set('');
    this.otpError.set('');

    if (this.mode() === 'assign' && !this.selectedStaff()) {
      this.formError.set('Vui lòng chọn nhân sự nội bộ cần phân quyền.');
      return;
    }
    if (!this.selectedRole()) {
      this.formError.set(this.mode() === 'assign' ? 'Vui lòng chọn vai trò phân bổ.' : 'Vui lòng chọn vai trò mới.');
      return;
    }
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

    const role = this.selectedRole() as AdminRoleCode;
    const reason = this.reason().trim();
    const otp = this.otp();
    const result = this.mode() === 'assign'
      ? this.store.assignRole(this.selectedStaff()!.id, role, reason, otp)
      : this.store.changeRole(this.person()!.id, role, reason, otp);

    if (!result.ok) {
      if (result.message.startsWith('Mã xác thực')) {
        this.wrongAttempts += 1;
        this.otp.set('');
        if (this.wrongAttempts >= MAX_WRONG_OTP) {
          const until = new Date(Date.now() + LOCK_MINUTES * 60_000);
          this.lockedUntil.set(until);
          this.otpError.set('');
        } else {
          this.otpError.set(result.message);
        }
      } else {
        this.formError.set(result.message);
      }
      return;
    }

    const target = this.mode() === 'assign' ? this.selectedStaff()! : this.person()!;
    const roleLabel = this.store.roles.find((item) => item.code === role)?.label.split(' (')[0] ?? role;
    this.saved.emit(this.mode() === 'assign'
      ? {
          title: 'Đã phân bổ vai trò thành công',
          detail: `${target.name} → ${roleLabel}. Nhân sự phải đăng nhập lại và hoàn tất 2FA.`
        }
      : {
          title: 'Đã thay đổi vai trò thành công',
          detail: `${target.name} → ${roleLabel}. Đã thu hồi mọi phiên đăng nhập.`
        });
  }
}