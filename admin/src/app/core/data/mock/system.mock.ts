import {
  AdminHistoryEntry,
  AdminPerson,
  AdminRoleDefinition,
  AuditLog,
  AuditSummary,
  InternalStaff,
  MomoGatewayConfig,
  PaymentGateway,
  SystemSettings
} from '../../../features/system/models/system.models';

/**
 * TODO(pre-deploy): Nhớ xóa toàn bộ dữ liệu demo này khi backend cung cấp API
 * `GET /admin/system/admins`, `GET /admin/system/audit-logs`, `GET|PUT /admin/system/settings`.
 */

export const ADMIN_ROLES: readonly AdminRoleDefinition[] = [
  {
    code: 'SA',
    label: 'Super Admin (SA)',
    shortLabel: 'SA',
    tagline: 'Toàn quyền quản trị hệ thống',
    responsibility: 'Toàn quyền quản trị hệ thống, phân quyền, cấu hình và phê duyệt ngưỡng cao.',
    scopes: [
      'Dashboard: Toàn bộ KPI',
      'Mọi phân hệ: Toàn quyền',
      'Phân quyền Admin: Đặc quyền',
      'Cấu hình hệ thống: Toàn quyền',
      'Không giới hạn ngưỡng phê duyệt.'
    ]
  },
  {
    code: 'CA',
    label: 'Content Admin (CA)',
    shortLabel: 'CA',
    tagline: 'Quản trị nội dung và Đào tạo',
    responsibility: 'Quản lý học tập, nội dung khóa học, bài thi, blog và phê duyệt xuất bản khóa học.',
    scopes: [
      'Dashboard: KPI Đào tạo',
      'Học viên/Giảng viên: Chỉ xem',
      'Khóa học: Toàn quyền',
      'Duyệt khóa học: Đặc quyền',
      'Lộ trình học tập: Toàn quyền',
      'Nội dung: Toàn quyền',
      'Không can thiệp đơn hàng, ví tiền hoặc khóa tài khoản người dùng.'
    ]
  },
  {
    code: 'FA',
    label: 'Finance Admin (FA)',
    shortLabel: 'FA',
    tagline: 'Quản trị tài chính và Dòng tiền',
    responsibility: 'Quản lý dòng tiền, doanh thu, voucher/giá bán và phê duyệt yêu cầu rút tiền.',
    scopes: [
      'Dashboard: KPI Doanh thu',
      'Học viên/Giảng viên: Chỉ xem',
      'Kinh doanh: Toàn quyền',
      'Duyệt rút tiền: Dưới 20 triệu',
      'Cổng thanh toán: Xem cấu hình'
    ],
    warning: 'Lệnh rút tiền từ 20.000.000 VNĐ trở lên bắt buộc do Super Admin phê duyệt.'
  },
  {
    code: 'CS',
    label: 'Support Admin (CS)',
    shortLabel: 'CS',
    tagline: 'Quản trị viên hỗ trợ và CSKH',
    responsibility: 'Tiếp nhận ticket, xử lý khiếu nại và quản lý trạng thái tài khoản vi phạm.',
    scopes: [
      'Dashboard: KPI Ticket',
      'Học viên/Giảng viên: Xem và khóa',
      'Hỗ trợ: Toàn quyền',
      'Báo cáo vi phạm: Đặc quyền xử lý',
      'Không xem doanh thu chi tiết, duyệt rút tiền hoặc sửa đổi bài giảng.'
    ]
  }
];

