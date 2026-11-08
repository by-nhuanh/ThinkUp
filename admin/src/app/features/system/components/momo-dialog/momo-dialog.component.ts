import { Component, OnDestroy, computed, inject, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { MomoGatewayConfig, TestState } from '../../models/system.models';
import { SYSTEM_STORE } from '../../data/system.store';
import { SecretRevealDialogComponent } from '../secret-reveal-dialog/secret-reveal-dialog.component';

const IPN_URL = 'https://api.thinkup.vn/v1/payments/momo/ipn';

@Component({
  selector: 'app-system-momo-dialog',
  standalone: true,
  imports: [AdminDialogComponent, SecretRevealDialogComponent],
  templateUrl: './momo-dialog.component.html',
  styleUrls: ['../../system-page.css', './momo-dialog.component.css']
})
export class MomoDialogComponent implements OnDestroy {
  private readonly store = inject(SYSTEM_STORE);

  readonly closed = output<void>();
  readonly saved = output<string>();

  readonly ipnUrl = IPN_URL;
  readonly form = signal<MomoGatewayConfig>(structuredClone(this.store.momoConfig()));
  readonly testState = signal<TestState>('idle');
  readonly revealOpen = signal(false);
  readonly revealed = signal(false);
  readonly copied = signal(false);

  private readonly baseline = structuredClone(this.store.momoConfig());
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  readonly dirty = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.baseline));
  readonly timeoutError = computed(() => {
    const value = this.form().timeoutSeconds;
    return Number.isInteger(value) && value >= 5 && value <= 60 ? '' : 'Chỉ nhận số nguyên từ 5 đến 60 giây.';
  });
  readonly valid = computed(() =>
    this.form().businessCode.trim().length > 0
    && this.form().publicKey.trim().length > 0
    && this.form().secretKey.trim().length > 0
    && !this.timeoutError());
  readonly canSave = computed(() => this.dirty() && this.valid() && this.testState() === 'success');
  readonly maskedSecret = computed(() => `••••••••••••${this.form().secretKey.slice(-4)}`);
  readonly timeoutDisplay = computed(() => Number.isNaN(this.form().timeoutSeconds) ? '' : String(this.form().timeoutSeconds));
  readonly footerNote = computed(() => {
    if (this.testState() === 'running') return 'Vui lòng đợi kết quả kiểm thử trước khi lưu cấu hình.';
    if (!this.dirty()) return 'Chưa có thay đổi để lưu.';
    if (this.testState() === 'success') return 'Có thay đổi chưa lưu · Kiểm thử thành công · Cấu hình sẽ áp dụng ngay sau khi lưu.';
    return 'Có thay đổi chưa lưu · Cần kiểm thử thành công để kích hoạt nút Lưu.';
  });

  update<K extends keyof MomoGatewayConfig>(key: K, value: MomoGatewayConfig[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
    if (this.testState() !== 'idle') this.testState.set('idle');
  }

  onTimeout(value: string): void {
    this.update('timeoutSeconds', value === '' ? Number.NaN : Number(value));
  }

  /**
   * TODO(pre-deploy): Nhớ thay bằng API test ping thật của cổng MoMo.
   * Demo: Mã doanh nghiệp kết thúc bằng `-fail` mô phỏng chữ ký không hợp lệ.
   */
  testPing(): void {
    if (this.testState() === 'running' || !this.valid()) return;
    this.testState.set('running');
    this.pingTimer = setTimeout(() => {
      this.testState.set(this.form().businessCode.trim().endsWith('-fail') ? 'failure' : 'success');
    }, 1600);
  }

  copyIpn(): void {
    void navigator.clipboard?.writeText(IPN_URL);
    this.copied.set(true);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  onRevealed(): void {
    this.revealOpen.set(false);
    this.revealed.set(true);
  }

  save(): void {
    if (!this.canSave()) return;
    this.store.updateMomoConfig(this.form());
    this.saved.emit('Đã lưu cấu hình cổng MoMo thành công');
  }

  ngOnDestroy(): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }
}