import { Injectable, signal } from '@angular/core';
import {
  AdminNotificationPreferences,
  AdminReportFormat,
  AdminReportFrequency,
  DEFAULT_ADMIN_NOTIFICATION_PREFERENCES
} from '../models/admin-notification-preferences.model';

const STORAGE_KEY = 'thinkup_admin_notification_preferences';

/**
 * P8 — UI preference for alerts/reports/SLA. Delivery itself still needs the
 * backend scheduler (B-21/B-22); these values are stored per browser only and
 * are never sent to the API, so the dialog cannot break the server contract.
 */
@Injectable({ providedIn: 'root' })
export class AdminNotificationPreferencesService {
  private readonly state = signal<AdminNotificationPreferences>(readStoredPreferences());

  readonly preferences = this.state.asReadonly();

  update<K extends keyof AdminNotificationPreferences>(
    key: K,
    value: AdminNotificationPreferences[K]
  ): void {
    if (this.state()[key] === value) return;
    this.write({ ...this.state(), [key]: value });
  }

  /** Ghi đè toàn bộ, dùng để khôi phục snapshot khi huỷ hộp thoại cài đặt. */
  restore(preferences: AdminNotificationPreferences): void {
    this.write({ ...preferences });
  }

  reset(): void {
    this.write({ ...DEFAULT_ADMIN_NOTIFICATION_PREFERENCES });
  }

  private write(next: AdminNotificationPreferences): void {
    this.state.set(next);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable; the in-memory value still applies.
    }
  }
}

function readStoredPreferences(): AdminNotificationPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_ADMIN_NOTIFICATION_PREFERENCES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      emergencyAlerts: parsed?.emergencyAlerts !== false,
      emailReportEnabled: parsed?.emailReportEnabled === true,
      emailReportFrequency: isFrequency(parsed?.emailReportFrequency)
        ? parsed.emailReportFrequency
        : DEFAULT_ADMIN_NOTIFICATION_PREFERENCES.emailReportFrequency,
      emailReportFormat: isFormat(parsed?.emailReportFormat)
        ? parsed.emailReportFormat
        : DEFAULT_ADMIN_NOTIFICATION_PREFERENCES.emailReportFormat,
      slaCoursePending: parsed?.slaCoursePending !== false,
      slaTicketOverdue: parsed?.slaTicketOverdue !== false
    };
  } catch {
    return { ...DEFAULT_ADMIN_NOTIFICATION_PREFERENCES };
  }
}

function isFrequency(value: unknown): value is AdminReportFrequency {
  return value === 'daily' || value === 'weekly' || value === 'monthly';
}

function isFormat(value: unknown): value is AdminReportFormat {
  return value === 'xlsx' || value === 'pdf';
}
