import type { AdminProfileResponse, AdminUser } from '../models/admin-user.model';

/**
 * Pure presentation helpers for the admin profile. Kept free of Angular imports
 * so the Node-based P1 unit tests can exercise them without a browser runner.
 */

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên'
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  INVITED: 'Đã mời',
  PENDING_ONBOARDING: 'Chờ kích hoạt',
  LOCKED: 'Tạm khóa',
  SUSPENDED: 'Tạm ngưng'
};

export function roleLabel(role: string | null | undefined): string {
  const key = (role || '').trim().toLowerCase();
  return ROLE_LABELS[key] ?? 'Quản trị viên';
}

export function statusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return STATUS_LABELS[status.trim().toUpperCase()] ?? null;
}

export function initials(fullName: string | null | undefined): string {
  const normalized = (fullName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim();
  if (!normalized) return 'A';

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent || '';
  if (!ua.trim()) return '';

  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Safari\//.test(ua) ? 'Safari'
            : '';

  const os = /Windows NT/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
      : /Android/.test(ua) ? 'Android'
        : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
          : /Linux/.test(ua) ? 'Linux'
            : '';

  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Thiết bị không xác định';
}

export function formatDateTime(
  value: string | null | undefined,
  timezone = 'Asia/Ho_Chi_Minh'
): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: timezone
    }).format(date);
  } catch {
    return '';
  }
}

/** Số ngày còn lại của mật khẩu, tính theo mốc thời gian truyền vào. */
export function passwordValidityLabel(
  expiresAt: string | null | undefined,
  now = Date.now()
): string {
  if (!expiresAt) return '';
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  if (!Number.isFinite(days)) return '';
  if (days <= 0) return 'Đã hết hạn';
  if (days <= 7) return `Sắp hết hạn (${days} ngày)`;
  return `Còn ${days} ngày`;
}

/** Một dòng thông tin trong bảng tóm tắt hồ sơ. */
export interface AdminProfileField {
  key: string;
  label: string;
  value: string;
  /** Mã định danh dùng font mono để dễ đọc từng ký tự. */
  mono?: boolean;
  /** Chỉ bật khi có giá trị thật lấy từ backend. */
  copyable?: boolean;
  /** Ghi chú phụ (IP đã mask, thiết bị, lý do thiếu dữ liệu). */
  note?: string;
  /** Trường chưa được backend cung cấp — hiển thị trạng thái thay vì giá trị. */
  unavailable?: boolean;
}

/** Nhóm thông tin theo cấu trúc BA (định danh, vai trò, bảo mật). */
export interface AdminProfileSection {
  id: string;
  title: string;
  fields: AdminProfileField[];
  note?: string;
}

const NOT_PROVIDED = 'Chưa được hệ thống cung cấp';
const NO_DATA = 'Chưa có dữ liệu';

/**
 * Dựng nội dung 3 nhóm thông tin của modal hồ sơ.
 *
 * Chỉ đưa vào những trường backend thật sự trả về trong `/api/admin/auth/me`.
 * Organization ID, SSO/Directory ID, ngày cấp quyền quản trị và permission matrix
 * hiện chưa có trong contract nên hiển thị trạng thái "chưa được cung cấp",
 * tuyệt đối không sinh giá trị giả.
 */
