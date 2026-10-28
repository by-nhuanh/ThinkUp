import { Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import {
  LucideBell,
  LucideCheck,
  LucideChevronDown,
  LucideCircleCheck,
  LucideInbox,
  LucideMessageCircle,
  LucideSettings2,
} from '@lucide/angular';
import { environment } from '../../../../environments/environment';
import {
  AppNotification,
  notificationCategoryMeta,
} from '../../../core/models/notification.model';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ToastService } from '../../../core/services/toast.service';
import { SettingsService } from '../../settings/services/settings.service';
import { NotificationRowComponent } from '../components/notification-row/notification-row.component';
import {
  NOTIFICATION_GROUP_ASIDE,
  NOTIFICATION_SETTINGS_PATH,
  NOTIFICATION_TABS,
  NotificationTabId,
} from '../data/notification-catalog';
import {
  NotificationTimeGroup,
  notificationTimeGroup,
} from '../utils/notification-time';

type SortOption = 'newest' | 'oldest' | 'unread';

interface NotificationGroupView {
  key: NotificationTimeGroup;
  label: string;
  items: AppNotification[];
}

const GROUP_LABELS: Readonly<Record<NotificationTimeGroup, string>> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  earlier: 'Trước đó',
};

const GROUP_ORDER: readonly NotificationTimeGroup[] = ['today', 'yesterday', 'earlier'];

function isCategoryTab(value: string | null): value is Exclude<NotificationTabId, 'all'> {
  return value === 'learning' || value === 'transactions' || value === 'security';
}

/**
 * Trung tâm thông báo - Figma section "thông báo" (3188:19571).
 * Bốn màn hình: Tất cả, Học tập & Tiến độ, Giao dịch & Khuyến mãi, Bảo mật & Hệ thống.
 */
