import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { getMongoDb, closeMongoDb } from '../../db.js';
import {
  skipOnboarding,
  submitOnboarding,
  getOnboardingCourseList,
} from '../onboarding.user.js';

function onboardingNotificationFixture() {
  const copy = value => value instanceof ObjectId ? new ObjectId(String(value)) : value instanceof Date ? new Date(value)
    : value instanceof Map ? new Map([...value].map(([k,v]) => [k,copy(v)])) : Array.isArray(value) ? value.map(copy)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copy(v)])) : value;
  const equal = (a,b) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a === b;
  const match = (row, query) => Object.entries(query).every(([key,value]) => {
    if (value && typeof value === 'object' && !(value instanceof ObjectId)) {
      return Object.entries(value).every(([op, values]) => {
        if (op === '$in') return values.some(value => equal(row[key],value));
        throw new Error(`Unsupported query ${op}`);
      });
    }
    return equal(row[key],value);
  });
  let tables = new Map(), queue = Promise.resolve();
  const db = { get tables() { return tables; }, fail: false, client: { startSession() { return {
    async withTransaction(work) {
      let release;const previous = queue;queue = new Promise(resolve => { release = resolve; });await previous;
      const snapshot = copy(tables);
      try { return await work(); } catch (error) { tables = snapshot;throw error; } finally { release(); }
    }, async endSession() {},
  }; } }, collection(name) {
    if (!tables.has(name)) tables.set(name,[]);
    const rows = () => tables.get(name);
    return {
      async findOne(query) { return copy(rows().find(row => match(row,query)) ?? null); },
      find(query) { const selected = rows().filter(row => match(row,query));return {
        sort() { return this; }, async toArray() { return copy(selected); },
      }; },
      async updateOne(query, update, options = {}) {
        if (db.fail && name === 'notifications') throw new Error('Inbox offline');
        let row = rows().find(row => match(row,query));
        if (!row && options.upsert) { row = { ...copy(query), ...copy(update.$setOnInsert || {}) };rows().push(row); }
        if (!row) return { matchedCount:0 };
        Object.assign(row,copy(update.$set || {}));return { matchedCount:1 };
      },
    };
  } };
  const uid = new ObjectId();
  tables.set('users',[{ _id:uid,onboarding_completed:false }]);
  tables.set('course_categories',[{ category_id:'1' }]);tables.set('tags',[{ tag_id:'1' }]);
  return { db,uid:String(uid),answers:{ categoryId:'1',selectedTagIds:['1'],level:'beginner' } };
}

describe('Notification integration: Onboarding isolated', () => {
  it('submit/skip and repeat requests produce one owned welcome after successful completion', async () => {
    const f = onboardingNotificationFixture();
    await submitOnboarding(f.uid,f.answers,{ db:f.db });
    await skipOnboarding(f.uid,{ db:f.db });
    await submitOnboarding(f.uid,f.answers,{ db:f.db });
    assert.equal(f.db.tables.get('notifications').length,1);
    assert.equal(f.db.tables.get('notifications')[0].user_id,f.uid);
    assert.equal(f.db.tables.get('users')[0].onboarding_completed,true);
  });
  it('inbox failure rolls back completion and answers, and retry recovers successfully', async () => {
    for (const mode of ['submit','skip']) {
      const f = onboardingNotificationFixture();f.db.fail = true;
      const run = () => mode === 'submit' ? submitOnboarding(f.uid,f.answers,{ db:f.db }) : skipOnboarding(f.uid,{ db:f.db });
      await assert.rejects(run(),/Inbox offline/);
      assert.equal(f.db.tables.get('users')[0].onboarding_completed,false);
      assert.equal(f.db.tables.get('student_onboarding_answers')?.length || 0,0);
      f.db.fail = false;await run();assert.equal(f.db.tables.get('notifications').length,1);
    }
  });
  it('invalid answers never create success events and concurrent completion stays idempotent', async () => {
    const f = onboardingNotificationFixture();
    await assert.rejects(submitOnboarding(f.uid,{ ...f.answers,categoryId:'missing' },{ db:f.db }));
    assert.equal(f.db.tables.get('notifications')?.length || 0,0);
    await Promise.all([submitOnboarding(f.uid,f.answers,{ db:f.db }),skipOnboarding(f.uid,{ db:f.db })]);
    assert.equal(f.db.tables.get('notifications').length,1);
  });
});

