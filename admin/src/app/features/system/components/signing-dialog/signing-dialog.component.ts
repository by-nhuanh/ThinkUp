import { Component, OnDestroy, computed, input, linkedSignal, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { SigningSettings, TestState } from '../../models/system.models';
import { SigningPreviewDialogComponent } from '../signing-preview-dialog/signing-preview-dialog.component';

const CALLBACK_URL = 'https://api.thinkup.vn/api/v1/contracts/callback';

@Component({
  selector: 'app-system-signing-dialog',
  standalone: true,
  imports: [AdminDialogComponent, CustomSelectComponent, SigningPreviewDialogComponent],
  templateUrl: './signing-dialog.component.html',
  styleUrls: ['../../system-page.css', './signing-dialog.component.css']
})
export class SigningDialogComponent implements OnDestroy {
  readonly config = input.required<SigningSettings>();

  readonly closed = output<void>();
  readonly saved = output<SigningSettings>();

  readonly callbackUrl = CALLBACK_URL;
  readonly providerOptions = [
    { value: 'VNPT-CA', label: 'VNPT-CA' },
    { value: 'Viettel-CA', label: 'Viettel-CA' },
    { value: 'MISA-CA', label: 'MISA-CA' }
  ];
  readonly form = linkedSignal(() => structuredClone(this.config()));
  readonly testState = signal<TestState>('idle');
  readonly previewOpen = signal(false);
  readonly copied = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  readonly dirty = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.config()));
  readonly daysLeft = computed(() => {
    const parts = this.form().expiresAt.trim().split('/');
    if (parts.length !== 3) return Number.NaN;
    const date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    if (Number.isNaN(date.getTime())) return Number.NaN;
    return Math.ceil((date.getTime() - Date.now()) / 86400000);
  });
  readonly expiryNote = computed(() => {
    const days = this.daysLeft();
    if (Number.isNaN(days)) return { text: 'Ngày hết hạn phải theo định dạng dd/MM/yyyy.', kind: 'error' };
    if (days <= 0) return { text: 'Chứng thư đã hết hạn. Cần gia hạn trước khi ký.', kind: 'error' };
    if (days <= 30) return { text: `Sắp hết hạn trong ${days} ngày · Cần gia hạn chứng thư.`, kind: 'warning' };
    return { text: 'Chứng thư còn hiệu lực.', kind: 'ok' };
  });
  readonly maxSignDaysError = computed(() => {
    const value = this.form().maxSignDays;
    return Number.isInteger(value) && value >= 3 && value <= 14 ? '' : 'Chỉ nhận số nguyên từ 3 đến 14 ngày.';
  });
  readonly legalEmailError = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form().legalEmail.trim()) ? '' : 'Email phòng Pháp chế không hợp lệ.');
  readonly valid = computed(() =>
    this.form().serial.trim().length > 0
    && this.form().clientId.trim().length > 0
    && this.form().secret.trim().length > 0
    && !Number.isNaN(this.daysLeft()) && this.daysLeft() > 0
    && !this.maxSignDaysError() && !this.legalEmailError());
  readonly canSave = computed(() => this.dirty() && this.valid() && this.testState() === 'success');
  readonly maxSignDaysDisplay = computed(() => Number.isNaN(this.form().maxSignDays) ? '' : String(this.form().maxSignDays));
  readonly footerNote = computed(() => {
    if (!this.dirty()) return 'Chưa có thay đổi để lưu.';
    if (this.testState() === 'success') return 'Có thay đổi hợp lệ chưa lưu · Văn bản mẫu đã được ký thành công.';
    return 'Có thay đổi chưa lưu · Cần ký thử thành công để kích hoạt nút Lưu.';
  });

  update<K extends keyof SigningSettings>(key: K, value: SigningSettings[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
    if (this.testState() !== 'idle') this.testState.set('idle');
  }

  onMaxSignDays(value: string): void {
    this.update('maxSignDays', value === '' ? Number.NaN : Number(value));
  }

  /**
   * TODO(pre-deploy): Nhớ thay bằng API ký thử văn bản mẫu của nhà cung cấp E-Sign.
   * Demo: chứng thư hết hạn trong ≤ 30 ngày mô phỏng lỗi E-SIGN-401 (khớp kịch bản Figma).
   */
  testSign(): void {
    if (this.testState() === 'running' || !this.valid()) return;
    this.testState.set('running');
    this.timer = setTimeout(() => {
      if (this.daysLeft() <= 30) {
        this.testState.set('failure');
      } else {
        this.testState.set('success');
        this.previewOpen.set(true);
      }
    }, 1500);
  }

  copyCallback(): void {
    void navigator.clipboard?.writeText(CALLBACK_URL);
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  save(): void {
    if (!this.canSave()) return;
    this.saved.emit(structuredClone(this.form()));
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }
}