import { Component, ElementRef, HostListener, Injector, ViewChild, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { LucideGripVertical, LucideHeadphones } from '@lucide/angular';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminNotificationsService } from '../../core/services/admin-notifications.service';
import { AdminPreferencesService } from '../../core/services/admin-preferences.service';
import { AdminDisplayPreferencesService } from '../../core/services/admin-display-preferences.service';
import { AdminNotificationSoundService } from '../../core/services/admin-notification-sound.service';
import { AdminShortcutsService } from '../../core/services/admin-shortcuts.service';
import { roleLabel } from '../../core/services/admin-profile.presenter';
import { AdminProfileDialogComponent } from './components/admin-profile-dialog/admin-profile-dialog.component';
import { AdminSettingsDialogComponent } from './components/admin-settings-dialog/admin-settings-dialog.component';
import { AdminNotificationsPanelComponent } from './components/admin-notifications-panel/admin-notifications-panel.component';
import { AdminStatusBarComponent } from './components/admin-status-bar/admin-status-bar.component';

interface Breadcrumb {
  label: string;
  path?: string;
}

const BREADCRUMB_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/users/lecturers': 'Giảng viên',
  '/users/students': 'Học viên',
  '/business/orders': 'Đơn hàng',
  '/business/vouchers': 'Voucher',
  '/business/payouts': 'Chi trả giảng viên',
  '/courses': 'Tất cả khóa học',
  '/courses/approvals': 'Hàng đợi phê duyệt',
  '/courses/roadmaps': 'Quản lý lộ trình học tập',
  '/content/posts': 'Bài viết',
  '/content/posts/new': 'Viết bài mới',
  '/content/comments': 'Bình luận',
  '/content/reviews': 'Đánh giá khóa học',
  '/content/reports': 'Báo cáo vi phạm',
  '/support/tickets': 'Ticket hỗ trợ',
  '/support/complaints': 'Khiếu nại & Sự cố',
  '/support/faq': 'FAQ',
  '/system/security': 'Phân quyền & Bảo mật',
  '/system/audit': 'Nhật ký Kiểm toán',
  '/system/settings': 'Cấu hình Hệ thống',
  '/auth/change-password': 'Đổi mật khẩu',
  '/auth/setup-2fa': 'Thiết lập xác thực hai lớp',
  '/auth/backup-codes': 'Mã dự phòng',
  '/auth/password-expiring': 'Mật khẩu sắp hết hạn',
  '/auth/password-expired': 'Mật khẩu đã hết hạn'
};

const SECTION_TITLES: Record<string, string> = {
  users: 'Quản lý người dùng',
  business: 'Quản lý kinh doanh',
  courses: 'Quản lý khóa học',
  content: 'Quản lý nội dung',
  support: 'Quản lý hỗ trợ',
  system: 'Quản trị hệ thống',
  auth: 'Bảo mật tài khoản'
};

function buildBreadcrumbs(url: string): Breadcrumb[] {
  const path = url.split('?')[0].split('#')[0] || '/';
  const title = BREADCRUMB_TITLES[path];
  if (title) {
    if (path === '/') return [{ label: title }];
    const [section] = path.split('/').filter(Boolean);
    const parent = SECTION_TITLES[section];
    return parent ? [{ label: parent }, { label: title }] : [{ label: title }];
  }
  const segments = path.split('/').filter(Boolean);
  if (!segments.length) return [{ label: 'Dashboard' }];
  const crumbs: Breadcrumb[] = [{ label: 'Dashboard', path: '/' }];
  const section = SECTION_TITLES[segments[0]];
  if (section) crumbs.push({ label: section, path: `/${segments[0]}` });
  // Route con chưa có tiêu đề tĩnh (ví dụ trang chi tiết) thì dùng id đã giải mã.
  crumbs.push({ label: decodeURIComponent(segments[segments.length - 1]) });
  return crumbs;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideHeadphones,
    LucideGripVertical,
    AdminProfileDialogComponent,
    AdminSettingsDialogComponent,
    AdminNotificationsPanelComponent,
    AdminStatusBarComponent
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css'
})
export class AdminLayoutComponent {
  @ViewChild('utilityBar') private utilityBar?: ElementRef<HTMLElement>;
  @ViewChild('accountButton') private accountButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('accountPopover') private accountPopover?: ElementRef<HTMLElement>;
  @ViewChild('settingsButton') private settingsButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('bellButton') private bellButton?: ElementRef<HTMLButtonElement>;

