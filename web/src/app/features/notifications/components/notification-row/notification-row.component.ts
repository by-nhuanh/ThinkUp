import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideBellOff, LucideEllipsisVertical, LucideTrash } from '@lucide/angular';
import {
  AppNotification,
  notificationCategoryMeta,
  notificationKindMeta,
} from '../../../../core/models/notification.model';
import { NotificationIconComponent } from '../../../../shared/components/notification-icon/notification-icon.component';
import { formatNotificationTime } from '../../utils/notification-time';

/**
 * Một dòng thông báo trong danh sách (Figma section "thông báo" 3188:19571):
 * dot chưa đọc 8px, icon tròn 52px, tiêu đề 15/600, mô tả + badge, thời gian và menu 3 chấm.
 */
@Component({
  selector: 'app-notification-row',
  standalone: true,
  imports: [NotificationIconComponent, LucideBellOff, LucideEllipsisVertical, LucideTrash],
  templateUrl: './notification-row.component.html',
  styleUrl: './notification-row.component.css',
})
export class NotificationRowComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly item = input.required<AppNotification>();
  /** Tab "Tất cả" hiển thị badge theo nhóm, tab chuyên đề hiển thị badge theo loại. */
  readonly badgeMode = input<'kind' | 'category'>('kind');
  /** Nhãn hành động bật/tắt thông báo liên quan; null = không hiển thị hành động này. */
  readonly muteLabel = input<string | null>(null);
  /** Thông báo bảo mật luôn bật nên hành động tắt bị khóa. */
  readonly muteLocked = input(false);

  readonly openNotification = output<AppNotification>();
  readonly removeNotification = output<AppNotification>();
  readonly toggleMute = output<AppNotification>();

  readonly menuOpen = signal(false);

  readonly kindMeta = computed(() => notificationKindMeta(this.item().kind));
  readonly time = computed(() => formatNotificationTime(this.item().createdAt));

  readonly badge = computed(() => {
    const item = this.item();
    if (this.badgeMode() === 'category') {
      const category = notificationCategoryMeta(item.category);
      return {
        label: category.label,
        background: category.badgeBackground,
        color: category.badgeColor,
      };
    }
    const kind = this.kindMeta();
    return { label: kind.label, background: kind.background, color: kind.color };
  });

  readonly lockedHint = 'Thông báo bảo mật luôn được bật để bảo vệ tài khoản của bạn.';

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const target = event.target;
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closeMenu(): void {
    this.menuOpen.set(false);
  }

  onActivate(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      return;
    }
    this.openNotification.emit(this.item());
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  onRemove(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.removeNotification.emit(this.item());
  }

  onToggleMute(event: MouseEvent): void {
    event.stopPropagation();
    if (this.muteLocked()) return;
    this.menuOpen.set(false);
    this.toggleMute.emit(this.item());
  }
}
