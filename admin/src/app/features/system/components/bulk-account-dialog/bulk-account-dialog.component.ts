import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { SystemOtpInputComponent } from '../otp-input/otp-input.component';
import { AdminPerson } from '../../models/system.models';
import { SYSTEM_STORE } from '../../data/system.store';
import { RoleDialogResult } from '../role-dialog/role-dialog.component';
import { AccountDialogKind } from '../account-dialog/account-dialog.component';

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
  resultVerb: string;
}

@Component({
  selector: 'app-system-bulk-account-dialog',
  standalone: true,
  imports: [FormsModule, AdminDialogComponent, SystemOtpInputComponent],
  templateUrl: './bulk-account-dialog.component.html',
  styleUrls: ['../../system-page.css', './bulk-account-dialog.component.css']
})
export class BulkAccountDialogComponent {
  private readonly store = inject(SYSTEM_STORE);

  readonly kind = input.required<AccountDialogKind>();
  readonly people = input.required<readonly AdminPerson[]>();
  readonly closed = output<void>();
  readonly saved = output<RoleDialogResult>();

  readonly reason = signal('');
  readonly otp = signal('');
  readonly reasonError = signal('');
  readonly otpError = signal('');
  readonly peopleError = signal('');
  readonly serverError = signal(false);
  readonly pickerOpen = signal(false);

  readonly chosen = linkedSignal(() => [...this.people()]);
  readonly chosenIds = linkedSignal(() => this.people().map((person) => person.id));
  readonly chosenPeople = computed(() => this.chosen().filter((person) => this.chosenIds().includes(person.id)));
  readonly candidates = computed(() => {
    const kind = this.kind();
    const chosenIds = new Set(this.chosenIds());
    return this.store.admins().filter((person) => !person.isSelf && !chosenIds.has(person.id)
      && (kind === 'lock' ? person.status !== 'locked'
        : kind === 'unlock' ? person.status === 'locked'
          : person.twoFactor === 'active'));
  });
  readonly count = computed(() => this.chosenPeople().length);
  readonly allSelected = computed(() => this.chosen().length > 0 && this.count() === this.chosen().length);
  readonly someSelected = computed(() => this.count() > 0 && !this.allSelected());
  readonly copy = computed<KindCopy>(() => {
    const count = this.count();
    if (this.kind() === 'lock') {
      return {
        title: `Khóa ${count} tài khoản Quản trị viên`,
        subtitle: 'Các tài khoản đã chọn sẽ bị giới hạn quyền truy cập.',
        noticeKind: 'danger',
        noticeTitle: 'Cảnh báo thu hồi truy cập',
        noticeBody: `${count} tài khoản sẽ bị đăng xuất khỏi mọi thiết bị và chặn toàn bộ quyền truy cập trang quản trị.`,
        reasonLabel: 'Lý do thực hiện',
        confirmLabel: `Xác nhận Khóa ${count} tài khoản`,
        toastTitle: 'Đã khóa tài khoản thành công',
        resultVerb: 'khóa'
      };
    }
    if (this.kind() === 'unlock') {
      return {
        title: `Mở khóa ${count} tài khoản Quản trị viên`,
        subtitle: 'Khôi phục quyền truy cập của các nhân sự đã chọn.',
        noticeKind: 'info',
        noticeTitle: 'Khôi phục truy cập',
        noticeBody: `${count} tài khoản sẽ hoạt động trở lại và có thể đăng nhập Cổng Quản trị theo vai trò hiện tại.`,
        reasonLabel: 'Lý do thực hiện',
        confirmLabel: `Xác nhận Mở khóa ${count} tài khoản`,
        toastTitle: 'Đã mở khóa tài khoản thành công',
        resultVerb: 'mở khóa'
      };
    }
    return {
      title: `Đặt lại 2FA cho ${count} tài khoản`,
      subtitle: 'Xóa cấu hình xác thực cũ của các tài khoản đã chọn.',
      noticeKind: 'warning',
      noticeTitle: 'Bắt buộc thiết lập lại 2FA',
      noticeBody: `${count} tài khoản sẽ bị xóa cấu hình bảo mật cũ. Lần đăng nhập tiếp theo, nhân sự phải quét mã QR mới để vào Cổng Quản trị.`,
      reasonLabel: 'Lý do đặt lại',
      confirmLabel: `Xác nhận Đặt lại ${count} tài khoản`,
      toastTitle: 'Đã đặt lại 2FA thành công',
      resultVerb: 'đặt lại 2FA cho'
    };
  });
  readonly reasonCount = computed(() => this.reason().trim().length);
  readonly confirmLabel = computed(() => this.serverError() ? 'Thử lại' : this.copy().confirmLabel);

  onReason(value: string): void {
    this.reason.set(value);
    this.reasonError.set('');
  }

  onOtp(value: string): void {
    this.otp.set(value.replace(/\D/g, '').slice(0, 6));
    this.otpError.set('');
    this.serverError.set(false);
  }

  togglePicker(): void {
    this.pickerOpen.update((open) => !open);
  }

  togglePerson(id: string, checked: boolean): void {
    this.chosenIds.update((ids) => checked ? [...ids, id] : ids.filter((value) => value !== id));
    this.peopleError.set('');
  }

  toggleAll(checked: boolean): void {
    this.chosenIds.set(checked ? this.chosen().map((person) => person.id) : []);
    this.peopleError.set('');
  }

  remove(person: AdminPerson): void {
    this.chosen.update((list) => list.filter((item) => item.id !== person.id));
    this.chosenIds.update((ids) => ids.filter((value) => value !== person.id));
    this.peopleError.set('');
  }

  add(person: AdminPerson): void {
    this.chosen.update((list) => [...list, person]);
    this.chosenIds.update((ids) => [...ids, person.id]);
    this.pickerOpen.set(false);
    this.peopleError.set('');
  }

  submit(): void {
    this.reasonError.set('');
    this.otpError.set('');
    this.peopleError.set('');
    if (!this.count()) {
      this.peopleError.set('Chọn ít nhất một tài khoản để thực hiện thao tác.');
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

    const kind = this.kind();
    const reason = this.reason().trim();
    const otp = this.otp();
    const people = [...this.chosenPeople()];
    const copy = this.copy();
    // TODO(pre-deploy): Nhớ thay vòng lặp bằng API thao tác hàng loạt nguyên tử của backend.
    let applied = 0;
    for (const person of people) {
      const result = kind === 'reset'
        ? this.store.resetTwoFactor(person.id, reason, otp)
        : this.store.setAccountLocked(person.id, kind === 'lock', reason, otp);
      if (!result.ok) {
        if (result.message.startsWith('Mã xác thực')) this.otpError.set(result.message);
        else if (result.message.startsWith('Lý do')) this.reasonError.set(result.message);
        else this.otpError.set(result.message);
        return;
      }
      applied += 1;
    }

    const names = people.map((person) => person.name);
    const shown = names.slice(0, 3).join(', ');
    const more = names.length > 3 ? ` và ${names.length - 3} người khác` : '';
    this.saved.emit({
      title: copy.toastTitle,
      detail: `Đã ${copy.resultVerb} ${applied} tài khoản: ${shown}${more}.`
    });
  }
}
