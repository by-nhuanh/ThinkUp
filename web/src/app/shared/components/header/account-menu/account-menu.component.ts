import { Component, computed, inject, signal, Input, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';

export interface MenuItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  dividerBefore?: boolean;
}

@Component({
  selector: 'app-account-menu',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.css'
})
export class AccountMenuComponent {
  private router = inject(Router);
  private el = inject(ElementRef);
  private authService = inject(AuthService);
  private notifications = inject(NotificationService);

  @Input() displayName = 'Học viên';
  @Input() email = '';
  @Input() avatarUrl = '';
  @Input() roleLabel = 'Học viên';

  readonly isOpen = signal(false);

  readonly menuItems = computed<MenuItem[]>(() => {
    const unread = this.notifications.unreadCount();
    return [
      { label: 'Khóa học yêu thích', href: '/main/favorites', icon: 'heart' },
      { label: 'Khóa học của tôi', href: '/main/my-courses', icon: 'book' },
      // TODO(pre-deploy): Flashcard chưa có route riêng, tạm trỏ về danh sách khóa học.
      { label: 'Flashcard', href: '/main/courses', icon: 'cards' },
      { label: 'Quản lý bài viết', href: '/main/blog', icon: 'newspaper' },
      { label: 'Lịch sử thanh toán', href: '/main/profile/billing', icon: 'credit-card' },
      { label: 'Chứng chỉ', href: '/main/certificates', icon: 'badge' },
      {
        label: 'Thông báo',
        href: '/main/notifications',
        icon: 'bell',
        badge: unread > 0 ? unread : undefined,
        dividerBefore: true,
      },
      { label: 'Cài đặt', href: '/main/profile/edit', icon: 'settings' },
      { label: 'Hồ sơ học viên', href: '/main/profile', icon: 'user', dividerBefore: true },
      { label: 'Liên hệ hỗ trợ', href: '/main/contact', icon: 'lifebuoy' },
      { label: 'Trung tâm trợ giúp', href: '/main/help-center', icon: 'help' },
    ];
  });

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  onLogout(): void {
    this.closeMenu();
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/auth/login']),
      error: () => this.router.navigate(['/auth/login'])
    });
  }
}
