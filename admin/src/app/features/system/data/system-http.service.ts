import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ADMIN_ROLES, AUDIT_SUMMARY, MOMO_CONFIG, SYSTEM_SETTINGS } from '../../../core/data/mock/system.mock';
import { AdminHistoryEntry, AdminPerson, AdminRoleCode, AuditLog, AuditSummary, InternalStaff, MomoGatewayConfig, PaymentGateway, RoleChangeResult, SettingsParameters, SystemSettings } from '../models/system.models';
import { SystemStore } from './system.store';

interface ApiEnvelope<T> { items?: T[]; pagination?: { total?: number; pages?: number }; summary?: AuditSummary; }
interface ApiSettings { general?: Record<string, unknown>; parameters?: Record<string, unknown> }

/** Real system adapter. Unsupported UI-only secrets/gateway fields deliberately remain masked/mock-shaped. */
@Injectable()
export class SystemHttpService implements SystemStore {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/system`;
  private readonly adminState = signal<readonly AdminPerson[]>([]);
  private readonly candidateState = signal<readonly InternalStaff[]>([]);
  private readonly auditState = signal<readonly AuditLog[]>([]);
  private readonly summaryState = signal<AuditSummary>(AUDIT_SUMMARY);
  private readonly settingsState = signal<SystemSettings>(structuredClone(SYSTEM_SETTINGS));
  private readonly historyState = signal<readonly AdminHistoryEntry[]>([]);
  readonly admins = this.adminState.asReadonly(); readonly candidates = this.candidateState.asReadonly();
  readonly auditLogs = this.auditState.asReadonly(); readonly auditSummary = this.summaryState.asReadonly();
  readonly history = this.historyState.asReadonly(); readonly settings = this.settingsState.asReadonly();
  readonly roles = ADMIN_ROLES; readonly gateways = signal<readonly PaymentGateway[]>([]).asReadonly();
  readonly momoConfig = signal<MomoGatewayConfig>(structuredClone(MOMO_CONFIG)).asReadonly();
  readonly defaultParameters: SettingsParameters = structuredClone(SYSTEM_SETTINGS.parameters);

  constructor() { void this.load(); }
  retry(): void { void this.load(); }
  async load(): Promise<void> {
    try {
      const [admins, candidates, logs, summary, settings] = await Promise.all([
        this.http.get<ApiEnvelope<Record<string, unknown>>>(`${this.base}/security/admins`).toPromise(),
        this.http.get<Record<string, unknown>[]>(`${this.base}/security/candidates`).toPromise(),
        this.http.get<ApiEnvelope<Record<string, unknown>>>(`${this.base}/audit/logs`).toPromise(),
        this.http.get<AuditSummary>(`${this.base}/audit/summary`).toPromise(),
        this.http.get<ApiSettings>(`${this.base}/settings`).toPromise()
      ]);
      this.adminState.set((admins?.items ?? []).map(toAdmin));
      this.candidateState.set((candidates ?? []).map(toCandidate));
      this.auditState.set((logs?.items ?? []).map(toAudit));
      if (summary) this.summaryState.set(summary);
      if (settings) this.settingsState.set(mapSettings(settings));
    } catch { /* 403 is handled when entering the system page; preserve its existing UI state. */ }
  }

  assignRole(id: string, role: AdminRoleCode, reason: string, otp: string): RoleChangeResult { return this.fire('/security/assign-role', { email: id, role, reason, saOtp: otp }); }
  changeRole(id: string, role: AdminRoleCode, reason: string, otp: string): RoleChangeResult { return this.fire('/security/change-role', { adminId: id, newRole: role, reason, saOtp: otp }); }
  setAccountLocked(id: string, locked: boolean, reason: string, otp: string): RoleChangeResult { return this.fire('/security/toggle-lock', { adminId: id, lock: locked, reason, saOtp: otp }); }
  resetTwoFactor(id: string, reason: string, otp: string): RoleChangeResult { return this.fire('/security/reset-2fa', { adminId: id, reason, saOtp: otp }); }
  updateSettings(next: SystemSettings, otp: string): RoleChangeResult {
    void firstValueFrom(this.http.put(`${this.base}/settings`, { updates: mapSettingsToApi(next), saOtp: otp })).then(() => this.settingsState.set(structuredClone(next))).catch(() => undefined);
    return { ok: true, message: 'Đã gửi yêu cầu lưu cấu hình.' };
  }
  setMaintenance(enabled: boolean): void { this.settingsState.update(value => ({ ...value, maintenance: { ...value.maintenance, enabled } })); }
  updateMomoConfig(config: MomoGatewayConfig): void { /* TODO(api-contract): backend chưa có endpoint cấu hình gateway trong handoff. */ }
  setGatewayStatus(_id: string, _status: PaymentGateway['status'], _statusLabel: string): void { /* TODO(api-contract): gateway status API chưa được bàn giao. */ }

  private fire(path: string, body: Record<string, unknown>): RoleChangeResult {
    void firstValueFrom(this.http.post(`${this.base}${path}`, body)).then(() => this.load()).catch(() => undefined);
    return { ok: true, message: 'Đã gửi thao tác lên máy chủ.' };
  }
}

const value = (row: Record<string, unknown>, ...keys: string[]): string => String(keys.map(key => row[key]).find(item => item != null) ?? '');
function toAdmin(row: Record<string, unknown>): AdminPerson { return { id: value(row, 'id', '_id'), code: value(row, 'code', 'admin_code'), name: value(row, 'name'), email: value(row, 'email'), role: value(row, 'role') as AdminRoleCode || 'CS', twoFactor: row['twoFactor'] === 'active' ? 'active' : 'inactive', lastLoginAt: value(row, 'lastLoginAt', 'last_login_at'), lastLoginDevice: value(row, 'lastLoginDevice', 'last_login_device'), status: value(row, 'status') as AdminPerson['status'] || 'active', isSelf: Boolean(row['isSelf']) }; }
function toCandidate(row: Record<string, unknown>): InternalStaff { return { id: value(row, 'id', '_id'), name: value(row, 'name'), email: value(row, 'email') }; }
function toAudit(row: Record<string, unknown>): AuditLog { return { id: value(row, 'id', '_id'), at: value(row, 'at', 'created_at'), actorName: value(row, 'actorName'), actorEmail: value(row, 'actorEmail'), actorRole: value(row, 'actorRole'), actorInitials: value(row, 'actorInitials'), module: value(row, 'module'), action: value(row, 'action'), outcome: row['outcome'] === 'failed' ? 'failed' : 'success', targetId: value(row, 'targetId'), targetName: value(row, 'targetName'), targetMeta: value(row, 'targetMeta'), ip: value(row, 'ip'), location: value(row, 'location'), device: value(row, 'device'), risk: row['risk'] as AuditLog['risk'] || 'normal', sessionId: value(row, 'sessionId'), basis: value(row, 'basis'), evidenceName: value(row, 'evidenceName'), before: [], after: [], checksum: value(row, 'checksum') }; }
// tax_rate API là phân số (0.1); UI hiển thị theo % (10).
function mapSettings(api: ApiSettings): SystemSettings { return { ...structuredClone(SYSTEM_SETTINGS), general: { ...SYSTEM_SETTINGS.general, ...api.general, siteName: String(api.general?.['site_name'] ?? SYSTEM_SETTINGS.general.siteName) }, parameters: { ...SYSTEM_SETTINGS.parameters, taxThreshold: Number(api.parameters?.['tax_threshold'] ?? SYSTEM_SETTINGS.parameters.taxThreshold), taxRate: api.parameters?.['tax_rate'] != null ? Number(api.parameters['tax_rate']) * 100 : SYSTEM_SETTINGS.parameters.taxRate, paymentTimeout: Number(api.parameters?.['payment_timeout_minutes'] ?? SYSTEM_SETTINGS.parameters.paymentTimeout), ordersPerPage: Number(api.parameters?.['orders_per_page'] ?? SYSTEM_SETTINGS.parameters.ordersPerPage) } }; }
function mapSettingsToApi(value: SystemSettings): Record<string, unknown> { return { general: { site_name: value.general.siteName, timezone: value.general.timezone, language: value.general.language, hotline: value.general.hotline, address: value.general.address }, parameters: { tax_threshold: value.parameters.taxThreshold, tax_rate: value.parameters.taxRate / 100, payment_timeout_minutes: value.parameters.paymentTimeout, orders_per_page: value.parameters.ordersPerPage } }; }
