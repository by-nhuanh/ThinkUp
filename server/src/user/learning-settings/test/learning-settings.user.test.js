import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireCookieCsrf, createCsrfToken, signJwt } from '../../auth/auth.user.js';
import { getLearningPreferences, getLearningSettings, updateLearningPreferences, resolveLearningPlayback,
  learningUtcDate, learningDateParts, learningDateRange, createLearningSettingsRouter } from '../learning-settings.user.js';

function storage() {
  const rows = new Map();
  return { rows, collection(name) {
    assert.equal(name, 'learning_preferences');
    return {
      async findOne(q) { return structuredClone(rows.get(q._id) || null); },
      async insertOne(doc) { if (rows.has(doc._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); rows.set(doc._id, structuredClone(doc)); },
      async updateOne(q, update) {
        const doc = rows.get(q._id);
        if (!doc || (q.revision?.$exists === false ? Object.hasOwn(doc, 'revision') : doc.revision !== q.revision)) return { matchedCount: 0 };
        Object.assign(doc, structuredClone(update.$set)); return { matchedCount: 1 };
      },
    };
  } };
}

test('Learning settings: defaults read without inserting and owner isolation', async () => {
  const db = storage(); const value = await getLearningSettings('one', { db });
  assert.equal(value.revision, 0); assert.equal(value.timezone, 'Asia/Ho_Chi_Minh'); assert.equal(value.capabilities.downloadQuality, false);
  assert.equal(db.rows.size, 0);
  await updateLearningPreferences('one', { expectedRevision: 0, playbackSpeed: 1.5, autoNext: false, timezone: 'GMT+09:00' }, { db });
  assert.equal((await getLearningPreferences('one', { db })).timezone, 'Asia/Tokyo');
  assert.equal((await getLearningPreferences('two', { db })).playbackSpeed, '1.0');
});
test('Learning settings: partial updates, stale revision and concurrent first writes', async () => {
  const db = storage();
  const results = await Promise.allSettled([true, false].map(autoNext => updateLearningPreferences('one', { expectedRevision: 0, autoNext }, { db })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'LEARNING_SETTINGS_CONFLICT');
  const next = await updateLearningPreferences('one', { expectedRevision: 1, subtitles: true }, { db });
  assert.equal(next.revision, 2); assert.equal(next.subtitles, true);
  await assert.rejects(updateLearningPreferences('one', { expectedRevision: 1, subtitles: false }, { db }), { status: 409 });
});
test('Learning settings: reject invalid and unavailable options before writes', async () => {
  const db = storage();
  for (const payload of [null, [], {}, { subtitles: true }, { expectedRevision: 0, userId: 'victim' },
    { expectedRevision: 0, subtitles: 'true' }, { expectedRevision: 0, playbackSpeed: ' 1' },
    { expectedRevision: 0, playbackSpeed: 3 }, { expectedRevision: 0, timezone: 'unknown' },
    { expectedRevision: 0, videoQuality: '4k' }]) {
    await assert.rejects(updateLearningPreferences('one', payload, { db }), { status: 400 });
  }
  for (const patch of [{ language: 'en' }, { downloadQuality: 'saving' }, { downloadLocation: 'choose' }])
    await assert.rejects(updateLearningPreferences('one', { expectedRevision: 0, ...patch }, { db }), { status: 409 });
  await assert.rejects(getLearningPreferences('', { db }), { status: 401 });
  assert.equal(db.rows.size, 0);
});
test('Learning settings: corrupted stored values and storage failures propagate', async () => {
  const db = storage();db.rows.set('one', { revision: 0, playbackSpeed: 8 });
  await assert.rejects(getLearningPreferences('one', { db }), { status: 503 });
  await assert.rejects(getLearningPreferences('one', { db: { collection() { throw new Error('storage offline'); } } }), /storage offline/);
});
test('Learning settings: actual video quality, captions, defaults and honest fallback', async () => {
  const db = storage();
  await updateLearningPreferences('one', { expectedRevision: 0, videoQuality: '720p', playbackSpeed: '1.25', subtitles: true, autoNext: false }, { db });
  const video = { video_url: '/original.mp4', video_sources: [{ quality: '720p', url: '/720.mp4' }],
    caption_tracks: [{ language: 'vi', label: 'Tiếng Việt', url: '/vi.vtt' }] };
  const selected = await resolveLearningPlayback('one', video, { db });
  assert.equal(selected.videoUrl, '/720.mp4');assert.equal(selected.effective.subtitles, true);assert.equal(selected.effective.autoNext, false);
  const fallback = await resolveLearningPlayback('one', { video_url: '/original.mp4' }, { db });
  assert.equal(fallback.qualityFallback, true);assert.equal(fallback.effective.subtitles, false);
  const guest = await resolveLearningPlayback(null, video, { db: { collection() { throw new Error('guest must not read preferences'); } } });
  assert.equal(guest.effective.playbackSpeed, 1);
  await assert.rejects(resolveLearningPlayback(null, {}), { status: 404 });
  await assert.rejects(resolveLearningPlayback(null, { video_url: 'javascript:alert(1)' }), { status: 503 });
});
test('Learning settings: canonical instants, calendar boundaries and DST', () => {
  assert.equal(learningUtcDate('2026-10-31 00:00:00').toISOString(), '2026-10-30T17:00:00.000Z');
  assert.equal(learningDateParts('2026-10-30T18:00:00Z', 'Asia/Tokyo').dateOnly, '31/10/2026');
  assert.equal(learningUtcDate('invalid'), null);
  const range = learningDateRange({ dateFrom: '2026-03-08', dateTo: '2026-03-08' }, 'America/New_York');
  assert.equal(+range.to - +range.from + 1, 23 * 3600000);
  const fall = learningDateRange({ dateFrom: '2026-11-01', dateTo: '2026-11-01' }, 'America/New_York');
  assert.equal(+fall.to - +fall.from + 1, 25 * 3600000);
  const today = learningDateRange({ datePreset: 'today' }, 'Asia/Tokyo', new Date('2026-10-30T18:00:00Z'));
  assert.equal(today.from.toISOString(), '2026-10-30T15:00:00.000Z');
  for (const filters of [{ dateFrom: '2026-02-30' }, { dateFrom: '2026-11-02', dateTo: '2026-11-01' }, { datePreset: 'unknown' }])
    assert.throws(() => learningDateRange(filters, 'Asia/Tokyo'), { status: 400 });
});
test('Learning settings: HTTP auth, update contract, no-store and sanitized failures', async t => {
  const token = signJwt({ sub: 'one' });
  const db = storage(), app = express();app.use(express.json());app.use(requireCookieCsrf);
  const auth = (req, res, next) => { if (req.headers.authorization !== 'Bearer test' && req.headers.cookie !== 'thinkup_user_auth=' + token) return res.status(401).json({ success: false }); req.userId = 'one'; next(); };
  app.use('/settings', createLearningSettingsRouter(express, auth, { db }));
  app.use('/offline', createLearningSettingsRouter(express, auth, { db: { collection() { throw new Error('secret database path'); } } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/settings')).status, 401);
  const cookieHeaders = { cookie: 'thinkup_user_auth=' + token, 'content-type': 'application/json' };
  const denied = await fetch(base + '/settings', { method: 'PUT', headers: cookieHeaders, body: JSON.stringify({ expectedRevision: 0, autoNext: false }) });
  assert.equal(denied.status, 403);assert.equal(db.rows.size, 0);
  const cookieSave = await fetch(base + '/settings', { method: 'PUT', headers: { ...cookieHeaders, 'x-csrf-token': createCsrfToken(token) }, body: JSON.stringify({ expectedRevision: 0, subtitles: true }) });
  assert.equal(cookieSave.status, 200);
  const headers = { authorization: 'Bearer test', 'content-type': 'application/json' };
  const saved = await fetch(base + '/settings', { method: 'PUT', headers, body: JSON.stringify({ expectedRevision: 1, autoNext: false }) });
  assert.equal(saved.status, 200); assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal((await saved.json()).data.autoNext, false);
  const offline = await fetch(base + '/offline', { headers });assert.equal(offline.status, 503);assert.doesNotMatch(await offline.text(), /secret database path/);
});
