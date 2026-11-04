import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminPreferences,
  AdminPreferencesResponse,
  AdminPreferencesSaveRequest,
  AdminPreferencesSnapshot,
  DEFAULT_ADMIN_PREFERENCES
} from '../models/admin-preferences.model';
import { AdminAuthService } from './admin-auth.service';
import { AdminCrossTabService } from './admin-cross-tab.service';

const DEMO_STORAGE_PREFIX = 'thinkup_admin_preferences_demo:';
const CACHE_TTL_MS = 60_000;

export interface AdminPreferencesError extends Error {
  status: number;
  code: string;
  current?: AdminPreferencesSnapshot;
}

interface CacheEntry {
  snapshot: AdminPreferencesSnapshot;
  at: number;
}

/**
 * P2 — Preferences state.
 *
 * `saved` mirrors the server (or the demo storage adapter); `applied` is what the
 * layout currently renders. The settings modal previews into `applied` and only
 * commits to `saved` on Save, so Cancel restores the last persisted snapshot.
 */
@Injectable({ providedIn: 'root' })
export class AdminPreferencesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly crossTab = inject(AdminCrossTabService);
  private readonly apiUrl = `${environment.apiUrl}/admin/preferences`;
  private readonly cache = new Map<string, CacheEntry>();

  private readonly appliedState = signal<AdminPreferences>({ ...DEFAULT_ADMIN_PREFERENCES });
  private readonly savedState = signal<AdminPreferences>({ ...DEFAULT_ADMIN_PREFERENCES });
  private readonly revisionState = signal(0);
  private readonly loadingState = signal(false);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly loadedForState = signal<string | null>(null);

  readonly applied = this.appliedState.asReadonly();
  readonly saved = this.savedState.asReadonly();
  readonly revision = this.revisionState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly saving = this.savingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly loadedFor = this.loadedForState.asReadonly();
  readonly isDefault = computed(() => this.revisionState() === 0);

  constructor() {
    this.crossTab.subscribe((message) => {
      if (message.type !== 'preferences-updated') return;
      const adminId = this.adminId();
      if (!adminId || message.adminId !== adminId) return;
      const preferences = normalizeClientPreferences(message.preferences);
      const snapshot: AdminPreferencesSnapshot = {
        preferences,
        revision: message.revisions,
        isDefault: message.revisions === 0,
        updatedAt: null
      };
      this.cache.set(adminId, { snapshot, at: Date.now() });
      this.commit(snapshot, false);
    });
  }

  /** Loads preferences for the signed-in admin, using a short per-admin cache. */
  load(force = false): Observable<AdminPreferencesSnapshot> {
    const adminId = this.adminId();
    if (!adminId) {
      this.loadedForState.set(null);
      return of(this.snapshot());
    }
    if (!force && this.loadedForState() === adminId) {
      return of(this.snapshot());
    }
    const cached = this.cache.get(adminId);
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      this.commit(cached.snapshot, false);
      return of(cached.snapshot);
    }

    this.loadingState.set(true);
    this.errorState.set(null);

    const request = this.isDemoMode()
      ? of(readDemoSnapshot(adminId))
      : this.http.get<AdminPreferencesResponse>(this.apiUrl).pipe(
        catchError((error: unknown) => throwError(() => this.normalizeError(error)))
      );

    return request.pipe(
      tap({
        next: (response) => {
          const snapshot = toSnapshot(response);
          this.cache.set(adminId, { snapshot, at: Date.now() });
          this.commit(snapshot, false);
          this.loadingState.set(false);
        },
        error: (error: AdminPreferencesError) => {
          this.loadingState.set(false);
          this.errorState.set(error.message);
        }
      })
    );
  }

  /** Persists the draft against the last known revision. */
  save(preferences: AdminPreferences): Observable<AdminPreferencesSnapshot> {
    const adminId = this.adminId();
    if (!adminId) {
      return throwError(() => this.buildError('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 401, 'NO_SESSION'));
    }
    const body: AdminPreferencesSaveRequest = {
      preferences: normalizeClientPreferences(preferences),
      revision: this.revisionState()
    };

    this.savingState.set(true);
    this.errorState.set(null);

    const request = this.isDemoMode()
      ? demoWrite(adminId, body)
      : this.http.put<AdminPreferencesResponse>(this.apiUrl, body).pipe(
        catchError((error: unknown) => throwError(() => this.normalizeError(error)))
      );

    return request.pipe(
      tap({
        next: (response) => {
          const snapshot = toSnapshot(response);
          this.cache.set(adminId, { snapshot, at: Date.now() });
          this.commit(snapshot, true);
          this.savingState.set(false);
        },
        error: (error: AdminPreferencesError) => {
          this.savingState.set(false);
          this.errorState.set(error.message);
          if (error.current) {
            this.cache.set(adminId, { snapshot: error.current, at: Date.now() });
            this.savedState.set(error.current.preferences);
            this.revisionState.set(error.current.revision);
          }
        }
      })
    );
  }

  /** Live preview used by the settings modal (theme, density, status bar). */
  preview(preferences: AdminPreferences): void {
    this.appliedState.set(normalizeClientPreferences(preferences));
  }

  /** Discards the preview and restores the last persisted state. */
  cancelPreview(): void {
    this.appliedState.set({ ...this.savedState() });
  }

  /** Opens the modal with the persisted state, ignoring a stale preview. */
  beginEditing(): void {
    this.appliedState.set({ ...this.savedState() });
  }

  snapshot(): AdminPreferencesSnapshot {
    return {
      preferences: { ...this.savedState() },
      revision: this.revisionState(),
      isDefault: this.revisionState() === 0,
      updatedAt: null
    };
  }

  private commit(snapshot: AdminPreferencesSnapshot, broadcast: boolean): void {
    this.savedState.set(snapshot.preferences);
    this.appliedState.set(snapshot.preferences);
    this.revisionState.set(snapshot.revision);
    this.loadedForState.set(this.adminId());

    if (broadcast) {
      const adminId = this.adminId();
      if (adminId) {
        this.crossTab.publish({
          type: 'preferences-updated',
          adminId,
          revisions: snapshot.revision,
          preferences: snapshot.preferences
        });
      }
    }
  }

  private isDemoMode(): boolean {
    return environment.adminDemoLogin || this.auth.getToken() === 'demo-local-access-token';
  }

  private adminId(): string | null {
    return this.auth.currentUser()?.id ?? null;
  }

  private normalizeError(error: unknown): AdminPreferencesError {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as {
        message?: string;
        code?: string;
        current?: AdminPreferencesResponse;
      } | null;
      const normalized = this.buildError(
        body?.message || (error.status === 0
          ? 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền.'
          : 'Không lưu được tuỳ chọn. Vui lòng thử lại.'),
        error.status,
        body?.code || 'PREFERENCES_REQUEST_FAILED'
      );
      if (body?.current) normalized.current = toSnapshot(body.current);
      return normalized;
    }
    return error as AdminPreferencesError;
  }

  private buildError(message: string, status: number, code: string): AdminPreferencesError {
    const error = new Error(message) as AdminPreferencesError;
    error.status = status;
    error.code = code;
    return error;
  }
}

