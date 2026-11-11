import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAuditChecksum,
  verifyAuditChecksum,
  determineRiskLevel,
} from '../audit.admin.js';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
} from '../settings.admin.js';

test('Audit Log Checksum: Tính toán và kiểm tra sai lệch toàn vẹn', () => {
  const logCode = 'LOG-2026-123456';
  const actorId = '507f1f77bcf86cd799439011';
  const targetId = 'PO-2026-001';
  const timestamp = new Date('2026-06-25T14:30:15Z');
  const diff = { before: { status: 'pending' }, after: { status: 'approved' } };

  const checksum = calculateAuditChecksum({
    log_code: logCode,
    actor_id: actorId,
    target_id: targetId,
    timestamp,
    diff,
  });

  assert.ok(typeof checksum === 'string' && checksum.length === 64);

  const doc = {
    log_code: logCode,
    actor: { admin_id: actorId },
    target: { id: targetId },
    timestamp,
    diff,
    checksum,
  };

  assert.equal(verifyAuditChecksum(doc), true, 'Bản ghi gốc phải hợp lệ checksum');

  // Thử can thiệp sửa đổi trường diff
  const tamperedDoc = {
    ...doc,
    diff: { before: { status: 'pending' }, after: { status: 'rejected' } },
  };
  assert.equal(verifyAuditChecksum(tamperedDoc), false, 'Bản ghi bị sửa dữ liệu phải bị phát hiện sai lệch checksum');
});

test('Risk Matrix: Phân loại rủi ro chuẩn quy tắc BA', () => {
  assert.equal(determineRiskLevel({ module: 'payout', amount: 25_000_000 }), 'high', 'Duyệt rút >= 20tr phải là high');
  assert.equal(determineRiskLevel({ module: 'payout', amount: 5_000_000 }), 'attention', 'Duyệt rút < 20tr phải là attention');
  assert.equal(determineRiskLevel({ module: 'rbac', action: 'change_role' }), 'high', 'Đổi vai trò phải là high');
  assert.equal(determineRiskLevel({ module: 'system_settings', action: 'update_settings' }), 'high', 'Đổi cấu hình sàn phải là high');
  assert.equal(determineRiskLevel({ action: 'lock_account', isPermanentLock: true }), 'high', 'Khóa vĩnh viễn là high');
  assert.equal(determineRiskLevel({ module: 'report', action: 'view' }), 'normal', 'Xem thông thường là normal');
});

test('Security & Cryptography: Mã hóa AES-256 và Masked secrets', () => {
  const secret = 'super-sensitive-secret-token-12345';
  const encrypted = encryptSecret(secret);

  assert.notEqual(encrypted, secret);
  assert.ok(encrypted.includes(':'), 'Dữ liệu mã hóa phải có cấu trúc IV:Ciphertext');

  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secret, 'Giải mã phải trả về đúng chuỗi ban đầu');

  const masked = maskSecret(secret);
  assert.equal(masked, '••••••••2345', 'Mask secret chỉ hiển thị 4 ký tự cuối');
});

