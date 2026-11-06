import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import { getHomeOverview, summarizeHomeLearningActivity, createHomeRouter } from '../home.user.js';
import { getPersonalizedCourseFeed } from '../../course/rcm_course.js';

const uid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const other = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const now = new Date('2026-11-02T03:00:00Z');

// Read-only Mongo fixture: evaluate every ownership predicate, fail on unsupported
// operations, and never connect to the project's real database.
function storage(seed = {}) {
  const tables = { users: [{ _id: new ObjectId(uid), full_name: 'Nguyễn Minh', status: 'active', password_hash: 'private' }], ...seed };
  const equal = (a, b) => a instanceof ObjectId || b instanceof ObjectId
    ? a instanceof ObjectId && b instanceof ObjectId && String(a) === String(b) : a === b;
  const matches = (row, query) => Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(item => matches(row, item));
    if (key === '$and') return value.every(item => matches(row, item));
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$in') return expected.some(item => equal(row[key], item));
        if (op === '$nin') return !expected.some(item => equal(row[key], item));
        if (op === '$lte') return row[key] <= expected;
        if (op === '$gt') return row[key] > expected;
        throw new Error('Unsupported operator ' + op);
      });
    }
    return equal(row[key], value);
  });
  const compare = sort => (a, b) => {
    for (const [key, direction] of Object.entries(sort)) {
      if (a[key] < b[key]) return -direction;
      if (a[key] > b[key]) return direction;
    }
    return 0;
  };
  const calls = [];
  return { tables, calls, collection(name) {
    calls.push(name);
    if (name === this.failCollection) throw new Error('mongodb://private-password/internal-path');
    const rows = tables[name] || [];
    return {
      find(query) {
        let found = rows.filter(row => matches(row, query)), projection;
        return { sort(order) { found.sort(compare(order)); return this; },
          project(fields) { projection = fields; return this; },
          limit(limit) { found = found.slice(0, limit); return this; },
          collation() { return this; },
          async toArray() { return projection ? found.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => projection[key] || key === '_id'))) : found; } };
      },
      async countDocuments(query) { return rows.filter(row => matches(row, query)).length; },
      async findOne(query, options = {}) {
        const found = rows.filter(row => matches(row, query));
        if (options.sort) found.sort(compare(options.sort));
        if (!found.length) return null;
        return options.projection ? Object.fromEntries(Object.entries(found[0]).filter(([key]) => options.projection[key])) : found[0];
      },
    };
  } };
}

function course(index, extra = {}) {
  return { _id: new ObjectId(index.toString(16).padStart(24, '0')), course_id: `course-${index}`,
    title: `Khóa ${index}`, status: 'published', total_students: index, ...extra };
}

test('Home: real user name, read-only empty state and honest untracked activity', async () => {
  const db = storage();
  const result = await getHomeOverview(uid, { db, now });
  assert.deepEqual(result.user, { full_name: 'Nguyễn Minh' });
  assert.equal(result.greeting, 'Chào buổi sáng,');
  assert.deepEqual(result.my_learning, { total: 0, courses: [] });
  assert.equal(result.roadmap, null);
  assert.equal(result.learning_activity.status, 'not_started');
  assert.equal(result.learning_activity.daily_goal_seconds, 900);
  assert.equal(result.learning_activity.start_date, '2026-01-01');
  assert.equal(result.learning_activity.end_date, '2026-12-31');
  assert.equal(result.learning_activity.days.length, 365);
  assert.equal(result.learning_activity.days[0].coverage, 'untracked');
  assert.equal(result.learning_activity.current_streak, null);
  assert.equal(result.recommendations.personalized, false);
  assert.doesNotMatch(JSON.stringify(result), /password_hash|private/);
  assert.equal(db.calls.includes('user_activity_logs'), false);
});