const EXTRA_ADMINS: ReadonlyArray<[string, string, AdminPerson['role'], AdminPerson['status']]> = [
  ['Nguyễn Thu Hà', 'ha.nguyen@thinkup.vn', 'CA', 'active'],
  ['Phan Quốc Bảo', 'bao.phan@thinkup.vn', 'CA', 'active'],
  ['Vũ Thanh Tùng', 'tung.vu@thinkup.vn', 'FA', 'active'],
  ['Đặng Khánh Ly', 'ly.dang@thinkup.vn', 'CS', 'active'],
  ['Bùi Minh Khoa', 'khoa.bui@thinkup.vn', 'CA', 'active'],
  ['Hồ Ngọc Mai', 'mai.ho@thinkup.vn', 'CS', 'active'],
  ['Ngô Đức Thắng', 'thang.ngo@thinkup.vn', 'FA', 'active'],
  ['Lý Thanh Vân', 'van.ly@thinkup.vn', 'CA', 'active'],
  ['Trương Gia Hân', 'han.truong@thinkup.vn', 'CS', 'locked'],
  ['Đinh Quang Huy', 'huy.dinh@thinkup.vn', 'FA', 'active'],
  ['Lâm Bảo Châu', 'chau.lam@thinkup.vn', 'CA', 'active'],
  ['Tạ Minh Quân', 'quan.ta@thinkup.vn', 'CS', 'active'],
  ['Cao Thị Nga', 'nga.cao@thinkup.vn', 'CA', 'active'],
  ['Dương Anh Kiệt', 'kiet.duong@thinkup.vn', 'FA', 'active'],
  ['Lưu Hoài Phương', 'phuong.luu@thinkup.vn', 'CS', 'locked'],
  ['Mai Xuân Trường', 'truong.mai@thinkup.vn', 'CA', 'active'],
  ['Võ Thị Bích', 'bich.vo@thinkup.vn', 'CS', 'active'],
  ['Trịnh Công Sơn', 'son.trinh@thinkup.vn', 'FA', 'active'],
  ['Hoàng Diệu Linh', 'linh.hoang@thinkup.vn', 'CA', 'active']
];

const INITIAL_ADMINS: readonly AdminPerson[] = [
  {
    id: 'AD-2026-001',
    code: 'AD-2026-001',
    name: 'Lê Hoàng Nam',
    email: 'nam.le@thinkup.vn',
    role: 'SA',
    twoFactor: 'active',
    lastLoginAt: '03/11/2026 · 08:42',
    lastLoginDevice: '192.168.1.12 · Chrome / Windows',
    status: 'active',
    isSelf: true
  },
  {
    id: 'AD-2026-003',
    code: 'AD-2026-003',
    name: 'Nguyễn Văn A',
    email: 'an.nguyen@thinkup.vn',
    role: 'CA',
    twoFactor: 'active',
    lastLoginAt: '03/11/2026 · 08:35',
    lastLoginDevice: '113.161.72.24 · Chrome / Windows',
    status: 'active'
  },
  {
    id: 'AD-2026-008',
    code: 'AD-2026-008',
    name: 'Trần Văn B',
    email: 'tuan.tran@thinkup.vn',
    role: 'FA',
    twoFactor: 'active',
    lastLoginAt: '03/11/2026 · 08:21',
    lastLoginDevice: '14.161.20.10 · Safari / macOS',
    status: 'active'
  },
  {
    id: 'AD-2026-012',
    code: 'AD-2026-012',
    name: 'Phạm Mai Linh',
    email: 'linh.pham@thinkup.vn',
    role: 'CS',
    twoFactor: 'active',
    lastLoginAt: '02/11/2026 · 17:50',
    lastLoginDevice: '118.69.35.81 · Chrome / Windows',
    status: 'locked'
  },
  {
    id: 'AD-2026-015',
    code: 'AD-2026-015',
    name: 'Đỗ Quốc Tuấn',
    email: 'tuan.do@thinkup.vn',
    role: 'CA',
    twoFactor: 'inactive',
    lastLoginAt: '02/11/2026 · 16:12',
    lastLoginDevice: '171.224.62.19 · Edge / Windows',
    status: 'active'
  },
  ...EXTRA_ADMINS.map<AdminPerson>(([name, email, role, status], index) => ({
    id: `AD-2026-${String(20 + index).padStart(3, '0')}`,
    code: `AD-2026-${String(20 + index).padStart(3, '0')}`,
    name,
    email,
    role,
    twoFactor: index % 9 === 4 ? 'inactive' : 'active',
    lastLoginAt: `0${(index % 2) + 1}/11/2026 · ${String(9 + (index % 9)).padStart(2, '0')}:${String(10 + index).padStart(2, '0')}`,
    lastLoginDevice: '118.69.35.81 · Chrome / Windows',
    status
  }))
];

export const ADMIN_PERSONS: readonly AdminPerson[] = INITIAL_ADMINS;

