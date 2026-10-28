import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  AccountSecurityPayload,
  DEFAULT_LEARNING_OPTIONS,
  DEFAULT_NOTIFICATION_PREFS,
  LearningOptions,
  NotificationPrefs,
  PaymentMethod,
  SettingSection,
  SettingsApiResponse,
} from '../models/settings.model';

/**
 * Dịch vụ cài đặt người dùng.
 * Lưu ý: endpoint cụ thể sẽ được chốt sau khi nhận spec/Postman handoff từ backend.
 * Hiện tại gọi API thật khi có backend, khi backend chưa sẵn sàng thì giữ trạng thái cục bộ
 * và không làm gián đoạn giao diện (giống ProfileService).
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Trạng thái cục bộ (fallback khi API chưa sẵn sàng)
  private readonly learningOptionsState = signal<LearningOptions>({ ...DEFAULT_LEARNING_OPTIONS });
  private readonly notificationPrefsState = signal<NotificationPrefs>({
    ...DEFAULT_NOTIFICATION_PREFS,
  });
  private readonly paymentMethodsState = signal<PaymentMethod[]>([
    {
      id: 'pm_1',
      type: 'momo',
      last4: '5678',
      holder: 'Nguyễn Minh Anh',
      expiredAt: '',
      isDefault: true,
      verified: true,
    },
    {
      id: 'pm_2',
      type: 'zalopay',
      last4: '2468',
      holder: 'Nguyễn Minh Anh',
      expiredAt: '',
      isDefault: false,
      verified: true,
    },
    {
      id: 'pm_3',
      type: 'visa',
      last4: '1234',
      holder: 'Nguyễn Minh Anh',
      expiredAt: '12/27',
      isDefault: false,
      verified: true,
    },
  ]);

  readonly learningOptions = this.learningOptionsState.asReadonly();
  readonly notificationPrefs = this.notificationPrefsState.asReadonly();
  readonly paymentMethods = this.paymentMethodsState.asReadonly();

  /** Cập nhật trạng thái cục bộ (dùng cho toggle/dropdown trước khi lưu API). */
  setLearningOptions(value: LearningOptions): void {
    this.learningOptionsState.set(value);
  }
  setNotificationPrefs(value: NotificationPrefs): void {
    this.notificationPrefsState.set(value);
  }

  /** TODO(pre-deploy): Gọi API đặt phương thức mặc định khi backend có spec. */
  setDefaultPaymentMethod(id: string): void {
    this.paymentMethodsState.update((methods) =>
      methods.map((method) => ({ ...method, isDefault: method.id === id }))
    );
  }

  /** TODO(pre-deploy): Gọi API xóa phương thức thanh toán khi backend có spec. */
  removePaymentMethod(id: string): void {
    this.paymentMethodsState.update((methods) => {
      const remaining = methods.filter((method) => method.id !== id);
      if (remaining.length > 0 && !remaining.some((method) => method.isDefault)) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }
      return remaining;
    });
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

  getLearningOptions(): Observable<LearningOptions> {
    // TODO(pre-deploy): Thay endpoint thật khi backend có spec.
    return this.http
      .get<SettingsApiResponse<LearningOptions>>(`${this.apiUrl}/user/settings/learning`, {
        withCredentials: true,
      })
      .pipe(
        tap((res) => {
          if (res.success && res.data) this.learningOptionsState.set(res.data);
        }),
        map((res) => (res.success ? (res.data ?? this.learningOptionsState()) : this.learningOptionsState())),
        catchError(() => of(this.learningOptionsState()))
      );
  }

  updateLearningOptions(payload: Partial<LearningOptions>): Observable<LearningOptions> {
    const next: LearningOptions = { ...this.learningOptionsState(), ...payload };
    return this.http
      .put<SettingsApiResponse<LearningOptions>>(
        `${this.apiUrl}/user/settings/learning`,
        next,
        { withCredentials: true }
      )
      .pipe(
        tap((res) => {
          if (res.success && res.data) this.learningOptionsState.set(res.data);
          else this.learningOptionsState.set(next);
        }),
        map((res) => (res.success ? (res.data ?? next) : next)),
        catchError(() => of(next))
      );
  }

  getNotificationPrefs(): Observable<NotificationPrefs> {
    return this.http
      .get<SettingsApiResponse<NotificationPrefs>>(`${this.apiUrl}/user/settings/notifications`, {
        withCredentials: true,
      })
      .pipe(
        tap((res) => {
          if (res.success && res.data) {
            this.notificationPrefsState.set({ ...DEFAULT_NOTIFICATION_PREFS, ...res.data });
          }
        }),
        map((res) => (res.success ? (res.data ?? this.notificationPrefsState()) : this.notificationPrefsState())),
        catchError(() => of(this.notificationPrefsState()))
      );
  }

  updateNotificationPrefs(payload: Partial<NotificationPrefs>): Observable<NotificationPrefs> {
    const next: NotificationPrefs = { ...this.notificationPrefsState(), ...payload };
    return this.http
      .put<SettingsApiResponse<NotificationPrefs>>(
        `${this.apiUrl}/user/settings/notifications`,
        next,
        { withCredentials: true }
      )
      .pipe(
        tap((res) => {
          if (res.success && res.data) {
            this.notificationPrefsState.set({ ...DEFAULT_NOTIFICATION_PREFS, ...res.data });
          } else this.notificationPrefsState.set(next);
        }),
        map((res) => (res.success ? (res.data ?? next) : next)),
        catchError(() => of(next))
      );
  }

  getPaymentMethods(): Observable<PaymentMethod[]> {
    return this.http
      .get<SettingsApiResponse<PaymentMethod[]>>(`${this.apiUrl}/user/settings/payment`, {
        withCredentials: true,
      })
      .pipe(
        tap((res) => {
          if (res.success && res.data) this.paymentMethodsState.set(res.data);
        }),
        map((res) => (res.success ? (res.data ?? this.paymentMethodsState()) : this.paymentMethodsState())),
        catchError(() => of(this.paymentMethodsState()))
      );
  }

  changePassword(payload: AccountSecurityPayload): Observable<{ success: boolean; message?: string }> {
    return this.http
      .post<SettingsApiResponse>(`${this.apiUrl}/user/settings/change-password`, payload, {
        withCredentials: true,
      })
      .pipe(
        map((res) => ({ success: res.success ?? false, message: res.message })),
        catchError(() => of({ success: false, message: 'Đổi mật khẩu thất bại. Vui lòng thử lại.' }))
      );
  }
}
