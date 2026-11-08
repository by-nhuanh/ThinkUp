import { Component, OnDestroy, OnInit, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { ExportFormat, downloadTable } from '../../../../shared/utils/export-formats';
import { AuditLog } from '../../models/system.models';

export interface AuditExportRequest {
  fileName: string;
  format: ExportFormat;
  reason: string;
}

type ExportPhase = 'idle' | 'running' | 'failure';

@Component({
  selector: 'app-system-audit-export-dialog',
  standalone: true,
  imports: [FormsModule, AdminDialogComponent],
  templateUrl: './audit-export-dialog.component.html',
  styleUrls: ['../../system-page.css', './audit-export-dialog.component.css']
})
export class AuditExportDialogComponent implements OnInit, OnDestroy {
  readonly initialFormat = input<ExportFormat>('xlsx');
  readonly countLabel = input.required<string>();
  readonly count = input.required<number>();
  readonly timeLabel = input.required<string>();
  readonly moduleLabel = input.required<string>();
  readonly riskLabel = input.required<string>();
  readonly actionLabel = input.required<string>();
  readonly simulateFailure = input(false);
  readonly rows = input.required<readonly AuditLog[]>();
  readonly closed = output<void>();
  readonly exported = output<AuditExportRequest>();

  readonly format = signal<ExportFormat>('xlsx');
  readonly reason = signal('');
  readonly reasonError = signal('');
  readonly phase = signal<ExportPhase>('idle');
  readonly progress = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  readonly reasonCount = computed(() => this.reason().trim().length);
  readonly csvRecommended = computed(() => this.count() > 50000);
  readonly running = computed(() => this.phase() === 'running');
  readonly failed = computed(() => this.phase() === 'failure');
  readonly confirmLabel = computed(() => this.running() ? 'Đang xử lý...' : this.failed() ? 'Thử lại' : 'Xác nhận tải tệp');
  readonly fileName = computed(() => `audit_log_2026-11.${this.format()}`);

  ngOnInit(): void {
    this.format.set(this.initialFormat());
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  pickFormat(value: ExportFormat): void {
    if (this.running()) return;
    this.format.set(value);
  }

  onReason(value: string): void {
    this.reason.set(value);
    this.reasonError.set('');
  }

  cancel(): void {
    this.stopTimer();
    this.closed.emit();
  }

  confirm(): void {
    if (this.running()) return;
    if (this.reasonCount() < 10) {
      this.reasonError.set('Nhập tối thiểu 10 ký tự sau khi bỏ khoảng trắng thừa.');
      return;
    }
    this.phase.set('running');
    this.progress.set(0);
    // TODO(pre-deploy): Nhớ thay tiến trình giả lập bằng tác vụ xuất báo cáo thật từ API kiểm toán.
    this.timer = setInterval(() => {
      this.progress.update((value) => Math.min(100, value + 9));
      if (this.progress() >= 100) {
        this.stopTimer();
        if (this.simulateFailure()) {
          this.phase.set('failure');
          return;
        }
        void this.finish();
      } else if (this.simulateFailure() && this.progress() >= 64) {
        this.stopTimer();
        this.progress.set(64);
        this.phase.set('failure');
      }
    }, 140);
  }

  private async finish(): Promise<void> {
    const header = ['Mã Log', 'Thời gian', 'Quản trị viên', 'Email', 'Vai trò', 'Phân hệ', 'Hành động', 'Kết quả', 'Đối tượng', 'IP', 'Mức độ'];
    const body = this.rows().map((log) => [
      log.id, log.at, log.actorName, log.actorEmail, log.actorRole,
      log.module, log.action, log.outcome === 'success' ? 'Thành công' : 'Thất bại',
      `${log.targetId} · ${log.targetName}`, log.ip, log.risk
    ]);
    const checksum = this.rows()[0]?.checksum ?? '';
    await downloadTable(this.format(), 'audit_log_2026-11', [...([header] as (string | number)[][]), ...body, ['Checksum', checksum]]);
    this.exported.emit({ fileName: this.fileName(), format: this.format(), reason: this.reason().trim() });
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}