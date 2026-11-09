import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { PaymentGateway, SettingsParameters, SystemSettings } from '../models/system.models';
import { SYSTEM_STORE } from '../data/system.store';
import { SystemToastService } from '../services/system-toast.service';
import { SystemToastComponent } from '../components/system-toast/system-toast.component';
import { MomoDialogComponent } from '../components/momo-dialog/momo-dialog.component';
import { MessagingDialogComponent } from '../components/messaging-dialog/messaging-dialog.component';
import { SigningDialogComponent } from '../components/signing-dialog/signing-dialog.component';
import { CacheDialogComponent } from '../components/cache-dialog/cache-dialog.component';
import { SettingsOtpDialogComponent } from '../components/settings-otp-dialog/settings-otp-dialog.component';
import { SystemConfirmDialogComponent } from '../components/system-confirm-dialog/system-confirm-dialog.component';

export type SettingsTab =
  | 'general' | 'parameters' | 'social' | 'seo' | 'payment'
  | 'messaging' | 'storage' | 'signing' | 'maintenance';

type SocialProvider = 'google' | 'facebook' | 'apple' | 'recaptcha';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-system-settings',
  standalone: true,
  imports: [
    CustomSelectComponent,
    SystemToastComponent,
    MomoDialogComponent,
    MessagingDialogComponent,
    SigningDialogComponent,
    CacheDialogComponent,
    SettingsOtpDialogComponent,
    SystemConfirmDialogComponent
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['../system-page.css', './settings.component.css']
})
export class SettingsComponent implements OnDestroy {
  protected readonly store = inject(SYSTEM_STORE);
  private readonly toast = inject(SystemToastService);