test('Home: reject absent/malformed identity before accessing storage, missing and blocked accounts', async () => {
  const db = storage();
  for (const value of [undefined, null, '', 'bad', {}, { $ne: null }]) {
    await assert.rejects(getHomeOverview(value, { db }), { status: 401 });
  }
  assert.equal(db.calls.length, 0);
  await assert.rejects(getHomeOverview(other, { db }), { status: 404 });
  for (const patch of [{ status: 'locked' }, { is_active: false }]) {
    await assert.rejects(getHomeOverview(uid, { db: storage({ users: [{ _id: new ObjectId(uid), ...patch }] }) }), { status: 403 });
  }
});

test('Home: active owned courses only, deduplicated aliases, newest first and max five', async () => {
  const courses = Array.from({ length: 11 }, (_, index) => course(index + 1));
  const db = storage({ courses,
    user_enrollments: courses.slice(0, 9).map(item => ({ user_id: uid, course_id: item.course_id, status: item.course_id === 'course-9' ? 'revoked' : 'active' })),
    user_courses: [{ user_id: new ObjectId(uid), course_id: courses[0]._id }, { user_id: other, course_id: 'course-10', status: 'active' }],
    user_course_progress: courses.map((item, index) => ({ user_id: index === 9 ? other : uid,
      course_id: index === 0 ? String(item._id) : item.course_id, progress_percentage: index === 6 ? 100 : index === 7 ? 0 : 25,
      updated_at: new Date(`2026-10-${String(index + 1).padStart(2, '0')}T00:00:00Z`) })),
  });
  const result = await getHomeOverview(uid, { db, now });
  assert.equal(result.my_learning.total, 6);
  assert.deepEqual(result.my_learning.courses.map(item => item.course_id), ['course-6', 'course-5', 'course-4', 'course-3', 'course-2']);
  assert.equal(result.my_learning.courses[0].resume_lesson, null);
});

test('Home: resume unfinished last lesson, then first unfinished lesson in section order', async () => {
  const c = course(1);
  const db = storage({ courses: [c], user_courses: [{ userId: uid, course_id: String(c._id) }],
    user_course_progress: [{ user_id: new ObjectId(uid), course_id: c.course_id, progress_percentage: 0,
      last_accessed_lesson_id: 'b', completed_lesson_ids: ['a'] }],
    course_sections: [{ course_id: c.course_id, section_id: 's2', order_index: 2 }, { course_id: c.course_id, section_id: 's1', order_index: 1 }],
    lessons: ['a', 'b', 'c', 'd'].map((id, index) => ({ _id: id, lesson_id: id, title: id,
      course_id: index === 2 ? c._id : c.course_id, section_id: id === 'd' ? 's1' : 's2', order_index: index })),
    user_lesson_progress: [{ user_id: other, course_id: c.course_id, lesson_id: 'b', status: 'completed' }],
  });
  const read = async () => (await getHomeOverview(uid, { db, now })).my_learning.courses[0];
  assert.equal((await read()).resume_lesson.lesson_id, 'b');
  db.tables.user_lesson_progress.push({ user_id: uid, course_id: c.course_id, lesson_id: 'b', status: 'completed' });
  assert.equal((await read()).resume_lesson.lesson_id, 'd');
  db.tables.user_course_progress[0].completed_lesson_ids.push('c', 'd');
  assert.equal((await read()).resume_lesson, null);
});

test('Home: corrupt progress is an explicit error rather than fabricated progress', async () => {
  for (const value of [-1, 101, NaN, '50']) {
    const db = storage({ courses: [course(1)], user_courses: [{ user_id: uid, course_id: 'course-1' }],
      user_course_progress: [{ user_id: uid, course_id: 'course-1', progress_percentage: value }] });
    await assert.rejects(getHomeOverview(uid, { db, now }), { status: 503, code: 'HOME_PROGRESS_INVALID' });
  }
});

