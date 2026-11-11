import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_ROLES, createAdminRoleMiddleware, normalizeAdminRole } from '../admin-rbac.js';

test('normalizes canonical and legacy admin roles', () => {
  assert.deepEqual(ADMIN_ROLES, ['SA', 'CA', 'FA', 'CS']);
  assert.equal(normalizeAdminRole('ADMIN'), 'SA');
  assert.equal(normalizeAdminRole('SUPER_ADMIN'), 'SA');
  assert.equal(normalizeAdminRole('CONTENT_ADMIN'), 'CA');
  assert.equal(normalizeAdminRole('FINANCE_ADMIN'), 'FA');
  assert.equal(normalizeAdminRole('SUPPORT_ADMIN'), 'CS');
  assert.equal(normalizeAdminRole('UNKNOWN'), null);
});

test('role middleware permits only explicitly allowed roles', () => {
  const middleware = createAdminRoleMiddleware(['SA', 'CA']);
  const invoke = adminRole => {
    let status = 200;
    let body;
    let calledNext = false;
    const response = {
      status(value) { status = value; return this; },
      json(value) { body = value; return this; },
    };
    middleware({ adminRole }, response, () => { calledNext = true; });
    return { status, body, calledNext };
  };

  assert.equal(invoke('CA').calledNext, true);
  assert.equal(invoke('FA').status, 403);
  assert.equal(invoke(undefined).body.code, 'ADMIN_FORBIDDEN');
});
