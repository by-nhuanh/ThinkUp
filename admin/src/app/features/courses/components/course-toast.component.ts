import { Component, EventEmitter, Input, Output } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'error';

@Component({
  selector: 'app-course-toast',
  standalone: true,
  template: `
    @if (message) {
      <div class="toast" [class.success]="tone === 'success'" [class.error]="tone === 'error'" role="status" aria-live="polite">
        <span>{{ message }}</span>
        <button class="close" type="button" aria-label="Đóng thông báo" (click)="closed.emit()">×</button>
      </div>
    }
  `,
  styleUrl: '../courses-page.css'
})
export class CourseToastComponent {
  @Input() message = '';
  @Input() tone: ToastTone = 'info';
  @Output() readonly closed = new EventEmitter<void>();
}