test('Home: latest active roadmap belongs to user and reuses roadmap progress rules', async () => {
  const db = storage({ user_roadmaps: [
    { _id: 'foreign', user_id: other, is_active: true, updated_at: new Date('2026-11-02') },
    { _id: 'inactive', user_id: uid, is_active: false, updated_at: new Date('2026-11-02') },
    { _id: 'old', user_id: uid, is_active: true, updated_at: new Date('2026-10-01') },
    { _id: 'current', user_id: uid, is_active: true, category_id: 1, career_name: 'Frontend',
      updated_at: new Date('2026-11-01'), nodes: [{ status: 'completed' }, { status: 'in_progress' }] },
  ] });
  const roadmap = (await getHomeOverview(uid, { db, now })).roadmap;
  assert.equal(roadmap.roadmap_id, 'current');
  assert.equal(roadmap.progress_percentage, 50);
  assert.equal(roadmap.total_nodes, 2);
});

test('Home: preserve existing personalized feed ranking before taking five, published courses only', async () => {
  const db = storage({ courses: Array.from({ length: 8 }, (_, index) => course(index + 1,
    { category_id: index === 0 ? 'target' : 'other', level: 'beginner' })),
    student_onboarding_answers: [{ user_id: new ObjectId(uid), category_id: 'target', level: 'beginner', selected_tag_ids: ['js'] }],
    course_tags: [{ course_id: 'course-1', tag_id: 'js' }],
  });
  db.tables.courses.push(course(9, { status: 'draft', total_students: 9999 }));
  const expected = await getPersonalizedCourseFeed({ userId: uid, page: 1, limit: 5, dbInstance: db });
  const result = await getHomeOverview(uid, { db, now });
  assert.equal(result.recommendations.personalized, true);
  assert.deepEqual(result.recommendations.courses.map(course => course.course_id), expected.courses.map(course => course.course_id));
  assert.equal(result.recommendations.courses.length, 5);
});

test('Home: greeting and history window follow saved learning timezone', async () => {
  const db = storage({ learning_preferences: [{ _id: uid, timezone: 'America/New_York' }] });
  const result = await getHomeOverview(uid, { db, now });
  assert.equal(result.greeting, 'Chào buổi tối,');
  assert.equal(result.learning_activity.days.find(day => day.date === '2026-11-02').coverage, 'future');
  assert.equal(result.timezone, 'America/New_York');
});

function interval(started_at, seconds) {
  return { started_at, ended_at: new Date(Date.parse(started_at) + seconds * 1000).toISOString() };
}

const day = (result, date) => result.days.find(item => item.date === date);

test('Activity: yearly heatmap counts active days separately from goal days and all color boundaries', () => {
  const seconds = [0, 1, 899, 900, 1799, 1800, 3599, 3600];
  const sessions = seconds.filter(Boolean).map((value, index) => interval('2026-10-' + String(index + 2).padStart(2, '0') + 'T01:00:00Z', value));
  const result = summarizeHomeLearningActivity(sessions, { now });
  assert.equal(result.year, 2026); assert.equal(result.days.length, 365);
  assert.deepEqual(result.days.slice(273, 281).map(item => item.intensity_level), [0, 1, 1, 2, 2, 3, 3, 4]);
  assert.equal(result.active_days, 7); assert.equal(result.qualifying_days, 5);
});

test('Activity: accumulate 8+4+3 minutes; goal is exactly 900 seconds', () => {
  const sessions = [interval('2026-11-02T01:00:00Z', 480), interval('2026-11-02T02:00:00Z', 240), interval('2026-11-02T02:30:00Z', 179)];
  assert.equal(day(summarizeHomeLearningActivity(sessions, { now }), '2026-11-02').goal_met, false);
  sessions[2] = interval('2026-11-02T02:30:00Z', 180);
  const result = summarizeHomeLearningActivity(sessions, { now });
  assert.equal(day(result, '2026-11-02').active_seconds, 900);
  assert.equal(result.current_streak, 1);
});

test('Activity: merge duplicate, overlapping and contained intervals across devices', () => {
  const session = interval('2026-11-02T01:00:00Z', 600);
  const result = summarizeHomeLearningActivity([session, session, interval('2026-11-02T01:05:00Z', 600), interval('2026-11-02T01:06:00Z', 30)], { now });
  assert.equal(result.total_active_seconds, 900);
});

