import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ADMIN_HISTORY,
  ADMIN_PERSONS,
  ADMIN_ROLES,
  AUDIT_LOGS,
  AUDIT_SUMMARY,
  INTERNAL_STAFF,
  MOMO_CONFIG,
  PAYMENT_GATEWAYS,
  SYSTEM_SETTINGS
} from '../../../core/data/mock/system.mock';
import {
  AdminHistoryEntry,
  AdminPerson,
  AdminRoleCode,
  AuditLog,
  AuditSummary,
  InternalStaff,
  MomoGatewayConfig,
  PaymentGateway,
  RoleChangeResult,
  SettingsParameters,
  SystemSettings
} from '../models/system.models';
import { SystemStore } from './system.store';

/**
 * TODO(pre-deploy): Nhớ thay `SystemDemoService` bằng implementation gọi API admin
 * (`/admin/system/admins`, `/admin/system/audit-logs`, `/admin/system/settings`) và xóa
 * `core/data/mock/system.mock.ts`.
 *
 * Trong bản demo, mã OTP `123456` được chấp nhận; mọi mã khác trả lỗi để kiểm tra trạng thái xác thực.
 */
@Injectable({ providedIn: 'root' })
export class SystemDemoService implements SystemStore {
  private readonly router = inject(Router);
  private readonly adminState = signal<readonly AdminPerson[]>(ADMIN_PERSONS);
  private readonly candidateState = signal<readonly InternalStaff[]>(INTERNAL_STAFF);
  private readonly historyState = signal<readonly AdminHistoryEntry[]>(ADMIN_HISTORY);
  private readonly settingsState = signal<SystemSettings>(structuredClone(SYSTEM_SETTINGS));
  private readonly gatewayState = signal<readonly PaymentGateway[]>(structuredClone(PAYMENT_GATEWAYS));
  private readonly momoState = signal<MomoGatewayConfig>(structuredClone(MOMO_CONFIG));
  private readonly integrityState = signal<'verified' | 'broken'>(AUDIT_SUMMARY.integrity);

  readonly admins = this.adminState.asReadonly();
  readonly candidates = this.candidateState.asReadonly();
  readonly roles = ADMIN_ROLES;
  readonly auditLogs = signal<readonly AuditLog[]>(AUDIT_LOGS).asReadonly();
  readonly history = this.historyState.asReadonly();
  readonly settings = this.settingsState.asReadonly();
  readonly gateways = this.gatewayState.asReadonly();
  readonly momoConfig = this.momoState.asReadonly();
  readonly defaultParameters: SettingsParameters = structuredClone(SYSTEM_SETTINGS.parameters);

  readonly auditSummary = computed<AuditSummary>(() => ({
    ...AUDIT_SUMMARY,
    integrity: this.integrityState(),
    activeAdmins: this.adminState().filter((item) => item.status !== 'unverified').length
  }));

  assignRole(id: string, role: AdminRoleCode, reason: string, otp: string): RoleChangeResult {
    const check = this.verify(otp, reason);
    if (!check.ok) return check;
    const staff = this.candidateState().find((item) => item.id === id);
    if (!staff) return { ok: false, message: 'Không tìm thấy nhân sự nội bộ.' };

    const existing = this.adminState().find((item) => item.email === staff.email);
    const person: AdminPerson = existing ?? {
      id: `AD-2026-${String(this.adminState().length + 1).padStart(3, '0')}`,
      code: `AD-2026-${String(this.adminState().length + 1).padStart(3, '0')}`,
      name: staff.name,
      email: staff.email,
      role,
      twoFactor: 'inactive',
      lastLoginAt: 'Chưa đăng nhập',
      lastLoginDevice: '—',
      status: 'active'
    };
    this.adminState.update((items) => existing
      ? items.map((item) => item.id === existing.id ? { ...item, role } : item)
      : [...items, person]);
    this.candidateState.update((items) => items.filter((item) => item.id !== id));
    this.pushHistory({
      action: 'Phân bổ vai trò',
      change: `Chưa có vai trò → ${role}`,
      person,
      reason
    });
    return { ok: true, message: `Đã phân bổ vai trò ${role} cho ${person.name}.` };
  }

  changeRole(id: string, role: AdminRoleCode, reason: string, otp: string): RoleChangeResult {
    const check = this.verify(otp, reason);
    if (!check.ok) return check;
    const person = this.find(id);
    if (!person) return { ok: false, message: 'Không tìm thấy nhân sự quản trị.' };
    if (person.role === role) return { ok: false, message: 'Vai trò mới trùng với vai trò hiện tại.' };

    this.adminState.update((items) => items.map((item) => item.id === id ? { ...item, role } : item));
    this.pushHistory({
      action: 'Thay đổi vai trò',
      change: `${person.role} → ${role}`,
      person,
      reason
    });
    return { ok: true, message: `Đã đổi vai trò của ${person.name} sang ${role}.` };
  }

