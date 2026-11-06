import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { signJwt } from '../../../user/db.js';
import {
  getAdminProfile,
  maskIpAddress,
  recordAdminLogoutAudit,
} from '../auth.admin.js';

const ADMIN_ID = '65f123456789abcdef012345';

function matchesQuery(doc, query) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = doc[key];
    if (expected instanceof ObjectId) return String(actual) === String(expected);
    return actual === expected;
  });
}

class MockCollection {
  constructor(documents = []) {
    this.documents = [...documents];
    this.inserted = [];
  }

  async findOne(query = {}, options = {}) {
    let matches = this.documents.filter((doc) => matchesQuery(doc, query));
    if (options.sort) {
      const [[field, direction]] = Object.entries(options.sort);
      matches = matches.sort((left, right) => {
        const a = new Date(left[field]).getTime();
        const b = new Date(right[field]).getTime();
        return (a - b) * direction;
      });
    }
    return matches[0] || null;
  }

  async insertOne(doc) {
    this.inserted.push(doc);
    return { insertedId: doc._id };
  }
}

class MockDb {
  constructor({ admin = null, audits = [], throwOnAudit = false } = {}) {
    this.admins = new MockCollection(admin ? [admin] : []);
    this.audit = new MockCollection(audits);
    this.throwOnAudit = throwOnAudit;
  }

  collection(name) {
    if (name === 'admins') return this.admins;
    if (name === 'admin_audit_logs') {
      if (this.throwOnAudit) throw new Error('audit unavailable');
      return this.audit;
    }
    throw new Error(`Unexpected collection: ${name}`);
  }
}

function adminDocument(overrides = {}) {
  return {
    _id: new ObjectId(ADMIN_ID),
    email: 'admin@thinkup.edu.vn',
    full_name: 'Quản trị viên ThinkUp',
    role: 'ADMIN',
    status: 'ACTIVE',
    is_2fa_enabled: true,
    created_at: new Date('2026-01-10T08:00:00.000Z'),
    last_login_at: new Date('2026-11-01T10:00:00.000Z'),
    password_changed_at: new Date(Date.now() - 10 * 86_400_000),
    password_hash: 'must-not-leak',
    two_factor_secret: 'must-not-leak',
    backup_codes: [{ code_hash: 'must-not-leak' }],
    ...overrides,
  };
}

test('P1 PROFILE: mask IP IPv4/IPv6 và giá trị không hợp lệ', () => {
  assert.equal(maskIpAddress('14.233.18.17'), '14.233.18.xxx');
  assert.equal(maskIpAddress('::ffff:14.233.18.17'), '14.233.18.xxx');
  assert.equal(maskIpAddress('2001:db8::1'), '2001:db8::xxxx');
  assert.equal(maskIpAddress('not-an-ip'), null);
  assert.equal(maskIpAddress(''), null);
  assert.equal(maskIpAddress(null), null);
});

test('P1 PROFILE: /me trả additive fields, lastLogin và currentSession đã mask, không lộ secret', async () => {
  const db = new MockDb({
    admin: adminDocument(),
    audits: [
      {
        _id: 'audit-old',
        admin_id: new ObjectId(ADMIN_ID),
        action: 'ADMIN_LOGIN_SUCCESS',
        ip: '10.0.0.1',
        user_agent: 'OldAgent',
        created_at: new Date('2026-10-01T08:00:00.000Z'),
      },
      {
        _id: 'audit-new',
        admin_id: new ObjectId(ADMIN_ID),
        action: 'ADMIN_LOGIN_SUCCESS',
        ip: '14.233.18.17',
        user_agent: 'Mozilla/5.0 Chrome/120 Windows NT 10.0',
        created_at: new Date('2026-11-01T10:00:00.000Z'),
      },
    ],
  });

  const result = await getAdminProfile(ADMIN_ID, {
    db,
    ip: '113.172.56.12',
    userAgent: 'Mozilla/5.0 Edg/156 Windows NT 10.0',
  });

  assert.equal(result.success, true);
  assert.equal(result.admin.id, ADMIN_ID);
  assert.equal(result.admin.email, 'admin@thinkup.edu.vn');
  assert.equal(result.admin.status, 'ACTIVE');
  assert.equal(result.admin.is_2fa_enabled, true);
  assert.equal(result.admin.created_at, '2026-01-10T08:00:00.000Z');
  assert.equal(result.admin.last_login_at, '2026-11-01T10:00:00.000Z');
  assert.equal(result.admin.lastLogin.at, '2026-11-01T10:00:00.000Z');
  assert.equal(result.admin.lastLogin.ipMasked, '14.233.18.xxx');
  assert.match(result.admin.lastLogin.userAgent, /Chrome\/120/);
  assert.equal(result.admin.currentSession.ipMasked, '113.172.56.xxx');
  assert.match(result.admin.currentSession.userAgent, /Edg\/156/);
  assert.equal('password_hash' in result.admin, false);
  assert.equal('two_factor_secret' in result.admin, false);
  assert.equal('backup_codes' in result.admin, false);
});

test('P1 PROFILE: không có audit thì lastLogin null nhưng /me vẫn thành công', async () => {
  const db = new MockDb({ admin: adminDocument(), audits: [] });
  const result = await getAdminProfile(ADMIN_ID, { db });
  assert.equal(result.success, true);
  assert.equal(result.admin.lastLogin, null);
  assert.equal(result.admin.currentSession, null);
});

test('P1 PROFILE: audit lỗi không làm hỏng /me', async () => {
  const db = new MockDb({ admin: adminDocument(), throwOnAudit: true });
  const result = await getAdminProfile(ADMIN_ID, { db });
  assert.equal(result.success, true);
  assert.equal(result.admin.lastLogin, null);
});

test('P1 PROFILE: không tìm thấy admin trả 404', async () => {
  const db = new MockDb({ admin: null });
  await assert.rejects(() => getAdminProfile(ADMIN_ID, { db }), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.code, 'ADMIN_NOT_FOUND');
    return true;
  });
});

test('P1 LOGOUT: token hợp lệ ghi audit ADMIN_LOGOUT với IP/UA', async () => {
  const db = new MockDb({ admin: adminDocument() });
  const token = signJwt({ adminId: ADMIN_ID, role: 'ADMIN' }, '1d');
  const recorded = await recordAdminLogoutAudit(token, {
    ip: '14.233.18.17',
    userAgent: 'Mozilla/5.0 Chrome/120',
  }, { db });

  assert.equal(recorded, true);
  assert.equal(db.audit.inserted.length, 1);
  const entry = db.audit.inserted[0];
  assert.equal(entry.action, 'ADMIN_LOGOUT');
  assert.equal(String(entry.admin_id), ADMIN_ID);
  assert.equal(entry.ip, '14.233.18.17');
  assert.match(entry.user_agent, /Chrome\/120/);
});

test('P1 LOGOUT: token sai hoặc thiếu thì không ghi audit và không throw', async () => {
  const db = new MockDb({ admin: adminDocument() });
  assert.equal(await recordAdminLogoutAudit('invalid-token', {}, { db }), false);
  assert.equal(await recordAdminLogoutAudit(null, {}, { db }), false);
  assert.equal(db.audit.inserted.length, 0);
});

test('P1 LOGOUT: DB lỗi vẫn trả false, không throw', async () => {
  const db = {
    collection() {
      throw new Error('db down');
    },
  };
  const token = signJwt({ adminId: ADMIN_ID, role: 'ADMIN' }, '1d');
  const recorded = await recordAdminLogoutAudit(token, { ip: '1.2.3.4' }, { db });
  assert.equal(recorded, false);
});
