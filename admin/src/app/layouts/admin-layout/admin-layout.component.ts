import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css'
})
export class AdminLayoutComponent {
  readonly collapsed = signal(false);
  readonly accountOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly businessOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/business/'));
  readonly nav = [
    { label: 'Quản lý người dùng', icon: '0-svg1.svg' },
    { label: 'Quản lý khóa học', icon: '0-svg2.svg' },
    { label: 'Quản lý nội dung', icon: '0-svg3.svg' },
    { label: 'Quản lý hỗ trợ', icon: '0-svg4.svg' },
    { label: 'Quản trị hệ thống', icon: '0-svg5.svg' }
  ];
  readonly businessPages = [
    { label: 'Đơn hàng', path: '/business/orders' },
    { label: 'Voucher', path: '/business/vouchers' },
    { label: 'Rút tiền giảng viên', path: '/business/payouts' }
  ];

  toggleBusiness(): void {
    if (this.collapsed()) this.collapsed.set(false);
    this.businessOpen.update(value => !value);
  }
}
