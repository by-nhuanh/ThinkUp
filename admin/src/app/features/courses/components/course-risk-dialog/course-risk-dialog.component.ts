import { Component, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { WorkspaceFile } from '../../models/course.models';

@Component({
  selector: 'app-course-risk-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './course-risk-dialog.component.html',
  styleUrl: '../../courses-page.css'
})
export class CourseRiskDialogComponent {
  readonly file = input.required<WorkspaceFile>();
  readonly closed = output<void>();
  readonly replaceRequested = output<void>();

  close(): void { this.closed.emit(); }
  requestReplace(): void { this.replaceRequested.emit(); }
}
