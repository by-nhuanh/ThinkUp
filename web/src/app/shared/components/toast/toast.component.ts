import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastAction, ToastService, ToastType } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css'
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  getStyle(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'error':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'warning':
        return 'border-amber-200 bg-amber-50 text-amber-800';
      case 'info':
      default:
        return 'border-blue-200 bg-blue-50 text-blue-800';
    }
  }

  close(id: number): void {
    this.toastService.removeToast(id);
  }

  /** Chạy hành động phụ (ví dụ Hoàn tác) rồi đóng toast. */
  runAction(id: number, action: ToastAction): void {
    action.run();
    this.close(id);
  }
}
