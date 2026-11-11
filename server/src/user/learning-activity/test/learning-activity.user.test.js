import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import express from 'express';
import {
  COLLECTION_LEARNING_ACTIVITY, startLearningActivity, recordLearningActivity,
  getRecordedLearningIntervals, getLearningActivitySession, createLearningActivityRouter,
} from '../learning-activity.user.js';
import { createLessonRouter } from '../../lesson/lesson.user.js';
import { createFlashcardRouter } from '../../flashcard/flashcard.user.js';
import { createRoadmapRouter } from '../../roadmap/roadmap.user.js';
import { createHomeRouter, getHomeOverview } from '../../home/home.user.js';

const uid = 'aaaaaaaaaaaaaaaaaaaaaaaa', other = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const courseId = 'cccccccccccccccccccccccc', listId = 'dddddddddddddddddddddddd';
const epoch = Date.parse('2026-11-02T01:00:00Z');
const at = seconds => new Date(epoch + seconds * 1000);

function fixture() {
  const clone = value => value instanceof Date ? new Date(value) : value instanceof ObjectId ? new ObjectId(String(value))
    : Array.isArray(value) ? value.map(clone) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
  const equal = (a, b) => a instanceof ObjectId || b instanceof ObjectId
    ? a instanceof ObjectId && b instanceof ObjectId && String(a) === String(b)
    : a instanceof Date || b instanceof Date ? +a === +b : a === b;
  const matches = (row, query) => Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part));
    if (key === '$and') return value.every(part => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === '$in') return expected.some(item => equal(row[key], item));
        if (operator === '$nin') return !expected.some(item => equal(row[key], item));
        if (operator === '$ne') return !equal(row[key], expected);
        if (operator === '$lte') return row[key] <= expected;
        if (operator === '$gt') return row[key] > expected;
        throw new Error(`Unsupported operator ${operator}`);
      });
    }
    return equal(row[key], value);
  });
  const tables = {
    users: [{ _id: new ObjectId(uid), full_name: 'Minh', status: 'active' }, { _id: new ObjectId(other), full_name: 'Other', status: 'active' }],
    courses: [{ _id: new ObjectId(courseId), course_id: 'react', slug: 'react-course', title: 'React', status: 'published' }],
    user_enrollments: [{ user_id: uid, course_id: 'react', status: 'active' }],
    lessons: [{ _id: 'lesson-object', lesson_id: 'lesson-1', course_id: 'react', title: 'State' }],
    flashcard_lists: [{ _id: new ObjectId(listId), user_id: uid, cards: [{ id: 'card-1' }] }],
    user_roadmaps: [{ _id: 'roadmap-1', user_id: uid, is_active: true, nodes: [{ stage_id: 'stage-1', status: 'in_progress' }] }],
    roadmap_stage_questions: [{ stage_id: 'stage-1', question_id: 'q1' }],
    [COLLECTION_LEARNING_ACTIVITY]: [],
  };
  const compare = sort => (a, b) => {
    for (const [key, direction] of Object.entries(sort)) {
      if (a[key] < b[key]) return -direction;
      if (a[key] > b[key]) return direction;
    }
    return 0;
  };
  const project = (row, options) => options?.projection ? Object.fromEntries(Object.entries(row).filter(([key]) => options.projection[key])) : row;
  const db = { tables, writes: 0, collection(name) {
    if (db.fail === name) throw new Error('secret database URI');
    const rows = tables[name] || (tables[name] = []);
    return {
      async findOne(query, options = {}) {
        const found = rows.filter(row => matches(row, query));
        if (options.sort) found.sort(compare(options.sort));
        return found.length ? clone(project(found[0], options)) : null;
      },
      find(query, options) {
        let found = rows.filter(row => matches(row, query)), selected = options;
        return { sort(order) { found.sort(compare(order)); return this; },
          project(fields) { selected = { projection: fields }; return this; },
          limit(limit) { found = found.slice(0, limit); return this; }, collation() { return this; },
          async toArray() { return found.map(row => clone(project(row, selected))); } };
      },
      async countDocuments(query) { return rows.filter(row => matches(row, query)).length; },
      async insertOne(row) {
        if (rows.some(item => equal(item._id, row._id))) throw Object.assign(new Error('duplicate'), { code: 11000 });
        rows.push(clone(row)); db.writes++;
      },
      async findOneAndUpdate(query, update, options) {
        assert.equal(options.returnDocument, 'after');
        if (db.failUpdate) throw new Error('write failed');
        const row = rows.find(item => matches(item, query));
        if (!row) return null;
        Object.assign(row, clone(update.$set));
        if (update.$push) for (const [key, value] of Object.entries(update.$push)) row[key].push(clone(value));
        db.writes++;
        return clone(row);
      },
    };
  } };
  return db;
}

