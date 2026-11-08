import { Component, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';

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
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input('Hủy');
  readonly danger = input(false);

  readonly closed = output<void>();
  readonly confirmed = output<void>();
}