export const INTERNAL_STAFF: readonly InternalStaff[] = [
  { id: 'STAFF-001', name: 'Nguyễn Văn A', email: 'an.nguyen@thinkup.vn' },
  { id: 'STAFF-002', name: 'Trần Thị Bích', email: 'bich.tran@thinkup.vn' },
  { id: 'STAFF-003', name: 'Lê Minh Hoàng', email: 'hoang.le@thinkup.vn' },
  { id: 'STAFF-004', name: 'Phạm Thùy Linh', email: 'linh.phamthuy@thinkup.vn' }
];

const BASE_HISTORY: readonly AdminHistoryEntry[] = [
  {
    id: 'AUD-20261103-00924',
    at: '03/11/2026 · 09:00:24',
    actor: 'Lê Hoàng Nam',
    actorRole: 'Super Admin · AD-2026-001',
    action: 'Thay đổi vai trò',
    change: 'CA → FA',
    targetName: 'Nguyễn Văn A',
    targetEmail: 'an.nguyen@thinkup.vn',
    ip: '192.168.1.12',
    reason: 'Điều chuyển sang bộ phận tài chính theo quyết định số 31/QĐ-THK.',
    before: 'Content Admin (CA) · Trạng thái: Hoạt động · Phiên đăng nhập: 2 đang mở',
    after: 'Finance Admin (FA) · Trạng thái: Hoạt động · Phiên đăng nhập: Đã thu hồi toàn bộ'
  },
  {
    id: 'AUD-20261102-01432',
    at: '02/11/2026 · 14:32:10',
    actor: 'Lê Hoàng Nam',
    actorRole: 'Super Admin · AD-2026-001',
    action: 'Đặt lại 2FA',
    change: 'Đã kích hoạt → Chờ thiết lập',
    targetName: 'Nguyễn Văn A',
    targetEmail: 'an.nguyen@thinkup.vn',
    ip: '192.168.1.12',
    reason: 'Nhân sự đổi điện thoại mới và không còn truy cập ứng dụng xác thực cũ.',
    before: '2FA: Đã kích hoạt',
    after: '2FA: Chờ thiết lập lại thiết bị'
  },
  {
    id: 'AUD-20261102-01012',
    at: '02/11/2026 · 10:12:45',
    actor: 'Lê Hoàng Nam',
    actorRole: 'Super Admin · AD-2026-001',
    action: 'Mở khóa tài khoản',
    change: 'Tạm khóa → Hoạt động',
    targetName: 'Nguyễn Văn A',
    targetEmail: 'an.nguyen@thinkup.vn',
    ip: '192.168.1.12',
    reason: 'Đã xác minh danh tính và hoàn tất bàn giao.',
    before: 'Trạng thái: Tạm khóa',
    after: 'Trạng thái: Hoạt động'
  },
  {
    id: 'AUD-20261101-01750',
    at: '01/11/2026 · 17:50:12',
    actor: 'Lê Hoàng Nam',
    actorRole: 'Super Admin · AD-2026-001',
    action: 'Khóa tài khoản',
    change: 'Hoạt động → Tạm khóa',
    targetName: 'Nguyễn Văn A',
    targetEmail: 'an.nguyen@thinkup.vn',
    ip: '192.168.1.12',
    reason: 'Tạm khóa để xác minh truy cập bất thường.',
    before: 'Trạng thái: Hoạt động',
    after: 'Trạng thái: Tạm khóa'
  },
  {
    id: 'AUD-20261101-00815',
    at: '01/11/2026 · 08:15:32',
    actor: 'Lê Hoàng Nam',
    actorRole: 'Super Admin · AD-2026-001',
    action: 'Phân bổ vai trò',
    change: 'Chưa có vai trò → CA',
    targetName: 'Nguyễn Văn A',
    targetEmail: 'an.nguyen@thinkup.vn',
    ip: '192.168.1.12',
    reason: 'Phân công quản lý nội dung và đào tạo theo quyết định số 26/QĐ-THK.',
    before: 'Chưa có vai trò quản trị',
    after: 'Content Admin (CA)'
  }
];