const start = (db, seconds = 0, kind = 'lesson') => startLearningActivity(uid, kind,
  kind === 'lesson' ? { course_id: 'react-course', lesson_id: 'lesson-1' }
    : kind === 'flashcard' ? { list_id: listId } : { stage_id: 'stage-1' }, { db, now: at(seconds) });
const event = (db, session, seconds, sequence, action = 'heartbeat', active = true) => recordLearningActivity(uid, session.session_id,
  action, action === 'heartbeat' ? { sequence, active } : { sequence }, { db, now: at(seconds) });

test('Activity storage: validate all three targets, canonicalize IDs and award no time for starting', async () => {
  const db = fixture();
  for (const kind of ['lesson', 'flashcard', 'roadmap_quiz']) {
    const session = await start(db, 0, kind);
    assert.equal(session.kind, kind); assert.equal(session.active_seconds, 0); assert.equal(session.sequence, 0);
    assert.equal(session.state, 'ready'); assert.equal(+session.expires_at - +session.created_at, 7200_000);
  }
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY][0].target.course_id, 'react');
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY][2].target.roadmap_id, 'roadmap-1');
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY].flatMap(row => row.intervals).length, 0);
});

test('Activity storage: deny missing identity, injection, foreign content, empty cards and unrelated stage before insert', async () => {
  const db = fixture();
  db.tables.courses[0].admin_hidden = true;
  const enrolledLearnerSession = await start(db);
  assert.equal(enrolledLearnerSession.target.course_id, 'react', 'Learner already enrolled keeps access after Admin hides course from sale');
  for (const value of [null, '', 'invalid', {}]) await assert.rejects(startLearningActivity(value, 'lesson', {}, { db }), { status: 401 });
  await assert.rejects(startLearningActivity(uid, 'lesson', { course_id: { $ne: null }, lesson_id: 'lesson-1' }, { db }), { status: 400 });
  await assert.rejects(startLearningActivity(other, 'lesson', { course_id: 'react', lesson_id: 'lesson-1' }, { db }), { status: 403 });
  await assert.rejects(startLearningActivity(uid, 'lesson', { course_id: 'react', lesson_id: 'unrelated' }, { db }), { status: 404 });
  await assert.rejects(startLearningActivity(other, 'flashcard', { list_id: listId }, { db }), { status: 404 });
  await assert.rejects(startLearningActivity(uid, 'flashcard', { list_id: 'bad' }, { db }), { status: 400 });
  await assert.rejects(startLearningActivity(uid, 'roadmap_quiz', { stage_id: 'other-stage' }, { db }), { status: 404 });
  db.tables.flashcard_lists[0].cards = [];
  await assert.rejects(start(db, 0, 'flashcard'), { status: 409 });
  db.tables.roadmap_stage_questions = [];
  await assert.rejects(start(db, 0, 'roadmap_quiz'), { status: 409 });
  await assert.rejects(startLearningActivity(uid, 'unknown', {}, { db }), { status: 400 });
  assert.equal(db.writes, 1, 'Only the enrolled learner session should be inserted');
});

test('Activity storage: server elapsed time requires consecutive active heartbeats; duplicated retry counts once', async () => {
  const db = fixture(), session = await start(db);
  assert.equal((await event(db, session, 20, 1)).active_seconds, 0);
  assert.equal((await event(db, session, 50, 2)).active_seconds, 30);
  assert.equal((await event(db, session, 55, 2)).active_seconds, 30);
  await assert.rejects(event(db, session, 55, 2, 'heartbeat', false), { code: 'ACTIVITY_SEQUENCE_CONFLICT' });
  await assert.rejects(event(db, session, 55, 3), { code: 'ACTIVITY_HEARTBEAT_TOO_SOON' });
  assert.equal((await event(db, session, 80, 3)).active_seconds, 60);
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY][0].intervals.length, 2);
});

test('Activity storage: inactive and long disconnected gaps cannot be reclaimed', async () => {
  const db = fixture(), session = await start(db);
  await event(db, session, 0, 1);
  assert.equal((await event(db, session, 30, 2, 'heartbeat', false)).active_seconds, 0);
  assert.equal((await event(db, session, 60, 3)).active_seconds, 0);
  assert.equal((await event(db, session, 121, 4)).active_seconds, 0);
  assert.equal((await event(db, session, 151, 5)).active_seconds, 30);
  assert.equal((await event(db, session, 161, 6, 'pause')).active_seconds, 40);
  assert.equal((await event(db, session, 190, 7)).active_seconds, 40);
  assert.equal((await event(db, session, 220, 8, 'finish')).active_seconds, 70);
  assert.equal((await event(db, session, 225, 8, 'finish')).active_seconds, 70);
  await assert.rejects(event(db, session, 250, 9), { status: 410 });
});

