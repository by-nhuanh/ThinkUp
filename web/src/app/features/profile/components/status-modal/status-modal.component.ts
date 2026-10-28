import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusModalVariant = 'success' | 'error' | 'warning';

@Component({
  selector: 'app-status-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-modal.component.html',
  styleUrl: './status-modal.component.css',
})
export class StatusModalComponent {
  @Input({ required: true }) variant: StatusModalVariant = 'success';
  @Input({ required: true }) title = '';
  @Input() primaryLabel = 'Đóng';
  @Input() secondaryLabel = '';

  @Output() primary = new EventEmitter<void>();
  @Output() secondary = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

  get isWarning(): boolean {
    return this.variant === 'warning';
  }

  onBackdropClick(): void {
    this.dismissed.emit();
  }

  onDialogClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}