/** Đủ 18 sự kiện demo cho hồ sơ Nguyễn Văn A (5 bản ghi gốc + 13 bản ghi lặp kịch bản). */
export const ADMIN_HISTORY: readonly AdminHistoryEntry[] = [
  ...BASE_HISTORY,
  ...Array.from({ length: 13 }, (_, index): AdminHistoryEntry => {
    const base = BASE_HISTORY[(index + 1) % BASE_HISTORY.length];
    return {
      ...base,
      id: `AUD-202610${String(28 - index).padStart(2, '0')}-${String(700 + index).padStart(5, '0')}`,
      at: `${String(28 - index).padStart(2, '0')}/10/2026 · ${String(9 + (index % 8)).padStart(2, '0')}:${String(12 + index).padStart(2, '0')}:05`
    };
  })
];

const BASE_LOGS: readonly AuditLog[] = [
  {
    id: 'LOG-2026-894201',
    at: '03/11/2026 14:30:15',
    actorName: 'Trần Nhật Anh',
    actorEmail: 'nhatanh@thinkup.vn',
    actorRole: 'Finance Admin (FA)',
    actorInitials: 'NA',
    module: 'Rút tiền giảng viên',
    action: 'Duyệt giải ngân',
    outcome: 'success',
    targetId: 'PO-2026-089',
    targetName: 'Giảng viên: Lê Thị Hồng',
    targetMeta: '4.200.000 đ',
    ip: '118.69.182.45',
    location: 'Hà Nội, VN',
    device: 'Chrome 126 · macOS',
    risk: 'attention',
    sessionId: 'sess_84920af31d8b7e6c',
    basis: '“Phê duyệt giải ngân lệnh rút hợp lệ sau khi đối chiếu số dư ví và trừ 10% thuế TNCN.”',
    evidenceName: 'Bien_ban_doi_soat.pdf',
    before: [
      { label: 'Trạng thái', value: 'Chờ duyệt' },
      { label: 'Số tiền đóng băng', value: '4.200.000 đ' },
      { label: 'Thực nhận', value: 'Chưa xác định' }
    ],
    after: [
      { label: 'Trạng thái', value: 'Chờ giải ngân' },
      { label: 'Tiền thuế khấu trừ', value: '420.000 đ (10%)' },
      { label: 'Thực nhận', value: '3.780.000 đ' }
    ],
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  },
  {
    id: 'LOG-2026-894200',
    at: '03/11/2026 14:25:08',
    actorName: 'Lê Hoàng Nam',
    actorEmail: 'nam.le@thinkup.vn',
    actorRole: 'Super Admin (SA)',
    actorInitials: 'HN',
    module: 'Rút tiền giảng viên',
    action: 'Phê duyệt rút tiền',
    outcome: 'success',
    targetId: 'PO-2026-088',
    targetName: 'Giảng viên: Nguyễn Hà',
    targetMeta: '28.000.000 đ',
    ip: '113.161.72.24',
    location: 'TP. Hồ Chí Minh, VN',
    device: 'Chrome 126 · Windows',
    risk: 'high',
    sessionId: 'sess_71bd20c9a4e1f803',
    basis: '“Phê duyệt lệnh rút vượt ngưỡng 20 triệu theo quy định bốn mắt.”',
    evidenceName: 'Bien_ban_doi_soat.pdf',
    before: [
      { label: 'Trạng thái', value: 'Chờ duyệt' },
      { label: 'Số tiền', value: '28.000.000 đ' }
    ],
    after: [
      { label: 'Trạng thái', value: 'Chờ giải ngân' },
      { label: 'Người phê duyệt', value: 'Lê Hoàng Nam (SA)' }
    ],
    checksum: '9f2c7b10d4a8e6f3c5b7a9d1e3f5a7c9b1d3e5f7a9c1b3d5e7f9a1c3b5d7e9f1'
  },
  {
    id: 'LOG-2026-894199',
    at: '03/11/2026 14:18:42',
    actorName: 'Lê Hoàng Nam',
    actorEmail: 'nam.le@thinkup.vn',
    actorRole: 'Super Admin (SA)',
    actorInitials: 'HN',
    module: 'Cấu hình sàn',
    action: 'Cập nhật cấu hình',
    outcome: 'success',
    targetId: 'SYS-CONFIG',
    targetName: 'Hạn mức rút tiền',
    targetMeta: '20.000.000 đ',
    ip: '113.161.72.24',
    location: 'TP. Hồ Chí Minh, VN',
    device: 'Chrome 126 · Windows',
    risk: 'high',
    sessionId: 'sess_71bd20c9a4e1f803',
    basis: '“Điều chỉnh hạn mức rút tiền theo biên bản họp tài chính tháng 11.”',
    evidenceName: 'Bien_ban_doi_soat.pdf',
    before: [
      { label: 'Hạn mức rút tiền', value: '15.000.000 đ' },
      { label: 'Ngưỡng SA phê duyệt', value: '15.000.000 đ' }
    ],
    after: [
      { label: 'Hạn mức rút tiền', value: '20.000.000 đ' },
      { label: 'Ngưỡng SA phê duyệt', value: '20.000.000 đ' }
    ],
    checksum: '3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c'
  },
  {
    id: 'LOG-2026-894198',
    at: '03/11/2026 14:09:36',
    actorName: 'Nguyễn Minh Anh',
    actorEmail: 'minhanh@thinkup.vn',
    actorRole: 'Content Admin (CA)',
    actorInitials: 'MA',
    module: 'Duyệt Khóa học',
    action: 'Từ chối xuất bản',
    outcome: 'failed',
    targetId: 'THKUP-2026-148',
    targetName: 'React & TypeScript thực chiến',
    targetMeta: 'Khóa học',
    ip: '14.161.20.10',
    location: 'Đà Nẵng, VN',
    device: 'Safari 17 · macOS',
    risk: 'attention',
    sessionId: 'sess_22a9c7e5d3b1f806',
    basis: '“Nội dung bài 3 thiếu minh chứng thực hành, cần bổ sung trước khi phát hành.”',
    evidenceName: 'Bien_ban_doi_soat.pdf',
    before: [
      { label: 'Trạng thái', value: 'Chờ duyệt' },
      { label: 'Phiên bản', value: 'v1.4' }
    ],
    after: [
      { label: 'Trạng thái', value: 'Từ chối xuất bản' },
      { label: 'Lý do', value: 'Thiếu minh chứng thực hành' }
    ],
    checksum: '7d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a'
  },
  {
    id: 'LOG-2026-894197',
    at: '03/11/2026 14:02:11',
    actorName: 'Phạm Mai Linh',
    actorEmail: 'linh.pham@thinkup.vn',
    actorRole: 'Support Admin (CS)',
    actorInitials: 'ML',
    module: 'Quản lý Học viên',
    action: 'Xem báo cáo học viên',
    outcome: 'success',
    targetId: 'HV-2026-0382',
    targetName: 'Học viên: Đỗ Quốc Tuấn',
    targetMeta: 'Báo cáo học tập',
    ip: '171.224.62.19',
    location: 'Hà Nội, VN',
    device: 'Edge 126 · Windows',
    risk: 'normal',
    sessionId: 'sess_55c1e9a7b3d5f802',
    basis: '“Kiểm tra tiến độ học tập theo yêu cầu hỗ trợ của học viên.”',
    evidenceName: 'Bien_ban_doi_soat.pdf',
    before: [
      { label: 'Quyền truy cập', value: 'Chỉ xem' },
      { label: 'Phạm vi', value: 'Báo cáo học tập' }
    ],
    after: [
      { label: 'Quyền truy cập', value: 'Chỉ xem' },
      { label: 'Báo cáo đã mở', value: 'HV-2026-0382' }
    ],
    checksum: '1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3'
  }
];

