import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAdminPreferencesRouter } from '../preferences.admin.js';

const ADMIN_A = '65f123456789abcdef012345';
const ADMIN_B = '65f123456789abcdef012346';

function fixture() {
  const documents = new Map();
  const collection = {
    async findOne(query) {
      return documents.get(query.admin_id) ?? null;
    },
    async insertOne(document) {
      if (documents.has(document.admin_id)) {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
      }
      documents.set(document.admin_id, { ...document });
      return { insertedId: document._id };
    },
    async updateOne(query, update) {
      const current = documents.get(query.admin_id);
      if (!current || current._id !== query._id || current.revision !== query.revision) {
        return { matchedCount: 0 };
      }
      Object.assign(current, update.$set);
      current.revision += update.$inc.revision;
      return { matchedCount: 1 };
    },
  };
  const db = { collection: () => collection };
  const auth = (req, res, next) => {
    const adminId = req.get('x-test-admin-id');
    if (!adminId) return res.status(401).json({ message: 'Yêu cầu đăng nhập.', code: 'UNAUTHORIZED' });
    req.adminId = adminId;
    next();
  };
  const router = createAdminPreferencesRouter(express, auth, { db });
  const app = express();
  app.use(express.json());
  app.use('/api/admin/preferences', router);
  app.use('/api/v1/admin/preferences', router);
  app.use((error, req, res, next) => {
    void next;
    const payload = { message: error.message };
    if (error.code) payload.code = error.code;
    res.status(error.status || 500).json(payload);
  });
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve) => server.once('listening', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      close: () => new Promise((done, reject) => server.close((error) => error ? reject(error) : done())),
      request: (path, { adminId, method = 'GET', body } = {}) => fetch(`${base}${path}`, {
        method,
        headers: {
          ...(adminId ? { 'x-test-admin-id': adminId } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    });
  }));
}

test('preferences routes require authentication and return no-store on both prefixes', async () => {
  const app = await fixture();
  try {
    for (const prefix of ['/api/admin/preferences', '/api/v1/admin/preferences']) {
      const denied = await app.request(prefix);
      assert.equal(denied.status, 401);

      const response = await app.request(prefix, { adminId: ADMIN_A });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).revision, 0);
    }
  } finally {
    await app.close();
  }
});

test('preferences PUT validates input, isolates admins, and reports stale revisions', async () => {
  const app = await fixture();
  const body = {
    revision: 0,
    preferences: {
      breadcrumbsVisible: true,
      timezone: 'Asia/Ho_Chi_Minh',
      statusBarEnabled: true,
      theme: 'dark',
      density: 'compact',
    },
  };
  try {
    const invalid = await app.request('/api/admin/preferences', {
      adminId: ADMIN_A,
      method: 'PUT',
      body: { ...body, preferences: { ...body.preferences, locale: 'en' } },
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'PREFERENCES_FIELD_INVALID');

    const saved = await app.request('/api/v1/admin/preferences', {
      adminId: ADMIN_A,
      method: 'PUT',
      body,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('cache-control'), 'no-store');
    assert.equal((await saved.json()).revision, 1);

    const stale = await app.request('/api/admin/preferences', {
      adminId: ADMIN_A,
      method: 'PUT',
      body,
    });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'PREFERENCES_CONFLICT');

    const otherAdmin = await app.request('/api/admin/preferences', { adminId: ADMIN_B });
    const otherSnapshot = await otherAdmin.json();
    assert.equal(otherSnapshot.revision, 0);
    assert.equal(otherSnapshot.preferences.theme, 'light');
  } finally {
    await app.close();
  }
});
