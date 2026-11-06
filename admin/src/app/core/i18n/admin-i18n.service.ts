import { Injectable, computed, signal } from '@angular/core';
import {
  AdminMessageKey,
  EN_DICTIONARY,
  ENGLISH_READY,
  VI_DICTIONARY
} from './admin-i18n.dictionary';

export type AdminLanguage = 'vi' | 'en';

const STORAGE_KEY = 'thinkup_admin_language';

/**
 * P9 — language preference. Vietnamese is the default and the only selectable
 * language until `ENGLISH_READY` flips; the preference is browser-local because
 * the backend preferences allowlist has no `language` field yet.
 */
@Injectable({ providedIn: 'root' })
export class AdminI18nService {
  private readonly state = signal<AdminLanguage>(readStoredLanguage());

  readonly language = this.state.asReadonly();
  readonly englishReady = computed(() => ENGLISH_READY);
  readonly languages: ReadonlyArray<{ value: AdminLanguage; label: string; disabled: boolean }> = [
    { value: 'vi', label: 'Tiếng Việt', disabled: false },
    { value: 'en', label: 'English', disabled: !ENGLISH_READY }
  ];

  t(key: AdminMessageKey): string {
    return this.state() === 'en' ? EN_DICTIONARY[key] : VI_DICTIONARY[key];
  }

  setLanguage(language: AdminLanguage): void {
    if (language === 'en' && !ENGLISH_READY) return;
    this.state.set(language);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Storage can be unavailable; the in-memory value still applies.
    }
  }
}

function readStoredLanguage(): AdminLanguage {
  if (typeof localStorage === 'undefined') return 'vi';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' && ENGLISH_READY ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}