/** Đủ dòng cho 5 trang demo (mỗi trang 5 dòng). */
export const AUDIT_LOGS: readonly AuditLog[] = [
  ...BASE_LOGS,
  ...Array.from({ length: 20 }, (_, index) => {
    const base = BASE_LOGS[(index + 1) % BASE_LOGS.length];
    return {
      ...base,
      id: `LOG-2026-${894196 - index}`,
      at: `0${(index % 3) + 1}/11/2026 ${String(9 + (index % 9)).padStart(2, '0')}:${String(10 + index).padStart(2, '0')}:05`,
      risk: (['normal', 'attention', 'high'] as const)[(index + 1) % 3],
      outcome: (['success', 'success', 'failed'] as const)[index % 3]
    };
  })
];

export const AUDIT_SUMMARY: AuditSummary = {
  totalToday: 12845,
  totalDelta: '+12,8% so với hôm qua',
  highRisk: 38,
  activeAdmins: 16,
  onlineAdmins: 8,
  integrity: 'verified'
};

export const PAYMENT_GATEWAYS: readonly PaymentGateway[] = [
  {
    id: 'momo',
    code: 'PAY_MOMO',
    name: 'MoMo',
    description: 'Ví điện tử MoMo · PAY_MOMO',
    environment: 'production',
    status: 'healthy',
    statusLabel: 'Hoạt động  ·  Kết nối ổn định'
  },
  {
    id: 'vcb',
    code: 'VCB',
    name: 'Vietcombank',
    description: 'Cổng thanh toán ngân hàng',
    environment: 'sandbox',
    status: 'down',
    statusLabel: 'Mất kết nối  ·  Kiểm tra lại cấu hình'
  }
];

