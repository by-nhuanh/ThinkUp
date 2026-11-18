import { Component, HostListener, OnDestroy, computed, inject, linkedSignal, signal } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { SettingsParameters } from '../models/system.models';
import { SYSTEM_STORE } from '../data/system.store';
import { SystemToastService } from '../services/system-toast.service';
import { SystemToastComponent } from '../components/system-toast/system-toast.component';
import { SettingsOtpDialogComponent } from '../components/settings-otp-dialog/settings-otp-dialog.component';
import { SystemConfirmDialogComponent } from '../components/system-confirm-dialog/system-confirm-dialog.component';
import { PLATFORM_SETTING_FIELDS, PLATFORM_SETTING_GROUPS, PlatformSettingKey, PlatformSettings, pickPlatformSettings, validatePlatformSettings } from './settings-parameters';

@Component({
  selector: 'app-system-settings', standalone: true,
  imports: [SystemToastComponent, SettingsOtpDialogComponent, SystemConfirmDialogComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['../system-page.css', './settings.component.css']
})
export class SettingsComponent implements OnDestroy {
  private readonly store = inject(SYSTEM_STORE);
  private readonly toast = inject(SystemToastService);
  readonly groups = PLATFORM_SETTING_GROUPS.map(group => {
    const entries = group.blocks.map((block, index) => ({ block, index }));
    return {
      ...group,
      columns: group.id === 'operations'
        ? [entries.filter(entry => entry.index !== 1), entries.filter(entry => entry.index === 1)]
        : entries.map(entry => [entry])
    };
  });
  readonly draft = linkedSignal(() => structuredClone(this.store.settings().parameters));
  readonly errors = computed(() => validatePlatformSettings(this.draft()));
  readonly touched = signal<ReadonlySet<PlatformSettingKey>>(new Set());
  readonly dirty = computed(() => PLATFORM_SETTING_FIELDS.some(field => !Object.is(this.draft()[field.key], this.store.settings().parameters[field.key])));
  readonly valid = computed(() => Object.keys(this.errors()).length === 0);
  readonly canSave = computed(() => this.dirty() && this.valid());
  readonly savedOnce = signal(false);
  readonly saveFailed = signal(false);
  readonly otpOpen = signal(false);
  readonly otpError = signal('');
  readonly leaveOpen = signal(false);
  private pendingParameters: PlatformSettings | null = null;
  private leaveSubject: Subject<boolean> | null = null;
  readonly statusLabel = computed(() => this.dirty()
    ? this.saveFailed() ? 'Lưu chưa thành công · Bản nháp được giữ lại' : 'Có thay đổi chưa lưu'
    : this.savedOnce() ? 'Đã lưu cấu hình sàn' : 'Chưa có thay đổi');

  onInput(key: PlatformSettingKey, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const value = event.target.value === '' ? Number.NaN : event.target.valueAsNumber;
    this.draft.update(current => {
      const next = { ...current, [key]: value };
      if ((key === 'platformRevenueShare' || key === 'lecturerRevenueShare') && Number.isFinite(value) && value >= 0 && value <= 100) {
        const other = key === 'platformRevenueShare' ? 'lecturerRevenueShare' : 'platformRevenueShare';
        next[other] = Math.round((100 - value) * 100) / 100;
      }
      return next;
    });
    this.saveFailed.set(false);
  }

  touch(key: PlatformSettingKey): void { this.touched.update(current => new Set([...current, key])); }
  numberDisplay(value: number): string { return Number.isFinite(value) ? String(value) : ''; }

  resetToDefaults(): void {
    this.draft.update(current => ({ ...current, ...pickPlatformSettings(this.store.defaultParameters) }));
    this.touched.set(new Set());
    this.saveFailed.set(false);
    this.toast.show('Đã đặt lại cấu hình mặc định', 'info', 3600, 'Nhấn Lưu cấu hình sàn để áp dụng các giá trị trong bản nháp.');
  }

  openSave(event?: Event): void {
    event?.preventDefault();
    if (!this.dirty()) return;
    this.touched.set(new Set(PLATFORM_SETTING_FIELDS.map(field => field.key)));
    if (!this.valid()) {
      const first = PLATFORM_SETTING_FIELDS.find(field => !!this.errors()[field.key]);
      if (first) document.getElementById('setting-' + first.key)?.focus();
      return;
    }
    this.pendingParameters = pickPlatformSettings(this.draft());
    this.otpError.set('');
    this.otpOpen.set(true);
  }

  closeOtp(): void { this.otpOpen.set(false); this.pendingParameters = null; }

  onOtpSubmitted(otp: string): void {
    if (!this.pendingParameters) return;
    const current = this.store.settings();
    const result = this.store.updateSettings({ ...current, parameters: { ...current.parameters, ...this.pendingParameters } }, otp);
    if (!result.ok) {
      if (result.serverError) {
        this.closeOtp();
        this.saveFailed.set(true);
        this.toast.show('Không thể lưu cấu hình', 'error', 5200, result.message);
      } else this.otpError.set(result.message);
      return;
    }
    this.closeOtp();
    this.draft.set(structuredClone(this.store.settings().parameters));
    this.savedOnce.set(true);
    this.saveFailed.set(false);
    this.touched.set(new Set());
    this.toast.show('Đã lưu cấu hình sàn', 'success', 3600);
  }

  @HostListener('window:beforeunload', ['$event'])
  protectUnsavedChanges(event: BeforeUnloadEvent): void {
    if (!this.dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  requestLeave(): Observable<boolean> {
    if (!this.dirty()) return of(true);
    if (!this.leaveSubject) this.leaveSubject = new Subject<boolean>();
    this.leaveOpen.set(true);
    return this.leaveSubject.asObservable();
  }

  resolveLeave(keepEditing: boolean): void {
    this.leaveOpen.set(false);
    this.leaveSubject?.next(!keepEditing);
    this.leaveSubject?.complete();
    this.leaveSubject = null;
  }

  ngOnDestroy(): void { this.leaveSubject?.next(false); this.leaveSubject?.complete(); }
}

export const settingsUnsavedGuard: CanDeactivateFn<SettingsComponent> = component => firstValueFrom(component.requestLeave(), { defaultValue: false });
