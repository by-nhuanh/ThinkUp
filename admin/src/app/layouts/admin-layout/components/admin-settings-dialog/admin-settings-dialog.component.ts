import {
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  output,
  signal,
  viewChild,
  viewChildren
} from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import {
  AdminPreferences,
  DEFAULT_ADMIN_PREFERENCES
} from '../../../../core/models/admin-preferences.model';
import { AdminPreferencesService } from '../../../../core/services/admin-preferences.service';
import { AdminDisplayPreferencesService } from '../../../../core/services/admin-display-preferences.service';
import { AdminNumberFormat } from '../../../../core/models/admin-display-preferences.model';
import {
  AdminNotificationPreferences,
  AdminReportFormat,
  AdminReportFrequency
} from '../../../../core/models/admin-notification-preferences.model';
import { AdminNotificationPreferencesService } from '../../../../core/services/admin-notification-preferences.service';
import { AdminNotificationSoundService } from '../../../../core/services/admin-notification-sound.service';
import { AdminI18nService, AdminLanguage } from '../../../../core/i18n/admin-i18n.service';
import { AdminShortcutsService } from '../../../../core/services/admin-shortcuts.service';
import {
  AdminShortcutAction,
  DEFAULT_SHORTCUTS,
  chordFromEvent
} from '../../../../core/models/admin-shortcut.model';
import { AdminAuthService } from '../../../../core/services/admin-auth.service';
import {
  formatInTimezone,
  listTimezones,
  timezoneOffsetMinutes
} from '../../../../core/services/admin-timezone';

type SettingsTab = 'general' | 'data' | 'system' | 'notifications' | 'shortcuts';

interface SettingsTabDefinition {
  id: SettingsTab;
  label: string;
  hint: string;
  icon: 'monitor' | 'chart' | 'gear' | 'bell' | 'keyboard';
}

interface AppShortcutRow {
  keys: string[];
  label: string;
  description: string;
  status: 'active' | 'unavailable' | 'conflict';
  statusLabel: string;
  icon: 'search' | 'home' | 'queue' | 'close';
}

/**
 * Hộp thoại "Cấu hình không gian làm việc" theo BA PLAN (5 tab, 2 cột).
 *
 * Thay đổi giao diện/mật độ/múi giờ được xem trước ngay trên layout; chỉ ghi
 * khi bấm "Lưu cấu hình". Đóng/Huỷ sẽ trả cả tuỳ chọn máy chủ lẫn tuỳ chọn cục
 * bộ (định dạng số, riêng tư, âm thanh, ngôn ngữ, phím tắt) về snapshot lúc mở.
 *
 * Các phím tắt toàn hệ thống trong tab 5 chỉ hiển thị tổ hợp đang thật sự hoạt
 * động. Ctrl+K/Alt+C chưa có hành động nên ghi "Chưa khả dụng"; Alt+D trùng
 * phím trình duyệt nên ghi "Trùng trình duyệt" — không đăng ký ghost action.
 */
@Component({
  selector: 'app-admin-settings-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './admin-settings-dialog.component.html',
  styleUrl: './admin-settings-dialog.component.css'
})
export class AdminSettingsDialogComponent implements OnDestroy {
  private readonly preferences = inject(AdminPreferencesService);
  private readonly displayPreferences = inject(AdminDisplayPreferencesService);
  private readonly notificationPreferences = inject(AdminNotificationPreferencesService);
  private readonly notificationSound = inject(AdminNotificationSoundService);
  private readonly i18n = inject(AdminI18nService);
  private readonly shortcutsService = inject(AdminShortcutsService);
  private readonly auth = inject(AdminAuthService);
  private readonly confirmResetButton = viewChild<ElementRef<HTMLButtonElement>>('confirmResetButton');
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly injector = inject(Injector);
  private finished = false;

  /** Báo layout đóng hộp thoại (đã xử lý preview/rollback bên trong). */
  readonly dismissed = output<void>();

  /** Theo snapshot đã lưu; đổi do cross-tab/refresh thì bản nháp cũng cập nhật. */
  readonly draft = linkedSignal<AdminPreferences>(() => ({ ...this.preferences.saved() }));
  readonly saving = this.preferences.saving;
  readonly error = this.preferences.error;
  readonly resetConfirming = signal(false);

  readonly display = this.displayPreferences.preferences;
  readonly notifications = this.notificationPreferences.preferences;
  readonly soundEnabled = this.notificationSound.enabled;

