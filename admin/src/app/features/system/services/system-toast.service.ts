import { Injectable, signal } from '@angular/core';

export type SystemToastKind = 'success' | 'error' | 'info';

/** Thông báo ngắn dùng chung trong module Quản trị hệ thống. */
@Injectable({ providedIn: 'root' })
export class SystemToastService {
  private readonly messageState = signal('');
  private readonly detailState = signal('');
  private readonly kindState = signal<SystemToastKind>('info');
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly message = this.messageState.asReadonly();
  readonly detail = this.detailState.asReadonly();
  readonly kind = this.kindState.asReadonly();

  show(message: string, kind: SystemToastKind = 'success', duration = 3600, detail = ''): void {
    this.messageState.set(message);
    this.detailState.set(detail);
    this.kindState.set(kind);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.clear(), duration);
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.messageState.set('');
    this.detailState.set('');
  }
}