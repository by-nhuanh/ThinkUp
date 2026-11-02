import {
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

export interface UserRowMenuItem {
  key: string;
  label: string;
  danger?: boolean;
}

const MENU_WIDTH = 260;
const MENU_ITEM_HEIGHT = 38;
const MENU_GAP = 2;
const MENU_PADDING = 16;
const VIEWPORT_MARGIN = 12;
const TRIGGER_GAP = 6;

/**
 * Menu thao tác theo dòng của bảng.
 *
 * Menu dùng `position: fixed` và tự đo lại vị trí trigger khi trang hoặc vùng bảng cuộn,
 * nên không bị cắt bởi `.table-wrap` và vẫn bám đúng dòng khi kéo ngang.
 * Hỗ trợ bàn phím: ArrowUp/Down/Home/End di chuyển, Escape đóng và trả focus về trigger.
 */
@Component({
  selector: 'app-user-row-menu',
  standalone: true,
  templateUrl: './user-row-menu.component.html',
  styleUrl: './user-row-menu.component.css'
})
export class UserRowMenuComponent implements OnDestroy {
  private static sequence = 0;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly triggerRef = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menuRef = viewChild<ElementRef<HTMLElement>>('menu');

  readonly items = input.required<readonly UserRowMenuItem[]>();
  readonly label = input('Thao tác');
  readonly action = output<string>();

  readonly menuId = `user-row-menu-${(UserRowMenuComponent.sequence += 1)}`;
  readonly open = signal(false);
  readonly position = signal<{ left: number; top: number } | null>(null);

  private readonly outsideHandler = (event: PointerEvent) => {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  };

  private readonly repositionHandler = () => this.reposition();

  toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    // Đặt open trước để reposition không bị chặn và menu có toạ độ ngay lần render đầu.
    this.open.set(true);
    this.reposition();
    this.document.addEventListener('pointerdown', this.outsideHandler, true);
    this.document.defaultView?.addEventListener('resize', this.repositionHandler);
    this.document.addEventListener('scroll', this.repositionHandler, true);
    // Chờ menu vào DOM rồi mới focus, nếu không danh sách nút còn rỗng.
    afterNextRender(
      () => {
        if (this.open()) this.focusItem(0);
      },
      { injector: this.injector }
    );
  }

  close(restoreFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    this.position.set(null);
    this.removeListeners();
    if (restoreFocus) this.triggerRef().nativeElement.focus();
  }

  select(item: UserRowMenuItem): void {
    this.close(true);
    this.action.emit(item.key);
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open()) this.toggle();
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const buttons = this.menuButtons();
    if (!buttons.length) return;
    const current = buttons.indexOf(this.document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        buttons[(current + 1) % buttons.length].focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        buttons[(current - 1 + buttons.length) % buttons.length].focus();
        break;
      case 'Home':
        event.preventDefault();
        buttons[0].focus();
        break;
      case 'End':
        event.preventDefault();
        buttons[buttons.length - 1].focus();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  ngOnDestroy(): void {
    this.removeListeners();
  }

  private reposition(): void {
    if (!this.open()) return;
    const view = this.document.defaultView;
    if (!view) return;

    const rect = this.triggerRef().nativeElement.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > view.innerHeight) {
      this.close();
      return;
    }

    const count = this.items().length;
    const height = count * MENU_ITEM_HEIGHT + Math.max(0, count - 1) * MENU_GAP + MENU_PADDING;
    const width = Math.min(MENU_WIDTH, view.innerWidth - VIEWPORT_MARGIN * 2);
    const left = Math.min(
      Math.max(rect.right - width, VIEWPORT_MARGIN),
      view.innerWidth - width - VIEWPORT_MARGIN
    );
    const below = rect.bottom + TRIGGER_GAP;
    const top = below + height <= view.innerHeight - VIEWPORT_MARGIN
      ? below
      : Math.max(VIEWPORT_MARGIN, rect.top - TRIGGER_GAP - height);

    this.position.set({ left, top });
  }

  private focusItem(index: number): void {
    this.menuButtons()[index]?.focus();
  }

  private menuButtons(): HTMLButtonElement[] {
    const menu = this.menuRef()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')) : [];
  }

  private removeListeners(): void {
    this.document.removeEventListener('pointerdown', this.outsideHandler, true);
    this.document.defaultView?.removeEventListener('resize', this.repositionHandler);
    this.document.removeEventListener('scroll', this.repositionHandler, true);
  }
}
