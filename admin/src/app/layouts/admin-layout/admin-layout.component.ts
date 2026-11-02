import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { LucideGripVertical, LucideHeadphones } from '@lucide/angular';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideHeadphones, LucideGripVertical],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css'
})
export class AdminLayoutComponent {
  @ViewChild('utilityBar') private utilityBar?: ElementRef<HTMLElement>;

  private readonly toolbarDockStorageKey = 'thinkup_admin_toolbar_dock';
  private readonly toolbarOffsetStorageKey = 'thinkup_admin_toolbar_offset';
  private dragPointerId: number | null = null;
  private dragDelta = { x: 0, y: 0 };
  private dragSize = { width: 0, height: 0 };
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  readonly collapsed = signal(false);
  readonly accountOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly toolbarDock = signal<ToolbarDock>(this.restoreToolbarDock());
  readonly toolbarOffset = signal(this.restoreToolbarOffset());
  readonly toolbarDragging = signal(false);
  readonly toolbarDragPosition = signal({ x: 0, y: 0 });
  readonly businessOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/business/'));
  readonly supportOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/support/'));
  readonly usersOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/users/'));
  readonly usersActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/users/'))
    ),
    { initialValue: typeof window !== 'undefined' && window.location.pathname.startsWith('/users/') }
  );
  readonly businessActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/business/'))
    ),
    { initialValue: typeof window !== 'undefined' && window.location.pathname.startsWith('/business/') }
  );
  readonly nav = [
    { label: 'Quản lý người dùng', icon: '0-svg1.svg' },
    { label: 'Quản lý khóa học', icon: '0-svg2.svg' },
    { label: 'Quản lý nội dung', icon: '0-svg3.svg' },
    { label: 'Quản lý hỗ trợ', icon: '0-svg4.svg' },
    { label: 'Quản trị hệ thống', icon: '0-settings-gear.svg' }
  ];
  readonly businessPages = [
    { label: 'Đơn hàng', path: '/business/orders' },
    { label: 'Voucher', path: '/business/vouchers' },
    { label: 'Chi trả giảng viên', path: '/business/payouts' }
  ];
  readonly supportPages = [
    { label: 'Ticket hỗ trợ', path: '/support/tickets' },
    { label: 'Khiếu nại & Sự cố', path: '/support/complaints' },
    { label: 'FAQ', path: '/support/faq' }
  ];
  readonly usersPages = [
    { label: 'Giảng viên', path: '/users/lecturers' },
    { label: 'Học viên', path: '/users/students' }
  ];

  startToolbarDrag(event: PointerEvent): void {
    if (event.button !== 0) return;

    const handle = event.currentTarget as HTMLButtonElement;
    const toolbar = this.utilityBar?.nativeElement;
    if (!toolbar) return;

    const bounds = toolbar.getBoundingClientRect();
    this.dragSize = { width: bounds.width, height: bounds.height };
    this.dragPointerId = event.pointerId;
    this.dragDelta = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    this.toolbarDragPosition.set({ x: bounds.left, y: bounds.top });
    this.toolbarDragging.set(true);
    this.accountOpen.set(false);
    this.notificationsOpen.set(false);
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  @HostListener('window:pointermove', ['$event'])
  moveToolbar(event: PointerEvent): void {
    if (!this.toolbarDragging() || event.pointerId !== this.dragPointerId) return;

    this.toolbarDragPosition.set({
      x: this.clamp(event.clientX - this.dragDelta.x, 8, window.innerWidth - this.dragSize.width - 8),
      y: this.clamp(event.clientY - this.dragDelta.y, 8, window.innerHeight - this.dragSize.height - 8)
    });
  }

  @HostListener('window:pointerup', ['$event'])
  @HostListener('window:pointercancel', ['$event'])
  endToolbarDrag(event: PointerEvent): void {
    if (!this.toolbarDragging() || event.pointerId !== this.dragPointerId) return;

    const position = this.toolbarDragPosition();
    const distances: Record<ToolbarDock, number> = {
      top: position.y,
      right: window.innerWidth - position.x - this.dragSize.width,
      bottom: window.innerHeight - position.y - this.dragSize.height,
      left: position.x
    };
    const dock = (Object.keys(distances) as ToolbarDock[])
      .reduce((nearest, edge) => distances[edge] < distances[nearest] ? edge : nearest);
    const offset = dock === 'top' || dock === 'bottom' ? position.x : position.y;

    this.toolbarDock.set(dock);
    this.toolbarOffset.set(this.clampToolbarOffset(dock, offset));
    this.dragPointerId = null;
    this.toolbarDragging.set(false);
    this.persistToolbarPosition();
  }

  moveToolbarByKeyboard(event: KeyboardEvent): void {
    const requestedDock = event.altKey ? this.dockFromArrowKey(event.key) : null;
    if (requestedDock) {
      event.preventDefault();
      this.toolbarDock.set(requestedDock);
      this.toolbarOffset.set(this.clampToolbarOffset(requestedDock, this.toolbarOffset()));
      this.persistToolbarPosition();
      return;
    }

    const dock = this.toolbarDock();
    const horizontal = dock === 'top' || dock === 'bottom';
    const step = event.shiftKey ? 80 : 24;
    let nextOffset: number | null = null;
    if (horizontal && event.key === 'ArrowLeft') nextOffset = this.toolbarOffset() - step;
    if (horizontal && event.key === 'ArrowRight') nextOffset = this.toolbarOffset() + step;
    if (!horizontal && event.key === 'ArrowUp') nextOffset = this.toolbarOffset() - step;
    if (!horizontal && event.key === 'ArrowDown') nextOffset = this.toolbarOffset() + step;
    if (event.key === 'Home') nextOffset = 16;
    if (event.key === 'End') nextOffset = this.maximumToolbarOffset(dock);
    if (nextOffset === null) return;

    event.preventDefault();
    this.toolbarOffset.set(this.clampToolbarOffset(dock, nextOffset));
    this.persistToolbarPosition();
  }

  @HostListener('window:resize')
  keepToolbarInViewport(): void {
    this.toolbarOffset.set(this.clampToolbarOffset(this.toolbarDock(), this.toolbarOffset()));
  }

  toolbarStyle(): Record<string, string> {
    if (this.toolbarDragging()) {
      const position = this.toolbarDragPosition();
      return { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' };
    }

    const offset = `${this.clampToolbarOffset(this.toolbarDock(), this.toolbarOffset())}px`;
    switch (this.toolbarDock()) {
      case 'top': return { left: offset, top: '16px', right: 'auto', bottom: 'auto' };
      case 'bottom': return { left: offset, bottom: '16px', right: 'auto', top: 'auto' };
      case 'left': return { left: '16px', top: offset, right: 'auto', bottom: 'auto' };
      case 'right': return { right: '24px', top: offset, left: 'auto', bottom: 'auto' };
    }
  }

  toggleBusiness(): void {
    if (this.collapsed()) this.collapsed.set(false);
    this.businessOpen.update(value => !value);
  }

  toggleSupport(): void {
    if (this.collapsed()) this.collapsed.set(false);
    this.supportOpen.update(value => !value);
  }

  toggleUsers(): void {
    if (this.collapsed()) this.collapsed.set(false);
    this.usersOpen.update(value => !value);
  }

  logout(): void {
    this.auth.logout();
    this.accountOpen.set(false);
    this.router.navigate(['/login']);
  }

  private restoreToolbarDock(): ToolbarDock {
    if (typeof window === 'undefined') return 'right';
    const value = window.localStorage.getItem(this.toolbarDockStorageKey);
    return value === 'top' || value === 'right' || value === 'bottom' || value === 'left' ? value : 'right';
  }

  private restoreToolbarOffset(): number {
    if (typeof window === 'undefined') return 16;
    const value = Number(window.localStorage.getItem(this.toolbarOffsetStorageKey));
    return Number.isFinite(value) && value >= 0 ? value : 16;
  }

  private maximumToolbarOffset(dock: ToolbarDock): number {
    if (typeof window === 'undefined') return 16;
    const toolbar = this.utilityBar?.nativeElement;
    const toolbarSize = dock === 'top' || dock === 'bottom'
      ? toolbar?.offsetWidth ?? 196
      : toolbar?.offsetHeight ?? 224;
    const viewportSize = dock === 'top' || dock === 'bottom' ? window.innerWidth : window.innerHeight;
    return Math.max(16, viewportSize - toolbarSize - 16);
  }

  private clampToolbarOffset(dock: ToolbarDock, offset: number): number {
    return this.clamp(offset, 16, this.maximumToolbarOffset(dock));
  }

  private persistToolbarPosition(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.toolbarDockStorageKey, this.toolbarDock());
      window.localStorage.setItem(this.toolbarOffsetStorageKey, String(this.toolbarOffset()));
    }
  }

  private dockFromArrowKey(key: string): ToolbarDock | null {
    if (key === 'ArrowUp') return 'top';
    if (key === 'ArrowRight') return 'right';
    if (key === 'ArrowDown') return 'bottom';
    if (key === 'ArrowLeft') return 'left';
    return null;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(minimum, maximum), Math.max(minimum, value));
  }
}

type ToolbarDock = 'top' | 'right' | 'bottom' | 'left';