  setAccountLocked(id: string, locked: boolean, reason: string, otp: string): RoleChangeResult {
    const check = this.verify(otp, reason);
    if (!check.ok) return check;
    const person = this.find(id);
    if (!person) return { ok: false, message: 'Không tìm thấy nhân sự quản trị.' };

    this.adminState.update((items) => items.map((item) => item.id === id
      ? { ...item, status: locked ? 'locked' : 'active' }
      : item));
    this.pushHistory({
      action: locked ? 'Khóa tài khoản' : 'Mở khóa tài khoản',
      change: locked ? 'Hoạt động → Tạm khóa' : 'Tạm khóa → Hoạt động',
      person,
      reason
    });
    return { ok: true, message: locked ? `Đã khóa tài khoản ${person.name}.` : `Đã mở khóa tài khoản ${person.name}.` };
  }

  resetTwoFactor(id: string, reason: string, otp: string): RoleChangeResult {
    const check = this.verify(otp, reason);
    if (!check.ok) return check;
    const person = this.find(id);
    if (!person) return { ok: false, message: 'Không tìm thấy nhân sự quản trị.' };

    this.adminState.update((items) => items.map((item) => item.id === id ? { ...item, twoFactor: 'inactive' } : item));
    this.pushHistory({
      action: 'Đặt lại 2FA',
      change: 'Đã kích hoạt → Chờ thiết lập',
      person,
      reason
    });
    return { ok: true, message: `Đã đặt lại 2FA cho ${person.name}.` };
  }

  updateSettings(next: SystemSettings, otp: string): RoleChangeResult {
    if (otp !== '123456') {
      return { ok: false, message: 'Mã xác thực sai hoặc đã hết hạn (30 giây). Vui lòng nhập mã mới.' };
    }
    // TODO(pre-deploy): Nhớ xóa mô phỏng lỗi lưu khi nối API thật.
    if (this.router.parseUrl(this.router.url).queryParamMap.get('saveError') === '1') {
      return {
        ok: false,
        serverError: true,
        message: 'Kết nối máy chủ bị gián đoạn. Các thay đổi chưa lưu vẫn được giữ nguyên để bạn thử lại.'
      };
    }
    this.settingsState.set(structuredClone(next));
    return { ok: true, message: 'Đã lưu cấu hình thành công' };
  }

  setMaintenance(enabled: boolean): void {
    this.settingsState.update((current) => ({
      ...current,
      maintenance: { ...current.maintenance, enabled }
    }));
  }

  updateMomoConfig(config: MomoGatewayConfig): void {
    this.momoState.set(structuredClone(config));
    this.gatewayState.update((items) => items.map((item) => item.id === 'momo'
      ? { ...item, environment: config.environment, status: config.active ? 'healthy' : 'down', statusLabel: config.active ? 'Hoạt động  ·  Kết nối ổn định' : 'Tạm ngưng  ·  Đã tắt tại trang thanh toán' }
      : item));
  }

  setGatewayStatus(id: string, status: PaymentGateway['status'], statusLabel: string): void {
    this.gatewayState.update((items) => items.map((item) => item.id === id ? { ...item, status, statusLabel } : item));
  }

  private verify(otp: string, reason: string): RoleChangeResult {
    if (reason.trim().length < 10) {
      return { ok: false, message: 'Lý do phải có tối thiểu 10 ký tự sau khi bỏ khoảng trắng thừa.' };
    }
    if (otp !== '123456') {
      return { ok: false, message: 'Mã xác thực sai hoặc đã hết hạn (30 giây). Vui lòng nhập mã mới.' };
    }
    return { ok: true, message: '' };
  }

  private find(id: string): AdminPerson | undefined {
    return this.adminState().find((item) => item.id === id);
  }

  private pushHistory(input: {
    action: string;
    change: string;
    person: AdminPerson;
    reason: string;
  }): void {
    const entry: AdminHistoryEntry = {
      id: `AUD-20261103-${String(this.historyState().length + 925).padStart(5, '0')}`,
      at: '03/11/2026 · 09:00:24',
      actor: 'Lê Hoàng Nam',
      actorRole: 'Super Admin · AD-2026-001',
      action: input.action,
      change: input.change,
      targetName: input.person.name,
      targetEmail: input.person.email,
      ip: '192.168.1.12',
      reason: input.reason,
      before: input.change.split(' → ')[0],
      after: input.change.split(' → ')[1]
    };
    this.historyState.update((items) => [entry, ...items]);
  }
}
