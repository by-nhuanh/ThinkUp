import { Component, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { formatDateTime } from '../../course-utils';

@Component({
  selector: 'app-course-history-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './course-history-dialog.component.html',
  styleUrl: '../../courses-page.css'
})
export class CourseHistoryDialogComponent {
  readonly title = input.required<string>();
  readonly history = input.required<ReadonlyArray<{ at: string; actor: string; action: string; note: string }>>();
  readonly closed = output<void>();

  dateTime = formatDateTime;
  close(): void { this.closed.emit(); }
}
