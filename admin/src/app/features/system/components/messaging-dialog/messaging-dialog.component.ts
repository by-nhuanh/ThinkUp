import { Component, OnDestroy, computed, input, linkedSignal, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { MessagingSettings } from '../../models/system.models';

type TemplateState = 'verified' | 'failed' | 'unchecked' | 'checking';

const OTP_RULES = 'Chuẩn mã OTP: 6 chữ số (0–9) · Tần suất tối đa: 3 lần / 10 phút\nĐường dẫn trạng thái: https://api.thinkup.vn/api/v1/otp/callback';

@Component({
  selector: 'app-system-messaging-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './messaging-dialog.component.html',
  styleUrls: ['../../system-page.css', './messaging-dialog.component.css']
})
export class MessagingDialogComponent implements OnDestroy {
  readonly config = input.required<MessagingSettings>();

  readonly closed = output<void>();
  readonly saved = output<MessagingSettings>();

  readonly otpRules = OTP_RULES;
  readonly form = linkedSignal(() => structuredClone(this.config()));
  readonly contractTemplateState = signal<TemplateState>('verified');
  readonly adminTemplateState = signal<TemplateState>('verified');

  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly dirty = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.config()));
  readonly systemEmailError = computed(() =>
    this.form().systemEmail.trim().toLowerCase().endsWith('@thinkup.vn') ? '' : 'Email gửi hệ thống phải sử dụng tên miền @thinkup.vn.');
  readonly replyEmailError = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form().replyEmail.trim()) ? '' : 'Email nhận phản hồi không hợp lệ.');
  readonly otpExpiryError = computed(() => {
    const value = this.form().otpExpiryMinutes;
    return Number.isInteger(value) && value > 0 ? '' : 'Thời hạn OTP phải là số nguyên dương lớn hơn 0.';
  });
  readonly valid = computed(() =>
    this.form().senderName.trim().length > 0
    && this.form().servicePassword.trim().length > 0
    && this.form().lecturerContractTemplate.trim().length > 0
    && this.form().adminGrantTemplate.trim().length > 0
    && !this.systemEmailError() && !this.replyEmailError() && !this.otpExpiryError());
  readonly templatesVerified = computed(() =>
    this.contractTemplateState() === 'verified' && this.adminTemplateState() === 'verified');
  readonly otpExpiryDisplay = computed(() => Number.isNaN(this.form().otpExpiryMinutes) ? '' : String(this.form().otpExpiryMinutes));
  readonly canSave = computed(() => this.dirty() && this.valid() && this.templatesVerified());
  readonly footerNote = computed(() => {
    if (!this.dirty()) return 'Chưa có thay đổi để lưu.';
    if (this.valid() && this.templatesVerified()) return 'Có thay đổi hợp lệ chưa lưu · Hai mẫu thư đã được xác minh.';
    return 'Có thay đổi chưa lưu · Sửa các trường không hợp lệ để tiếp tục.';
  });

  update<K extends keyof MessagingSettings>(key: K, value: MessagingSettings[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
    if (key === 'lecturerContractTemplate') this.contractTemplateState.set('unchecked');
    if (key === 'adminGrantTemplate') this.adminTemplateState.set('unchecked');
  }

  onOtpExpiry(value: string): void {
    this.update('otpExpiryMinutes', value === '' ? Number.NaN : Number(value));
  }

  /**
   * TODO(pre-deploy): Nhớ thay bằng API kiểm tra Template ID trên dịch vụ gửi thư thật.
   * Demo: ID chứa `khong-ton-tai` hoặc sai định dạng `d-...` sẽ trả không tìm thấy.
   */
  checkTemplate(which: 'contract' | 'admin'): void {
    const id = (which === 'contract' ? this.form().lecturerContractTemplate : this.form().adminGrantTemplate).trim();
    const state = which === 'contract' ? this.contractTemplateState : this.adminTemplateState;
    if (!id || state() === 'checking') return;
    state.set('checking');
    this.timer = setTimeout(() => {
      state.set(/^d-[a-z0-9-]+$/i.test(id) && !id.includes('khong-ton-tai') ? 'verified' : 'failed');
    }, 800);
  }

  save(): void {
    if (!this.canSave()) return;
    this.saved.emit(structuredClone(this.form()));
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}