  readonly tabs: readonly { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'Cài đặt chung' },
    { id: 'parameters', label: 'Tham số hệ thống' },
    { id: 'social', label: 'Xác thực và Mạng xã hội' },
    { id: 'seo', label: 'SEO và Tracking' },
    { id: 'payment', label: 'Cổng thanh toán' },
    { id: 'messaging', label: 'SMS và Email' },
    { id: 'storage', label: 'Lưu trữ S3' },
    { id: 'signing', label: 'Ký số' },
    { id: 'maintenance', label: 'Bảo trì và Cảnh báo' }
  ];
  readonly activeTab = signal<SettingsTab>('general');
  readonly draft = signal<SystemSettings>(structuredClone(this.store.settings()));
  readonly savedOnce = signal(false);
  readonly saveFailed = signal(false);

  readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.store.settings()));
  readonly draftStatusLabel = computed(() => {
    if (this.dirty()) return this.saveFailed() ? 'Có thay đổi chưa được lưu' : 'Có thay đổi chưa lưu';
    return this.savedOnce() ? 'Đã áp dụng cấu hình mới' : 'Chưa có thay đổi';
  });
  readonly draftStatusClass = computed(() => this.dirty() ? 'dirty' : this.savedOnce() ? 'saved' : '');

  readonly momoOpen = signal(false);
  readonly messagingOpen = signal(false);
  readonly signingOpen = signal(false);
  readonly cacheOpen = signal(false);
  readonly otpOpen = signal(false);
  readonly otpError = signal('');
  readonly maintenanceConfirm = signal<'enable' | 'disable' | null>(null);
  readonly leaveOpen = signal(false);
  private leaveSubject: Subject<boolean> | null = null;

  readonly timezoneOptions = [
    { value: 'GMT+07:00', label: 'GMT+07:00 · Giờ Đông Dương' },
    { value: 'GMT+00:00', label: 'GMT+00:00 · UTC' },
    { value: 'GMT+09:00', label: 'GMT+09:00 · Giờ Nhật Bản' }
  ];
  readonly languageOptions = [
    { value: 'Tiếng Việt', label: 'Tiếng Việt' },
    { value: 'English', label: 'English' }
  ];
  readonly regionOptions = [
    { value: 'ap-southeast-1', label: 'ap-southeast-1 · Singapore' },
    { value: 'ap-northeast-1', label: 'ap-northeast-1 · Tokyo' },
    { value: 'us-east-1', label: 'us-east-1 · N. Virginia' }
  ];

  readonly siteNameError = computed(() =>
    this.draft().general.siteName.length <= 70 ? '' : 'Tên Website tối đa 70 ký tự.');
  readonly hotlineError = computed(() =>
    /^\d{9,11}$/.test(this.draft().general.hotline.trim()) ? '' : 'Nhập số điện thoại từ 9–11 chữ số.');
  readonly uploadError = signal('');
  readonly logoName = signal('logo-thinkup.png');
  readonly faviconName = signal('favicon-thinkup.ico');

  readonly paramErrors = computed(() => {
    const p = this.draft().parameters;
    const errors: Partial<Record<keyof SettingsParameters, string>> = {};
    const positive = (value: number) => Number.isInteger(value) && value > 0;
    if (!positive(p.taxThreshold)) errors.taxThreshold = 'Giá trị phải là số nguyên dương.';
    if (!Number.isInteger(p.taxRate) || p.taxRate < 0 || p.taxRate > 100) errors.taxRate = 'Thuế suất từ 0–100%.';
    if (!positive(p.superAdminThreshold)) errors.superAdminThreshold = 'Giá trị phải là số nguyên dương.';
    if (!positive(p.paymentTimeout)) errors.paymentTimeout = 'Giá trị phải là số nguyên dương.';
    if (!positive(p.ordersPerPage)) errors.ordersPerPage = 'Giá trị phải là số nguyên dương.';
    if (!positive(p.courseReviewHours)) errors.courseReviewHours = 'Giá trị phải là số nguyên dương.';
    if (!Number.isInteger(p.sMatchThreshold) || p.sMatchThreshold < 1 || p.sMatchThreshold > 100) errors.sMatchThreshold = 'Điểm số hợp lệ từ 1–100.';
    if (!positive(p.minCoursesPerMilestone)) errors.minCoursesPerMilestone = 'Giá trị phải là số nguyên dương.';
    if (!Number.isInteger(p.testPassScore) || p.testPassScore < 1 || p.testPassScore > 100) errors.testPassScore = 'Điểm số hợp lệ từ 1–100.';
    if (!positive(p.studentLockReasonMin)) errors.studentLockReasonMin = 'Giá trị phải là số nguyên dương.';
    if (!positive(p.lecturerDisciplineReasonMin)) errors.lecturerDisciplineReasonMin = 'Giá trị phải là số nguyên dương.';
    if (!positive(p.courseRejectReasonMin)) errors.courseRejectReasonMin = 'Giá trị phải là số nguyên dương.';
    return errors;
  });

  readonly paramGroups = [
    {
      title: 'Doanh thu và Thuế',
      columns: 3,
      keys: ['taxThreshold', 'taxRate', 'superAdminThreshold'],
      note: 'Thu nhập từ 2 triệu khấu trừ 10% TNCN. Lệnh rút từ 20 triệu phải do Super Admin phê duyệt.',
      fields: [
        { key: 'taxThreshold', label: 'Ngưỡng tính thuế TNCN', unit: 'VNĐ' },
        { key: 'taxRate', label: 'Thuế suất TNCN', unit: '%' },
        { key: 'superAdminThreshold', label: 'Ngưỡng duyệt của Quản trị tối cao', unit: 'VNĐ' }
      ]
    },
    {
      title: 'Đơn hàng và Thanh toán',
      columns: 2,
      keys: ['paymentTimeout', 'ordersPerPage'],
      note: 'Hết hạn chờ: tự hủy đơn chưa thanh toán và hoàn lại lượt sử dụng voucher.',
      fields: [
        { key: 'paymentTimeout', label: 'Hạn chờ thanh toán', unit: 'phút' },
        { key: 'ordersPerPage', label: 'Số đơn hiển thị mặc định', unit: 'đơn/trang' }
      ]
    },
    {
      title: 'Đào tạo và Thẩm định',
      columns: 2,
      keys: ['courseReviewHours', 'sMatchThreshold', 'minCoursesPerMilestone', 'testPassScore'],
      note: 'Điểm số hợp lệ từ 1–100. S-Match từ 70 điểm; đạt bài kiểm tra từ 80%.',
      fields: [
        { key: 'courseReviewHours', label: 'Thời hạn duyệt khóa học', unit: 'giờ' },
        { key: 'sMatchThreshold', label: 'Ngưỡng gợi ý S-Match', unit: 'điểm', info: 'Ngưỡng điểm tối thiểu để hệ thống gợi ý ghép cặp S-Match.' },
        { key: 'minCoursesPerMilestone', label: 'Khóa học tối thiểu/Cột mốc', unit: 'khóa' },
        { key: 'testPassScore', label: 'Điểm đạt bài kiểm tra', unit: '%', info: 'Điểm tối thiểu để học viên được tính đạt bài kiểm tra.' }
      ]
    },
    {
      title: 'Quy định Kỷ luật',
      columns: 2,
      keys: ['studentLockReasonMin', 'lecturerDisciplineReasonMin', 'courseRejectReasonMin'],
      note: 'Độ dài tối thiểu được tính sau khi bỏ khoảng trắng thừa. Giá trị mặc định: 10 ký tự.',
      fields: [
        { key: 'studentLockReasonMin', label: 'Lý do khóa học viên', unit: 'ký tự' },
        { key: 'lecturerDisciplineReasonMin', label: 'Lý do kỷ luật giảng viên', unit: 'ký tự' },
        { key: 'courseRejectReasonMin', label: 'Lý do từ chối khóa học', unit: 'ký tự' }
      ]
    }
  ] as const;

  readonly editingProvider = signal<SocialProvider | null>(null);
  readonly newKeyId = signal('');
  readonly newKeySecret = signal('');
  readonly socialCards: readonly {
    id: SocialProvider;
    name: string;
    idLabel: string;
    secretLabel: string;
    enabledKey: keyof SystemSettings['social'];
    idKey: keyof SystemSettings['social'];
    secretKey: keyof SystemSettings['social'];
  }[] = [
    { id: 'google', name: 'Google', idLabel: 'Client ID', secretLabel: 'Client Secret', enabledKey: 'googleEnabled', idKey: 'googleClientId', secretKey: 'googleClientSecret' },
    { id: 'facebook', name: 'Facebook', idLabel: 'Client ID', secretLabel: 'Client Secret', enabledKey: 'facebookEnabled', idKey: 'facebookClientId', secretKey: 'facebookClientSecret' },
    { id: 'apple', name: 'Apple', idLabel: 'Client ID', secretLabel: 'Client Secret', enabledKey: 'appleEnabled', idKey: 'appleClientId', secretKey: 'appleClientSecret' },
    { id: 'recaptcha', name: 'Google reCAPTCHA v3', idLabel: 'Site Key', secretLabel: 'Secret Key', enabledKey: 'recaptchaEnabled', idKey: 'recaptchaSiteKey', secretKey: 'recaptchaSecretKey' }
  ];
  readonly socialValid = computed(() =>
    this.editingProvider() === null || (this.newKeyId().trim().length > 0 && this.newKeySecret().trim().length > 0));

  readonly ga4Error = computed(() =>
    /^G-[A-Z0-9]{6,}$/i.test(this.draft().tracking.ga4Id.trim()) ? '' : 'Mã GA4 phải có định dạng G-XXXXXXXXXX.');
  readonly pixelError = computed(() =>
    /^\d{10,20}$/.test(this.draft().tracking.pixelId.trim()) ? '' : 'Pixel ID phải gồm 10–20 chữ số.');
  readonly gtmError = computed(() => {
    const script = this.draft().tracking.gtmScript;
    if (!script.trim()) return 'Vui lòng nhập mã GTM container.';
    if (/eval\(|document\.cookie/i.test(script)) return 'Mã theo dõi không an toàn và sẽ bị từ chối. Chỉ dùng mã từ nhà cung cấp.';
    return '';
  });

  readonly storageValid = computed(() => {
    const s = this.draft().storage;
    return s.bucket.trim().length > 0 && s.region.trim().length > 0
      && s.accessKeyId.trim().length > 0 && s.secretAccessKey.trim().length > 0;
  });

  readonly emailInput = signal('');
  readonly phoneInput = signal('');
  readonly chipError = signal('');

  readonly generalValid = computed(() => !this.siteNameError() && !this.hotlineError() && !this.uploadError());
  readonly parametersValid = computed(() => Object.keys(this.paramErrors()).length === 0);
  readonly seoValid = computed(() => !this.ga4Error() && !this.pixelError() && !this.gtmError());
  readonly allValid = computed(() =>
    this.generalValid() && this.parametersValid() && this.socialValid() && this.seoValid() && this.storageValid());
  readonly canSave = computed(() => this.dirty() && this.allValid());

  selectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  updateSection<S extends keyof SystemSettings, K extends keyof SystemSettings[S]>(
    section: S, key: K, value: SystemSettings[S][K]
  ): void {
    this.draft.update((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
    this.saveFailed.set(false);
  }

  onNumber<S extends keyof SystemSettings, K extends keyof SystemSettings[S]>(
    section: S, key: K, raw: string
  ): void {
    this.updateSection(section, key, (raw === '' ? Number.NaN : Number(raw)) as SystemSettings[S][K]);
  }

  numberDisplay(value: number): string {
    return Number.isNaN(value) ? '' : String(value);
  }

  resetParameters(keys?: readonly (keyof SettingsParameters)[]): void {
    const defaults = this.store.defaultParameters;
    if (!keys) {
      this.draft.update((current) => ({ ...current, parameters: structuredClone(defaults) }));
    } else {
      const patch: Partial<SettingsParameters> = {};
      for (const key of keys) patch[key] = defaults[key];
      this.draft.update((current) => ({ ...current, parameters: { ...current.parameters, ...patch } }));
    }
    this.toast.show('Đã đặt lại tham số mặc định', 'info', 3000);
  }

  onUpload(event: Event, kind: 'logo' | 'favicon'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      const mb = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
      this.uploadError.set(`${file.name}: ${mb}MB. Vui lòng chọn ảnh dưới 2MB.`);
      return;
    }
    this.uploadError.set('');
    if (kind === 'logo') this.logoName.set(file.name);
    else this.faviconName.set(file.name);
    // TODO(pre-deploy): Nhớ thay bằng API tải ảnh thương hiệu lên CDN khi backend sẵn sàng.
    this.toast.show('Đã nhận tệp minh họa', 'info', 3000, 'Bản demo chưa tải tệp lên máy chủ.');
  }

  startEditKeys(provider: SocialProvider): void {
    this.editingProvider.set(provider);
    this.newKeyId.set('');
    this.newKeySecret.set('');
  }

  toggleSocial(card: { enabledKey: keyof SystemSettings['social'] }): void {
    const next = !this.draft().social[card.enabledKey];
    this.updateSection('social', card.enabledKey, next as SystemSettings['social'][typeof card.enabledKey]);
    this.toast.show(
      next ? 'Đã bật phương thức đăng nhập' : 'Đã tắt phương thức đăng nhập',
      'info',
      3000,
      'Thay đổi nằm trong bản nháp · nhấn Lưu cấu hình để áp dụng.'
    );
  }

  isProviderEnabled(card: { enabledKey: keyof SystemSettings['social'] }): boolean {
    return this.draft().social[card.enabledKey] === true;
  }

  cancelEditKeys(): void {
    this.editingProvider.set(null);
    this.newKeyId.set('');
    this.newKeySecret.set('');
  }

  onNewKeyInput(card: { idKey: keyof SystemSettings['social']; secretKey: keyof SystemSettings['social'] }): void {
    const id = this.newKeyId().trim();
    const secret = this.newKeySecret().trim();
    if (!id || !secret) return;
    this.updateSection('social', card.idKey, id);
    this.updateSection('social', card.secretKey, secret);
    this.editingProvider.set(null);
    this.newKeyId.set('');
    this.newKeySecret.set('');
  }

  addChip(kind: 'email' | 'phone'): void {
    const raw = (kind === 'email' ? this.emailInput() : this.phoneInput()).trim();
    if (!raw) return;
    if (kind === 'email') {
      if (!EMAIL_PATTERN.test(raw)) {
        this.chipError.set('Email nhận cảnh báo không hợp lệ.');
        return;
      }
      if (this.draft().maintenance.alertEmails.includes(raw)) {
        this.chipError.set('Email này đã có trong danh sách.');
        return;
      }
      this.updateSection('maintenance', 'alertEmails', [...this.draft().maintenance.alertEmails, raw]);
      this.emailInput.set('');
    } else {
      if (!/^\d{9,11}$/.test(raw)) {
        this.chipError.set('Số điện thoại phải gồm 9–11 chữ số.');
        return;
      }
      if (this.draft().maintenance.alertPhones.includes(raw)) {
        this.chipError.set('Số điện thoại này đã có trong danh sách.');
        return;
      }
      this.updateSection('maintenance', 'alertPhones', [...this.draft().maintenance.alertPhones, raw]);
      this.phoneInput.set('');
    }
    this.chipError.set('');
  }

  removeChip(kind: 'email' | 'phone', value: string): void {
    if (kind === 'email') {
      this.updateSection('maintenance', 'alertEmails', this.draft().maintenance.alertEmails.filter((item) => item !== value));
    } else {
      this.updateSection('maintenance', 'alertPhones', this.draft().maintenance.alertPhones.filter((item) => item !== value));
    }
  }

  requestMaintenanceChange(): void {
    this.maintenanceConfirm.set(this.draft().maintenance.enabled ? 'disable' : 'enable');
  }

  confirmMaintenanceChange(): void {
    const enable = this.maintenanceConfirm() === 'enable';
    this.store.setMaintenance(enable);
    this.updateSection('maintenance', 'enabled', enable);
    this.maintenanceConfirm.set(null);
    this.toast.show(
      enable ? 'Đã bật chế độ bảo trì' : 'Đã tắt chế độ bảo trì',
      'success',
      4000,
      enable ? 'Giao diện học viên đang tạm đóng.' : 'Người dùng có thể truy cập lại bình thường.'
    );
  }

  /** TODO(pre-deploy): Nhớ thay bằng API kiểm tra kết nối cổng thanh toán thật. */
  checkGateway(gateway: PaymentGateway): void {
    if (gateway.status === 'healthy') {
      this.toast.show(`${gateway.name} hoạt động ổn định`, 'success', 3200, 'Kết nối kiểm tra thành công · dữ liệu demo');
    } else {
      this.toast.show(`${gateway.name} mất kết nối`, 'error', 4200, 'Kiểm tra lại cấu hình cổng trước khi sử dụng.');
    }
  }

  toastChannel(name: string): void {
    this.toast.show(`${name} hoạt động ổn định`, 'success', 3200, 'Kết nối kiểm tra thành công · dữ liệu demo');
  }

  toastVcb(): void {
    this.toast.show('Vietcombank đang mất kết nối', 'info', 4200, 'Biểu mẫu cấu hình ngân hàng sẽ khả dụng sau khi tích hợp xong.');
  }

  openSave(): void {
    if (!this.canSave()) return;
    this.otpError.set('');
    this.otpOpen.set(true);
  }

  onOtpSubmitted(otp: string): void {
    const result = this.store.updateSettings(this.draft(), otp);
    if (!result.ok) {
      if (result.serverError) {
        this.otpOpen.set(false);
        this.saveFailed.set(true);
        this.toast.show('Không thể lưu cấu hình', 'error', 5200, result.message);
      } else {
        this.otpError.set(result.message);
      }
      return;
    }
    this.otpOpen.set(false);
    this.draft.set(structuredClone(this.store.settings()));
    this.savedOnce.set(true);
    this.saveFailed.set(false);
    this.toast.show('Đã lưu cấu hình thành công', 'success', 4200, 'Cấu hình mới đã được áp dụng trên hệ thống.');
  }

  onMessagingSaved(config: SystemSettings['messaging']): void {
    this.draft.update((current) => ({ ...current, messaging: config }));
    this.messagingOpen.set(false);
    this.toast.show('Đã cập nhật cấu hình SMS và Email', 'success', 3600, 'Thay đổi nằm trong bản nháp · nhấn Lưu cấu hình để áp dụng.');
  }

  onSigningSaved(config: SystemSettings['signing']): void {
    this.draft.update((current) => ({ ...current, signing: config }));
    this.signingOpen.set(false);
    this.toast.show('Đã cập nhật cấu hình Ký số', 'success', 3600, 'Thay đổi nằm trong bản nháp · nhấn Lưu cấu hình để áp dụng.');
  }

  onMomoSaved(message: string): void {
    this.momoOpen.set(false);
    this.toast.show(message, 'success', 3800);
  }

  requestLeave(): Observable<boolean> {
    if (!this.dirty()) return of(true);
    this.leaveOpen.set(true);
    this.leaveSubject = new Subject<boolean>();
    return this.leaveSubject.asObservable();
  }

  resolveLeave(keepEditing: boolean): void {
    this.leaveOpen.set(false);
    this.leaveSubject?.next(!keepEditing);
    this.leaveSubject?.complete();
    this.leaveSubject = null;
  }

  ngOnDestroy(): void {
    this.leaveSubject?.complete();
  }
}

export const settingsUnsavedGuard: CanDeactivateFn<SettingsComponent> = (component) => firstValueFrom(component.requestLeave());