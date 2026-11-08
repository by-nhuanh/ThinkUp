import { Component, computed, input, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { AuditLog } from '../../models/system.models';

@Component({
  selector: 'app-system-audit-evidence-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './audit-evidence-dialog.component.html',
  styleUrls: ['../../system-page.css', './audit-evidence-dialog.component.css']
})
export class AuditEvidenceDialogComponent {
  readonly log = input.required<AuditLog>();
  readonly closed = output<void>();

  readonly zoom = signal(100);
  readonly zoomLabel = computed(() => `${this.zoom()}%`);
  readonly docHeading = computed(() => {
    const log = this.log();
    return `Mã lệnh: ${log.targetId}\n${log.targetName}\nNgày đối soát: ${log.at.split(' ')[0]}`;
  });
  readonly docAmounts = computed(() => {
    const amount = Number(this.log().targetMeta.replace(/[^\d]/g, '')) || 0;
    const tax = Math.round(amount * 0.1);
    const vnd = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
    return `Số tiền yêu cầu: ${vnd(amount)}\nThuế TNCN (10%): ${vnd(tax)}\nSố tiền thực nhận: ${vnd(amount - tax)}`;
  });

  zoomBy(delta: number): void {
    this.zoom.update((value) => Math.min(200, Math.max(50, value + delta)));
  }
}