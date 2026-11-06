/** P2 — Admin preferences shared between the settings modal and the layout. */

export type AdminTheme = 'light' | 'dark';
export type AdminDensity = 'compact' | 'standard' | 'comfortable';

export interface AdminPreferences {
  breadcrumbsVisible: boolean;
  timezone: string;
  statusBarEnabled: boolean;
  theme: AdminTheme;
  density: AdminDensity;
}

/** Defaults preserve the pre-P2 layout: no breadcrumb, no status bar, light, standard. */
export const DEFAULT_ADMIN_PREFERENCES: AdminPreferences = {
  breadcrumbsVisible: false,
  timezone: 'Asia/Ho_Chi_Minh',
  statusBarEnabled: false,
  theme: 'light',
  density: 'standard'
};

export interface AdminPreferencesSnapshot {
  preferences: AdminPreferences;
  revision: number;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface AdminPreferencesResponse extends AdminPreferencesSnapshot {
  success: boolean;
}

export interface AdminPreferencesSaveRequest {
  preferences: AdminPreferences;
  revision: number;
}
