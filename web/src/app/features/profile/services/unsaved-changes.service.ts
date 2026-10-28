import { Injectable, signal } from '@angular/core';

/**
 * Cầu nối giữa route guard (CanDeactivate) và modal cảnh báo Dirty Form.
 * Guard gọi confirm() và chờ người dùng chọn "Tiếp tục chỉnh sửa" / "Rời đi".
 */
@Injectable({ providedIn: 'root' })
export class UnsavedChangesService {
  readonly isOpen = signal(false);

  private resolver: ((leave: boolean) => void) | null = null;

  confirm(): Promise<boolean> {
    if (this.resolver) return Promise.resolve(false);

    this.isOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolve(leave: boolean): void {
    this.isOpen.set(false);
    const resolver = this.resolver;
    this.resolver = null;
    resolver?.(leave);
  }
}