// ─── Test Suite chạy trực tiếp trên Database Thật (MongoDB Atlas) ─────────────

describe('Khảo Sát Onboarding với Database Thật (MongoDB Atlas)', () => {
  let db;
  let testUserId;
  let testUserIdStr;
  const testCategoryId = 'onboarding-test-category';
  const testTagIds = ['onboarding-test-tag-html', 'onboarding-test-tag-js'];
  const testCourseIds = ['onboarding-test-course-1', 'onboarding-test-course-2'];

  const cleanUpFixtures = async () => {
    await db.collection('course_tags').deleteMany({ course_id: { $in: testCourseIds } });
    await db.collection('courses').deleteMany({ test_fixture_id: 'onboarding-user-test' });
    await db.collection('tags').deleteMany({ test_fixture_id: 'onboarding-user-test' });
    await db.collection('course_categories').deleteMany({ test_fixture_id: 'onboarding-user-test' });
  };

  before(async () => {
    db = await getMongoDb();
    testUserId = new ObjectId();
    testUserIdStr = testUserId.toString();

    await cleanUpFixtures();

    await db.collection('course_categories').insertOne({
      category_id: testCategoryId,
      name: 'Onboarding Test Category',
      test_fixture_id: 'onboarding-user-test',
    });
    await db.collection('tags').insertMany(testTagIds.map((tag_id, index) => ({
      tag_id,
      name: `Onboarding Test Tag ${index + 1}`,
      test_fixture_id: 'onboarding-user-test',
    })));
    await db.collection('courses').insertMany([
      {
        course_id: testCourseIds[0],
        title: 'Onboarding matching course',
        category_id: testCategoryId,
        level: 'beginner',
        status: 'published',
        total_students: 20,
        price: 100,
        test_fixture_id: 'onboarding-user-test',
      },
      {
        course_id: testCourseIds[1],
        title: 'Onboarding other course',
        category_id: 'other-test-category',
        level: 'advanced',
        status: 'published',
        total_students: 10,
        price: 200,
        test_fixture_id: 'onboarding-user-test',
      },
    ]);
    await db.collection('course_tags').insertMany([
      { course_id: testCourseIds[0], tag_id: testTagIds[0] },
      { course_id: testCourseIds[1], tag_id: testTagIds[1] },
    ]);

    // Đảm bảo không còn bản ghi user cũ nếu test trước đó bị gián đoạn
    await db.collection('users').deleteMany({ email: 'test_onboarding_runner@thinkup.vn' });

    // Tạo học viên kiểm thử tạm thời trong collection users
    await db.collection('users').insertOne({
      _id: testUserId,
      email: 'test_onboarding_runner@thinkup.vn',
      full_name: 'Test Onboarding Runner',
      role: 'student',
      status: 'active',
      onboarding_completed: false,
      created_at: new Date(),
    });
  });

  after(async () => {
    // Dọn dẹp bản ghi kiểm thử trong database thật sau khi hoàn tất
    if (db && testUserId) {
      await db.collection('users').deleteOne({ _id: testUserId });
      await db.collection('student_onboarding_answers').deleteOne({ user_id: testUserId });
      await cleanUpFixtures();
    }
    await closeMongoDb();
  });

  beforeEach(async () => {
    // Đặt lại trạng thái test user trước mỗi test
    await db.collection('users').updateOne(
      { _id: testUserId },
      { $set: { onboarding_completed: false } }
    );
    await db.collection('student_onboarding_answers').deleteOne({ user_id: testUserId });
  });

  describe('skipOnboarding() trên DB thật', () => {
    it('TC-SKIP-01: Trả về toàn bộ khóa học thật theo thứ tự mặc định, cập nhật onboarding_completed = true', async () => {
      const result = await skipOnboarding(testUserIdStr, { db });

      assert.ok(result.message);
      assert.ok(Array.isArray(result.courses));
      assert.ok(result.courses.length > 0, 'Phải trả về danh sách khóa học thực tế từ database');

      // Xác nhận trong CSDL thật: onboarding_completed = true
      const user = await db.collection('users').findOne({ _id: testUserId });
      assert.strictEqual(user.onboarding_completed, true);

      // Xác nhận KHÔNG lưu bất kỳ lựa chọn nào vào CSDL thật
      const answer = await db.collection('student_onboarding_answers').findOne({ user_id: testUserId });
      assert.strictEqual(answer, null, 'Không được lưu bản ghi khảo sát khi bấm Bỏ qua');
    });

    it('TC-SKIP-02: Không lưu lựa chọn vào CSDL khi bỏ qua', async () => {
      await skipOnboarding(testUserIdStr, { db });
      const answer = await db.collection('student_onboarding_answers').findOne({ user_id: testUserId });
      assert.strictEqual(answer, null);
    });

    it('TC-SKIP-03: Báo lỗi 401 khi không truyền userId', async () => {
      await assert.rejects(
        () => skipOnboarding('', { db }),
        (err) => err.status === 401
      );
    });

    it('TC-SKIP-04: Báo lỗi 400 khi userId không phải ObjectId hợp lệ', async () => {
      await assert.rejects(
        () => skipOnboarding('invalid_id', { db }),
        (err) => err.status === 400
      );
    });

    it('TC-SKIP-05: Báo lỗi 404 khi userId không tồn tại trong database thật', async () => {
      const nonExistent = new ObjectId().toString();
      await assert.rejects(
        () => skipOnboarding(nonExistent, { db }),
        (err) => err.status === 404
      );
    });
  });

  describe('submitOnboarding() trên DB thật', () => {
    const VALID_ANSWERS = {
      categoryId: testCategoryId,
      selectedTagIds: testTagIds,
      level: 'beginner',
    };

    it('TC-SUB-01: Lưu lựa chọn vào student_onboarding_answers thật + cập nhật user + trả về courses', async () => {
      const result = await submitOnboarding(testUserIdStr, VALID_ANSWERS, { db });

      assert.ok(result.message);
      assert.ok(result.preferences);
      assert.strictEqual(result.preferences.categoryId, testCategoryId);
      assert.deepEqual(result.preferences.selectedTagIds, testTagIds);
      assert.strictEqual(result.preferences.level, 'beginner');

      // Kiểm tra bản ghi thật trong CSDL
      const saved = await db.collection('student_onboarding_answers').findOne({ user_id: testUserId });
      assert.ok(saved, 'Bản ghi khảo sát phải được lưu vào CSDL thật');
      assert.strictEqual(saved.category_id, testCategoryId);
      assert.deepEqual(saved.selected_tag_ids, testTagIds);
      assert.strictEqual(saved.level, 'beginner');

      // Kiểm tra cờ onboarding_completed trong CSDL thật
      const user = await db.collection('users').findOne({ _id: testUserId });
      assert.strictEqual(user.onboarding_completed, true);

      // Danh sách khóa học được trả về
      assert.ok(Array.isArray(result.courses));
      assert.ok(result.courses.length > 0);
    });

    it('TC-SUB-02: Không dùng bộ lọc cứng loại bỏ — bảo toàn toàn bộ khóa học published', async () => {
      const publishedCount = await db.collection('courses').countDocuments({ status: 'published' });
      const result = await submitOnboarding(testUserIdStr, VALID_ANSWERS, { db });

      assert.strictEqual(
        result.courses.length,
        publishedCount,
        'Số lượng khóa học trả về phải bằng chính xác tổng số khóa học published trong CSDL thật'
      );
    });

    it('TC-SUB-03: Sắp xếp ưu tiên: khóa học thỏa tiêu chí khảo sát phải xuất hiện ở nhóm đầu', async () => {
      const result = await submitOnboarding(testUserIdStr, VALID_ANSWERS, { db });
      const courses = result.courses;

      // Tìm khóa học khớp category test và level beginner
      const matchedIdx = courses.findIndex(
        (c) => c.category_id === testCategoryId && (c.level || '').toLowerCase() === 'beginner'
      );
      // Tìm khóa học hoàn toàn khác category và khác level
      const unmatchedIdx = courses.findLastIndex(
        (c) => c.category_id !== testCategoryId
      );

      if (matchedIdx !== -1 && unmatchedIdx !== -1) {
        assert.ok(
          matchedIdx < unmatchedIdx,
          `Khóa học phù hợp (vị trí ${matchedIdx}) phải xếp trước khóa học không phù hợp (vị trí ${unmatchedIdx})`
        );
      }
    });

    it('TC-SUB-04: Báo lỗi 400 khi thiếu categoryId', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, { selectedTagIds: [testTagIds[0]], level: 'beginner' }, { db }),
        (err) => err.status === 400 && err.field === 'categoryId'
      );
    });

    it('TC-SUB-05: Báo lỗi 400 khi categoryId không hợp lệ (ngoài 1–17)', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, { ...VALID_ANSWERS, categoryId: '999' }, { db }),
        (err) => err.status === 400 && err.field === 'categoryId'
      );
    });

    it('TC-SUB-06: Báo lỗi 400 khi selectedTagIds rỗng []', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, { ...VALID_ANSWERS, selectedTagIds: [] }, { db }),
        (err) => err.status === 400 && err.field === 'selectedTagIds'
      );
    });

    it('TC-SUB-07: Báo lỗi 400 khi selectedTagIds vượt quá 3 kỹ năng', async () => {
      await assert.rejects(
        () =>
          submitOnboarding(
            testUserIdStr,
            { ...VALID_ANSWERS, selectedTagIds: ['1', '2', '3', '4'] },
            { db }
          ),
        (err) => err.status === 400 && err.field === 'selectedTagIds'
      );
    });

    it('TC-SUB-08: Báo lỗi 400 khi thiếu level', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, { categoryId: testCategoryId, selectedTagIds: [testTagIds[0]] }, { db }),
        (err) => err.status === 400 && err.field === 'level'
      );
    });

    it('TC-SUB-09: Báo lỗi 400 khi level không hợp lệ', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, { ...VALID_ANSWERS, level: 'unreal_level' }, { db }),
        (err) => err.status === 400 && err.field === 'level'
      );
    });

    it('TC-SUB-09.1: Level sai kiểu trả 400 thay vì lỗi runtime và không ghi dữ liệu', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, { ...VALID_ANSWERS, level: { value: 'beginner' } }, { db }),
        error => error.status === 400 && error.field === 'level',
      );
      assert.equal(await db.collection('student_onboarding_answers').findOne({ user_id: testUserId }), null);
      const user = await db.collection('users').findOne({ _id: testUserId });
      assert.equal(user.onboarding_completed, false);
    });

    it('TC-SUB-09.2: Từ chối tag không tồn tại trước khi ghi câu trả lời', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, {
          ...VALID_ANSWERS,
          selectedTagIds: ['onboarding-tag-does-not-exist'],
        }, { db }),
        error => error.status === 400
          && error.field === 'selectedTagIds'
          && error.code === 'INVALID_ONBOARDING_TAGS',
      );
      assert.equal(await db.collection('student_onboarding_answers').findOne({ user_id: testUserId }), null);
      const user = await db.collection('users').findOne({ _id: testUserId });
      assert.equal(user.onboarding_completed, false);
    });

    it('TC-SUB-09.3: Từ chối body khảo sát không phải object', async () => {
      await assert.rejects(
        () => submitOnboarding(testUserIdStr, null, { db }),
        error => error.status === 400 && error.code === 'INVALID_ONBOARDING_INPUT',
      );
      assert.equal(await db.collection('student_onboarding_answers').findOne({ user_id: testUserId }), null);
    });

    it('TC-SUB-09.4: Rollback câu trả lời nếu cập nhật cờ user thất bại trong transaction', async () => {
      const usersColl = db.collection('users');
      const originalCollection = db.collection;
      const originalUpdateOne = usersColl.updateOne;
      let failureInjected = false;
      db.collection = function collectionWithInjectedUserCollection(name, ...args) {
        if (name === 'users') return usersColl;
        return originalCollection.call(this, name, ...args);
      };
      usersColl.updateOne = async function updateOneWithInjectedFailure(...args) {
        const result = await originalUpdateOne.apply(this, args);
        if (!failureInjected && args[2]?.session) {
          failureInjected = true;
          throw new Error('Injected transaction failure after user write');
        }
        return result;
      };

      try {
        await assert.rejects(
          () => submitOnboarding(testUserIdStr, VALID_ANSWERS, { db }),
          /Injected transaction failure after user write/,
        );
      } finally {
        usersColl.updateOne = originalUpdateOne;
        db.collection = originalCollection;
      }

      assert.equal(failureInjected, true, 'Lỗi phải phát sinh sau khi MongoDB đã chạy lệnh ghi user trong transaction');
      assert.equal(await db.collection('student_onboarding_answers').findOne({ user_id: testUserId }), null);
      const user = await usersColl.findOne({ _id: testUserId });
      assert.equal(user.onboarding_completed, false);
    });

    it('TC-SUB-10: Báo lỗi 401 khi userId rỗng', async () => {
      await assert.rejects(
        () => submitOnboarding('', VALID_ANSWERS, { db }),
        (err) => err.status === 401
      );
    });

    it('TC-SUB-11: Báo lỗi 404 khi userId không tồn tại', async () => {
      const nonExistent = new ObjectId().toString();
      await assert.rejects(
        () => submitOnboarding(nonExistent, VALID_ANSWERS, { db }),
        (err) => err.status === 404
      );
    });

    it('TC-SUB-12: Trùng selectedTagIds được tự động khử trùng lặp', async () => {
      const result = await submitOnboarding(
        testUserIdStr,
        { ...VALID_ANSWERS, selectedTagIds: [testTagIds[0], testTagIds[0], testTagIds[1]] },
        { db }
      );
      assert.deepEqual(result.preferences.selectedTagIds, testTagIds);
    });
  });

  describe('getOnboardingCourseList() trên DB thật', () => {
    it('TC-GET-01: Trả về danh sách theo thứ tự mặc định khi chưa làm khảo sát', async () => {
      const result = await getOnboardingCourseList(testUserIdStr, { db });
      assert.ok(Array.isArray(result.courses));
      assert.ok(result.courses.length > 0);
      assert.strictEqual(result.preferences, null);
    });

    it('TC-GET-02: Trả về danh sách sắp xếp theo ưu tiên khi đã có kết quả khảo sát trong DB thật', async () => {
      await submitOnboarding(
        testUserIdStr,
        { categoryId: testCategoryId, selectedTagIds: [testTagIds[0]], level: 'beginner' },
        { db }
      );

      const result = await getOnboardingCourseList(testUserIdStr, { db });
      assert.ok(result.preferences);
      assert.strictEqual(result.preferences.categoryId, testCategoryId);
      assert.ok(Array.isArray(result.courses));
      assert.ok(result.courses.length > 0);
    });

    it('TC-GET-03: Báo lỗi 401 khi userId rỗng', async () => {
      await assert.rejects(
        () => getOnboardingCourseList('', { db }),
        (err) => err.status === 401
      );
    });

    it('TC-GET-04: Báo lỗi 404 khi userId không tồn tại', async () => {
      const nonExistent = new ObjectId().toString();
      await assert.rejects(
        () => getOnboardingCourseList(nonExistent, { db }),
        (err) => err.status === 404
      );
    });

    it('TC-GET-05: Khóa học trả về có đủ các trường chuẩn theo schema database thật', async () => {
      const result = await getOnboardingCourseList(testUserIdStr, { db });
      const course = result.courses[0];

      assert.ok('id' in course);
      assert.ok('course_id' in course);
      assert.ok('title' in course);
      assert.ok('category_id' in course);
      assert.ok('level' in course);
      assert.ok('price' in course);
      assert.ok('total_students' in course);
      assert.ok('rating' in course);
      assert.ok('tag_ids' in course);
    });
  });
});