  private readonly toolbarDockStorageKey = 'thinkup_admin_toolbar_dock';
  private readonly toolbarOffsetStorageKey = 'thinkup_admin_toolbar_offset';
  private dragPointerId: number | null = null;
  private dragDelta = { x: 0, y: 0 };
  private dragSize = { width: 0, height: 0 };
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly preferences = inject(AdminPreferencesService);
  private readonly displayPreferences = inject(AdminDisplayPreferencesService);
  private readonly notifications = inject(AdminNotificationsService);
  private readonly notificationSound = inject(AdminNotificationSoundService);
  private readonly shortcuts = inject(AdminShortcutsService);
  private readonly injector = inject(Injector);
  private lastUnread: number | null = null;

  readonly user = this.auth.currentUser;
  readonly roleLabel = roleLabel;
  readonly appliedPreferences = this.preferences.applied;
  readonly displayPrivacy = this.displayPreferences.privacyMode;
  readonly unreadNotifications = this.notifications.unread;
  readonly notificationBadge = this.notifications.badgeText;
  readonly collapsed = signal(false);
  readonly accountOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly profileOpen = signal(false);
  readonly profileLoading = signal(false);
  readonly profileError = signal<string | null>(null);
  readonly accountPopoverStyle = signal<Record<string, string> | null>(null);
  readonly toolbarDock = signal<ToolbarDock>(this.restoreToolbarDock());
  readonly toolbarOffset = signal(this.restoreToolbarOffset());
  readonly toolbarDragging = signal(false);
  readonly toolbarDragPosition = signal({ x: 0, y: 0 });
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );
  readonly breadcrumbs = computed(() => buildBreadcrumbs(this.currentUrl()));
  readonly businessOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/business/'));
  readonly coursesOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/courses'));
  readonly contentOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/content/'));
  readonly supportOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/support/'));
  readonly usersOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/users/'));
  readonly systemOpen = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/system/'));
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
  readonly contentActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/content/'))
    ),
    { initialValue: typeof window !== 'undefined' && window.location.pathname.startsWith('/content/') }
  );
  readonly coursesActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/courses'))
    ),
    { initialValue: typeof window !== 'undefined' && window.location.pathname.startsWith('/courses') }
  );
  readonly systemActive = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/system/'))
    ),
    { initialValue: typeof window !== 'undefined' && window.location.pathname.startsWith('/system/') }
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
  readonly coursesPages = [
    { label: 'Tất cả khóa học', path: '/courses' },
    { label: 'Hàng đợi phê duyệt', path: '/courses/approvals' },
    { label: 'Lộ trình học tập', path: '/courses/roadmaps' }
  ];
  readonly contentPages = [
    { label: 'Bài viết', path: '/content/posts' },
    { label: 'Bình luận', path: '/content/comments' },
    { label: 'Đánh giá khóa học', path: '/content/reviews' },
    { label: 'Báo cáo vi phạm', path: '/content/reports' }
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
  readonly systemPages = [
    { label: 'Phân quyền & Bảo mật', path: '/system/security' },
    { label: 'Nhật ký Kiểm toán', path: '/system/audit' },
    { label: 'Cấu hình Hệ thống', path: '/system/settings' }
  ];

  constructor() {
    // Nạp tuỳ chọn của admin đang đăng nhập; lỗi được service ghi nhận, layout giữ mặc định.
    this.preferences.load().subscribe({ error: () => undefined });
    // Badge phải có số thật ngay khi vào layout, không chờ mở panel.
    this.notifications.refresh(true, false);
    // P8 — chime chỉ khi unread tăng sau lần đồng bộ đầu; bỏ qua thông báo bảo mật.
    effect(() => {
      const unread = this.notifications.unread();
      if (!this.notifications.initialized()) return;
      if (this.lastUnread === null) {
        this.lastUnread = unread;
        return;
      }
      if (unread > this.lastUnread) {
        const newest = this.notifications.items()[0];
        if (newest?.type !== 'security') this.notificationSound.play();
      }
      this.lastUnread = unread;
    });
  }

  toggleNotifications(): void {
    if (this.notificationsOpen()) {
      this.closeNotifications();
      return;
    }
    this.closeAccountMenu(false);
    this.notificationsOpen.set(true);
    this.notifications.openPanel();
  }

  closeNotifications(returnFocus = true): void {
    if (!this.notificationsOpen()) return;
    this.notificationsOpen.set(false);
    if (returnFocus) setTimeout(() => this.bellButton?.nativeElement.focus());
  }

  openSettings(): void {
    this.closeAccountMenu(false);
    this.notificationsOpen.set(false);
    this.preferences.beginEditing();
    this.settingsOpen.set(true);
    // Làm mới nền; linkedSignal trong hộp thoại sẽ đồng bộ khi dữ liệu về.
    this.preferences.load(true).subscribe({ error: () => undefined });
  }

  closeSettings(): void {
    this.settingsOpen.set(false);
    // Huỷ hộp thoại có thể đổi lại breadcrumb/thanh trạng thái và dựng lại thanh công cụ,
    // nên trả focus sau khi render xong để không bám vào nút đã bị thay thế.
    afterNextRender(() => {
      if (this.settingsButton?.nativeElement.isConnected) this.settingsButton.nativeElement.focus();
    }, { injector: this.injector });
  }

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
    if (this.accountOpen()) this.positionAccountPopover();
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
    const open = !this.businessOpen();
    this.businessOpen.set(open);
    if (open) { this.usersOpen.set(false); this.coursesOpen.set(false); this.contentOpen.set(false); this.supportOpen.set(false); this.systemOpen.set(false); }
  }

  toggleCourses(): void {
    if (this.collapsed()) this.collapsed.set(false);
    const open = !this.coursesOpen();
    this.coursesOpen.set(open);
    if (open) { this.usersOpen.set(false); this.businessOpen.set(false); this.contentOpen.set(false); this.supportOpen.set(false); this.systemOpen.set(false); }
  }

  toggleSupport(): void {
    if (this.collapsed()) this.collapsed.set(false);
    const open = !this.supportOpen();
    this.supportOpen.set(open);
    if (open) { this.usersOpen.set(false); this.businessOpen.set(false); this.coursesOpen.set(false); this.contentOpen.set(false); this.systemOpen.set(false); }
  }

  toggleContent(): void {
    if (this.collapsed()) this.collapsed.set(false);
    const open = !this.contentOpen();
    this.contentOpen.set(open);
    if (open) { this.usersOpen.set(false); this.businessOpen.set(false); this.coursesOpen.set(false); this.supportOpen.set(false); this.systemOpen.set(false); }
  }

  navigatePage(): void {
    this.usersOpen.set(false);
    this.businessOpen.set(false);
    this.coursesOpen.set(false);
    this.contentOpen.set(false);
    this.supportOpen.set(false);
    this.systemOpen.set(false);
  }

  toggleUsers(): void {
    if (this.collapsed()) this.collapsed.set(false);
    const open = !this.usersOpen();
    this.usersOpen.set(open);
    if (open) { this.businessOpen.set(false); this.coursesOpen.set(false); this.contentOpen.set(false); this.supportOpen.set(false); this.systemOpen.set(false); }
  }

  toggleSystem(): void {
    if (this.collapsed()) this.collapsed.set(false);
    const open = !this.systemOpen();
    this.systemOpen.set(open);
    if (open) { this.usersOpen.set(false); this.businessOpen.set(false); this.coursesOpen.set(false); this.contentOpen.set(false); this.supportOpen.set(false); }
  }

  toggleAccountMenu(): void {
    if (this.accountOpen()) {
      this.closeAccountMenu(false);
      return;
    }

    this.notificationsOpen.set(false);
    this.accountOpen.set(true);
    // Chạy sau khi popover đã render để focus và đo vị trí không phụ thuộc timing.
    afterNextRender(() => {
      this.focusAccountItem(0);
      this.positionAccountPopover();
    }, { injector: this.injector });
  }

  closeAccountMenu(returnFocus: boolean): void {
    if (!this.accountOpen()) return;
    this.accountOpen.set(false);
    this.accountPopoverStyle.set(null);
    if (returnFocus) {
      setTimeout(() => this.accountButton?.nativeElement.focus());
    }
  }

  onAccountMenuKeydown(event: KeyboardEvent): void {
    const items = this.accountMenuItems();
    if (!items.length) return;

    if (event.key === 'Tab') {
      this.closeAccountMenu(false);
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeAccountMenu(true);
      return;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex].focus();
  }

  /*
   * Một listener duy nhất cho pointerdown: nhiều @HostListener cùng tên sự kiện
   * trên cùng component có thể bị ghi đè, làm mất hành vi đóng menu tài khoản.
   */
  @HostListener('document:pointerdown', ['$event'])
  closePopoversOnOutsidePointer(event: PointerEvent): void {
    // Web Audio chỉ mở được trong một gesture thật.
    this.notificationSound.unlock();
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.accountOpen() && !target.closest('.account-tool, .account-popover')) {
      this.closeAccountMenu(false);
    }
    if (this.notificationsOpen() && !target.closest('.notifications-popover, .top-tool[aria-label="Thông báo"]')) {
      this.closeNotifications(false);
    }
  }

  /** P10 — opt-in global dock shortcuts; no-op while the service is disabled. */
  @HostListener('document:keydown', ['$event'])
  runGlobalShortcut(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
    }
    const action = this.shortcuts.actionFor(event);
    if (!action) return;
    event.preventDefault();
    const dock: ToolbarDock = action.replace('dock-', '') as ToolbarDock;
    this.toolbarDock.set(dock);
    this.toolbarOffset.set(this.clampToolbarOffset(dock, this.toolbarOffset()));
    this.persistToolbarPosition();
  }

  @HostListener('document:keydown.escape')
  closeAccountOnEscape(): void {
    this.closeAccountMenu(true);
    this.closeNotifications(true);
  }

  openProfile(): void {
    this.closeAccountMenu(false);
    this.profileOpen.set(true);
    this.loadProfile();
  }

  retryProfile(): void {
    this.loadProfile();
  }

  closeProfile(): void {
    this.profileOpen.set(false);
    setTimeout(() => this.accountButton?.nativeElement.focus());
  }

  openSecuritySettings(): void {
    this.closeAccountMenu(false);
    void this.router.navigate(['/auth/change-password'], {
      queryParams: { returnUrl: this.router.url }
    });
  }

  signOut(): void {
    this.closeAccountMenu(false);
    this.closeNotifications(false);
    this.notifications.reset();
    this.auth.signOut().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login'])
    });
  }

  private loadProfile(): void {
    if (!this.user()) return;
    this.profileError.set(null);
    this.profileLoading.set(true);
    this.auth.refreshCurrentUser().subscribe({
      next: () => this.profileLoading.set(false),
      error: (error: unknown) => {
        this.profileLoading.set(false);
        this.profileError.set(error instanceof Error && error.message
          ? error.message
          : 'Không thể tải hồ sơ mới. Đang hiển thị dữ liệu phiên hiện tại.');
      }
    });
  }

  private accountMenuItems(): HTMLButtonElement[] {
    const popover = this.accountPopover?.nativeElement;
    if (!popover) return [];
    return Array.from(popover.querySelectorAll<HTMLButtonElement>('[data-account-item]'));
  }

  private focusAccountItem(index: number): void {
    this.accountMenuItems()[index]?.focus();
  }

  /**
   * Đặt popover tài khoản theo viewport thay vì để CSS tràn khỏi màn hình.
   * Vị trí ở viewport đủ lớn giữ nguyên hướng mở hiện tại của từng dock.
   */
  private positionAccountPopover(): void {
    const trigger = this.accountButton?.nativeElement;
    const popover = this.accountPopover?.nativeElement;
    if (!trigger || !popover) return;

    const anchor = trigger.getBoundingClientRect();
    const panel = popover.getBoundingClientRect();
    const anchorBox = popover.parentElement?.getBoundingClientRect();
    if (!anchorBox) return;
    const gap = 10;
    const margin = 12;
    let left = anchor.left;
    let top = anchor.top;

    switch (this.toolbarDock()) {
      case 'left':
        left = anchor.right + gap;
        top = anchor.top;
        break;
      case 'right':
        left = anchor.left - panel.width - gap;
        top = anchor.top;
        break;
      case 'top':
        left = anchor.right - panel.width;
        top = anchor.bottom + gap;
        break;
      case 'bottom':
        left = anchor.right - panel.width;
        top = anchor.top - panel.height - gap;
        break;
    }

    left = this.clamp(left, margin, Math.max(margin, window.innerWidth - panel.width - margin));
    top = this.clamp(top, margin, Math.max(margin, window.innerHeight - panel.height - margin));
    // Popover nằm trong vùng có backdrop-filter nên `fixed` sẽ bị neo vào ancestor;
    // dùng absolute theo anchor và quy đổi từ toạ độ viewport.
    this.accountPopoverStyle.set({
      position: 'absolute',
      left: `${left - anchorBox.left}px`,
      top: `${top - anchorBox.top}px`,
      right: 'auto',
      bottom: 'auto'
    });
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
