import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createAdminUsersRouter, downloadInstructorDocumentFile, instructorDocumentView } from '../users.admin.js';

const userId = new ObjectId().toHexString();
const assetId = '0123456789abcdef0123456789abcdef';
const pdf = Buffer.from('%PDF-1.4\nfixture');

function database({ documents = [], user = { _id: new ObjectId(userId), role: 'student' } } = {}) {
  return { collection(name) {
    if (name === 'users') return { async findOne(query) {
      assert.equal(query.deleted_at.$exists, false);
      return user;
    } };
    if (name === 'instructor_profiles') return { async findOne() { return { user_id: userId, documents }; } };
    if (name === 'instructor_applications') return { async findOne() { return null; } };
    throw new Error(`Unexpected collection: ${name}`);
  } };
}

function contract(overrides = {}) {
  return {
    id: 'contract-sample-v1',
    type: 'contract',
    filename: 'contract.pdf',
    mime_type: 'application/pdf',
    storage: 'cloudinary',
    asset_id: assetId,
    ...overrides,
  };
}

test('lecturer document download fetches only the Cloudinary asset attached to that user', async () => {
  let requestedUrl = '';
  let authorization = '';
  const result = await downloadInstructorDocumentFile(userId, 'contract-sample-v1', {
    db: database({ documents: [contract()] }),
    cloudinary: { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' },
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      authorization = options.headers.Authorization;
      return new Response(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    },
  });
  assert.match(requestedUrl, /api\.cloudinary\.com\/v1_1\/test-cloud\/asset\/download/);
  assert.match(requestedUrl, new RegExp(`asset_id=${assetId}`));
  assert.match(authorization, /^Basic /);
  assert.equal(result.filename, 'contract.pdf');
  assert.equal(result.mimeType, 'application/pdf');
  assert.deepEqual(result.bytes, pdf);
});

test('lecturer document download rejects a document not attached to this account', async () => {
  let fetched = false;
  await assert.rejects(() => downloadInstructorDocumentFile(userId, 'contract-sample-v1', {
    db: database({ documents: [] }), fetchImpl: async () => { fetched = true; },
  }), { status: 404, code: 'LECTURER_DOCUMENT_NOT_FOUND' });
  assert.equal(fetched, false);
});

test('lecturer document download validates document IDs and Cloudinary asset IDs', async () => {
  await assert.rejects(() => downloadInstructorDocumentFile(userId, '../other', { db: database() }),
    { status: 400, code: 'LECTURER_DOCUMENT_ID_INVALID' });
  await assert.rejects(() => downloadInstructorDocumentFile(userId, 'contract-sample-v1', {
    db: database({ documents: [contract({ asset_id: 'not-an-asset-id' })] }),
  }), { status: 409, code: 'LECTURER_DOCUMENT_UNAVAILABLE' });
});

test('lecturer document download rejects storage errors and mismatched file content', async () => {
  const options = { db: database({ documents: [contract()] }),
    cloudinary: { CLOUDINARY_CLOUD_NAME: 'test-cloud', CLOUDINARY_API_KEY: 'test-key', CLOUDINARY_API_SECRET: 'test-secret' } };
  await assert.rejects(() => downloadInstructorDocumentFile(userId, 'contract-sample-v1', {
    ...options, fetchImpl: async () => new Response('denied', { status: 403 }),
  }), { status: 502, code: 'DOCUMENT_STORAGE_FAILED' });
  await assert.rejects(() => downloadInstructorDocumentFile(userId, 'contract-sample-v1', {
    ...options, fetchImpl: async () => new Response('not a pdf', { status: 200 }),
  }), { status: 502, code: 'DOCUMENT_STORAGE_INVALID' });
});

test('lecturer document details hide Cloudinary internals and only give download URLs to SA/CA', () => {
  const source = contract({ id: 'legal-doc-01', title: 'Hồ sơ pháp lý', url: 'https://cloudinary.invalid/private.pdf', public_id: 'secret/path', asset_id: assetId });
  const academicView = instructorDocumentView(source, userId, true);
  const supportView = instructorDocumentView(source, userId, false);
  assert.equal(academicView.downloadUrl, `/api/admin/users/lecturers/${userId}/documents/legal-doc-01/download`);
  assert.equal('url' in academicView, false);
  assert.equal('public_id' in academicView, false);
  assert.equal('asset_id' in academicView, false);
  assert.equal('downloadUrl' in supportView, false);
});

test('lecturer document download route authorizes only SA and CA', () => {
  const routes = [];
  const router = {
    use() {},
    get(path, ...handlers) { routes.push({ method: 'get', path, handlers }); },
    post(path, ...handlers) { routes.push({ method: 'post', path, handlers }); },
    patch(path, ...handlers) { routes.push({ method: 'patch', path, handlers }); },
    put(path, ...handlers) { routes.push({ method: 'put', path, handlers }); },
    delete(path, ...handlers) { routes.push({ method: 'delete', path, handlers }); },
  };
  const express = { Router: () => router, raw: () => (_req, _res, next) => next() };
  createAdminUsersRouter(express, (_req, _res, next) => next());
  const route = routes.find(item => item.method === 'get' && item.path === '/lecturers/:id/documents/:documentId/download');
  assert.ok(route);
  for (const role of ['SA', 'CA']) {
    let passed = false;
    route.handlers[0]({ adminRole: role }, {}, () => { passed = true; });
    assert.equal(passed, true, `${role} can download reviewed documents`);
  }
  for (const role of ['FA', 'CS']) {
    let status = 0, code = '';
    route.handlers[0]({ adminRole: role }, { status(value) { status = value; return this; }, json(body) { code = body.code; } }, () => {});
    assert.equal(status, 403);
    assert.equal(code, 'ADMIN_FORBIDDEN');
  }
});

