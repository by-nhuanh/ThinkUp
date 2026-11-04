import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileSections,
  describeDevice,
  formatDateTime,
  initials,
  mapAdminProfile,
  passwordValidityLabel,
  roleLabel,
  statusLabel
} from '../../src/app/core/services/admin-profile.presenter.ts';
import type { AdminProfileResponse, AdminUser } from '../../src/app/core/models/admin-user.model.ts';

const current: AdminUser = {
  id: 'demo-admin@thinkup.edu.vn',
  email: 'admin@thinkup.edu.vn',
  fullName: 'Quản trị viên ThinkUp',
  role: 'admin',
  avatar: null,
  passwordExpiresAt: null,
  mustChangePassword: false,
  twoFactorSetupRequired: false
};

test('P1 PRESENTER: role/status labels chỉ dùng giá trị hệ thống hỗ trợ', () => {
  assert.equal(roleLabel('admin'), 'Quản trị viên');
  assert.equal(roleLabel('ADMIN'), 'Quản trị viên');
  assert.equal(roleLabel(null), 'Quản trị viên');
  assert.equal(statusLabel('ACTIVE'), 'Đang hoạt động');
  assert.equal(statusLabel('LOCKED'), 'Tạm khóa');
  assert.equal(statusLabel('UNKNOWN'), null);
  assert.equal(statusLabel(null), null);
});

test('P1 PRESENTER: initials xử lý tiếng Việt, một từ và rỗng', () => {
  assert.equal(initials('Nguyễn Văn An'), 'NA');
  assert.equal(initials('Đặng Thị Hồng'), 'DH');
  assert.equal(initials('An'), 'A');
  assert.equal(initials('   '), 'A');
  assert.equal(initials(null), 'A');
});

test('P1 PRESENTER: mô tả thiết bị từ user agent', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36'), 'Chrome · Windows');
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36 Edg/156'), 'Edge · Windows');
  assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/121'), 'Firefox · macOS');
  assert.equal(describeDevice(''), '');
  assert.equal(describeDevice('unknown-agent'), 'Thiết bị không xác định');
});

test('P1 PRESENTER: format ngày giờ theo vi-VN', () => {
  assert.equal(formatDateTime('2026-11-01T10:00:00.000Z'), '17:00 01/11/2026');
  assert.equal(formatDateTime(''), '');
  assert.equal(formatDateTime('not-a-date'), '');
});

test('P1 PRESENTER: map /me giữ role hiện tại và chỉ lấy dữ liệu backend trả', () => {
  const response: AdminProfileResponse = {
    success: true,
    admin: {
      id: '65f123456789abcdef012345',
      email: 'admin@thinkup.edu.vn',
      full_name: 'Quản trị viên ThinkUp',
      role: 'ADMIN',
      status: 'ACTIVE',
      is_2fa_enabled: true,
      created_at: '2026-01-10T08:00:00.000Z',
      last_login_at: '2026-11-01T10:00:00.000Z',
      lastLogin: { at: '2026-11-01T10:00:00.000Z', ipMasked: '14.233.18.xxx', userAgent: 'Chrome/120' },
      currentSession: { ipMasked: '113.172.56.xxx', userAgent: 'Edg/156' },
      passwordStatus: { isExpired: false, isWarning: false, daysLeft: 80 }
    }
  };

  const mapped = mapAdminProfile(response, current);
  assert.equal(mapped.id, '65f123456789abcdef012345');
  assert.equal(mapped.role, 'admin');
  assert.equal(mapped.status, 'ACTIVE');
  assert.equal(mapped.is2faEnabled, true);
  assert.equal(mapped.createdAt, '2026-01-10T08:00:00.000Z');
  assert.equal(mapped.lastLogin?.ipMasked, '14.233.18.xxx');
  assert.equal(mapped.currentSession?.userAgent, 'Edg/156');
  assert.ok(mapped.passwordExpiresAt);
  assert.equal(mapped.avatar, null);
});

test('P1 PRESENTER: /me thiếu field thì không bịa dữ liệu', () => {
  const response: AdminProfileResponse = {
    success: true,
    admin: {
      id: '65f123456789abcdef012345',
      email: 'admin@thinkup.edu.vn',
      full_name: 'Quản trị viên ThinkUp',
      role: 'ADMIN'
    }
  };

  const mapped = mapAdminProfile(response, current);
  assert.equal(mapped.status, undefined);
  assert.equal(mapped.is2faEnabled, undefined);
  assert.equal(mapped.createdAt, null);
  assert.equal(mapped.lastLogin, null);
  assert.equal(mapped.currentSession, null);
});

test('P1 PRESENTER: format ngày giờ theo timezone preference', () => {
  const value = '2026-11-01T10:00:00.000Z';
  assert.equal(formatDateTime(value, 'Asia/Ho_Chi_Minh'), '17:00 01/11/2026');
  assert.equal(formatDateTime(value, 'UTC'), '10:00 01/11/2026');
  assert.equal(formatDateTime(value, 'Not/AZone'), '');
});

