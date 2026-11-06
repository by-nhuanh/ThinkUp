import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'thinkup_admin_notification_sound';

/**
 * P8 — notification chime, synthesized with Web Audio (no asset, no dependency).
 *
 * Browsers only allow audio after a user gesture, so the context is created and
 * resumed by `unlock()` (wired to the first pointer/key event in the layout).
 * When the browser still reports a suspended context, `play()` stays silent
 * instead of forcing audio — the setting never bypasses autoplay policy.
 */
@Injectable({ providedIn: 'root' })
export class AdminNotificationSoundService {
  private readonly state = signal(readStoredEnabled());
  private context: AudioContext | null = null;

  readonly enabled = this.state.asReadonly();

  setEnabled(enabled: boolean): void {
    this.state.set(enabled);
    if (enabled) this.unlock();
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Storage can be unavailable; the in-memory value still applies.
    }
  }

  /** Called from a real user gesture; safe to call repeatedly. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    const context = this.ensureContext();
    if (context?.state === 'suspended') void context.resume();
  }

  /** Test button and new-notification chime share the same sound. */
  play(): void {
    if (!this.enabled()) return;
    const context = this.ensureContext();
    if (!context || context.state !== 'running') return;

    const now = context.currentTime;
    this.tone(context, 880, now, 0.12);
    this.tone(context, 1174.66, now + 0.13, 0.16);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.context;
  }

  private tone(context: AudioContext, frequency: number, start: number, duration: number): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

function readStoredEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}
