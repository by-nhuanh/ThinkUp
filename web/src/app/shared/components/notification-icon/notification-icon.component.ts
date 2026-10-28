import { Component, computed, input } from '@angular/core';
import { NotificationKind } from '../../../core/models/notification.model';
import { NOTIFICATION_ICON_NODES, NotificationIconNode } from './notification-icon-data';

/**
 * Icon tròn theo loại thông báo (Figma: icon 52px trong danh sách, 40px trong popover).
 * Dùng chung cho popover trên header và trang Trung tâm thông báo.
 *
 * Vẽ SVG trực tiếp từ dữ liệu icon thay vì import `@lucide/angular`: popover nằm trong bundle
 * đầu tiên nên mọi import lucide ở đây sẽ kéo toàn bộ thư viện icon vào bundle đó.
 */
@Component({
  selector: 'app-notification-icon',
  standalone: true,
  templateUrl: './notification-icon.component.html',
  styleUrl: './notification-icon.component.css',
})
export class NotificationIconComponent {
  readonly kind = input.required<NotificationKind>();
  readonly size = input(24);
  readonly strokeWidth = input(2);

  readonly nodes = computed<readonly NotificationIconNode[]>(() => NOTIFICATION_ICON_NODES[this.kind()]);
}