function toSnapshot(response: AdminPreferencesResponse | AdminPreferencesSnapshot): AdminPreferencesSnapshot {
  return {
    preferences: normalizeClientPreferences(response.preferences),
    revision: Number.isSafeInteger(response.revision) ? response.revision : 0,
    isDefault: Boolean(response.isDefault),
    updatedAt: response.updatedAt ?? null
  };
}

function normalizeClientPreferences(value: unknown): AdminPreferences {
  const source = (value || {}) as Partial<AdminPreferences>;
  return {
    breadcrumbsVisible: source.breadcrumbsVisible === true,
    timezone: typeof source.timezone === 'string' && source.timezone.trim()
      ? source.timezone.trim()
      : DEFAULT_ADMIN_PREFERENCES.timezone,
    statusBarEnabled: source.statusBarEnabled === true,
    theme: source.theme === 'dark' ? 'dark' : 'light',
    density: source.density === 'compact' || source.density === 'comfortable'
      ? source.density
      : 'standard'
  };
}

function demoKey(adminId: string): string {
  return `${DEMO_STORAGE_PREFIX}${adminId}`;
}

function readDemoSnapshot(adminId: string): AdminPreferencesSnapshot {
  if (typeof localStorage === 'undefined') return defaultSnapshot();
  try {
    const raw = localStorage.getItem(demoKey(adminId));
    if (!raw) return defaultSnapshot();
    return toSnapshot(JSON.parse(raw) as AdminPreferencesResponse);
  } catch {
    return defaultSnapshot();
  }
}

function defaultSnapshot(): AdminPreferencesSnapshot {
  return {
    preferences: { ...DEFAULT_ADMIN_PREFERENCES },
    revision: 0,
    isDefault: true,
    updatedAt: null
  };
}

function demoWrite(adminId: string, body: AdminPreferencesSaveRequest): Observable<AdminPreferencesSnapshot> {
  const current = readDemoSnapshot(adminId);
  if (body.revision !== current.revision) {
    const error = new Error('Tuỳ chọn đã được thay đổi ở phiên khác. Vui lòng tải lại.') as AdminPreferencesError;
    error.status = 409;
    error.code = 'PREFERENCES_CONFLICT';
    error.current = current;
    return throwError(() => error);
  }
  const snapshot: AdminPreferencesSnapshot = {
    preferences: normalizeClientPreferences(body.preferences),
    revision: current.revision + 1,
    isDefault: false,
    updatedAt: new Date().toISOString()
  };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(demoKey(adminId), JSON.stringify({ success: true, ...snapshot }));
  }
  return of(snapshot);
}
