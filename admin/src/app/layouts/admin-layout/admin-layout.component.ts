import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css'
})
export class AdminLayoutComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  readonly collapsed = signal(false);
  readonly accountOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly businessOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/business/'));
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

  toggleBusiness(): void {
    if (this.collapsed()) this.collapsed.set(false);
    this.businessOpen.update(value => !value);
  }

  logout(): void {
    this.auth.logout();
    this.accountOpen.set(false);
    this.router.navigate(['/login']);
  }
}
