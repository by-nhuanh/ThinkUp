/** P7 — frontend-only display preferences (not part of the backend preferences contract). */

export type AdminNumberFormat = 'full' | 'compact';
export type AdminPrivacyMode = 'off' | 'blur' | 'mask';

export interface AdminDisplayPreferences {
  numberFormat: AdminNumberFormat;
  privacyMode: AdminPrivacyMode;
}

/** Defaults keep the current UI: raw numbers and visible contact data. */
export const DEFAULT_ADMIN_DISPLAY_PREFERENCES: AdminDisplayPreferences = {
  numberFormat: 'full',
  privacyMode: 'off'
};