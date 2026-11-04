import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { AdminPreferencesService } from '../../../../core/services/admin-preferences.service';
import { formatInTimezone } from '../../../../core/services/admin-timezone';
import { AdminTPipe } from '../../../../shared/pipes/admin-t.pipe';

/**
 * P5 — Thanh trạng thái quản trị (mặc định tắt).
 *
 * Nằm trong luồng nội dung (không `position: fixed`) nên không che nội dung,
 * footer của trang hay thanh tiện ích đang neo. Không dùng `role="status"` hay
 * `aria-live` vì đồng hồ cập nhật định kỳ sẽ tạo thông báo liên tục cho trình đọc màn hình.
 */
@Component({
  selector: 'app-admin-status-bar',
  standalone: true,
  imports: [AdminTPipe],
  templateUrl: './admin-status-bar.component.html',
  styleUrl: './admin-status-bar.component.css'
})
export class AdminStatusBarComponent {
  private readonly preferences = inject(AdminPreferencesService);
  private readonly destroyRef = inject(DestroyRef);

  /** Cạnh đang neo thanh tiện ích; cần chừa chỗ để hai thành phần không chồng nhau. */
  readonly reserveDock = input(false);

  private readonly now = signal(new Date());
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  readonly timezone = computed(() => this.preferences.applied().timezone);
  readonly environmentLabel = environment.production ? 'Production' : 'Development';
  readonly clock = computed(() =>
    formatInTimezone(this.now(), this.timezone(), { hour: '2-digit', minute: '2-digit' })
  );

  constructor() {
    if (typeof window === 'undefined') return;
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    const updateOnline = () => this.online.set(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    });
  }
}
