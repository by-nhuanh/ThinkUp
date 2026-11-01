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

  private readonly utilityPositionStorageKey = 'thinkup_admin_utility_right';
  private dragPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartRight = 24;
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  readonly collapsed = signal(false);
  readonly accountOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly utilityDragging = signal(false);
  readonly utilityRight = signal(this.readUtilityPosition());
  readonly businessOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/business/'));
  readonly supportOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/support/'));
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

  beginUtilityDrag(event: PointerEvent): void {
    if (event.button !== 0) return;

    const handle = event.currentTarget as HTMLButtonElement;
    this.dragPointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartRight = this.utilityRight();
    this.utilityDragging.set(true);
    this.accountOpen.set(false);
    this.notificationsOpen.set(false);
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  moveUtilityDrag(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointerId) return;

    this.utilityRight.set(this.clampUtilityRight(this.dragStartRight - (event.clientX - this.dragStartX)));
  }

  endUtilityDrag(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointerId) return;

    const handle = event.currentTarget as HTMLButtonElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    this.dragPointerId = null;
    this.utilityDragging.set(false);
    this.persistUtilityPosition();
  }

  moveUtilityByKeyboard(event: KeyboardEvent): void {
    const step = event.shiftKey ? 80 : 24;
    let nextPosition: number | null = null;

    if (event.key === 'ArrowLeft') nextPosition = this.utilityRight() + step;
    if (event.key === 'ArrowRight') nextPosition = this.utilityRight() - step;
    if (event.key === 'Home') nextPosition = this.maximumUtilityRight();
    if (event.key === 'End') nextPosition = 16;
    if (nextPosition === null) return;

    event.preventDefault();
    this.utilityRight.set(this.clampUtilityRight(nextPosition));
    this.persistUtilityPosition();
  }

  @HostListener('window:resize')
  keepUtilityInViewport(): void {
    this.utilityRight.set(this.clampUtilityRight(this.utilityRight()));
  }

  toggleBusiness(): void {
    if (this.collapsed()) this.collapsed.set(false);
    this.businessOpen.update(value => !value);
  }

  toggleSupport(): void {
    if (this.collapsed()) this.collapsed.set(false);
    this.supportOpen.update(value => !value);
  }

  logout(): void {
    this.auth.logout();
    this.accountOpen.set(false);
    this.router.navigate(['/login']);
  }

  private readUtilityPosition(): number {
    if (typeof window === 'undefined') return 24;
    const storedPosition = Number(window.localStorage.getItem(this.utilityPositionStorageKey));
    return Number.isFinite(storedPosition) ? storedPosition : 24;
  }

  private maximumUtilityRight(): number {
    if (typeof window === 'undefined') return 24;
    const barWidth = this.utilityBar?.nativeElement.offsetWidth ?? 380;
    return Math.max(16, window.innerWidth - barWidth - 16);
  }

  private clampUtilityRight(position: number): number {
    return Math.min(this.maximumUtilityRight(), Math.max(16, position));
  }

  private persistUtilityPosition(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.utilityPositionStorageKey, String(this.utilityRight()));
    }
  }
}
