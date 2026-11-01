import { Component, ElementRef, HostListener, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { LucideBellOff, LucideEllipsisVertical, LucideTrash } from '@lucide/angular';
import {
  AppNotification,
  notificationCategoryMeta,
  notificationKindMeta,
} from '../../../../core/models/notification.model';
import { NotificationIconComponent } from '../../../../shared/components/notification-icon/notification-icon.component';
import { moveMenuFocus, preferMenuAbove } from '../../utils/menu-placement';
import { formatNotificationTime } from '../../utils/notification-time';

/** Chiều cao ước tính của menu 2 mục - dùng để chọn hướng mở theo khoảng trống viewport. */
const MENU_ESTIMATED_HEIGHT = 96;

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
  /** Menu mở lên trên khi bên dưới không đủ chỗ (viewport thấp, zoom lớn). */
  readonly menuAbove = signal(true);

  readonly menuId = computed(() => `row-menu-${this.item().id}`);

  private triggerElement: HTMLElement | null = null;
  private readonly pendingFocus = { edge: null as 'first' | 'last' | null };

  @ViewChild('menuTrigger')
  set menuTriggerRef(ref: ElementRef<HTMLElement> | undefined) {
    this.triggerElement = ref?.nativeElement ?? null;
  }

  @ViewChild('rowMenu')
  set rowMenuRef(ref: ElementRef<HTMLElement> | undefined) {
    if (!ref || !this.pendingFocus.edge) return;
    const edge = this.pendingFocus.edge;
    this.pendingFocus.edge = null;
    const items = Array.from(
      ref.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
    );
    const target = edge === 'first' ? items[0] : items[items.length - 1];
    target?.focus();
  }

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
      this.closeMenu(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu(true);
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    if (this.menuOpen() && this.triggerElement) this.updatePlacement(this.triggerElement);
  }

  onActivate(): void {
    if (this.menuOpen()) {
      this.closeMenu(false);
      return;
    }
    this.openNotification.emit(this.item());
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuOpen()) {
      this.closeMenu(false);
      return;
    }

    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;
    this.updatePlacement(trigger);
    this.menuOpen.set(true);
  }

  /** ArrowDown/ArrowUp trên nút 3 chấm mở menu và đưa focus vào mục đầu/cuối. */
  onMenuTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const trigger = event.currentTarget;
    if (trigger instanceof HTMLElement) this.updatePlacement(trigger);
    this.pendingFocus.edge = event.key === 'ArrowDown' ? 'first' : 'last';
    this.menuOpen.set(true);
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const container = event.currentTarget;
    if (!(container instanceof HTMLElement)) return;

    if (event.key === 'Tab') {
      this.closeMenu(false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu(true);
      return;
    }
    moveMenuFocus(event, container);
  }

  onRemove(event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu(false);
    this.removeNotification.emit(this.item());
  }

  onToggleMute(event: MouseEvent): void {
    event.stopPropagation();
    if (this.muteLocked()) return;
    this.closeMenu(false);
    this.toggleMute.emit(this.item());
  }

  private closeMenu(restoreFocus: boolean): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    if (restoreFocus) this.triggerElement?.focus();
  }

  private updatePlacement(trigger: HTMLElement): void {
    this.menuAbove.set(preferMenuAbove(trigger, MENU_ESTIMATED_HEIGHT));
  }
}
