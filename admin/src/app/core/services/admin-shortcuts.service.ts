import { Injectable, computed, signal } from '@angular/core';
import {
  AdminShortcutAction,
  DEFAULT_SHORTCUTS,
  chordFromEvent,
  shortcutBlockReason
} from '../models/admin-shortcut.model';

const STORAGE_KEY = 'thinkup_admin_shortcuts';

type Bindings = Record<AdminShortcutAction, string>;

/**
 * P10 — opt-in custom bindings for real shell actions.
 *
 * Default off: nothing is registered globally, so existing behaviour (drag
 * handle keys, Esc closing overlays) is untouched. When enabled, the layout
 * dispatches a dock action only for a chord that passes the reserved-key and
 * conflict checks; input/IME contexts are ignored by the caller.
 */
@Injectable({ providedIn: 'root' })
export class AdminShortcutsService {
  private readonly stored = readStored();
  private readonly enabledState = signal(this.stored.enabled);
  private readonly bindingsState = signal<Bindings>(this.stored.bindings);

  readonly enabled = this.enabledState.asReadonly();
  readonly bindings = this.bindingsState.asReadonly();
  readonly definitions = DEFAULT_SHORTCUTS;
  readonly rows = computed(() =>
    DEFAULT_SHORTCUTS.map((definition) => ({
      ...definition,
      chord: this.bindingsState()[definition.action]
    }))
  );

  setEnabled(enabled: boolean): void {
    this.enabledState.set(enabled);
    this.persist();
  }

  /** Returns an error message when the chord is reserved or already used. */
  setBinding(action: AdminShortcutAction, chord: string): string | null {
    const blocked = shortcutBlockReason(chord);
    if (blocked) return blocked;
    const conflict = DEFAULT_SHORTCUTS.find(
      (definition) => definition.action !== action && this.bindingsState()[definition.action] === chord
    );
    if (conflict) return `Tổ hợp đã dùng cho “${conflict.label}”.`;
    this.bindingsState.update((bindings) => ({ ...bindings, [action]: chord }));
    this.persist();
    return null;
  }

  /** Khôi phục snapshot khi huỷ hộp thoại cài đặt (không qua kiểm tra trùng). */
  restore(enabled: boolean, bindings: Record<AdminShortcutAction, string>): void {
    this.bindingsState.set({ ...defaultBindings(), ...bindings });
    this.enabledState.set(enabled);
    this.persist();
  }

  reset(): void {
    this.bindingsState.set(defaultBindings());
    this.enabledState.set(false);
    this.persist();
  }

  actionFor(event: KeyboardEvent): AdminShortcutAction | null {
    if (!this.enabledState()) return null;
    if (event.isComposing) return null;
    const chord = chordFromEvent(event);
    const entry = DEFAULT_SHORTCUTS.find(
      (definition) => this.bindingsState()[definition.action] === chord
    );
    return entry?.action ?? null;
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: this.enabledState(),
        bindings: this.bindingsState()
      }));
    } catch {
      // Storage can be unavailable; the in-memory values still apply.
    }
  }
}

function defaultBindings(): Bindings {
  return DEFAULT_SHORTCUTS.reduce((result, definition) => {
    result[definition.action] = definition.chord;
    return result;
  }, {} as Bindings);
}

function readStored(): { enabled: boolean; bindings: Bindings } {
  const fallback = { enabled: false, bindings: defaultBindings() };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    const bindings = defaultBindings();
    for (const definition of DEFAULT_SHORTCUTS) {
      const value = parsed.bindings?.[definition.action];
      if (typeof value === 'string' && !shortcutBlockReason(value)) bindings[definition.action] = value;
    }
    return { enabled: parsed.enabled === true, bindings };
  } catch {
    return fallback;
  }
}
