import { Component, EventEmitter, Input, Output } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'error';

@Component({
  selector: 'app-content-toast',
  standalone: true,
  template: `
    @if (message) {
      <div class="toast" [class.success]="tone === 'success'" [class.error]="tone === 'error'" role="status" aria-live="polite">
        <svg class="toast-icon" viewBox="0 0 24 24" aria-hidden="true">
          @switch (tone) {
            @case ('success') { <path d="m4.5 12.5 4.5 4.5 10-10"/> }
            @case ('error') { <path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17.2v.1"/> }
            @default { <circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.2v.1"/> }
          }
        </svg>
        <div class="toast-text">
          <strong>{{ message }}</strong>
          @if (description) { <span>{{ description }}</span> }
        </div>
        <button class="close" type="button" aria-label="Đóng thông báo" (click)="closed.emit()">×</button>
      </div>
    }
  `,
  styleUrl: '../content-page.css'
})
export class ContentToastComponent {
  @Input() message = '';
  @Input() description = '';
  @Input() tone: ToastTone = 'info';
  @Output() readonly closed = new EventEmitter<void>();
}
