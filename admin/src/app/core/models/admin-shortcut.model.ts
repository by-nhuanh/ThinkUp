/** P10 — shortcut actions that genuinely exist in the admin shell. */

export type AdminShortcutAction = 'dock-top' | 'dock-right' | 'dock-bottom' | 'dock-left';

export interface AdminShortcutDefinition {
  action: AdminShortcutAction;
  label: string;
  chord: string;
}

/**
 * Mirrors the keys already handled by the toolbar drag handle. Customization is
 * opt-in; when disabled nothing is registered globally.
 */
export const DEFAULT_SHORTCUTS: ReadonlyArray<AdminShortcutDefinition> = [
  { action: 'dock-top', label: 'Neo thanh tiện ích lên trên', chord: 'Alt+ArrowUp' },
  { action: 'dock-right', label: 'Neo thanh tiện ích sang phải', chord: 'Alt+ArrowRight' },
  { action: 'dock-bottom', label: 'Neo thanh tiện ích xuống dưới', chord: 'Alt+ArrowDown' },
  { action: 'dock-left', label: 'Neo thanh tiện ích sang trái', chord: 'Alt+ArrowLeft' }
];

/** Chords the browser, OS or IME needs; they can never be assigned. */
const RESERVED_KEYS = new Set(['Escape', 'Tab', 'Enter', ' ', 'F5', 'F11', 'F12']);

export function chordFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  parts.push(event.key);
  return parts.join('+');
}

export function shortcutBlockReason(chord: string): string | null {
  const parts = chord.split('+');
  const key = parts[parts.length - 1];
  if (RESERVED_KEYS.has(key)) return 'Tổ hợp này do trình duyệt hoặc hộp thoại sử dụng.';
  if (parts.includes('Ctrl') || parts.includes('Meta')) return 'Không dùng Ctrl/Cmd để tránh trùng phím hệ thống.';
  if (!parts.includes('Alt')) return 'Cần giữ Alt để tránh chiếm phím khi đang nhập liệu.';
  return null;
}
