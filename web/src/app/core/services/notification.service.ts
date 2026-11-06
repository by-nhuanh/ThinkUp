import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppNotification, NotificationCategory } from '../models/notification.model';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
export type UserNotification = AppNotification;
export interface RemovedNotification { item: AppNotification; index: number; undoUntil: string; }
interface Summary {
  totalCount: number; unreadCount: number;
  countsByCategory: Record<NotificationCategory, number>;
  unreadCountsByCategory: Record<NotificationCategory, number>;
}
interface Page { items: AppNotification[]; pagination: { hasMore: boolean }; }
const emptyCounts = () => ({ learning: 0, transactions: 0, security: 0 });
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly url = environment.apiUrl + '/user/notifications';
  private activeUserId: string | null = null;
  private generation = 0;
  private readonly pending = new Set<string>();
  readonly items = signal<AppNotification[]>([]);
  readonly totalCount = signal(0);
  readonly unreadCount = signal(0);
  readonly countsByCategory = signal(emptyCounts());
  readonly unreadCountsByCategory = signal(emptyCounts());
  readonly loading = signal(false);
  readonly error = signal(false);

  setUser(userId: string | null): void {
    if (this.activeUserId === userId) return;
    this.activeUserId = userId;
    this.generation++;
    this.pending.clear(); this.items.set([]); this.totalCount.set(0); this.unreadCount.set(0);
    this.countsByCategory.set(emptyCounts()); this.unreadCountsByCategory.set(emptyCounts());
    this.loading.set(false); this.error.set(false);
    if (userId) this.syncFromStorage();
  }

  // Kept for the existing header refresh hook; the source is now the server.
  syncFromStorage(): void { void this.refresh().catch(() => this.showError()); }

  private async request<T>(method: string, path: string): Promise<T> {
    const token = this.auth.getToken();
    const response = await firstValueFrom(this.http.request<{ success: boolean; data: T }>(method, this.url + path));
    if (token !== this.auth.getToken() || !response.success || response.data == null) throw new Error('Phản hồi thông báo không hợp lệ.');
    return response.data;
  }

  async refresh(): Promise<void> {
    if (!this.activeUserId) return;
    const generation = ++this.generation;
    this.loading.set(true);
    try {
      const items: AppNotification[] = [];
      for (let page = 1; ; page++) {
        const data = await this.request<Page>('GET', '?page=' + page + '&limit=100&sort=newest');
        if (generation !== this.generation) return;
        items.push(...data.items);
        if (!data.pagination.hasMore) break;
      }
      const summary = await this.request<Summary>('GET', '/summary');
      if (generation !== this.generation) return;
      this.items.set(items); this.totalCount.set(summary.totalCount); this.unreadCount.set(summary.unreadCount);
      this.countsByCategory.set(summary.countsByCategory); this.unreadCountsByCategory.set(summary.unreadCountsByCategory);
      this.error.set(false);
    } catch (error) {
      if (generation !== this.generation) return;
      this.error.set(true);
      throw error;
    } finally { if (generation === this.generation) this.loading.set(false); }
  }

  private showError(): void { this.toast.showToast({ type: 'error', message: 'Không thể cập nhật thông báo. Vui lòng thử lại.' }); }

  private async mutate<T>(key: string, method: string, path: string): Promise<T | null> {
    if (!this.activeUserId || this.pending.has(key)) return null;
    const user = this.activeUserId;
    this.pending.add(key);
    try {
      const data = await this.request<T>(method, path);
      if (user !== this.activeUserId) return null;
      // An ACK is authoritative even if the subsequent refresh fails.
      void this.refresh().catch(() => this.showError());
      return data;
    } catch {
      if (user === this.activeUserId) { this.showError(); this.syncFromStorage(); }
      return null;
    } finally { if (user === this.activeUserId) this.pending.delete(key); }
  }

  async markRead(id: string): Promise<boolean> {
    return !!await this.mutate<AppNotification>(id, 'PATCH', '/' + encodeURIComponent(id) + '/read');
  }
  async markAllRead(): Promise<number | null> {
    const result = await this.mutate<{ changed: number }>('read-all', 'PATCH', '/read-all');
    return result?.changed ?? null;
  }
  async remove(id: string): Promise<RemovedNotification | null> {
    const index = this.items().findIndex(item => item.id === id);
    if (index < 0) return null;
    const item = this.items()[index];
    const result = await this.mutate<{ id: string; undoUntil: string }>(id, 'DELETE', '/' + encodeURIComponent(id));
    return result ? { item, index, undoUntil: result.undoUntil } : null;
  }
  async restore(removed: RemovedNotification): Promise<boolean> {
    return !!await this.mutate<AppNotification>(removed.item.id, 'POST', '/' + encodeURIComponent(removed.item.id) + '/restore');
  }
}
