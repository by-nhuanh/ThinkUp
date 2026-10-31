import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { signJwt } from '../../db.js';
import { readAuthToken, verifyAccessToken, requireCookieCsrf, createCsrfToken } from '../../auth/auth.user.js';
import { COLLECTION_PAYMENT_PREFERENCES, getPaymentPreferences, updatePaymentPreferences,
  getPaymentTransactions, getPaymentInvoices, getPaymentInvoice, getPaymentMethods,
  getPaymentSettings, createPaymentSettingsRouter } from '../payment-settings.user.js';

// Isolated storage with detached snapshots and atomic writes. No live MongoDB connection.
function storage() {
  const tables = new Map();
  const match = (row, query) => Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object') {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === '$exists') return Object.hasOwn(row, key) === expected;
        throw new Error(`Unsupported query ${operator}`);
      });
    }
    return row[key] === value;
  });
  return { tables, collection(name) {
    if (!tables.has(name)) tables.set(name, []);
    const rows = tables.get(name);
    return {
      async findOne(query) { return structuredClone(rows.find(row => match(row, query)) ?? null); },
      async insertOne(doc) {
        if (rows.some(row => row._id === doc._id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
        rows.push(structuredClone(doc)); return { insertedId: doc._id };
      },
      async updateOne(query, update) {
        assert.deepEqual(Object.keys(update), ['$set']);
        const row = rows.find(item => match(item, query));
        if (!row) return { matchedCount: 0 };
        Object.assign(row, structuredClone(update.$set)); return { matchedCount: 1 };
      },
    };
  } };
}
function fixture() {
  const db = storage();
  const rows = Array.from({ length: 7 }, (_, index) => ({ order_id: `DH${index}`, transaction_id: `GD${index}`,
    status: index === 6 ? 'pending' : 'success', amount: 200000 + index, courses: [{ title: `Course ${index}` }] }));
  const calls = [];
  const options = { db, now: Date.parse('2026-10-31T08:00:00Z'),
    purchaseHistory: async (uid, query) => {
      calls.push(['purchase', uid, query]);
      const transactions = uid === 'alice' ? rows.filter(row => !query.status || row.status === query.status) : [];
      return { transactions, total: transactions.length };
    },
    billingDetail: async (uid, id) => {
      calls.push(['billing', uid, id]);
      const row = rows.find(item => [item.order_id, item.transaction_id].includes(id));
      if (uid !== 'alice' || !row) throw Object.assign(new Error('private billing information'), { status: 404 });
      return { order_id: row.order_id, status: row.status, transactionCode: row.transaction_id,
        invoice: { code: `HD-${row.order_id}`, issuedAt: '31/10/2026 15:00:00' },
        order: { total_number: row.amount, currency: 'VND' } };
    },
  };
  return { options, db, rows, calls };
}
const code = expected => error => error.code === expected;

test('default preferences preserve receipt email, disable unsupported switches, and GET does not write', async () => {
  const f = fixture();
  assert.deepEqual(await getPaymentPreferences('alice', f.options),
    { savePayment: false, invoiceEmail: true, quickConfirm: false, revision: 0 });
  assert.equal(f.db.tables.get(COLLECTION_PAYMENT_PREFERENCES).length, 0);
  assert.deepEqual(getPaymentMethods('alice'), { items: [], supported: false });
  await assert.rejects(getPaymentPreferences(null, f.options), code('PAYMENT_SETTINGS_AUTH_REQUIRED'));
});

test('partial auto-save persists by owner, increments revision and rejects stale updates', async () => {
  const f = fixture();
  let prefs = await updatePaymentPreferences('alice', { invoiceEmail: false, expectedRevision: 0 }, f.options);
  assert.equal(prefs.invoiceEmail, false);
  assert.equal(prefs.revision, 1);
  assert.equal((await getPaymentPreferences('bob', f.options)).invoiceEmail, true);
  await assert.rejects(updatePaymentPreferences('alice', { invoiceEmail: true, expectedRevision: 0 }, f.options), code('PAYMENT_SETTINGS_CONFLICT'));
  prefs = await updatePaymentPreferences('alice', { invoiceEmail: true, expectedRevision: 1 }, f.options);
  assert.equal(prefs.revision, 2);
  assert.equal(prefs.invoiceEmail, true);
});

test('validation rejects injections, unknown fields, invalid revisions and unsupported activation without partial saves', async () => {
  const f = fixture();
  for (const payload of [null, [], {}, { expectedRevision: 0 }, { invoiceEmail: 'false', expectedRevision: 0 },
    { invoiceEmail: false }, { userId: 'bob', expectedRevision: 0 }, { invoiceEmail: false, expectedRevision: '0' },
    { invoiceEmail: false, expectedRevision: -1 }, { invoiceEmail: false, expectedRevision: Number.MAX_SAFE_INTEGER }]) {
    await assert.rejects(updatePaymentPreferences('alice', payload, f.options));
  }
  await assert.rejects(updatePaymentPreferences('alice', { invoiceEmail: false, savePayment: true, expectedRevision: 0 }, f.options), code('PAYMENT_METHOD_STORAGE_UNAVAILABLE'));
  await assert.rejects(updatePaymentPreferences('alice', { quickConfirm: true, expectedRevision: 0 }, f.options), code('PAYMENT_QUICK_CONFIRM_UNAVAILABLE'));
  assert.equal((await getPaymentPreferences('alice', f.options)).invoiceEmail, true);
  assert.equal(f.db.tables.get(COLLECTION_PAYMENT_PREFERENCES).length, 0);
});

test('concurrent first creation and later saves cannot silently overwrite one another', async () => {
  const f = fixture();
  for (const expectedRevision of [0, 1]) {
    const results = await Promise.allSettled([
      updatePaymentPreferences('alice', { invoiceEmail: false, expectedRevision }, f.options),
      updatePaymentPreferences('alice', { invoiceEmail: true, expectedRevision }, f.options),
    ]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(results.find(item => item.status === 'rejected').reason.code, 'PAYMENT_SETTINGS_CONFLICT');
    assert.equal((await getPaymentPreferences('alice', f.options)).revision, expectedRevision + 1);
  }
  assert.equal(f.db.tables.get(COLLECTION_PAYMENT_PREFERENCES).length, 1);
});

test('legacy missing revision is updated by compare-and-set and corrupt preferences fail visibly', async () => {
  const f = fixture();
  const collection = f.db.collection(COLLECTION_PAYMENT_PREFERENCES);
  await collection.insertOne({ _id: 'alice', invoiceEmail: false });
  assert.equal((await getPaymentPreferences('alice', f.options)).revision, 0);
  assert.equal((await updatePaymentPreferences('alice', { invoiceEmail: true, expectedRevision: 0 }, f.options)).revision, 1);
  for (const [index, patch] of [{ invoiceEmail: 'true' }, { revision: -1 }, { savePayment: true }, { quickConfirm: true }].entries()) {
    const uid = `broken-${index}`;
    await collection.insertOne({ _id: uid, ...patch });
    await assert.rejects(getPaymentPreferences(uid, f.options), code('PAYMENT_SETTINGS_STORAGE_ERROR'));
  }
});

test('transaction previews reuse purchase ownership/status logic and expose bounded pagination', async () => {
  const f = fixture();
  const first = await getPaymentTransactions('alice', {}, f.options);
  assert.equal(first.items.length, 5);
  assert.deepEqual(first.pagination, { page: 1, limit: 5, total: 7, hasMore: true });
  const second = await getPaymentTransactions('alice', { page: 2, limit: 5 }, f.options);
  assert.equal(second.items.length, 2);
  assert.equal(second.pagination.hasMore, false);
  assert.equal((await getPaymentTransactions('bob', {}, f.options)).pagination.total, 0);
  const pending = await getPaymentTransactions('alice', { status: 'pending' }, f.options);
  assert.equal(pending.items.length, 1);
  assert.deepEqual(f.calls.at(-1), ['purchase', 'alice', { status: 'pending' }]);
  for (const query of [{ limit: 101 }, { page: 0 }, { page: [] }, { status: { $ne: 'pending' } }]) {
    await assert.rejects(getPaymentTransactions('alice', query, f.options));
  }
});

test('invoices use completed purchases and existing billing snapshots rather than catalog or client prices', async () => {
  const f = fixture();
  const list = await getPaymentInvoices('alice', { limit: 2, page: 2 }, f.options);
  assert.equal(list.pagination.total, 6);
  assert.deepEqual(list.items.map(item => item.id), ['GD2', 'GD3']);
  assert.equal(list.items[0].amount, 200002);
  assert.equal(list.items[0].code, 'HD-DH2');
  assert.equal(list.items[0].detailHref, '/main/profile/billing/DH2');
  assert.equal(f.calls.some(call => call[0] === 'purchase' && call[2].status === 'success'), true);
  await assert.rejects(getPaymentInvoice('alice', 'GD6', f.options), code('PAYMENT_INVOICE_UNAVAILABLE'));
  await assert.rejects(getPaymentInvoice('bob', 'GD0', f.options), error => error.status === 404);
  await assert.rejects(getPaymentInvoice('alice', '../GD0', f.options));
  await assert.rejects(getPaymentInvoices('alice', { status: 'pending' }, f.options));
});

test('overview advertises real capabilities and preserves source failures instead of producing demo data', async () => {
  const f = fixture();
  const overview = await getPaymentSettings('alice', f.options);
  assert.equal(overview.capabilities.invoiceEmail, true);
  assert.equal(overview.capabilities.savePayment, false);
  assert.equal(overview.capabilities.quickConfirm, false);
  assert.equal(overview.capabilities.invoiceDownload, false);
  assert.equal(overview.methods.items.length, 0);
  assert.equal(overview.invoices.items.length, 5);
  const broken = { ...f.options, purchaseHistory: async () => { throw new Error('storage offline'); } };
  await assert.rejects(getPaymentSettings('alice', broken), /storage offline/);
  await assert.rejects(getPaymentTransactions('alice', {}, { ...f.options,
    purchaseHistory: async () => ({ total: 10, transactions: [] }) }), code('PAYMENT_SETTINGS_STORAGE_ERROR'));
  await assert.rejects(getPaymentInvoice('alice', 'GD0', { ...f.options,
    billingDetail: async () => ({ status: 'success', invoice: { code: 'HD-0' }, order: { total_number: -1 } }) }), code('PAYMENT_INVOICE_INCOMPLETE'));
});

test('HTTP settings API enforces auth, cookie CSRF, owner and unsupported actions, and sanitizes dependency failures', async t => {
  const f = fixture();
  const app = express();
  app.use(express.json());
  app.use(requireCookieCsrf);
  const requireAuth = (req, res, next) => {
    try { req.userId = verifyAccessToken(readAuthToken(req)).sub; next(); }
    catch { res.status(401).json({ code: 'AUTH_REQUIRED' }); }
  };
  app.use('/api/user/settings/payment', createPaymentSettingsRouter(express, requireAuth, f.options));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/user/settings/payment`;
  const token = signJwt({ sub: 'alice' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base)).status, 401);
  const overview = await fetch(base, { headers });
  assert.equal(overview.status, 200);
  assert.equal(overview.headers.get('cache-control'), 'no-store');
  assert.equal((await (await fetch(`${base}/methods`, { headers })).json()).data.supported, false);
  const payload = JSON.stringify({ invoiceEmail: false, expectedRevision: 0 });
  assert.equal((await fetch(`${base}/preferences`, { method: 'PATCH',
    headers: { Cookie: `thinkup_user_auth=${token}`, 'Content-Type': 'application/json' }, body: payload })).status, 403);
  const saved = await fetch(`${base}/preferences`, { method: 'PATCH', headers: {
    Cookie: `thinkup_user_auth=${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': createCsrfToken(token),
  }, body: payload });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).data.invoiceEmail, false);
  assert.equal((await fetch(`${base}/preferences`, { method: 'PATCH', headers, body: payload })).status, 409);
  const bobHeaders = { Authorization: `Bearer ${signJwt({ sub: 'bob' })}` };
  assert.equal((await fetch(`${base}/invoices/GD0`, { headers: bobHeaders })).status, 404);
  const enabled = await fetch(`${base}/preferences`, { method: 'PATCH', headers,
    body: JSON.stringify({ savePayment: true, expectedRevision: 1 }) });
  assert.equal(enabled.status, 409);
  assert.equal((await enabled.json()).code, 'PAYMENT_METHOD_STORAGE_UNAVAILABLE');
  f.options.billingDetail = async () => { throw new Error('mongodb://private-host/secret'); };
  const error = await fetch(`${base}/invoices/GD0`, { headers });
  assert.equal(error.status, 503);
  assert.equal((await error.text()).includes('private-host'), false);
  assert.equal((await fetch(`${base}/methods`, { method: 'POST', headers })).status, 404);
});