test('P1 PRESENTER: nhãn hiệu lực mật khẩu tính theo mốc thời gian cho trước', () => {
  const now = Date.parse('2026-11-01T00:00:00.000Z');
  assert.equal(passwordValidityLabel('2026-12-01T00:00:00.000Z', now), 'Còn 30 ngày');
  assert.equal(passwordValidityLabel('2026-11-04T00:00:00.000Z', now), 'Sắp hết hạn (3 ngày)');
  assert.equal(passwordValidityLabel('2026-10-01T00:00:00.000Z', now), 'Đã hết hạn');
  assert.equal(passwordValidityLabel(null, now), '');
});

test('P1 PRESENTER: modal hồ sơ luôn có đủ 3 nhóm theo BA', () => {
  const sections = buildProfileSections(current, { timezone: 'Asia/Ho_Chi_Minh' });
  assert.deepEqual(sections.map(section => section.id), ['identity', 'roles', 'security']);
  assert.deepEqual(
    sections.map(section => section.title),
    [
      '01. Định danh hệ thống & tổ chức',
      '02. Vai trò & Thẩm quyền hệ thống',
      '03. Bảo mật & Phiên làm việc'
    ]
  );
  assert.ok(sections[1].note?.includes('không thể chỉnh sửa'));
});

test('P1 PRESENTER: trường backend chưa hỗ trợ hiển thị trạng thái, không sinh dữ liệu giả', () => {
  const fields = buildProfileSections(current, { timezone: 'Asia/Ho_Chi_Minh' })
    .flatMap(section => section.fields);
  const byKey = new Map(fields.map(field => [field.key, field]));

  assert.equal(byKey.get('organization')?.value, 'Chưa được hệ thống cung cấp');
  assert.equal(byKey.get('organization')?.copyable, undefined);
  assert.equal(byKey.get('sso')?.value, 'Chưa liên kết / Chưa được hỗ trợ');
  assert.equal(byKey.get('sso')?.copyable, undefined);
  assert.equal(byKey.get('granted')?.value, 'Chưa được hệ thống cung cấp');
  assert.equal(byKey.get('permissions')?.unavailable, true);
  assert.equal(byKey.get('role')?.value, 'Quản trị viên');
});

test('P1 PRESENTER: mã quản trị viên lấy đúng ID thật và chỉ copy khi có giá trị', () => {
  const fields = buildProfileSections(
    { ...current, id: '65f123456789abcdef012345' },
    { timezone: 'Asia/Ho_Chi_Minh' }
  ).flatMap(section => section.fields);
  const id = fields.find(field => field.key === 'system-id');

  assert.equal(id?.value, '65f123456789abcdef012345');
  assert.equal(id?.copyable, true);
  assert.equal(id?.mono, true);
  assert.equal(id?.note, undefined);

  const missing = buildProfileSections({ ...current, id: '' }, {})
    .flatMap(section => section.fields)
    .find(field => field.key === 'system-id');
  assert.equal(missing?.value, 'Chưa có dữ liệu');
  assert.equal(missing?.copyable, false);
});

test('P1 PRESENTER: dữ liệu bảo mật và phiên chỉ lấy từ /me', () => {
  const user = {
    ...current,
    status: 'ACTIVE',
    is2faEnabled: true,
    createdAt: '2026-01-10T08:00:00.000Z',
    passwordExpiresAt: null,
    lastLogin: {
      at: '2026-11-01T10:00:00.000Z',
      ipMasked: '14.233.18.xxx',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36'
    },
    currentSession: {
      ipMasked: '113.172.56.xxx',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36 Edg/156'
    }
  };
  const fields = buildProfileSections(user, { timezone: 'Asia/Ho_Chi_Minh' })
    .flatMap(section => section.fields);
  const byKey = new Map(fields.map(field => [field.key, field]));

  assert.equal(byKey.get('status')?.value, 'Đang hoạt động');
  assert.equal(byKey.get('two-factor')?.value, 'Đã bật');
  assert.equal(byKey.get('created')?.value, '15:00 10/01/2026');
  assert.equal(byKey.get('last-login')?.value, '17:00 01/11/2026');
  assert.equal(byKey.get('last-login')?.note, '14.233.18.xxx · Chrome · Windows');
  assert.equal(byKey.get('session')?.value, '113.172.56.xxx');
  assert.equal(byKey.get('session')?.note, 'Edge · Windows');

  const empty = buildProfileSections(current, {})
    .flatMap(section => section.fields);
  const emptyByKey = new Map(empty.map(field => [field.key, field]));
  assert.equal(emptyByKey.get('last-login')?.value, 'Chưa có lịch sử đăng nhập');
  assert.equal(emptyByKey.get('last-login')?.unavailable, true);
  assert.equal(emptyByKey.get('session')?.value, 'Chưa có dữ liệu');
  assert.equal(emptyByKey.get('two-factor')?.value, 'Chưa có dữ liệu');
});

test('P1 PRESENTER: phiên demo được đánh dấu rõ trên mã định danh', () => {
  const id = buildProfileSections(current, { isDemo: true })
    .flatMap(section => section.fields)
    .find(field => field.key === 'system-id');
  assert.equal(id?.note, 'Mã định danh của phiên demo cục bộ.');
});