  /** P9 — English stays disabled until coverage reaches every admin screen. */
  readonly language = this.i18n.language;
  readonly languages = this.i18n.languages;
  readonly englishReady = this.i18n.englishReady;

  /** P10 — opt-in custom bindings for the dock toolbar. */
  readonly shortcutsEnabled = this.shortcutsService.enabled;
  readonly shortcutRows = this.shortcutsService.rows;
  readonly capturingAction = signal<AdminShortcutAction | null>(null);
  readonly shortcutError = signal<string | null>(null);

  readonly adminEmail = computed(() => this.auth.currentUser()?.email || 'admin@thinkup.edu.vn');

  readonly tabs: SettingsTabDefinition[] = [
    { id: 'general', label: 'Giao diện chung', hint: 'Sidebar, Theme, Mật độ', icon: 'monitor' },
    { id: 'data', label: 'Định dạng dữ liệu', hint: 'Số liệu KPI, Đơn vị tiền tệ', icon: 'chart' },
    { id: 'system', label: 'Tuỳ chọn hệ thống', hint: 'Múi giờ, Ngôn ngữ, Báo cáo', icon: 'gear' },
    { id: 'notifications', label: 'Thông báo & Âm thanh', hint: 'Cảnh báo SLA, Âm thanh', icon: 'bell' },
    { id: 'shortcuts', label: 'Phím tắt thao tác', hint: 'Danh sách Hotkeys', icon: 'keyboard' }
  ];
  readonly activeTab = signal<SettingsTab>('general');

  readonly themeOptions = [
    { value: 'light' as const, label: 'Giao diện Sáng' },
    { value: 'dark' as const, label: 'Giao diện Tối' }
  ];
  readonly densityOptions = [
    { value: 'compact' as const, label: 'Thu gọn', hint: '(Compact)' },
    { value: 'standard' as const, label: 'Tiêu chuẩn', hint: '(Standard)' },
    { value: 'comfortable' as const, label: 'Thoải mái', hint: '(Comfortable)' }
  ];
  readonly numberFormatOptions: { value: AdminNumberFormat; label: string; hint: string }[] = [
    { value: 'full', label: 'Giá trị đầy đủ', hint: 'Ví dụ: 120.540 người / 2.120.000.000 đ' },
    { value: 'compact', label: 'Giá trị rút gọn', hint: 'Ví dụ: 120,5K người / 2,12 tỷ đ' }
  ];
  readonly reportFrequencyOptions: { value: AdminReportFrequency; label: string }[] = [
    { value: 'daily', label: 'Hàng ngày (07:00 sáng)' },
    { value: 'weekly', label: 'Hàng tuần (07:00 sáng Thứ Hai)' },
    { value: 'monthly', label: 'Hàng tháng (07:00 sáng ngày 1)' }
  ];
  readonly reportFormatOptions: { value: AdminReportFormat; label: string }[] = [
    { value: 'xlsx', label: 'Tệp Excel (.xlsx)' },
    { value: 'pdf', label: 'Tệp PDF (.pdf)' }
  ];

  readonly timezones = listTimezones();
  readonly defaultTimezone = DEFAULT_ADMIN_PREFERENCES.timezone;

  /** Phím tắt toàn hệ thống: chỉ mô tả đúng những gì bản này thật sự xử lý. */
  readonly appShortcuts: AppShortcutRow[] = [
    {
      keys: ['Ctrl', 'K'],
      label: 'Mở thanh tìm kiếm toàn sảnh',
      description: 'Tìm kiếm khóa học, học viên, đơn hàng, giảng viên...',
      status: 'unavailable',
      statusLabel: 'Chưa khả dụng',
      icon: 'search'
    },
    {
      keys: ['Alt', 'D'],
      label: 'Quay về Dashboard điều hành',
      description: 'Trở về trang tổng quan quản trị hệ thống.',
      status: 'conflict',
      statusLabel: 'Trùng trình duyệt',
      icon: 'home'
    },
    {
      keys: ['Alt', 'C'],
      label: 'Mở nhanh hàng đợi Duyệt khóa học',
      description: 'Đi đến danh sách khóa học chờ duyệt.',
      status: 'unavailable',
      statusLabel: 'Chưa khả dụng',
      icon: 'queue'
    },
    {
      keys: ['Esc'],
      label: 'Đóng nhanh các Modal đang mở',
      description: 'Đóng cửa sổ, hộp thoại tuỳ chỉnh hiện tại.',
      status: 'active',
      statusLabel: 'Đang hoạt động',
      icon: 'close'
    }
  ];

