import { Component, OnInit, computed, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import {
  AdminNotificationItem,
  NOTIFICATION_TYPE_LABELS
} from '../../../../core/models/admin-notification.model';
import { AdminNotificationsService } from '../../../../core/services/admin-notifications.service';
import { AdminPreferencesService } from '../../../../core/services/admin-preferences.service';
import { formatInTimezone } from '../../../../core/services/admin-timezone';

/**
 * P3 — Panel chuông thông báo.
 *
 * Toàn bộ dữ liệu đến từ `AdminNotificationsService` (HTTP ở production, adapter
 * demo chỉ trong build local). Không có nội dung thông báo hardcode.
 */
@Component({
  selector: 'app-admin-notifications-panel',
  standalone: true,
  templateUrl: './admin-notifications-panel.component.html',
  styleUrl: './admin-notifications-panel.component.css'
})
export class AdminNotificationsPanelComponent implements OnInit {
  private readonly notifications = inject(AdminNotificationsService);
  private readonly preferences = inject(AdminPreferencesService);
  private readonly router = inject(Router);

  readonly dismissed = output<void>();

  readonly items = this.notifications.items;
  readonly loading = this.notifications.loading;
  readonly loadingMore = this.notifications.loadingMore;
  readonly error = this.notifications.error;
  readonly hasMore = this.notifications.hasMore;
  readonly unread = this.notifications.unread;
  readonly summary = this.notifications.summary;
  readonly countLabel = computed(() => {
    const unread = this.unread();
    return unread > 0 ? `${unread} chưa đọc` : 'Không có thông báo mới';
  });

  ngOnInit(): void {
    this.notifications.openPanel();
  }

  retry(): void {
    this.notifications.refresh(true, false);
  }

  loadMore(): void {
    this.notifications.loadMore();
  }

  markAllRead(): void {
    this.notifications.markAllRead();
  }

  select(item: AdminNotificationItem): void {
    this.notifications.markRead(item);
    if (item.href) {
      void this.router.navigateByUrl(item.href);
      this.dismissed.emit();
    }
  }

  timeLabel(item: AdminNotificationItem): string {
    if (item.createdAtLocal) return item.createdAtLocal;
    return formatInTimezone(item.createdAt, this.preferences.applied().timezone);
  }

  typeLabel(type: string): string {
    return NOTIFICATION_TYPE_LABELS[type as keyof typeof NOTIFICATION_TYPE_LABELS] ?? 'Thông báo';
  }

  close(): void {
    this.dismissed.emit();
  }
}
