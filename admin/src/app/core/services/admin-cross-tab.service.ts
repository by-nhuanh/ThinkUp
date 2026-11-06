import { Injectable, NgZone, inject } from '@angular/core';

export type AdminCrossTabMessage =
  | { type: 'preferences-updated'; adminId: string; revisions: number; preferences: unknown }
  | { type: 'notifications-changed'; adminId: string; reason: 'read' | 'read-all' | 'received' };

type Envelope = AdminCrossTabMessage & { nonce: string };

const CHANNEL_NAME = 'thinkup-admin-sync';
const STORAGE_KEY = 'thinkup_admin_sync';

/**
 * P2/P3 — cross-tab fan-out.
 *
 * BroadcastChannel is used when available; a `storage` event is kept as the
 * fallback for browsers or embedded contexts without BroadcastChannel.
 * Messages are scoped by admin id so a different admin session in another tab
 * never leaks preferences or notification state.
 */
@Injectable({ providedIn: 'root' })
export class AdminCrossTabService {
  private readonly zone = inject(NgZone);
  private readonly listeners = new Set<(message: AdminCrossTabMessage) => void>();
  private readonly channel: BroadcastChannel | null = createChannel();
  private readonly tabId = Math.random().toString(36).slice(2);

  constructor() {
    if (typeof window === 'undefined') return;

    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<Envelope>) => this.deliver(event.data);
    }

    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        this.deliver(JSON.parse(event.newValue) as Envelope);
      } catch {
        // Ignore malformed payloads written by other tooling.
      }
    });
  }

  publish(message: AdminCrossTabMessage): void {
    const envelope: Envelope = { ...message, nonce: `${this.tabId}-${Date.now()}-${Math.random()}` };
    try {
      this.channel?.postMessage(envelope);
    } catch {
      // BroadcastChannel can be closed by the platform; storage still fans out.
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Storage can be unavailable in private mode; the channel already handled it.
      }
    }
  }

  subscribe(listener: (message: AdminCrossTabMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private deliver(envelope: Envelope | null): void {
    if (!envelope || !envelope.type || !envelope.adminId) return;
    if (envelope.nonce?.startsWith(`${this.tabId}-`)) return;
    this.zone.run(() => {
      for (const listener of this.listeners) {
        try {
          listener(envelope);
        } catch {
          // A broken listener must not interrupt the others.
        }
      }
    });
  }
}

function createChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}