test('Activity: split local midnight, clip future, and retain activity older than 84 days', () => {
  const result = summarizeHomeLearningActivity([interval('2026-11-01T16:50:00Z', 1800), interval('2026-11-02T02:55:00Z', 600),
    interval('2026-01-02T01:00:00Z', 900), interval('2026-11-03T01:00:00Z', 900)], { now });
  assert.equal(day(result, '2026-11-01').active_seconds, 600);
  assert.equal(day(result, '2026-11-02').active_seconds, 1500);
  assert.equal(day(result, '2026-01-02').active_seconds, 900);
  assert.equal(day(result, '2026-11-03').coverage, 'future');
  assert.equal(day(result, '2026-11-03').intensity_level, null);
});

test('Activity: streak preserves yesterday, breaks after missed day and does not reset at Monday', () => {
  const sessions = ['2026-10-31', '2026-11-01'].map(date => interval(date + 'T01:00:00Z', 900));
  assert.equal(summarizeHomeLearningActivity(sessions, { now }).streak.current_streak, 2);
  assert.equal(summarizeHomeLearningActivity(sessions, { now: new Date('2026-11-03T03:00:00Z') }).streak.current_streak, 0);
  sessions.push(interval('2026-11-02T01:00:00Z', 900));
  const result = summarizeHomeLearningActivity(sessions, { now });
  assert.equal(result.streak.current_streak, 3);
  assert.equal(result.streak.week_start, '2026-11-02');
  assert.deepEqual(result.streak.days.map(item => item.weekday_label), ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
  assert.equal(result.streak.days[0].goal_met, true);
  assert.equal(result.streak.days[1].coverage, 'future');
});

test('Activity: leap year calendar, weekday alignment and padding cells', () => {
  const result = summarizeHomeLearningActivity([interval('2024-02-29T01:00:00Z', 300)], { now, year: 2024 });
  assert.equal(result.days.length, 366);
  assert.equal(day(result, '2024-02-29').weekday_label, 'T5');
  assert.equal(result.weeks.flat().filter(Boolean).length, 366);
  for (const week of result.weeks) week.forEach((item, index) => { if (item) assert.equal(item.weekday, index); });
  assert.equal(result.active_days, 1); assert.equal(result.qualifying_days, 0);
});

test('Activity: DST repeated hour uses elapsed time and short DST day splits at midnight', () => {
  const fall = summarizeHomeLearningActivity([{ started_at: '2026-11-01T01:30:00-04:00', ended_at: '2026-11-01T01:45:00-05:00' }],
    { timezone: 'America/New_York', now: new Date('2026-11-02T03:00:00Z') });
  assert.equal(day(fall, '2026-11-01').active_seconds, 4500);
  const spring = summarizeHomeLearningActivity([{ started_at: '2026-03-08T23:50:00-04:00', ended_at: '2026-03-09T00:20:00-04:00' }],
    { timezone: 'America/New_York', now: new Date('2026-03-09T12:00:00Z') });
  assert.equal(day(spring, '2026-03-08').active_seconds, 600);
  assert.equal(day(spring, '2026-03-09').active_seconds, 1200);
});

test('Activity: streak exceeds 84 days and crosses a year independently of selected heatmap', () => {
  const reference = new Date('2026-02-01T03:00:00Z');
  const sessions = Array.from({ length: 130 }, (_, index) => interval(new Date(+reference - index * 86400000 - 3600000).toISOString(), 900));
  const current = summarizeHomeLearningActivity(sessions, { now: reference });
  const previous = summarizeHomeLearningActivity(sessions, { now: reference, year: 2025 });
  assert.equal(current.streak.current_streak, 130);
  assert.deepEqual(previous.streak, current.streak);
  assert.equal(current.qualifying_days, 32); assert.equal(previous.qualifying_days, 98);
  assert.equal(current.streak.history_limited, false);
});

test('Activity: unknown history differs from zero and future; partial first day bounds streak', () => {
  const result = summarizeHomeLearningActivity([interval('2026-11-02T01:00:00Z', 900)], { now, recordedSince: '2026-11-02T00:00:00Z' });
  assert.equal(day(result, '2026-11-01').active_seconds, null);
  assert.equal(day(result, '2026-11-01').intensity_level, null);
  assert.equal(day(result, '2026-11-02').coverage, 'partial');
  assert.equal(result.streak.current_streak, 1); assert.equal(result.streak.history_limited, true);
  const beforeTracking = summarizeHomeLearningActivity([], { now, year: 2024, recordedSince: '2026-11-02T00:00:00Z' });
  assert.equal(beforeTracking.active_days, null);
  assert.equal(beforeTracking.total_active_seconds, null);
  const noSessions = summarizeHomeLearningActivity([], { now, recordedSince: null });
  assert.equal(noSessions.status, 'not_started'); assert.equal(noSessions.active_days, null);
  const tracked = summarizeHomeLearningActivity([], { now, recordedSince: '2026-01-01T00:00:00+07:00' });
  assert.equal(day(tracked, '2026-11-01').active_seconds, 0);
  assert.equal(day(tracked, '2026-11-01').intensity_level, 0);
  assert.equal(tracked.streak.current_streak, 0);
});

test('Activity: invalid intervals, year, timezone, reference and stored tracking timestamp fail explicitly', () => {
  for (const intervals of [null, [null], [{ started_at: 'invalid', ended_at: now }],
    [{ started_at: '2026-11-02 01:00:00', ended_at: now }], [{ started_at: now, ended_at: new Date(+now - 1000) }]])
    assert.throws(() => summarizeHomeLearningActivity(intervals, { now }), { status: 400 });
  for (const year of [0, -1, 2027, '2026.0', ' 2026', [], {}, null])
    assert.throws(() => summarizeHomeLearningActivity([], { now, year }), { code: 'HOME_YEAR_INVALID' });
  assert.throws(() => summarizeHomeLearningActivity([], { now, timezone: 'bad' }), { status: 400 });
  assert.throws(() => summarizeHomeLearningActivity([], { now: 'bad' }), { status: 400 });
  assert.throws(() => summarizeHomeLearningActivity([], { now, recordedSince: 'bad' }), { status: 503 });
  assert.equal(summarizeHomeLearningActivity([], { now }).active_days, 0);
});

test('Home HTTP: authentication, contract, query rejection, no-store and sanitized dependency failures', async t => {
  const db = storage();
  const offline = storage(); offline.failCollection = 'courses';
  const auth = (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test') return res.status(401).json({ message: 'Yêu cầu đăng nhập.' });
    req.userId = uid; next();
  };
  const app = express();
  app.use('/home', createHomeRouter(express, auth, { db, now }));
  app.use('/offline', createHomeRouter(express, auth, { db: offline, now }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/home')).status, 401);
  const headers = { authorization: 'Bearer test' };
  const response = await fetch(base + '/home', { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).data.user.full_name, 'Nguyễn Minh');
  const selected = await fetch(base + '/home?year=2024', { headers });
  assert.equal(selected.status, 200);
  const previousYear = (await selected.json()).data;
  assert.equal(previousYear.learning_activity.year, 2024);
  assert.equal(previousYear.learning_activity.days.length, 366);
  assert.equal(previousYear.learning_streak.week_start, '2026-11-02');
  for (const query of ['year=2027', 'year=2026.0', 'year=', 'year=2024&year=2025', 'year[x]=2024']) {
    const rejected = await fetch(base + '/home?' + query, { headers });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).code, query.startsWith('year[') ? 'HOME_QUERY_INVALID' : 'HOME_YEAR_INVALID');
  }
  const invalid = await fetch(base + '/home?userId=' + other, { headers });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'HOME_QUERY_INVALID');
  const failed = await fetch(base + '/offline', { headers });
  assert.equal(failed.status, 503);
  const body = await failed.text();
  assert.match(body, /HOME_UNAVAILABLE/);
  assert.doesNotMatch(body, /private-password|internal-path/);
});
