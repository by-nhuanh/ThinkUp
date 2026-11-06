import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, defer, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PaymentPreferences, PaymentSettingsOverview } from '../../../core/models/payment.model';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  AccountSecurityPayload,
  DEFAULT_LEARNING_OPTIONS,
  DEFAULT_NOTIFICATION_PREFS,
  DndDuration,
  LearningOptions,
  NotificationPrefs,
  PaymentMethod,
  SettingSection,
  SettingsApiResponse,
} from '../models/settings.model';

interface NotificationPrefsDto {
  web?: boolean;
  email?: boolean;
  newsletter?: boolean;
  learning?: boolean;
  community?: boolean;
  courseUpdates?: boolean;
  marketing?: boolean;
  marketingOptIn?: boolean;
  revision?: number;
  dnd?: {
    mode?: 'off' | 'timed' | 'indefinite';
    durationMinutes?: number | null;
    endsAt?: string | null;
  };
}

interface PaymentMethodsDto {
  items?: PaymentMethod[];
  supported?: boolean;
}

/** Cấu hình từ API; lỗi được chuyển đến giao diện. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  // Bản nháp phục vụ giao diện; không dùng làm kết quả thay thế API.
  private readonly learningOptionsState = signal<LearningOptions>({ ...DEFAULT_LEARNING_OPTIONS });
  private readonly notificationPrefsState = signal<NotificationPrefs>({
    ...DEFAULT_NOTIFICATION_PREFS,
  });
  private readonly paymentMethodsState = signal<PaymentMethod[]>([]);

  readonly learningOptions = this.learningOptionsState.asReadonly();
  readonly notificationPrefs = this.notificationPrefsState.asReadonly();
  readonly paymentMethods = this.paymentMethodsState.asReadonly();

  private notificationRevision: number | null = null;
  private learningRevision: number | null = null;
  constructor() {
    let owner = this.auth.currentUser()?.id;
    effect(() => {
      const next = this.auth.currentUser()?.id;
      if (next === owner) return;
      owner = next;
      this.learningRevision = null; this.notificationRevision = null;
      this.learningOptionsState.set({ ...DEFAULT_LEARNING_OPTIONS });
      this.notificationPrefsState.set({ ...DEFAULT_NOTIFICATION_PREFS });
      this.paymentMethodsState.set([]);
    });
  }

  private readonly dndMinutes: Record<Exclude<DndDuration, 'until' | null>, number> = {
    '15': 15,
    '1': 60,
    '8': 480,
    '24': 1440,
  };

  /** Cập nhật trạng thái cục bộ (dùng cho toggle/dropdown trước khi lưu API). */
  setLearningOptions(value: LearningOptions): void {
    this.learningOptionsState.set(value);
  }
  setNotificationPrefs(value: NotificationPrefs): void {
    this.notificationPrefsState.set(value);
  }

  getSections(): Observable<SettingSection[]> {
    return of<SettingSection[]>([
      {
        id: 'account-security',
        title: 'Tài khoản & Bảo mật',
        description: 'Quản lý mật khẩu và các thiết lập bảo mật cho tài khoản của bạn.',
        icon: 'Shield',
        iconColor: '#155DFC',
        bgColor: '#EFF6FF',
        href: '/main/settings/account-security',
      },
      {
        id: 'notifications',
        title: 'Thông báo',
        description: 'Chọn loại thông báo bạn muốn nhận và cách nhận thông báo.',
        icon: 'Bell',
        iconColor: '#009966',
        bgColor: '#ECFDF5',
        href: '/main/settings/notifications',
      },
      {
        id: 'learning-options',
        title: 'Tùy chọn học tập',
        description: 'Cách nhận hoặc truyền giáo dục trên ThinkUp.',
        icon: 'GraduationCap',
        iconColor: '#7F22FE',
        bgColor: '#F5F3FF',
        href: '/main/settings/learning-options',
      },
      {
        id: 'payment',
        title: 'Thanh toán',
        description: 'Quản lý phương thức thanh toán, lịch sử giao dịch và hóa đơn.',
        icon: 'CreditCard',
        iconColor: '#E17100',
        bgColor: '#FFFBEB',
        href: '/main/settings/payment',
      },
    ]);
  }

  private mapLearning(data: LearningOptions & { revision: number }): LearningOptions {
    if (!Number.isSafeInteger(data.revision)) throw new Error('Cấu hình không hợp lệ.');
    this.learningRevision = data.revision;
    const zones: Record<string, string> = { 'Asia/Ho_Chi_Minh': 'GMT+07:00', 'Asia/Singapore': 'GMT+08:00', 'Asia/Tokyo': 'GMT+09:00', 'Etc/UTC': 'GMT+00:00' };
    const value: LearningOptions = { language: data.language, timezone: zones[data.timezone] ?? data.timezone,
      videoQuality: data.videoQuality, playbackSpeed: data.playbackSpeed, downloadQuality: data.downloadQuality,
      downloadLocation: data.downloadLocation, subtitles: data.subtitles, autoNext: data.autoNext };
    this.learningOptionsState.set(value);
    return value;
  }

  getLearningOptions(): Observable<LearningOptions> {
    return this.paymentResponse(this.http.get<SettingsApiResponse<LearningOptions & { revision: number }>>(
      this.apiUrl + '/user/settings/learning')).pipe(map(data => this.mapLearning(data)));
  }

  updateLearningOptions(payload: Partial<LearningOptions>): Observable<LearningOptions> {
    if (this.learningRevision === null) return throwError(() => new Error('Cần tải cấu hình trước khi lưu.'));
    const body: Record<string, unknown> = { expectedRevision: this.learningRevision };
    for (const key of ['language', 'timezone', 'videoQuality', 'playbackSpeed', 'downloadQuality', 'downloadLocation', 'subtitles', 'autoNext'] as const) {
      if (payload[key] !== undefined) body[key] = payload[key];
    }
    return this.paymentResponse(this.http.put<SettingsApiResponse<LearningOptions & { revision: number }>>(
      this.apiUrl + '/user/settings/learning', body)).pipe(map(data => this.mapLearning(data)));
  }

  getNotificationPrefs(): Observable<NotificationPrefs> {
    return this.paymentResponse(this.http.get<SettingsApiResponse<NotificationPrefsDto>>(
      this.apiUrl + '/user/notifications/preferences')).pipe(map(dto => {
        const value = this.mapNotificationPrefs(dto);
        this.notificationPrefsState.set(value);
        return value;
      }));
  }

  updateNotificationPrefs(payload: Partial<NotificationPrefs>): Observable<NotificationPrefs> {
    if (this.notificationRevision === null) return throwError(() => new Error('Cần tải cấu hình trước khi lưu.'));
    const next: NotificationPrefs = { ...this.notificationPrefsState(), ...payload };
    const body: Record<string, unknown> = { expectedRevision: this.notificationRevision };

    for (const key of ['web', 'email', 'learning', 'community', 'courseUpdates'] as const) {
      if (typeof payload[key] === 'boolean') body[key] = payload[key];
    }

    // BE dùng chung marketingOptIn cho cả hai công tắc khuyến mãi.
    const marketing = payload.marketing ?? payload.newsletter;
    if (typeof marketing === 'boolean') {
      body['marketingOptIn'] = marketing;
      body['newsletter'] = marketing;
      body['marketing'] = marketing;
    }

    if (payload.dnd !== undefined) {
      body['dnd'] =
        payload.dnd === null || payload.dnd === this.notificationPrefsState().dnd
          ? { mode: 'off' }
          : payload.dnd === 'until'
          ? { mode: 'indefinite' }
          : { mode: 'timed', durationMinutes: this.dndMinutes[payload.dnd] };
      // BE bắt buộc gửi revision khi đổi chế độ không làm phiền.
      body['expectedRevision'] = this.notificationRevision;
    }

    if (Object.keys(body).length === 1) return of(next);

    return this.paymentResponse(this.http.put<SettingsApiResponse<NotificationPrefsDto>>(
      this.apiUrl + '/user/notifications/preferences', body)).pipe(map(dto => {
        const value = this.mapNotificationPrefs(dto);
        this.notificationPrefsState.set(value);
        return value;
      }));
  }

  private mapNotificationPrefs(dto: NotificationPrefsDto): NotificationPrefs {
    if (!Number.isSafeInteger(dto.revision) || ['web', 'email', 'learning', 'community', 'courseUpdates'].some(key => typeof dto[key as keyof NotificationPrefsDto] !== 'boolean') || typeof dto.marketingOptIn !== 'boolean' || !dto.dnd) {
      throw new Error('Phản hồi cấu hình thông báo không hợp lệ.');
    }
    const marketing = dto.marketingOptIn;
    const marketingValue =
      typeof marketing === 'boolean' ? marketing : DEFAULT_NOTIFICATION_PREFS.marketing;

    let dnd: DndDuration = null;
    if (dto.dnd?.mode === 'indefinite') {
      dnd = 'until';
    } else if (dto.dnd?.mode === 'timed' && typeof dto.dnd.durationMinutes === 'number') {
      const matched = (Object.keys(this.dndMinutes) as Array<Exclude<DndDuration, 'until' | null>>).find(
        (key) => this.dndMinutes[key] === dto.dnd?.durationMinutes
      );
      if (matched) dnd = matched;
    }

    if (typeof dto.revision === 'number' && Number.isInteger(dto.revision) && dto.revision >= 0) {
      this.notificationRevision = dto.revision;
    }

    return {
      web: dto.web ?? DEFAULT_NOTIFICATION_PREFS.web,
      email: dto.email ?? DEFAULT_NOTIFICATION_PREFS.email,
      newsletter: marketingValue,
      learning: dto.learning ?? DEFAULT_NOTIFICATION_PREFS.learning,
      community: dto.community ?? DEFAULT_NOTIFICATION_PREFS.community,
      courseUpdates: dto.courseUpdates ?? DEFAULT_NOTIFICATION_PREFS.courseUpdates,
      marketing: marketingValue,
      dnd,
    };
  }

  getPaymentMethods(): Observable<PaymentMethod[]> {
    return this.http
      .get<SettingsApiResponse<PaymentMethodsDto>>(
        `${this.apiUrl}/user/settings/payment/methods`,
        { withCredentials: true }
      )
      .pipe(
        tap((res) => {
            if (!res.success || !Array.isArray(res.data?.items)) throw new Error('Không tải được phương thức thanh toán.');
            this.paymentMethodsState.set(res.data.items);
        }),
        map(() => this.paymentMethodsState())
      );
  }

  private paymentResponse<T>(request: Observable<SettingsApiResponse<T>>): Observable<T> {
    return defer(() => {
      const token = this.auth.getToken();
      return request.pipe(map(response => {
        if (token !== this.auth.getToken() || !response.success || !response.data) throw new Error('Không tải được cài đặt.');
        return response.data;
      }));
    });
  }

  getPaymentSettings(): Observable<PaymentSettingsOverview> {
    return this.paymentResponse(this.http.get<SettingsApiResponse<PaymentSettingsOverview>>(`${this.apiUrl}/user/settings/payment`));
  }

  updatePaymentPreferences(expectedRevision: number, invoiceEmail: boolean): Observable<PaymentPreferences> {
    return this.paymentResponse(this.http.patch<SettingsApiResponse<PaymentPreferences>>(
      `${this.apiUrl}/user/settings/payment/preferences`, { expectedRevision, invoiceEmail }));
  }

  downloadPaymentInvoice(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/user/settings/payment/invoices/${encodeURIComponent(id)}/download`, {
      responseType: 'blob', withCredentials: true,
    });
  }

  getAccountSecurity(): Observable<AccountSecurityOverview> {
    return this.paymentResponse(this.http.get<SettingsApiResponse<AccountSecurityOverview>>(this.apiUrl + '/user/settings/account-security'));
  }

  revokeSession(id: string): Observable<{ id: string; revoked: boolean }> {
    return this.paymentResponse(this.http.delete<SettingsApiResponse<{ id: string; revoked: boolean }>>(this.apiUrl + '/user/settings/sessions/' + encodeURIComponent(id)));
  }

  changePassword(payload: AccountSecurityPayload): Observable<{ success: boolean; message?: string }> {
    return this.paymentResponse(this.http.post<SettingsApiResponse<{ accessToken: string; refreshToken: string }>>(
      this.apiUrl + '/user/settings/change-password', payload)).pipe(map(data => {
        this.auth.replaceCredentials(data);
        return { success: true };
      }));
  }
}

export interface SecurityDevice {
  id: string; deviceType: string; os: string; browser: string; maskedIp: string; location: string;
  isCurrent: boolean; createdAt: string; lastSeenAt: string; expiresAt: string;
}
export interface AccountSecurityOverview {
  canChangePassword: boolean; serverTime: string; passwordLockedUntil: string | null;
  sessions: { items: SecurityDevice[]; pagination: { total: number; hasMore: boolean } };
  logs: { items: { id: string; type: string; title: string; device: SecurityDevice; createdAt: string }[]; pagination: { total: number; hasMore: boolean } };
}
