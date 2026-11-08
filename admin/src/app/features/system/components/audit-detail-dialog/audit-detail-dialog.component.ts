import { Component, computed, inject, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { AuditLog } from '../../models/system.models';
import { SYSTEM_STORE } from '../../data/system.store';

@Component({
  selector: 'app-system-audit-detail-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './audit-detail-dialog.component.html',
  styleUrls: ['../../system-page.css', './audit-detail-dialog.component.css']
})
export class AuditDetailDialogComponent {
  private readonly store = inject(SYSTEM_STORE);

  readonly log = input.required<AuditLog>();
  readonly broken = input(false);
  readonly closed = output<void>();
  readonly evidence = output<AuditLog>();
  readonly printRecord = output<void>();

  readonly title = computed(() => `Chi tiết Bản ghi Kiểm toán - ${this.log().id}`);
  readonly subtitle = computed(() => `${this.log().at} (UTC+7) · ${this.log().module} · ${this.log().action}`);
  readonly actorLabel = computed(() => {
    const code = this.store.admins().find((person) => person.email === this.log().actorEmail)?.code;
    return code ? `${this.log().actorName} (${code})` : this.log().actorName;
  });
}