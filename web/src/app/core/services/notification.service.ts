import { Injectable, computed, signal } from '@angular/core';
import {
  AppNotification,
  NotificationCategory,
  NotificationInput,
  NotificationKind,
} from '../models/notification.model';
import { buildSeedNotifications } from '../data/mock/notifications.mock';

const STORAGE_PREFIX = 'thinkup_notifications_';
const SEED_VERSION = 'v1';

/** Giữ tên cũ để các luồng đang dùng (header, onboarding) không phải đổi import. */
export type UserNotification = AppNotification;

export interface RemovedNotification {
  item: AppNotification;
  index: number;
}

function sortByNewest(items: AppNotification[]): AppNotification[] {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function emptyCategoryMap(): Record<NotificationCategory, number> {
  return { learning: 0, transactions: 0, security: 0 };
}

/**
 * Kho thông báo dùng chung cho toàn app.
 *
 * TODO(pre-deploy): Thay localStorage bằng API thật (`GET /user/notifications`,
 * `PATCH /user/notifications/:id/read`, `DELETE /user/notifications/:id`) khi backend
 * chốt spec/Postman handoff. Hiện tại dữ liệu demo lấy từ `core/data/mock/notifications.mock.ts`.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly activeUserId = signal<string | null>(null);
  private readonly itemsState = signal<AppNotification[]>([]);

  readonly items = this.itemsState.asReadonly();
  readonly totalCount = computed(() => this.itemsState().length);
  readonly unreadCount = computed(() => this.itemsState().filter((item) => !item.readAt).length);

  readonly countsByCategory = computed<Record<NotificationCategory, number>>(() => {
    const counts = emptyCategoryMap();
    for (const item of this.itemsState()) counts[item.category] += 1;
    return counts;
  });

  readonly unreadCountsByCategory = computed<Record<NotificationCategory, number>>(() => {
    const counts = emptyCategoryMap();
    for (const item of this.itemsState()) {
      if (!item.readAt) counts[item.category] += 1;
    }
    return counts;
  });

  setUser(userId: string | null): void {
    if (this.activeUserId() === userId) return;
    this.activeUserId.set(userId);

    if (!userId) {
      this.itemsState.set([]);
      return;
    }

    const stored = this.readStored(userId) ?? [];
    if (this.hasSeeded(userId)) {
      this.itemsState.set(sortByNewest(stored));
      return;
    }

    // Lần đầu mở module: ghép dữ liệu demo với thông báo cũ (ví dụ thông báo onboarding),
    // rồi ghi marker riêng để việc xóa sạch danh sách không làm dữ liệu demo tự xuất hiện lại.
    const existingIds = new Set(stored.map((item) => item.id));
    const seeded = sortByNewest([
      ...stored,
      ...buildSeedNotifications().filter((item) => !existingIds.has(item.id)),
    ]);
    this.itemsState.set(seeded);
    this.write(userId, seeded);
    this.markSeeded(userId);
  }

  syncFromStorage(): void {
    const userId = this.activeUserId();
    if (!userId) return;
    const stored = this.readStored(userId);
    if (stored) this.itemsState.set(sortByNewest(stored));
  }

  /**
   * Nạp lại các bản ghi mock còn thiếu để QA có thể mở thẳng module và kiểm thử.
   * Giữ nguyên trạng thái đã đọc của bản ghi còn tồn tại và không xóa thông báo từ luồng khác.
   *
   * TODO(pre-deploy): Xóa hàm này cùng dữ liệu mock khi Notification API được tích hợp.
   */
  loadMockDataForTesting(userId: string): void {
    const existing = this.readStored(userId) ?? [];
    const existingIds = new Set(existing.map((item) => item.id));
    const next = sortByNewest([
      ...existing,
      ...buildSeedNotifications().filter((item) => !existingIds.has(item.id)),
    ]);

    this.activeUserId.set(userId);
    this.itemsState.set(next);
    this.write(userId, next);
    this.markSeeded(userId);
  }

  addForUser(userId: string, input: NotificationInput): void {
    const existing = this.readStored(userId) ?? [];
    if (existing.some((item) => item.id === input.id)) return;

    const next = sortByNewest([
      {
        id: input.id,
        category: input.category ?? 'learning',
        kind: input.kind ?? 'progress',
        title: input.title,
        message: input.message,
        createdAt: input.createdAt,
        readAt: input.readAt ?? null,
        href: input.href,
      },
      ...existing,
    ]);

    this.write(userId, next);
    if (this.activeUserId() === userId) this.itemsState.set(next);
  }

  markRead(id: string): void {
    const readAt = new Date().toISOString();
    this.update((items) =>
      items.map((item) => (item.id === id && !item.readAt ? { ...item, readAt } : item))
    );
  }

  /** Trả về số thông báo vừa được chuyển sang trạng thái đã đọc. */
  markAllRead(): number {
    const readAt = new Date().toISOString();
    let changed = 0;
    this.update((items) =>
      items.map((item) => {
        if (item.readAt) return item;
        changed += 1;
        return { ...item, readAt };
      })
    );
    return changed;
  }

  remove(id: string): RemovedNotification | null {
    const items = this.itemsState();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return null;

    const item = items[index];
    this.update((current) => current.filter((entry) => entry.id !== id));
    return { item, index };
  }

  /** Hoàn tác thao tác xóa: chèn lại bản ghi về đúng vị trí cũ. */
  restore(removed: RemovedNotification): void {
    this.update((items) => {
      if (items.some((item) => item.id === removed.item.id)) return items;
      const next = [...items];
      next.splice(Math.min(removed.index, next.length), 0, removed.item);
      return next;
    });
  }

  private update(transform: (items: AppNotification[]) => AppNotification[]): void {
    const userId = this.activeUserId();
    const next = transform(this.itemsState());
    this.itemsState.set(next);
    if (userId) this.write(userId, next);
  }

  /** Trả về null khi chưa từng lưu dữ liệu cho user này (khác với mảng rỗng). */
  private readStored(userId: string): AppNotification[] | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + userId);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return null;
      return value.map(normalizeStoredNotification).filter(isPresent);
    } catch {
      return null;
    }
  }

  private write(userId: string, items: AppNotification[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(items));
    } catch {
      // Storage unavailable: keep the in-memory notification state for this tab.
    }
  }

  private hasSeeded(userId: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(`${STORAGE_PREFIX}${userId}_seed`) === SEED_VERSION;
  }

  private markSeeded(userId: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${userId}_seed`, SEED_VERSION);
    } catch {
      // Storage unavailable: the in-memory state remains usable for this tab.
    }
  }
}

const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'progress',
  'milestone',
  'reminder',
  'quiz',
  'certificate',
  'course-update',
  'achievement',
  'purchase',
  'payment',
  'promotion',
  'voucher',
  'refund',
  'login',
  'password',
  'email',
  'system',
  'alert',
  'backup',
];

function normalizeStoredNotification(value: unknown): AppNotification | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<AppNotification>;
  if (
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.message !== 'string' ||
    typeof item.createdAt !== 'string'
  ) {
    return null;
  }

  const category: NotificationCategory =
    item.category === 'transactions' || item.category === 'security' ? item.category : 'learning';
  const kind = NOTIFICATION_KINDS.includes(item.kind as NotificationKind)
    ? (item.kind as NotificationKind)
    : 'progress';

  return {
    id: item.id,
    title: item.title,
    message: item.message,
    createdAt: item.createdAt,
    href: typeof item.href === 'string' ? item.href : undefined,
    readAt: typeof item.readAt === 'string' ? item.readAt : null,
    category,
    kind,
  };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