export function buildProfileSections(
  user: AdminUser,
  options: { timezone?: string; isDemo?: boolean } = {}
): AdminProfileSection[] {
  const timezone = options.timezone || 'Asia/Ho_Chi_Minh';
  const id = (user.id || '').trim();
  const status = statusLabel(user.status);
  const twoFactor = user.is2faEnabled === true
    ? 'Đã bật'
    : user.is2faEnabled === false ? 'Chưa bật' : NO_DATA;
  const createdAt = formatDateTime(user.createdAt, timezone);
  const lastLoginAt = formatDateTime(user.lastLogin?.at, timezone);
  const lastLoginMeta = [
    user.lastLogin?.ipMasked,
    describeDevice(user.lastLogin?.userAgent)
  ].filter(Boolean).join(' · ');
  const sessionDevice = describeDevice(user.currentSession?.userAgent);
  const sessionIp = user.currentSession?.ipMasked || '';
  const password = passwordValidityLabel(user.passwordExpiresAt);

  return [
    {
      id: 'identity',
      title: '01. Định danh hệ thống & tổ chức',
      fields: [
        {
          key: 'organization',
          label: 'Mã tổ chức (Organization ID)',
          value: NOT_PROVIDED,
          unavailable: true
        },
        {
          key: 'sso',
          label: 'SSO / Directory ID',
          value: 'Chưa liên kết / Chưa được hỗ trợ',
          unavailable: true
        },
        {
          key: 'system-id',
          label: 'Mã quản trị viên hệ thống',
          value: id || NO_DATA,
          mono: true,
          copyable: !!id,
          unavailable: !id,
          note: options.isDemo && id ? 'Mã định danh của phiên demo cục bộ.' : undefined
        },
        {
          key: 'status',
          label: 'Trạng thái tài khoản',
          value: status || NO_DATA,
          unavailable: !status
        }
      ]
    },
    {
      id: 'roles',
      title: '02. Vai trò & Thẩm quyền hệ thống',
      fields: [
        {
          key: 'role',
          label: 'Vai trò hiện tại',
          value: roleLabel(user.role)
        },
        {
          key: 'permissions',
          label: 'Phạm vi thẩm quyền',
          value: NOT_PROVIDED,
          unavailable: true,
          note: 'Hệ thống chưa cung cấp danh sách quyền chi tiết.'
        }
      ],
      note: 'Thông tin vai trò và quyền hạn được quản lý bởi hệ thống. Bạn không thể chỉnh sửa tại đây.'
    },
    {
      id: 'security',
      title: '03. Bảo mật & Phiên làm việc',
      fields: [
        {
          key: 'two-factor',
          label: 'Xác thực hai yếu tố (2FA)',
          value: twoFactor,
          unavailable: twoFactor === NO_DATA
        },
        {
          key: 'created',
          label: 'Ngày tạo tài khoản',
          value: createdAt || NO_DATA,
          unavailable: !createdAt
        },
        {
          key: 'granted',
          label: 'Ngày cấp quyền quản trị',
          value: NOT_PROVIDED,
          unavailable: true
        },
        {
          key: 'last-login',
          label: 'Đăng nhập gần nhất',
          value: lastLoginAt || 'Chưa có lịch sử đăng nhập',
          unavailable: !lastLoginAt,
          note: lastLoginMeta || undefined
        },
        {
          key: 'session',
          label: 'Phiên hiện tại',
          value: sessionIp || (sessionDevice ? 'Phiên đang hoạt động' : NO_DATA),
          unavailable: !sessionIp && !sessionDevice,
          note: sessionDevice || undefined
        },
        {
          key: 'password',
          label: 'Hiệu lực mật khẩu',
          value: password || NO_DATA,
          unavailable: !password
        }
      ]
    }
  ];
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

/**
 * Maps the additive `/me` response onto the existing session user.
 * P1a intentionally keeps the normalized role from the session; role broadening
 * is a separate, unapproved change.
 */
export function mapAdminProfile(response: AdminProfileResponse, current: AdminUser): AdminUser {
  const admin = response?.admin;
  if (!admin) return current;

  const daysLeft = admin.passwordStatus?.daysLeft;
  const passwordExpiresAt = typeof daysLeft === 'number'
    ? addDays(new Date(), admin.passwordStatus?.isExpired ? -1 : daysLeft)
    : current.passwordExpiresAt;

  return {
    ...current,
    id: admin.id || current.id,
    email: admin.email?.trim() || current.email,
    fullName: admin.full_name?.trim() || current.fullName,
    role: current.role,
    passwordExpiresAt,
    status: admin.status,
    is2faEnabled: admin.is_2fa_enabled,
    createdAt: admin.created_at ?? null,
    lastLogin: admin.lastLogin ?? null,
    currentSession: admin.currentSession ?? null
  };
}
