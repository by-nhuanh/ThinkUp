import { InjectionToken, Signal } from '@angular/core';
import {
  AdminHistoryEntry,
  AdminPerson,
  AdminRoleCode,
  AdminRoleDefinition,
  AuditLog,
  AuditSummary,
  InternalStaff,
  MomoGatewayConfig,
  PaymentGateway,
  RoleChangeResult,
  SettingsParameters,
  SystemSettings
} from '../models/system.models';

export interface SystemStore {
  readonly admins: Signal<readonly AdminPerson[]>;
  readonly candidates: Signal<readonly InternalStaff[]>;
  readonly roles: readonly AdminRoleDefinition[];
  readonly auditLogs: Signal<readonly AuditLog[]>;
  readonly auditSummary: Signal<AuditSummary>;
  readonly history: Signal<readonly AdminHistoryEntry[]>;
  readonly settings: Signal<SystemSettings>;
  readonly gateways: Signal<readonly PaymentGateway[]>;
  readonly momoConfig: Signal<MomoGatewayConfig>;
  readonly defaultParameters: SettingsParameters;

  assignRole(id: string, role: AdminRoleCode, reason: string, otp: string): RoleChangeResult;
  changeRole(id: string, role: AdminRoleCode, reason: string, otp: string): RoleChangeResult;
  setAccountLocked(id: string, locked: boolean, reason: string, otp: string): RoleChangeResult;
  resetTwoFactor(id: string, reason: string, otp: string): RoleChangeResult;
  updateSettings(next: SystemSettings, otp: string): RoleChangeResult;
  setMaintenance(enabled: boolean): void;
  updateMomoConfig(config: MomoGatewayConfig): void;
  setGatewayStatus(id: string, status: PaymentGateway['status'], statusLabel: string): void;
}

export const SYSTEM_STORE = new InjectionToken<SystemStore>('SYSTEM_STORE');