@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [
    RouterLink,
    NotificationRowComponent,
    LucideBell,
    LucideCheck,
    LucideChevronDown,
    LucideCircleCheck,
    LucideInbox,
    LucideMessageCircle,
    LucideSettings2,
  ],
  templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.css',
})
export class NotificationCenterComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);

  private readonly tabParam = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('tab'))),
    { initialValue: this.route.snapshot.paramMap.get('tab') }
  );

  readonly tab = computed<NotificationTabId>(() => {
    const value = this.tabParam();
    return isCategoryTab(value) ? value : 'all';
  });

  readonly totalCount = this.notifications.totalCount;
  readonly unreadCount = this.notifications.unreadCount;
  readonly readCount = computed(() => this.totalCount() - this.unreadCount());
  readonly countsByCategory = this.notifications.countsByCategory;
  readonly prefs = this.settings.notificationPrefs;
  readonly settingsPath = NOTIFICATION_SETTINGS_PATH;

  readonly tabs = computed(() => {
    const counts = this.countsByCategory();
    return NOTIFICATION_TABS.map((tab) => ({
      ...tab,
      count: tab.id === 'all' ? this.totalCount() : counts[tab.id],
    }));
  });

  readonly tabLabel = computed(
    () => this.tabs().find((tab) => tab.id === this.tab())?.label ?? 'Tất cả'
  );

  readonly aside = computed(() => {
    const tab = this.tab();
    return tab === 'all' ? null : NOTIFICATION_GROUP_ASIDE[tab];
  });

  readonly sort = signal<SortOption>('newest');
  readonly sortOpen = signal(false);
  readonly sortOptions: ReadonlyArray<{ id: SortOption; label: string }> = [
    { id: 'newest', label: 'Mới nhất' },
    { id: 'oldest', label: 'Cũ nhất' },
    { id: 'unread', label: 'Chưa đọc' },
  ];
  readonly sortLabel = computed(
    () => this.sortOptions.find((option) => option.id === this.sort())?.label ?? 'Mới nhất'
  );

  constructor() {
    if (!environment.production) {
      // TODO(pre-deploy): Xóa fallback user và lệnh nạp mock khi Notification API sẵn sàng.
      const testUserId = this.auth.currentUser()?.id ?? 'notification-demo-user';
      this.notifications.loadMockDataForTesting(testUserId);
      effect(() => {
        // Header khách có thể xóa active user sau khi route được khởi tạo; nạp lại cho màn QA.
        if (this.notifications.totalCount() === 0) {
          this.notifications.loadMockDataForTesting(testUserId);
        }
      });
    }
  }

  /** Thông báo hiển thị theo tab và kiểu sắp xếp (chỉ tab "Tất cả" có sắp xếp). */
  readonly visibleItems = computed<AppNotification[]>(() => {
    const tab = this.tab();
    const items = this.notifications.items();
    const scoped = tab === 'all' ? items : items.filter((item) => item.category === tab);
    if (tab !== 'all') return scoped;

    switch (this.sort()) {
      case 'oldest':
        return [...scoped].reverse();
      case 'unread':
        return scoped.filter((item) => !item.readAt);
      default:
        return scoped;
    }
  });

  readonly groups = computed<NotificationGroupView[]>(() => {
    const buckets = new Map<NotificationTimeGroup, AppNotification[]>();
    for (const item of this.visibleItems()) {
      const key = notificationTimeGroup(item.createdAt);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }

    const groups: NotificationGroupView[] = [];
    const groupOrder = this.tab() === 'all' && this.sort() === 'oldest'
      ? [...GROUP_ORDER].reverse()
      : GROUP_ORDER;
    for (const key of groupOrder) {
      const items = buckets.get(key);
      if (items?.length) groups.push({ key, label: GROUP_LABELS[key], items });
    }
    return groups;
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.sortOpen()) return;
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.querySelector('[data-sort-root]')?.contains(target)) {
      this.sortOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closeSort(): void {
    this.sortOpen.set(false);
  }

  toggleSort(event: MouseEvent): void {
    event.stopPropagation();
    this.sortOpen.update((open) => !open);
  }

  selectSort(option: SortOption): void {
    this.sort.set(option);
    this.sortOpen.set(false);
  }

  markAllRead(): void {
    const changed = this.notifications.markAllRead();
    if (changed === 0) {
      this.toast.showToast({ type: 'info', message: 'Tất cả thông báo đã được đọc.' });
      return;
    }
    this.toast.showToast({
      type: 'success',
      message: `Đã đánh dấu ${changed} thông báo là đã đọc.`,
    });
  }

  openNotification(item: AppNotification): void {
    this.notifications.markRead(item.id);
    if (item.href) void this.router.navigateByUrl(item.href);
  }

  removeNotification(item: AppNotification): void {
    const removed = this.notifications.remove(item.id);
    if (!removed) return;

    this.toast.showToast({
      type: 'success',
      message: 'Đã xóa thông báo.',
      duration: 6000,
      action: {
        label: 'Hoàn tác',
        run: () => {
          this.notifications.restore(removed);
          this.toast.showToast({ type: 'info', message: 'Đã khôi phục thông báo.' });
        },
      },
    });
  }

  /**
   * Bật/tắt nhóm thông báo tương ứng trên trang Cài đặt thông báo.
   * Thông báo bảo mật luôn bật nên không có hành động này.
   */
  toggleMute(item: AppNotification): void {
    if (item.category === 'security') return;

    const key = item.category === 'learning' ? 'learning' : 'marketing';
    const next = !this.prefs()[key];
    this.settings.setNotificationPrefs({ ...this.prefs(), [key]: next });

    const label = notificationCategoryMeta(item.category).label;
    this.toast.showToast({
      type: 'success',
      message: next ? `Đã bật thông báo ${label}.` : `Đã tắt thông báo ${label}.`,
    });
  }

  muteLabelFor(item: AppNotification): string {
    if (item.category === 'security') return 'Tắt thông báo liên quan';
    const enabled = item.category === 'learning' ? this.prefs().learning : this.prefs().marketing;
    return enabled ? 'Tắt thông báo liên quan' : 'Bật thông báo liên quan';
  }
}
