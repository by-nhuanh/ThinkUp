import { Component, computed, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { AuditLog } from '../../models/system.models';

@Component({
  selector: 'app-system-audit-target-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './audit-target-dialog.component.html',
  styleUrls: ['../../system-page.css', './audit-target-dialog.component.css']
})
export class AuditTargetDialogComponent {
  readonly log = input.required<AuditLog>();
  readonly closed = output<void>();

  readonly subtitle = computed(() => `${this.log().targetId} · Thông tin đối tượng liên quan đến bản ghi kiểm toán.`);
  readonly amounts = computed(() => {
    const amount = Number(this.log().targetMeta.replace(/[^\d]/g, '')) || 0;
    const tax = Math.round(amount * 0.1);
    return {
      requested: this.formatVnd(amount),
      tax: this.formatVnd(tax),
      net: this.formatVnd(amount - tax)
    };
  });
  readonly lecturerCode = computed(() => this.log().targetId.replace('PO-', 'GV-'));

  private formatVnd(value: number): string {
    return `${value.toLocaleString('vi-VN')} đ`;
  }
}