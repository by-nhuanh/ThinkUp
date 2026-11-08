export type AdminRoleCode = 'SA' | 'CA' | 'FA' | 'CS';

export type AdminAccountStatus = 'active' | 'locked' | 'unverified';

export type TwoFactorStatus = 'active' | 'inactive';

export interface AdminRoleDefinition {
  code: AdminRoleCode;
  label: string;
  shortLabel: string;
  tagline: string;
  responsibility: string;
  scopes: readonly string[];
  warning?: string;
}

/** Nhân sự nội bộ chưa có vai trò quản trị — ứng viên cho luồng phân bổ vai trò. */
export interface InternalStaff {
  id: string;
  name: string;
  email: string;
}

export interface AdminPerson {
  id: string;
  code: string;
  name: string;
  email: string;
  role: AdminRoleCode;
  twoFactor: TwoFactorStatus;
  lastLoginAt: string;
  lastLoginDevice: string;
  status: AdminAccountStatus;
  isSelf?: boolean;
}

export interface AdminHistoryEntry {
  id: string;
  at: string;
  actor: string;
  actorRole: string;
  action: string;
  change: string;
  targetName: string;
  targetEmail: string;
  ip: string;
  reason?: string;
  before?: string;
  after?: string;
}

export type AuditRisk = 'normal' | 'attention' | 'high';

export type AuditOutcome = 'success' | 'failed';

export interface AuditLog {
  id: string;
  at: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  actorInitials: string;
  module: string;
  action: string;
  outcome: AuditOutcome;
  targetId: string;
  targetName: string;
  targetMeta: string;
  ip: string;
  location: string;
  device: string;
  risk: AuditRisk;
  sessionId: string;
  basis: string;
  evidenceName: string;
  before: ReadonlyArray<{ label: string; value: string }>;
  after: ReadonlyArray<{ label: string; value: string }>;
  checksum: string;
}

export interface AuditSummary {
  totalToday: number;
  totalDelta: string;
  highRisk: number;
  activeAdmins: number;
  onlineAdmins: number;
  integrity: 'verified' | 'broken';
}

export type GatewayStatus = 'healthy' | 'down' | 'testing';

export interface PaymentGateway {
  id: string;
  code: string;
  name: string;
  description: string;
  environment: 'production' | 'sandbox';
  status: GatewayStatus;
  statusLabel: string;
}

export interface SettingsGeneral {
  siteName: string;
  timezone: string;
  language: string;
  hotline: string;
  address: string;
}

export interface SettingsParameters {
  taxThreshold: number;
  taxRate: number;
  superAdminThreshold: number;
  paymentTimeout: number;
  ordersPerPage: number;
  courseReviewHours: number;
  sMatchThreshold: number;
  minCoursesPerMilestone: number;
  testPassScore: number;
  studentLockReasonMin: number;
  lecturerDisciplineReasonMin: number;
  courseRejectReasonMin: number;
}

export interface SocialKeys {
  googleClientId: string;
  googleClientSecret: string;
  facebookClientId: string;
  facebookClientSecret: string;
  appleClientId: string;
  appleClientSecret: string;
  recaptchaSiteKey: string;
  recaptchaSecretKey: string;
}

export interface TrackingSettings {
  ga4Id: string;
  pixelId: string;
  gtmScript: string;
}

export interface MessagingSettings {
  senderName: string;
  systemEmail: string;
  replyEmail: string;
  servicePassword: string;
  lecturerContractTemplate: string;
  adminGrantTemplate: string;
  otpExpiryMinutes: number;
}

export interface StorageSettings {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SigningSettings {
  provider: string;
  serial: string;
  expiresAt: string;
  clientId: string;
  secret: string;
  maxSignDays: number;
  legalEmail: string;
  autoSendCopy: boolean;
}

export interface MaintenanceSettings {
  enabled: boolean;
  alertEmails: readonly string[];
  alertPhones: readonly string[];
}

export interface SystemSettings {
  general: SettingsGeneral;
  parameters: SettingsParameters;
  social: SocialKeys;
  tracking: TrackingSettings;
  messaging: MessagingSettings;
  storage: StorageSettings;
  signing: SigningSettings;
  maintenance: MaintenanceSettings;
}

export interface MomoGatewayConfig {
  environment: 'sandbox' | 'production';
  businessCode: string;
  publicKey: string;
  secretKey: string;
  timeoutSeconds: number;
  active: boolean;
}

export type TestState = 'idle' | 'running' | 'success' | 'failure';

export interface RoleChangeResult {
  ok: boolean;
  message: string;
  locked?: boolean;
  serverError?: boolean;
}