test('Activity storage: reject client time, durations, invalid sequence and cross-user session access', async () => {
  const db = fixture(), session = await start(db);
  for (const payload of [null, [], {}, { sequence: 0, active: true }, { sequence: 1.2, active: true },
    { sequence: 1, active: 'true' }, { sequence: 1, active: true, seconds: 900 },
    { sequence: 1, active: true, started_at: at(0) }, { sequence: 1, active: true, user_id: other }]) {
    await assert.rejects(recordLearningActivity(uid, session.session_id, 'heartbeat', payload, { db, now: at(30) }), { status: 400 });
  }
  await assert.rejects(recordLearningActivity(other, session.session_id, 'heartbeat', { sequence: 1, active: true }, { db, now: at(30) }), { status: 404 });
  await assert.rejects(event(db, session, 30, 2), { status: 409 });
  assert.equal(db.writes, 1);
});

test('Activity storage: concurrent identical events are idempotent and different events conflict', async () => {
  const db = fixture(), session = await start(db);
  await event(db, session, 0, 1);
  const repeated = await Promise.all([event(db, session, 30, 2), event(db, session, 30, 2)]);
  assert.deepEqual(repeated[0], repeated[1]);
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY][0].intervals.length, 1);
  const competing = await Promise.allSettled([event(db, session, 60, 3), event(db, session, 60, 3, 'pause')]);
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(competing.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY][0].credited_milliseconds, 60_000);
});

test('Activity storage: access is rechecked after enrollment revocation, list deletion or roadmap change', async () => {
  const db = fixture();
  const lesson = await start(db), flashcard = await start(db, 0, 'flashcard'), quiz = await start(db, 0, 'roadmap_quiz');
  db.tables.user_enrollments[0].status = 'revoked';
  db.tables.flashcard_lists = [];
  db.tables.user_roadmaps[0]._id = 'new-roadmap';
  await assert.rejects(event(db, lesson, 30, 1), { status: 403 });
  await assert.rejects(event(db, flashcard, 30, 1), { status: 404 });
  await assert.rejects(event(db, quiz, 30, 1), { status: 404 });
  assert.equal(db.writes, 3);
});

test('Activity storage: expired session and backwards clock cannot award time', async () => {
  const db = fixture(), session = await start(db);
  await event(db, session, 0, 1);
  await assert.rejects(event(db, session, -1, 2), { status: 503 });
  await assert.rejects(event(db, session, 7200, 2), { status: 410 });
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY][0].credited_milliseconds, 0);
});

test('Activity storage: failed writes remain retryable without awarding duplicate time', async () => {
  const db = fixture(), session = await start(db);
  await event(db, session, 0, 1); db.failUpdate = true;
  await assert.rejects(event(db, session, 30, 2), /write failed/);
  assert.equal(db.tables[COLLECTION_LEARNING_ACTIVITY][0].sequence, 1);
  db.failUpdate = false;
  assert.equal((await event(db, session, 40, 2)).active_seconds, 40);
});

test('Activity storage: reading recovers the event sequence without awarding time or exposing another user', async () => {
  const db = fixture(), session = await start(db);
  await event(db, session, 0, 1);
  const writes = db.writes;
  const result = await getLearningActivitySession(uid, session.session_id, { db, now: at(30) });
  assert.equal(result.next_sequence, 2); assert.equal(result.active_seconds, 0);
  assert.equal(db.writes, writes);
  await assert.rejects(getLearningActivitySession(other, session.session_id, { db, now: at(30) }), { status: 404 });
  assert.equal((await getLearningActivitySession(uid, session.session_id, { db, now: at(7200) })).state, 'expired');
});

test('Activity + Home: unknown pre-tracking streak remains unknown until a qualifying day is recorded', async () => {
  const db = fixture(); await start(db);
  const result = await getHomeOverview(uid, { db, now: at(30) });
  assert.equal(result.learning_activity.total_active_seconds, 0);
  assert.equal(result.learning_activity.current_streak, null);
  assert.equal(result.learning_activity.streak_window_limited, true);
});

test('Activity + Home: 8 minutes lesson + 4 flashcard + 3 quiz meets the daily goal; untracked days remain unknown', async () => {
  const db = fixture();
  let offset = 0;
  for (const [kind, seconds] of [['lesson', 480], ['flashcard', 240], ['roadmap_quiz', 180]]) {
    const session = await start(db, offset, kind);
    await event(db, session, offset, 1);
    for (let elapsed = 30; elapsed <= seconds; elapsed += 30) await event(db, session, offset + elapsed, elapsed / 30 + 1);
    offset += seconds;
  }
  const result = await getHomeOverview(uid, { db, now: at(offset) });
  assert.equal(result.learning_activity.status, 'available');
  assert.equal(result.learning_activity.total_active_seconds, 900);
  assert.equal(result.learning_activity.qualifying_days, 1);
  assert.equal(result.learning_activity.current_streak, 1);
  assert.equal(result.learning_activity.days.length, 365);
  assert.equal(result.learning_activity.days[0].date, '2026-01-01');
  assert.equal(result.learning_activity.days[0].coverage, 'untracked');
  assert.equal(result.learning_activity.days.find(day => day.date === '2026-11-02').coverage, 'partial');
  assert.equal(result.learning_activity.history_complete, false);
  assert.equal(result.learning_activity.streak_window_limited, true);
  const foreign = await getHomeOverview(other, { db, now: at(offset) });
  assert.equal(foreign.learning_activity.status, 'not_started');
});

