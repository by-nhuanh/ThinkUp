import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'search'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'arrow-right'
  | 'send'
  | 'paperclip'
  | 'upload'
  | 'x'
  | 'plus'
  | 'minus'
  | 'check'
  | 'circle-check'
  | 'layout-grid'
  | 'user'
  | 'credit-card'
  | 'book-open'
  | 'award'
  | 'wrench'
  | 'file-text'
  | 'circle-help'
  | 'life-buoy'
  | 'headphones'
  | 'mail'
  | 'phone'
  | 'clock'
  | 'facebook'
  | 'graduation-cap'
  | 'users'
  | 'sparkles'
  | 'shield-check'
  | 'monitor'
  | 'message-circle'
  | 'trending-up'
  | 'star'
  | 'heart'
  | 'bookmark'
  | 'shopping-cart'
  | 'flame'
  | 'play'
  | 'lock'
  | 'target'
  | 'zap'
  | 'briefcase'
  | 'map-pin'
  | 'settings'
  | 'code';

/**
 * Icon set dùng chung (hình Lucide 24x24, stroke 2 như file Figma).
 * Kích thước đặt qua class của host: <app-icon name="search" class="h-4 w-4" />
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly strokeWidth = input(2);
}
