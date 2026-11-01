import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Hành động phụ trong toast, ví dụ "Hoàn tác" sau khi xóa thông báo. */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly toastsSignal = signal<ToastItem[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  showToast(toast: { type?: ToastType; message: string; duration?: number; action?: ToastAction }): void {
    const id = Date.now() + Math.random();
    const newItem: ToastItem = {
      id,
      type: toast.type || 'info',
      message: toast.message,
      action: toast.action
    };

    this.toastsSignal.update(items => [...items, newItem]);

    const duration = toast.duration ?? (toast.action ? 6000 : 4000);
    setTimeout(() => {
      this.removeToast(id);
    }, duration);
  }

  removeToast(id: number): void {
    this.toastsSignal.update(items => items.filter(t => t.id !== id));
  }
}
