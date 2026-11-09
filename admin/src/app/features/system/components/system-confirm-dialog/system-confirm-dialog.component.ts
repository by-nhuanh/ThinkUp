import { Component, computed, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';

/** Biểu tượng bánh răng dùng chung cho các hộp thoại xác nhận của module hệ thống. */
const GEAR_ICON =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z';

export type ConfirmTone = 'danger' | 'warning' | 'success' | 'info';

@Component({
  selector: 'app-system-confirm-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './system-confirm-dialog.component.html',
  styleUrls: ['../../system-page.css', './system-confirm-dialog.component.css']
})
export class SystemConfirmDialogComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly heading = input.required<string>();
  readonly lines = input<readonly string[]>([]);
  /** Dòng ghi chú không nằm trong khối cảnh báo, hiển thị ngay dưới khối. */
  readonly note = input('');
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input('Hủy');
  readonly danger = input(false);
  readonly tone = input<ConfirmTone | ''>('');
  readonly icon = input(GEAR_ICON);

  readonly resolvedTone = computed<ConfirmTone>(() => {
    const explicit = this.tone();
    if (explicit) return explicit;
    return this.danger() ? 'danger' : 'info';
  });

  readonly closed = output<void>();
  readonly confirmed = output<void>();
}
