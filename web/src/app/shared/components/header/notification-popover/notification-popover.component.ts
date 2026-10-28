import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../../../core/services/notification.service';
import { notificationKindMeta } from '../../../../core/models/notification.model';
import { NotificationIconComponent } from '../../notification-icon/notification-icon.component';
import { formatRelativeTime } from '../../../../features/notifications/utils/notification-time';

/**
 * Chuông thông báo + popover trên header (Figma 400x460, node trong section "thông báo" 3188:19571).
 * Chỉ được render cho thành viên đã đăng nhập; header quyết định việc đó.
 *
 * Không import `@lucide/angular` ở đây: component này nằm trong bundle đầu tiên, và chỉ một
 * import lucide là toàn bộ thư viện icon bị kéo vào bundle đó (icon vẽ bằng SVG nội tuyến).
 */
@Component({
  selector: 'app-notification-popover',
  standalone: true,
  imports: [RouterLink, NotificationIconComponent],
  templateUrl: './notification-popover.component.html',
  styleUrl: './notification-popover.component.css',
})
export class NotificationPopoverComponent {
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly unreadCount = this.notifications.unreadCount;
  readonly open = signal(false);

  readonly items = computed(() =>
    this.notifications.items().map((item) => ({
      ...item,
      relativeTime: formatRelativeTime(item.createdAt),
      meta: notificationKindMeta(item.kind),
    }))
  );

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) this.close();
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.open.set(false);
  }

  toggle(): void {
    this.open.update((open) => !open);
  }

  markAllRead(): void {
    this.notifications.markAllRead();
  }

  openItem(id: string, href?: string): void {
    this.notifications.markRead(id);
    this.close();
    if (href) void this.router.navigateByUrl(href);
  }
}