export const MOMO_CONFIG: MomoGatewayConfig = {
  environment: 'production',
  businessCode: 'MOMO_2026_THINKUP',
  publicKey: 'pk_live_948201_demo',
  secretKey: 'sk_demo_thinkup_2026_a1b2',
  timeoutSeconds: 30,
  active: true
};

export const SYSTEM_SETTINGS: SystemSettings = {
  general: {
    siteName: 'ThinkUp Vietnam',
    timezone: 'GMT+07:00',
    language: 'Tiếng Việt',
    hotline: '1900123456',
    address: 'TP. Hồ Chí Minh, Việt Nam'
  },
  parameters: {
    taxThreshold: 2000000,
    taxRate: 10,
    superAdminThreshold: 20000000,
    paymentTimeout: 15,
    ordersPerPage: 20,
    courseReviewHours: 48,
    sMatchThreshold: 70,
    minCoursesPerMilestone: 3,
    testPassScore: 80,
    studentLockReasonMin: 10,
    lecturerDisciplineReasonMin: 10,
    courseRejectReasonMin: 10
  },
  social: {
    googleClientId: 'google-client-id.apps.googleusercontent.com',
    googleClientSecret: 'google-secret-demo',
    facebookClientId: 'facebook-app-id-demo',
    facebookClientSecret: 'facebook-secret-demo',
    appleClientId: 'apple-service-id-demo',
    appleClientSecret: 'apple-secret-demo',
    recaptchaSiteKey: 'recaptcha-site-demo',
    recaptchaSecretKey: 'recaptcha-secret-demo'
  },
  tracking: {
    ga4Id: 'G-AB12CD34EF',
    pixelId: '123456789012345',
    gtmScript: '<!-- Google Tag Manager -->\n<script>\n  /* Dán mã container Google Tag Manager tại đây */\n</script>\n<!-- End Google Tag Manager -->'
  },
  messaging: {
    senderName: 'ThinkUp Vietnam',
    systemEmail: 'no-reply@thinkup.vn',
    replyEmail: 'support@thinkup.vn',
    servicePassword: 'mail-service-demo',
    lecturerContractTemplate: 'd-89420af-demo',
    adminGrantTemplate: 'd-78210bc-demo',
    otpExpiryMinutes: 6
  },
  storage: {
    bucket: 'thinkup-media-prod',
    region: 'ap-southeast-1',
    accessKeyId: 'AKIA-DEMO-ACCESS',
    secretAccessKey: 's3-secret-demo'
  },
  signing: {
    provider: 'VNPT-CA',
    serial: '5401029384AB2025',
    expiresAt: '25/12/2028',
    clientId: 'thinkup_esign_client',
    secret: 'esign-secret-demo',
    maxSignDays: 7,
    legalEmail: 'legal@thinkup.vn',
    autoSendCopy: true
  },
  maintenance: {
    enabled: false,
    alertEmails: ['it-lead@thinkup.vn', 'ops@thinkup.vn'],
    alertPhones: ['0901234567', '0912345678']
  }
};
