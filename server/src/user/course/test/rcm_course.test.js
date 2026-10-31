import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getMongoDb } from '../../db.js';
import { COLLECTION_CARTS, COLLECTION_COURSES, getCourseCards } from '../course.user.js';
import {
  SCORE_WEIGHTS,
  normalizeLimit,
  computeBudget,
  computeBudgetScore,
  computeTagScore,
  computePopularityScore,
  computeBehaviorWeight,
  blendTagAffinity,
  computeLevelScore,
  clearRecommendationCache,
  getRecommendedCourses,
  getPersonalizedCourseFeed,
} from '../rcm_course.js';

describe('Kiểm thử Module Gợi ý Khóa Học (rcm_course)', () => {
  describe('1. Hàm tính điểm thuần', () => {
    it('TC-LIM-01: normalizeLimit mặc định 4, chặn tối đa 12, từ chối giá trị sai', () => {
      assert.equal(normalizeLimit(undefined), 4);
      assert.equal(normalizeLimit('6'), 6);
      assert.equal(normalizeLimit(999), 12);
      assert.throws(() => normalizeLimit(0), { status: 400, field: 'limit' });
      assert.throws(() => normalizeLimit('abc'), { status: 400 });
      assert.throws(() => normalizeLimit(2.5), { status: 400 });
    });

    it('TC-BUD-01: computeBudget ưu tiên giỏ, fallback đã mua, bỏ khóa miễn phí', () => {
      assert.deepEqual(computeBudget([100000, 300000, 0], [900000]), { referencePrice: 200000, source: 'cart' });
      assert.deepEqual(computeBudget([0], [400000]), { referencePrice: 400000, source: 'purchased' });
      assert.deepEqual(computeBudget([], []), { referencePrice: 0, source: null });
    });

    it('TC-BUD-02: computeBudgetScore đúng các mốc và biên', () => {
      const ref = 200000;
      assert.equal(computeBudgetScore(ref, ref), SCORE_WEIGHTS.budget);
      assert.equal(computeBudgetScore(ref * 1.3, ref), SCORE_WEIGHTS.budget);
      assert.equal(computeBudgetScore(ref * 2.5, ref), 0);
      assert.equal(computeBudgetScore(ref * 5, ref), 0);
      const mid = computeBudgetScore(ref * 1.9, ref);
      assert.ok(mid > 0 && mid < SCORE_WEIGHTS.budget);
      assert.equal(computeBudgetScore(0, ref), 40);
      assert.equal(computeBudgetScore(500000, 0), 0);
      assert.equal(computeBudgetScore('abc', ref), 40);
    });

    it('TC-TAG-01: computeTagScore chuẩn hóa theo trọng số hồ sơ', () => {
      const affinity = new Map([['t1', 3], ['t2', 1]]);
      assert.equal(computeTagScore(['t1', 't2'], affinity), SCORE_WEIGHTS.tag);
      assert.equal(computeTagScore(['t1'], affinity), SCORE_WEIGHTS.tag * 0.75);
      assert.equal(computeTagScore(['t1', 't1'], affinity), SCORE_WEIGHTS.tag * 0.75);
      assert.equal(computeTagScore(['x'], affinity), 0);
      assert.equal(computeTagScore(['t1'], new Map()), 0);
    });

    it('TC-POP-01: computePopularityScore trong khoảng 0..40 và tăng theo chất lượng', () => {
      const maxima = { maxStudents: 10000, maxReviews: 1000 };
      const top = computePopularityScore({ rating: 5, total_students: 10000, total_reviews: 1000 }, maxima);
      const low = computePopularityScore({ rating: 3, total_students: 10, total_reviews: 1 }, maxima);
      assert.ok(Math.abs(top - SCORE_WEIGHTS.popularity) < 1e-9);
      assert.ok(low < top);
      assert.equal(computePopularityScore({ rating: 0, total_students: 0, total_reviews: 0 }, { maxStudents: 0, maxReviews: 0 }), 0);
    });

    it('TC-BLD-01: computeBehaviorWeight tăng theo tương tác và chặn ở 1', () => {
      assert.equal(computeBehaviorWeight(0), 0);
      assert.equal(computeBehaviorWeight(-3), 0);
      assert.equal(computeBehaviorWeight('abc'), 0);
      assert.equal(computeBehaviorWeight(2.5), 0.5);
      assert.equal(computeBehaviorWeight(5), 1);
      assert.equal(computeBehaviorWeight(50), 1);
    });

    it('TC-BLD-02: blendTagAffinity cold start chỉ onboarding, nhiều hành vi chỉ hành vi', () => {
      const behavior = new Map([['b1', 3], ['b2', 1]]);
      const cold = blendTagAffinity(['o1', 'o2'], behavior, 0);
      assert.equal(cold.get('o1'), 0.5);
      assert.equal(cold.get('b1'), 0);

      const warm = blendTagAffinity(['o1', 'o2'], behavior, 1);
      assert.equal(warm.get('o1'), 0);
      assert.equal(warm.get('b1'), 0.75);

      const mid = blendTagAffinity(['o1'], new Map([['b1', 1]]), 0.5);
      assert.equal(mid.get('o1'), 0.5);
      assert.equal(mid.get('b1'), 0.5);
    });

    it('TC-BLD-03: blendTagAffinity thiếu một nguồn thì dùng nguồn còn lại', () => {
      assert.equal(blendTagAffinity([], new Map([['b1', 2]]), 0).get('b1'), 1);
      assert.equal(blendTagAffinity(['o1'], new Map(), 1).get('o1'), 1);
      assert.equal(blendTagAffinity([], new Map(), 0.5).size, 0);
    });

    it('TC-LVL-01: computeLevelScore giảm khi hành vi chiếm ưu thế', () => {
      assert.equal(computeLevelScore('beginner', 'beginner', 0), SCORE_WEIGHTS.level);
      assert.equal(computeLevelScore('beginner', 'beginner', 0.5), SCORE_WEIGHTS.level / 2);
      assert.equal(computeLevelScore('beginner', 'beginner', 1), 0);
      assert.equal(computeLevelScore('advanced', 'beginner', 0), 0);
      assert.equal(computeLevelScore('', 'beginner', 0), 0);
      assert.equal(computeLevelScore('beginner', null, 0), 0);
    });
  });

  describe('2. getRecommendedCourses (CSDL thực, dữ liệu test tự dọn)', () => {
    let db;
    const testUserId = 'test-rcm-course-user-999';
    let cartCourseId = null;

    before(async () => {
      db = await getMongoDb();
      await db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId });
      const doc = await db.collection(COLLECTION_COURSES).findOne({ status: 'published' });
      if (doc) cartCourseId = String(doc.course_id);
    });

    after(async () => {
      if (db) await db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId });
    });

    it('TC-RCM-01: từ chối userId sai kiểu / guestCartIds sai kiểu / limit sai', async () => {
      await assert.rejects(getRecommendedCourses({ userId: 123, dbInstance: db }), { status: 400, field: 'userId' });
      await assert.rejects(getRecommendedCourses({ userId: '  ', dbInstance: db }), { status: 400, field: 'userId' });
      await assert.rejects(getRecommendedCourses({ guestCartIds: 'x', dbInstance: db }), { status: 400, field: 'guestCartIds' });
      await assert.rejects(getRecommendedCourses({ limit: -1, dbInstance: db }), { status: 400, field: 'limit' });
    });

    it('TC-RCM-02: khách không có giỏ → trả tối đa 4 khóa theo độ phổ biến, không có ngân sách', async () => {
      const res = await getRecommendedCourses({ dbInstance: db });
      assert.ok(res.recommendations.length <= 4);
      assert.equal(res.budget.source, null);
      for (const r of res.recommendations) assert.equal(r.score_breakdown.budget, 0);
      for (const r of res.recommendations) assert.equal(r.recommendation_method, 'rules');
      const scores = res.recommendations.map((r) => r.recommend_score);
      assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    });

    it('TC-RCM-03: loại trừ khóa trong giỏ khách và tôn trọng limit', async (t) => {
      if (!cartCourseId) return t.skip('Không có khóa published trong DB');
      const res = await getRecommendedCourses({ guestCartIds: [cartCourseId], limit: 2, dbInstance: db });
      assert.ok(res.recommendations.length <= 2);
      assert.ok(res.recommendations.every((r) => r.course_id !== cartCourseId));
    });

    it('TC-RCM-04: học viên có giỏ hàng trong DB → loại khóa trong giỏ, không rò dữ liệu nhạy cảm', async (t) => {
      if (!cartCourseId) return t.skip('Không có khóa published trong DB');
      await db.collection(COLLECTION_CARTS).insertOne({ user_id: testUserId, course_id: cartCourseId });
      const res = await getRecommendedCourses({ userId: testUserId, dbInstance: db });
      assert.ok(res.recommendations.every((r) => r.course_id !== cartCourseId && !r.is_in_cart && !r.is_purchased));
      assert.ok(res.recommendations.every((r) => !('password' in r) && !('email' in r)));
    });

    it('TC-RCM-05: userId không tồn tại (không có dữ liệu) vẫn trả kết quả an toàn', async () => {
      const res = await getRecommendedCourses({ userId: 'no-such-user-xyz', dbInstance: db });
      assert.ok(Array.isArray(res.recommendations));
      assert.equal(res.blend.interactions, 0);
      assert.equal(res.blend.behavior_weight, 0);
    });

    it('TC-RCM-06: gợi ý trả thẻ đầy đủ trường như getCourseCards', async () => {
      const res = await getRecommendedCourses({ dbInstance: db });
      for (const r of res.recommendations) {
        for (const key of ['course_id', 'title', 'price', 'instructor', 'tags', 'tag_names',
          'is_in_wishlist', 'is_in_cart', 'is_purchased', 'action_state', 'action_label',
          'duration_formatted', 'recommend_score', 'score_breakdown']) {
          assert.ok(key in r, `Thiếu trường ${key}`);
        }
      }
    });

    it('TC-CID-01: getCourseCards filters.course_ids lọc đúng, mảng rỗng trả rỗng, không dùng thì như cũ', async (t) => {
      if (!cartCourseId) return t.skip('Không có khóa published trong DB');
      const only = await getCourseCards({ filters: { course_ids: [cartCourseId, 'no-such-course'] }, limit: 'all', dbInstance: db });
      assert.deepEqual(only.courses.map((c) => c.course_id), [cartCourseId]);

      const none = await getCourseCards({ filters: { course_ids: [] }, limit: 'all', dbInstance: db });
      assert.equal(none.courses.length, 0);

      const all = await getCourseCards({ limit: 'all', fields: ['course_id'], dbInstance: db });
      assert.ok(all.courses.length >= 1);
    });

    it('TC-FEED-01: feed yêu cầu userId, kiểm tra page/limit', async () => {
      await assert.rejects(getPersonalizedCourseFeed({ dbInstance: db }), { status: 400, field: 'userId' });
      await assert.rejects(getPersonalizedCourseFeed({ userId: testUserId, page: 0, dbInstance: db }), { status: 400, field: 'page' });
      await assert.rejects(getPersonalizedCourseFeed({ userId: testUserId, limit: 'x', dbInstance: db }), { status: 400, field: 'limit' });
    });

    it('TC-FEED-02: feed phân trang, không loại khóa trong giỏ, giảm dần theo điểm, hành vi tăng khi có giỏ', async (t) => {
      if (!cartCourseId) return t.skip('Không có khóa published trong DB');
      clearRecommendationCache();
      await db.collection(COLLECTION_CARTS).deleteMany({ user_id: testUserId });
      const cold = await getPersonalizedCourseFeed({ userId: testUserId, limit: 5, dbInstance: db });
      assert.equal(cold.blend.interactions, 0);
      assert.ok(cold.courses.length <= 5);
      assert.equal(cold.pagination.page, 1);
      assert.equal(cold.pagination.has_prev, false);
      const scores = cold.courses.map((c) => c.recommend_score);
      assert.deepEqual(scores, [...scores].sort((a, b) => b - a));

      await db.collection(COLLECTION_CARTS).insertOne({ user_id: testUserId, course_id: cartCourseId });
      const warm = await getPersonalizedCourseFeed({ userId: testUserId, limit: 50, dbInstance: db });
      assert.equal(warm.blend.interactions, 1);
      assert.equal(warm.blend.behavior_weight, 0.2);
      assert.ok(warm.courses.some((c) => c.course_id === cartCourseId));
    });
  });
});
