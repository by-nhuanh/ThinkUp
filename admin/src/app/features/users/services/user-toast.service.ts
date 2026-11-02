import { Injectable, signal } from '@angular/core';

/**
 * Thông báo ngắn dùng chung trong module quản lý người dùng.
 *
 * Sống ở cấp root để thông báo không mất khi component phát sinh điều hướng
 * (ví dụ trang thẩm định hồ sơ quay về danh sách sau khi hoàn tất).
 */
@Injectable({ providedIn: 'root' })
export class UserToastService {
  private readonly messageState = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly message = this.messageState.asReadonly();

  show(message: string, duration = 3200): void {
    this.messageState.set(message);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.messageState.set(''), duration);
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.messageState.set('');
  }
}
