import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminNotificationItem,
  AdminNotificationPage,
  AdminNotificationSummary,
  EMPTY_NOTIFICATION_SUMMARY,
  NOTIFICATION_PAGE_SIZE
} from '../models/admin-notification.model';
import { AdminAuthService } from './admin-auth.service';
import { AdminCrossTabService } from './admin-cross-tab.service';
import {
  AdminNotificationTransport,
  createDemoNotificationTransport,
  createHttpNotificationTransport
} from './admin-notification.transport';

const POLL_INTERVAL_MS = 60_000;
const MIN_REFRESH_GAP_MS = 10_000;

/**
 * P3 — Notification state for the admin bell.
 *
 * Polling is deliberately conservative: only while the tab is visible, at most
 * once per minute, and every refresh (poll, focus, cross-tab) is throttled.
 * Reads are optimistic and reconciled by a silent refresh on failure.
 */
@Injectable({ providedIn: 'root' })
export class AdminNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly crossTab = inject(AdminCrossTabService);

  private readonly httpTransport = createHttpNotificationTransport(this.http);
  private readonly demoTransport = createDemoNotificationTransport();
  private poller: ReturnType<typeof setInterval> | null = null;
  private lastRefreshAt = 0;
  private inFlight = false;
  private loadedFor: string | null = null;

  private readonly itemsState = signal<AdminNotificationItem[]>([]);
  private readonly summaryState = signal<AdminNotificationSummary>({ ...EMPTY_NOTIFICATION_SUMMARY });
  private readonly loadingState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly hasMoreState = signal(false);
  private readonly nextCursorState = signal<string | null>(null);
  private readonly initializedState = signal(false);

  readonly items = this.itemsState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly initialized = this.initializedState.asReadonly();
  readonly unread = computed(() => this.summaryState().unread);
  readonly badgeText = computed(() => {
    const count = this.unread();
    return count > 99 ? '99+' : String(count);
  });

  constructor() {
    this.crossTab.subscribe((message) => {
      if (message.type !== 'notifications-changed') return;
      if (message.adminId !== this.auth.currentUser()?.id) return;
      this.refresh(true, true);
    });

    if (typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.refresh(false, true);
    });
    window.addEventListener('focus', () => this.refresh(false, true));
    this.poller = setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh(false, true);
    }, POLL_INTERVAL_MS);
  }

  /** First page + summary. `silent` keeps the current list on screen while refreshing. */
  refresh(force = false, silent = false): void {
    const adminId = this.adminId();
    if (!adminId) return;
    if (this.inFlight) return;
    if (!force && Date.now() - this.lastRefreshAt < MIN_REFRESH_GAP_MS) return;

    if (this.loadedFor !== adminId) {
      // Không để dữ liệu của admin trước lộ sang phiên mới.
      this.loadedFor = adminId;
      this.itemsState.set([]);
      this.summaryState.set({ ...EMPTY_NOTIFICATION_SUMMARY });
      this.hasMoreState.set(false);
      this.nextCursorState.set(null);
      this.initializedState.set(false);
    }

    this.inFlight = true;
    if (!silent || !this.initializedState()) this.loadingState.set(true);
    this.errorState.set(null);

    forkJoin({
      summary: this.transport().summary(adminId),
      page: this.transport().list(adminId, { limit: NOTIFICATION_PAGE_SIZE })
    }).pipe(
      finalize(() => {
        this.inFlight = false;
        this.loadingState.set(false);
      })
    ).subscribe({
      next: ({ summary, page }) => {
        this.applySummary(summary);
        this.itemsState.set(page.items);
        this.applyPageMeta(page);
        this.initializedState.set(true);
        this.lastRefreshAt = Date.now();
        this.errorState.set(null);
      },
      error: (error: unknown) => {
        this.errorState.set(this.messageOf(error));
      }
    });
  }

  loadMore(): void {
    const adminId = this.adminId();
    const cursor = this.nextCursorState();
    if (!adminId || !cursor || this.loadingMoreState() || this.loadingState()) return;

    this.loadingMoreState.set(true);
    this.errorState.set(null);
    this.transport().list(adminId, { limit: NOTIFICATION_PAGE_SIZE, cursor }).subscribe({
      next: (page) => {
        this.itemsState.update((items) => mergeItems(items, page.items));
        this.applyPageMeta(page);
        this.loadingMoreState.set(false);
      },
      error: (error: unknown) => {
        this.errorState.set(this.messageOf(error));
        this.loadingMoreState.set(false);
      }
    });
  }

  /** Marks one notification read (optimistic) and syncs other tabs. */
  markRead(item: AdminNotificationItem): void {
    const adminId = this.adminId();
    if (!adminId || item.readAt) return;
    const readAt = new Date().toISOString();
    this.itemsState.update((items) => items.map((entry) => (entry.id === item.id ? { ...entry, readAt } : entry)));
    this.summaryState.update((summary) => ({
      ...summary,
      unread: Math.max(0, summary.unread - 1),
      read: summary.read + 1,
      byType: {
        ...summary.byType,
        [item.type]: {
          total: summary.byType[item.type]?.total ?? 0,
          unread: Math.max(0, (summary.byType[item.type]?.unread ?? 0) - 1)
        }
      }
    }));

    this.transport().markRead(adminId, item.id).subscribe({
      next: () => this.broadcast('read'),
      error: () => this.refresh(true, true)
    });
  }

  markAllRead(): void {
    const adminId = this.adminId();
    if (!adminId || this.unread() === 0) return;
    const readAt = new Date().toISOString();
    this.itemsState.update((items) => items.map((entry) => (entry.readAt ? entry : { ...entry, readAt })));
    this.summaryState.update((summary) => ({
      total: summary.total,
      unread: 0,
      read: summary.total,
      byType: Object.fromEntries(
        Object.entries(summary.byType).map(([type, bucket]) => [type, { total: bucket.total, unread: 0 }])
      ) as AdminNotificationSummary['byType']
    }));

    this.transport().markAllRead(adminId).subscribe({
      next: () => this.broadcast('read-all'),
      error: () => this.refresh(true, true)
    });
  }

  /** Called when the panel opens; avoids a fetch when data is still fresh. */
  openPanel(): void {
    if (!this.initializedState()) {
      this.refresh(true, false);
      return;
    }
    this.refresh(false, true);
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  /** Clears everything on sign-out so the next admin never sees stale counts. */
  reset(): void {
    this.loadedFor = null;
    this.lastRefreshAt = 0;
    this.itemsState.set([]);
    this.summaryState.set({ ...EMPTY_NOTIFICATION_SUMMARY });
    this.hasMoreState.set(false);
    this.nextCursorState.set(null);
    this.initializedState.set(false);
    this.errorState.set(null);
    this.loadingState.set(false);
    this.loadingMoreState.set(false);
  }

  private applySummary(summary: AdminNotificationSummary): void {
    this.summaryState.set(summary);
  }

  private applyPageMeta(page: AdminNotificationPage): void {
    this.hasMoreState.set(page.hasMore);
    this.nextCursorState.set(page.nextCursor);
  }

  private broadcast(reason: 'read' | 'read-all' | 'received'): void {
    const adminId = this.adminId();
    if (!adminId) return;
    this.crossTab.publish({ type: 'notifications-changed', adminId, reason });
  }

  private adminId(): string | null {
    return this.auth.currentUser()?.id ?? null;
  }

  private isDemoMode(): boolean {
    return environment.adminDemoLogin || this.auth.getToken() === 'demo-local-access-token';
  }

  private transport(): AdminNotificationTransport {
    return this.isDemoMode() ? this.demoTransport : this.httpTransport;
  }

  private messageOf(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { message?: string } | null;
      if (body?.message) return body.message;
      return error.status === 0
        ? 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền.'
        : 'Không tải được thông báo. Vui lòng thử lại.';
    }
    if (error instanceof Error && error.message) return error.message;
    return 'Không tải được thông báo. Vui lòng thử lại.';
  }
}

function mergeItems(current: AdminNotificationItem[], incoming: AdminNotificationItem[]): AdminNotificationItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
