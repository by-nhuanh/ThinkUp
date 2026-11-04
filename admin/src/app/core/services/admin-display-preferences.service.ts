import { Injectable, computed, signal } from '@angular/core';
import {
  AdminDisplayPreferences,
  AdminNumberFormat,
  AdminPrivacyMode,
  DEFAULT_ADMIN_DISPLAY_PREFERENCES
} from '../models/admin-display-preferences.model';

const STORAGE_KEY = 'thinkup_admin_display_preferences';

/**
 * P7 — display preferences that are intentionally local to this browser.
 *
 * The backend preferences contract (P2) only stores layout options. Number
 * formatting and privacy masking are presentation concerns, so they are kept
 * here and never sent to the API; changing them cannot fail or conflict.
 */
@Injectable({ providedIn: 'root' })
export class AdminDisplayPreferencesService {
  private readonly state = signal<AdminDisplayPreferences>(readStoredPreferences());

  readonly preferences = this.state.asReadonly();
  readonly numberFormat = computed(() => this.state().numberFormat);
  readonly privacyMode = computed(() => this.state().privacyMode);

  setNumberFormat(numberFormat: AdminNumberFormat): void {
    this.write({ ...this.state(), numberFormat });
  }

  setPrivacyMode(privacyMode: AdminPrivacyMode): void {
    this.write({ ...this.state(), privacyMode });
  }

  reset(): void {
    this.write({ ...DEFAULT_ADMIN_DISPLAY_PREFERENCES });
  }

  private write(next: AdminDisplayPreferences): void {
    this.state.set(next);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode/quota); the in-memory value still applies.
    }
  }
}

function readStoredPreferences(): AdminDisplayPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_ADMIN_DISPLAY_PREFERENCES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      numberFormat: parsed?.numberFormat === 'compact' ? 'compact' : 'full',
      privacyMode: parsed?.privacyMode === 'blur' || parsed?.privacyMode === 'mask'
        ? parsed.privacyMode
        : 'off'
    };
  } catch {
    return { ...DEFAULT_ADMIN_DISPLAY_PREFERENCES };
  }
}