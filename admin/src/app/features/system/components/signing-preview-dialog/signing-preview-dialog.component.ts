import { Component, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';

@Component({
  selector: 'app-system-signing-preview-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './signing-preview-dialog.component.html',
  styleUrls: ['../../system-page.css', './signing-preview-dialog.component.css']
})
export class SigningPreviewDialogComponent {
  readonly provider = input('VNPT-CA');
  readonly closed = output<void>();
}