test('Activity + Home: overlapping sessions on multiple devices never double daily time', async () => {
  const db = fixture(), one = await start(db), two = await start(db, 0, 'flashcard');
  await event(db, one, 0, 1); await event(db, two, 0, 1);
  for (let seconds = 30; seconds <= 900; seconds += 30) {
    await Promise.all([event(db, one, seconds, seconds / 30 + 1), event(db, two, seconds, seconds / 30 + 1)]);
  }
  const result = await getHomeOverview(uid, { db, now: at(900) });
  assert.equal(result.learning_activity.total_active_seconds, 900);
});

test('Activity history: retained intervals, window filtering, owner isolation and errors propagate', async () => {
  const db = fixture(), session = await start(db, -40 * 86400);
  await event(db, session, -40 * 86400, 1);
  await event(db, session, -40 * 86400 + 30, 2);
  const from = at(-84 * 86400), to = at(0);
  assert.equal((await getRecordedLearningIntervals(uid, from, to, { db })).intervals.length, 1);
  assert.equal((await getRecordedLearningIntervals(other, from, to, { db })).recorded_since, null);
  assert.equal((await getRecordedLearningIntervals(uid, at(-86400), to, { db })).intervals.length, 0);
  await assert.rejects(getRecordedLearningIntervals(uid, to, from, { db }), { status: 400 });
  db.fail = COLLECTION_LEARNING_ACTIVITY;
  await assert.rejects(getHomeOverview(uid, { db, now: at(0) }), /secret database URI/);
});

test('Activity HTTP: real module routes, event contract, auth, foreign access, sanitized errors and home integration', async t => {
  const db = fixture(); let seconds = 0;
  const options = { db, get now() { return at(seconds); } };
  const auth = (req, res, next) => {
    if (!['Bearer one', 'Bearer other'].includes(req.headers.authorization)) return res.status(401).json({ success: false });
    req.userId = req.headers.authorization === 'Bearer one' ? uid : other; next();
  };
  const app = express(); app.use(express.json());
  app.use('/lessons', createLessonRouter(express, auth, auth, options));
  app.use('/flashcards', createFlashcardRouter(express, auth, options));
  app.use('/roadmap', createRoadmapRouter(express, auth, options));
  app.use('/activity', createLearningActivityRouter(express, auth, options));
  app.use('/home', createHomeRouter(express, auth, options));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}, token = 'one') => fetch(base + path,
    { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  assert.equal((await post('/lessons/lesson-1/activity-session', { course_id: 'react' }, 'missing')).status, 401);
  assert.equal((await post('/lessons/lesson-1/activity-session', { course_id: 'react', user_id: other })).status, 400);
  const started = await post('/lessons/lesson-1/activity-session', { course_id: 'react' });
  assert.equal(started.status, 201); assert.equal(started.headers.get('cache-control'), 'no-store');
  const id = (await started.json()).data.session_id;
  const endpoint = '/activity/sessions/' + id + '/heartbeat';
  assert.equal((await post(endpoint, { sequence: 1, active: true })).status, 200);
  seconds = 30;
  const heartbeat = await post(endpoint, { sequence: 2, active: true });
  assert.equal((await heartbeat.json()).data.active_seconds, 30);
  const recovered = await fetch(base + '/activity/sessions/' + id, { headers: { authorization: 'Bearer one' } });
  assert.equal((await recovered.json()).data.next_sequence, 3);
  assert.equal((await post(endpoint, { sequence: 3, active: true }, 'other')).status, 404);
  assert.equal((await post(endpoint, { sequence: 3, active: true, time_spent_seconds: 900 })).status, 400);
  assert.equal((await post(endpoint + '?userId=' + other, { sequence: 3, active: true })).status, 400);
  assert.equal((await post(`/flashcards/${listId}/activity-session`)).status, 201);
  assert.equal((await post('/roadmap/stage-test/stage-1/activity-session')).status, 201);
  const home = await fetch(base + '/home', { headers: { authorization: 'Bearer one' } });
  assert.equal((await home.json()).data.learning_activity.total_active_seconds, 30);
  db.fail = COLLECTION_LEARNING_ACTIVITY;
  const failed = await post(endpoint, { sequence: 3, active: true });
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /secret database URI/);
});
