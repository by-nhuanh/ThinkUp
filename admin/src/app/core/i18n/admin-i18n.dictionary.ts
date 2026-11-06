/**
 * P9 — typed dictionary. Vietnamese is the default and must stay byte-identical
 * to the current UI. English is only exposed when every admin screen is migrated;
 * `ENGLISH_READY` is the coverage gate, not a per-key fallback switch.
 */
export const VI_DICTIONARY = {
  'statusBar.ariaLabel': 'Thanh trạng thái quản trị',
  'statusBar.online': 'Trực tuyến',
  'statusBar.offline': 'Ngoại tuyến',
  'statusBar.environment': 'Môi trường',
  'settings.language': 'Ngôn ngữ',
  'settings.languageHint': 'Tiếng Anh chỉ bật khi toàn bộ màn hình quản trị đã được dịch.',
  'settings.languageVi': 'Tiếng Việt',
  'settings.languageEn': 'English'
} as const;

export type AdminMessageKey = keyof typeof VI_DICTIONARY;

export const EN_DICTIONARY: Record<AdminMessageKey, string> = {
  'statusBar.ariaLabel': 'Admin status bar',
  'statusBar.online': 'Online',
  'statusBar.offline': 'Offline',
  'statusBar.environment': 'Environment',
  'settings.language': 'Language',
  'settings.languageHint': 'English turns on only after every admin screen is translated.',
  'settings.languageVi': 'Vietnamese',
  'settings.languageEn': 'English'
};

/**
 * English stays off until coverage is 100% across admin screens, as required by
 * the P9 acceptance criteria. Flip this only with the final translation pass.
 */
export const ENGLISH_READY = false;
