import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { listAdminUsers } from '../users.admin.js';
import {
  ACTIVE_USER_FLAG_FILTER,
  ACTIVE_VERIFIED_USER_FILTER,
  UNLINKED_INSTRUCTOR_FILTER,
  USER_MANAGEMENT_INDEXES,
} from '../migrate-user-management-schema.js';
import { buildInstructorDemoRecords, DEMO_BATCH_ID } from '../../../../scripts/seed-user-management-demo.js';
import { buildStudentDemoRecords, STUDENT_DEMO_BATCH_ID } from '../../../../scripts/seed-student-demo.js';

test('migration backfills only active, non-deleted accounts with absent flags', () => {
  assert.deepEqual(ACTIVE_USER_FLAG_FILTER.role, { $in: ['student', 'instructor'] });
  assert.equal(ACTIVE_USER_FLAG_FILTER.status, 'active');
  assert.deepEqual(ACTIVE_USER_FLAG_FILTER.deleted_at, { $exists: false });
  assert.deepEqual(ACTIVE_USER_FLAG_FILTER.is_active, { $exists: false });

  assert.deepEqual(ACTIVE_VERIFIED_USER_FILTER.email_verified, { $exists: false });
  assert.equal(ACTIVE_VERIFIED_USER_FILTER.$expr.$ne[0].$convert.input, '$email_verified_at');
  assert.equal(ACTIVE_VERIFIED_USER_FILTER.$expr.$ne[0].$convert.to, 'date');
  assert.equal(ACTIVE_VERIFIED_USER_FILTER.$expr.$ne[0].$convert.onError, null);
  assert.equal(ACTIVE_VERIFIED_USER_FILTER.status, 'active');
});

test('legacy profiles are flagged for reconciliation without inventing a user link', () => {
  assert.deepEqual(UNLINKED_INSTRUCTOR_FILTER.user_id, { $exists: false });
  assert.deepEqual(UNLINKED_INSTRUCTOR_FILTER.deleted_at, { $exists: false });
  assert.deepEqual(UNLINKED_INSTRUCTOR_FILTER.account_link_status, { $ne: 'needs_reconciliation' });
});

test('profile-to-account index is unique only for explicit string account links', () => {
  const index = USER_MANAGEMENT_INDEXES.find(([collection, keys]) => collection === 'instructor_profiles' && keys.user_id === 1);
  assert.ok(index);
  assert.equal(index[2].unique, true);
  assert.deepEqual(index[2].partialFilterExpression, { user_id: { $type: 'string' } });
});

test('lecturer application records use natural profile names and cover the non-active workflow states', () => {
  const rows = buildInstructorDemoRecords(new Date('2026-11-10T00:00:00.000Z'));
  assert.equal(rows.length, 15);
  assert.equal(rows.every(({ user, application, profile }) => !user.is_test_data && !application.is_test_data && !profile.is_test_data), true);
  assert.equal(new Set(rows.map(({ user }) => user.full_name)).size, 15);
  assert.equal(rows.every(({ user }) => !/demo|test|kiểm thử/i.test(user.full_name)), true);
  assert.equal(rows.every(({ user }) => user.status === 'pending' && user.is_active === false && user.email_verified === false), true);
  assert.equal(rows.every(({ profile }) => profile.is_public === false && profile.legal_status === 'incomplete'), true);
  assert.equal(rows.every(({ application }) => application.status !== 'active'), true);
  assert.deepEqual(rows.reduce((counts, { application }) => ({ ...counts, [application.status]: (counts[application.status] || 0) + 1 }), {}), {
    'pending-review': 4,
    'pending-docs': 4,
    'pending-contract': 4,
    rejected: 3,
  });
  assert.equal(rows.every(({ user, application, profile }) => user.test_batch_id === DEMO_BATCH_ID && application.test_batch_id === DEMO_BATCH_ID && profile.test_batch_id === DEMO_BATCH_ID), true);
});

test('lecturer list includes a linked applicant without a special visibility query', async () => {
  const userId = new ObjectId();
  const profile = { _id: new ObjectId(), user_id: String(userId), instructor_id: String(userId), status: 'pending-review', title: 'Giảng viên phân tích dữ liệu', field: 'Phân tích dữ liệu' };
  const application = { _id: new ObjectId(), user_id: String(userId), profile_id: String(profile._id), status: 'pending-review' };
  const user = { _id: userId, role: 'student', status: 'pending', full_name: 'Nguyễn Minh Châu', email: 'teacher@example.invalid' };
  const db = { collection(name) {
    if (name === 'instructor_profiles') return { find: () => ({ toArray: async () => [profile] }) };
    if (name === 'instructor_applications') return { find: () => ({ toArray: async () => [application] }) };
    if (name === 'users') return {
      find: query => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, async toArray() {
        assert.equal(query.role, undefined);
        return [user];
      } }),
      async countDocuments() { return 1; },
    };
    throw new Error(`Unexpected collection: ${name}`);
  } };

  const result = await listAdminUsers('lecturers', {}, { db, role: 'SA' });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0].role, 'student');
  assert.equal(result.items[0].status, 'pending-review');
  const contentAdminResult = await listAdminUsers('lecturers', {}, { db, role: 'CA' });
  assert.equal(contentAdminResult.pagination.total, 1);
});

test('student demo seed creates 50 active login accounts and tagged non-payment learning activity', () => {
  const now = new Date('2026-11-10T00:00:00.000Z');
  const makeCourse = (id) => ({ _id: new ObjectId(), course_id: id, category_id: 'demo-category', lessons: [
    { lesson_id: 'lesson-1', course_id: 'demo-course' },
    { lesson_id: 'lesson-2', course_id: id },
    { lesson_id: 'lesson-3', course_id: id },
  ].map(lesson => ({ ...lesson, course_id: id })), tags: ['demo-tag'] });
  const courses = [makeCourse('demo-course-1'), makeCourse('demo-course-2')];
  const records = buildStudentDemoRecords({ now, courses, categories: [{ category_id: 'demo-category' }], tags: [{ tag_id: 'demo-tag' }], passwordHash: 'hashed-demo-password' });
  assert.equal(records.users.length, 50);
  assert.equal(records.users.every(user => user.role === 'student' && user.status === 'active' && user.is_active && user.email_verified), true);
  assert.equal(records.users.every(user => user.password_hash === 'hashed-demo-password' && !user.is_test_data && !user.demo_kind), true);
  assert.equal(new Set(records.users.map(user => user.full_name)).size, 50);
  assert.equal(records.users.every(user => !/demo|test|kiểm thử/i.test(user.full_name) && !/DEMO/i.test(user.student_id)), true);
  assert.equal(records.onboarding.length, 50);
  assert.equal(records.enrollments.length, 75);
  assert.equal(records.ownedCourses.length, records.enrollments.length);
  assert.equal(records.courseProgress.every(progress => progress.is_completed === false && progress.progress_percentage < 100), true);
  assert.equal(records.activities.length > 50, true);
  assert.equal(records.favorites.every(favorite => favorite.test_batch_id === STUDENT_DEMO_BATCH_ID), true);
  assert.equal(records.enrollments.every(enrollment => enrollment.test_batch_id === STUDENT_DEMO_BATCH_ID), true);
  assert.equal(records.users.every(user => user.email.endsWith('@example.invalid') && user.test_batch_id === STUDENT_DEMO_BATCH_ID), true);
  assert.equal(records.lessonProgress.every(progress => progress.status !== 'completed' || progress.is_completed === true), true);
});
