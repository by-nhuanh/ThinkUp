import { Component, computed, effect, inject, input, signal, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommerceService } from '../../../core/services/commerce.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AccountMenuComponent } from './account-menu/account-menu.component';
import { NotificationPopoverComponent } from './notification-popover/notification-popover.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, AccountMenuComponent, NotificationPopoverComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  host: { '[class.liquid-glass]': "appearance() === 'liquid-glass'" },
})
export class HeaderComponent implements OnInit {
  readonly audience = input<'guest' | 'member'>('guest');
  readonly appearance = input<'standard' | 'liquid-glass'>('standard');
  private commerceService = inject(CommerceService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private notifications = inject(NotificationService);

  readonly cartCount = this.commerceService.cartCount;
  isMobileMenuOpen = signal(false);

  isLoggedIn = computed(() => this.audience() === 'member' && this.authService.isAuthenticated());
  userName = computed(() => this.authService.currentUser()?.full_name || 'Học viên');
  userEmail = computed(() => this.authService.currentUser()?.email || '');
  userAvatar = computed(() => this.authService.currentUser()?.avatar || '');
  userRole = computed(() => this.authService.currentUser()?.role === 'instructor' ? 'Giảng viên' : 'Học viên');

  readonly navItems = [
    { label: 'Trang chủ', href: '/main/home' },
    { label: 'Khóa học', href: '/main/courses' },
    { label: 'Phòng học ảo', href: '/learning/study-room' },
    { label: 'Roadmap', href: '/learning/roadmap' },
    { label: 'Bài viết', href: '/main/blog' },
    { label: 'Liên hệ', href: '/main/contact' },
  ];

  constructor() {
    effect(() => this.notifications.setUser(this.isLoggedIn() ? this.authService.currentUser()?.id ?? null : null));
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.authService.validateSession().subscribe({ error: () => { /* Giữ phiên để thử lại nếu mạng tạm mất. */ } });
    }
  }

  @HostListener('window:storage')
  onStorage(): void {
    this.authService.syncFromStorage();
    this.notifications.syncFromStorage();
  }

  logout(): void {
    this.isMobileMenuOpen.set(false);
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/main']),
      error: () => this.router.navigate(['/main'])
    });
  }
}
