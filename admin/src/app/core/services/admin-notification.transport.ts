import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminNotificationItem,
  AdminNotificationListQuery,
  AdminNotificationPage,
  AdminNotificationSummary,
  EMPTY_NOTIFICATION_SUMMARY,
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_TYPE_LABELS
} from '../models/admin-notification.model';

/**
 * P3 — Transport abstraction.
 *
 * The service only depends on this interface so a websocket/SSE transport can be
 * added later without touching the panel or the layout. Production always uses the
 * HTTP implementation; the demo adapter is selected only for the local demo build.
 */
export interface AdminNotificationTransport {
  summary(adminId: string): Observable<AdminNotificationSummary>;
  list(adminId: string, query: AdminNotificationListQuery): Observable<AdminNotificationPage>;
  markRead(adminId: string, id: string): Observable<AdminNotificationItem>;
  markAllRead(adminId: string): Observable<number>;
}

const DEMO_STORAGE_PREFIX = 'thinkup_admin_notifications_demo:';

export function createHttpNotificationTransport(http: HttpClient): AdminNotificationTransport {
  const baseUrl = `${environment.apiUrl}/admin/notifications`;

  return {
    summary: () => http.get<AdminNotificationSummary & { success: boolean }>(`${baseUrl}/summary`)
      .pipe(map((response) => normalizeSummary(response))),

    list: (_adminId, query) => {
      let params = new HttpParams().set('limit', String(query.limit ?? NOTIFICATION_PAGE_SIZE));
      if (query.cursor) params = params.set('cursor', query.cursor);
      if (query.type && query.type !== 'all') params = params.set('type', query.type);
      if (query.unread === true) params = params.set('unread', 'true');
      return http.get<AdminNotificationPage & { success: boolean }>(baseUrl, { params })
        .pipe(map((response) => ({
          items: Array.isArray(response.items) ? response.items : [],
          pageSize: response.pageSize ?? NOTIFICATION_PAGE_SIZE,
          hasMore: response.hasMore === true,
          nextCursor: response.nextCursor ?? null
        })));
    },

    markRead: (_adminId, id) => http.post<{ success: boolean; notification: AdminNotificationItem }>(
      `${baseUrl}/${encodeURIComponent(id)}/read`,
      {}
    ).pipe(map((response) => response.notification)),

    markAllRead: () => http.post<{ success: boolean; changed: number }>(`${baseUrl}/read-all`, {})
      .pipe(map((response) => response.changed ?? 0))
  };
}

export function createDemoNotificationTransport(): AdminNotificationTransport {
  return {
    summary: (adminId) => of(buildSummary(readDemoItems(adminId))),
    list: (adminId, query) => {
      const filtered = readDemoItems(adminId)
        .filter((item) => (query.type && query.type !== 'all' ? item.type === query.type : true))
        .filter((item) => (query.unread === true ? item.readAt === null : true))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const start = query.cursor ? Math.max(0, filtered.findIndex((item) => item.id === query.cursor) + 1) : 0;
      const limit = query.limit ?? NOTIFICATION_PAGE_SIZE;
      const page = filtered.slice(start, start + limit);
      const hasMore = start + limit < filtered.length;
      return of({
        items: page,
        pageSize: limit,
        hasMore,
        nextCursor: hasMore && page.length ? page[page.length - 1].id : null
      });
    },
    markRead: (adminId, id) => {
      const items = readDemoItems(adminId);
      const target = items.find((item) => item.id === id);
      if (!target) return throwError(() => Object.assign(new Error('Không tìm thấy thông báo.'), { status: 404 }));
      target.readAt = new Date().toISOString();
      writeDemoItems(adminId, items);
      return of(target);
    },
    markAllRead: (adminId) => {
      const items = readDemoItems(adminId);
      const now = new Date().toISOString();
      let changed = 0;
      for (const item of items) {
        if (!item.readAt) {
          item.readAt = now;
          changed += 1;
        }
      }
      writeDemoItems(adminId, items);
      return of(changed);
    }
  };
}

function normalizeSummary(value: Partial<AdminNotificationSummary> | null): AdminNotificationSummary {
  return {
    total: Number.isFinite(value?.total) ? Number(value?.total) : 0,
    unread: Number.isFinite(value?.unread) ? Number(value?.unread) : 0,
    read: Number.isFinite(value?.read) ? Number(value?.read) : 0,
    byType: { ...EMPTY_NOTIFICATION_SUMMARY.byType, ...(value?.byType || {}) }
  };
}

function buildSummary(items: AdminNotificationItem[]): AdminNotificationSummary {
  const summary: AdminNotificationSummary = {
    total: items.length,
    unread: 0,
    read: 0,
    byType: Object.fromEntries(
      Object.keys(EMPTY_NOTIFICATION_SUMMARY.byType).map((type) => [type, { total: 0, unread: 0 }])
    ) as AdminNotificationSummary['byType']
  };
  for (const item of items) {
    const bucket = summary.byType[item.type];
    if (bucket) {
      bucket.total += 1;
      if (!item.readAt) bucket.unread += 1;
    }
    if (item.readAt) summary.read += 1;
    else summary.unread += 1;
  }
  return summary;
}

function demoKey(adminId: string): string {
  return `${DEMO_STORAGE_PREFIX}${adminId}`;
}

function readDemoItems(adminId: string): AdminNotificationItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(demoKey(adminId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function writeDemoItems(adminId: string, items: AdminNotificationItem[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(demoKey(adminId), JSON.stringify({ items }));
}

/** Exposed for the demo panel while a local build has no admin notifications backend. */
export function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABELS[type as keyof typeof NOTIFICATION_TYPE_LABELS] ?? 'Thông báo';
}