  private readonly initialDisplay = { ...this.displayPreferences.preferences() };
  private readonly initialNotifications: AdminNotificationPreferences = {
    ...this.notificationPreferences.preferences()
  };
  private readonly initialSound = this.notificationSound.enabled();
  private readonly initialLanguage = this.i18n.language();
  private readonly initialShortcutsEnabled = this.shortcutsService.enabled();
  private readonly initialBindings: Record<AdminShortcutAction, string> = {
    ...this.shortcutsService.bindings()
  };

  readonly serverDirty = computed(() => !samePreferences(this.draft(), this.preferences.saved()));
  readonly localDirty = computed(() => this.localChanged());
  readonly dirty = computed(() => this.serverDirty() || this.localDirty());

  readonly privacyEnabled = computed(() => this.display().privacyMode !== 'off');

  // `dateStyle`/`timeStyle` không được ghép với `timeZoneName`; dùng bộ trường tường minh
  // để vừa có bản xem trước đầy đủ vừa hiển thị được tên offset (GMT+7/GMT-5…).
  readonly timezonePreview = computed(() =>
    formatInTimezone(new Date(), this.draft().timezone, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'shortOffset'
    })
  );
  readonly timezoneOffset = computed(() => formatOffset(timezoneOffsetMinutes(new Date(), this.draft().timezone)));
  readonly hasTimezone = computed(() => this.timezones.includes(this.draft().timezone));

  ngOnDestroy(): void {
    if (!this.finished) this.rollback();
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  onTabKeydown(event: KeyboardEvent, index: number): void {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % this.tabs.length;
    else next = (index - 1 + this.tabs.length) % this.tabs.length;
    this.activeTab.set(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  update<K extends keyof AdminPreferences>(key: K, value: AdminPreferences[K]): void {
    if (this.draft()[key] === value) return;
    const next = { ...this.draft(), [key]: value };
    this.draft.set(next);
    this.preferences.preview(next);
  }

  onBreadcrumbsChange(event: Event): void {
    this.update('breadcrumbsVisible', (event.target as HTMLInputElement).checked);
  }

  onStatusBarChange(event: Event): void {
    this.update('statusBarEnabled', (event.target as HTMLInputElement).checked);
  }

  onThemeChange(theme: AdminPreferences['theme']): void {
    this.update('theme', theme);
  }

  onDensityChange(density: AdminPreferences['density']): void {
    this.update('density', density);
  }

  onTimezoneChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    this.update('timezone', value);
  }

  timezoneLabel(zone: string): string {
    if (zone === 'Asia/Ho_Chi_Minh') return '(GMT+07:00) Giờ Đông Dương - Hà Nội / TP.HCM';
    const offset = formatOffset(timezoneOffsetMinutes(new Date(), zone));
    return offset ? `(${offset}) ${zone.replace(/_/g, ' ')}` : zone;
  }

  setNumberFormat(numberFormat: AdminNumberFormat): void {
    this.displayPreferences.setNumberFormat(numberFormat);
  }

  togglePrivacy(event: Event): void {
    this.displayPreferences.setPrivacyMode((event.target as HTMLInputElement).checked ? 'blur' : 'off');
  }

  onLanguageChange(event: Event): void {
    this.i18n.setLanguage((event.target as HTMLSelectElement).value as AdminLanguage);
  }

  onNotificationToggle(
    key: 'emergencyAlerts' | 'slaCoursePending' | 'slaTicketOverdue',
    event: Event
  ): void {
    this.notificationPreferences.update(key, (event.target as HTMLInputElement).checked);
  }

  onEmailReportToggle(event: Event): void {
    this.notificationPreferences.update('emailReportEnabled', (event.target as HTMLInputElement).checked);
  }

  onReportFrequencyChange(event: Event): void {
    this.notificationPreferences.update(
      'emailReportFrequency',
      (event.target as HTMLSelectElement).value as AdminReportFrequency
    );
  }

  setReportFormat(format: AdminReportFormat): void {
    this.notificationPreferences.update('emailReportFormat', format);
  }

  onSoundChange(event: Event): void {
    this.notificationSound.setEnabled((event.target as HTMLInputElement).checked);
  }

  testSound(): void {
    this.notificationSound.play();
  }

  onShortcutsToggle(event: Event): void {
    this.shortcutsService.setEnabled((event.target as HTMLInputElement).checked);
    if (!this.shortcutsService.enabled()) this.capturingAction.set(null);
    this.shortcutError.set(null);
  }

  startCapture(action: AdminShortcutAction): void {
    this.capturingAction.set(action);
    this.shortcutError.set(null);
  }

  captureKey(event: KeyboardEvent, action: AdminShortcutAction): void {
    if (this.capturingAction() !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.capturingAction.set(null);
      return;
    }
    if (event.isComposing) return;
    const error = this.shortcutsService.setBinding(action, chordFromEvent(event));
    this.shortcutError.set(error);
    if (!error) this.capturingAction.set(null);
  }

  resetShortcuts(): void {
    this.shortcutsService.reset();
    this.capturingAction.set(null);
    this.shortcutError.set(null);
  }

  requestReset(): void {
    this.resetConfirming.set(true);
    afterNextRender(() => this.confirmResetButton()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelReset(): void {
    this.resetConfirming.set(false);
  }

  confirmReset(): void {
    const next: AdminPreferences = { ...DEFAULT_ADMIN_PREFERENCES };
    this.draft.set(next);
    this.preferences.preview(next);
    this.displayPreferences.reset();
    this.notificationPreferences.reset();
    this.notificationSound.setEnabled(false);
    this.i18n.setLanguage('vi');
    this.shortcutsService.reset();
    this.capturingAction.set(null);
    this.shortcutError.set(null);
    this.resetConfirming.set(false);
  }

  save(): void {
    if (!this.dirty() || this.saving()) return;
    if (!this.serverDirty()) {
      this.finish(true);
      return;
    }
    this.preferences.save(this.draft()).subscribe({
      next: () => this.finish(true),
      error: () => {
        // Lỗi hiển thị qua `error`; giữ hộp thoại mở để thử lại.
      }
    });
  }

  reloadLatest(): void {
    this.preferences.load(true).subscribe({
      next: () => {
        this.draft.set({ ...this.preferences.saved() });
        this.preferences.preview(this.draft());
      },
      error: () => {
        // Lỗi đã được service ghi nhận và hiển thị.
      }
    });
  }

  cancel(): void {
    this.finish(false);
  }

  private localChanged(): boolean {
    const display = this.display();
    const notifications = this.notifications();
    return display.numberFormat !== this.initialDisplay.numberFormat
      || display.privacyMode !== this.initialDisplay.privacyMode
      || notifications.emergencyAlerts !== this.initialNotifications.emergencyAlerts
      || notifications.emailReportEnabled !== this.initialNotifications.emailReportEnabled
      || notifications.emailReportFrequency !== this.initialNotifications.emailReportFrequency
      || notifications.emailReportFormat !== this.initialNotifications.emailReportFormat
      || notifications.slaCoursePending !== this.initialNotifications.slaCoursePending
      || notifications.slaTicketOverdue !== this.initialNotifications.slaTicketOverdue
      || this.soundEnabled() !== this.initialSound
      || this.language() !== this.initialLanguage
      || this.shortcutsEnabled() !== this.initialShortcutsEnabled
      || !sameBindings(this.shortcutsService.bindings(), this.initialBindings);
  }

  private rollback(): void {
    this.preferences.cancelPreview();
    this.displayPreferences.setNumberFormat(this.initialDisplay.numberFormat);
    this.displayPreferences.setPrivacyMode(this.initialDisplay.privacyMode);
    this.notificationPreferences.restore(this.initialNotifications);
    this.notificationSound.setEnabled(this.initialSound);
    this.i18n.setLanguage(this.initialLanguage);
    this.shortcutsService.restore(this.initialShortcutsEnabled, this.initialBindings);
  }

  private finish(saved: boolean): void {
    this.finished = true;
    if (!saved) this.rollback();
    this.dismissed.emit();
  }
}

function formatOffset(offset: number | null): string {
  if (offset === null) return '';
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `GMT${sign}${hours}:${minutes}`;
}

function samePreferences(left: AdminPreferences, right: AdminPreferences): boolean {
  return left.breadcrumbsVisible === right.breadcrumbsVisible
    && left.timezone === right.timezone
    && left.statusBarEnabled === right.statusBarEnabled
    && left.theme === right.theme
    && left.density === right.density;
}

function sameBindings(
  left: Record<AdminShortcutAction, string>,
  right: Record<AdminShortcutAction, string>
): boolean {
  return DEFAULT_SHORTCUTS.every((definition) => left[definition.action] === right[definition.action]);
}
