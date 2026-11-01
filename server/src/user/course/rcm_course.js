import { ObjectId } from 'mongodb';
import { getMongoDb } from '../db.js';
import {
  getCourseCards,
  COLLECTION_COURSES,
  COLLECTION_COURSE_TAGS,
  COLLECTION_CARTS,
  COLLECTION_USER_COURSES,
  COLLECTION_ENROLLMENTS,
} from './course.user.js';
import {
  scoreCourseWithModel,
  trainCourseRanker,
} from './ml/course_ranker.js';

// ─── 0. Hằng số cấu hình thuật toán gợi ý ────────────────────────────────────
export const DEFAULT_RECOMMEND_LIMIT = 4;
export const MAX_RECOMMEND_LIMIT = 12;
export const DEFAULT_FEED_LIMIT = 12;
export const MAX_FEED_LIMIT = 50;

// Trọng số tối đa của từng tín hiệu (tổng tối đa = 280 điểm)
export const SCORE_WEIGHTS = Object.freeze({
  tag: 100,
  cooccurrence: 80,
  budget: 50,
  popularity: 40,
  level: 10,
});

// Trọng số tương đối giữa các hành vi trong nhóm "hành vi" (giỏ hàng nặng hơn đã mua)
const BEHAVIOR_TAG_WEIGHT = Object.freeze({ cart: 3, purchased: 2 });

// Số tương tác (giỏ + đã mua) để hành vi chiếm toàn bộ trọng số, onboarding về 0
export const INTERACTIONS_FOR_FULL_BEHAVIOR = 5;

// Giá chấp nhận được = giá tham chiếu x 1.3; điểm giảm dần về 0 tại giá tham chiếu x 2.5
const BUDGET_COMFORT_RATIO = 1.3;
const BUDGET_LIMIT_RATIO = 2.5;
const FREE_COURSE_BUDGET_SCORE = 40;
const MAX_CO_OWNERS = 500;
const CATALOG_CACHE_TTL_MS = 60 * 1000;
const ML_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const ML_MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
const ML_MODEL_MIN_EVENTS = 200;
const ML_MODEL_MIN_LABELS_PER_CLASS = 30;

function createError(message, status, field) {
  const err = new Error(message);
  err.status = status;
  if (field) err.field = field;
  return err;
}

// ─── 1. Các hàm tính điểm thuần (không truy cập CSDL) ────────────────────────

/**
 * Chuẩn hóa một tham số số nguyên dương có giá trị mặc định và trần.
 * @param {number|string|undefined} value
 * @param {number} fallback
 * @param {number} max
 * @param {string} field
 * @returns {number}
 */
function normalizePositiveInt(value, fallback, max, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw createError(`Tham số ${field} phải là số nguyên dương.`, 400, field);
  }
  return Math.min(num, max);
}

/**
 * Chuẩn hóa số lượng gợi ý về khoảng [1, MAX_RECOMMEND_LIMIT].
 * @param {number|string|undefined} limit
 * @returns {number}
 */
export function normalizeLimit(limit) {
  return normalizePositiveInt(limit, DEFAULT_RECOMMEND_LIMIT, MAX_RECOMMEND_LIMIT, 'limit');
}

/**
 * Tính giá tham chiếu (ngân sách) từ các khóa có phí trong giỏ; nếu giỏ không có
 * khóa có phí thì dùng các khóa có phí đã mua.
 * @param {number[]} cartPrices
 * @param {number[]} purchasedPrices
 * @returns {{ referencePrice: number, source: 'cart'|'purchased'|null }}
 */
export function computeBudget(cartPrices = [], purchasedPrices = []) {
  const paidCart = cartPrices.filter((p) => p > 0);
  if (paidCart.length > 0) {
    const avg = paidCart.reduce((s, p) => s + p, 0) / paidCart.length;
    return { referencePrice: avg, source: 'cart' };
  }
  const paidPurchased = purchasedPrices.filter((p) => p > 0);
  if (paidPurchased.length > 0) {
    const avg = paidPurchased.reduce((s, p) => s + p, 0) / paidPurchased.length;
    return { referencePrice: avg, source: 'purchased' };
  }
  return { referencePrice: 0, source: null };
}

/**
 * Điểm phù hợp túi tiền của 1 khóa học (0 → SCORE_WEIGHTS.budget).
 * Không có giá tham chiếu → 0 (tín hiệu bị bỏ qua).
 * @param {number} price - giá bán của khóa ứng viên
 * @param {number} referencePrice
 * @returns {number}
 */
export function computeBudgetScore(price, referencePrice) {
  if (!(referencePrice > 0)) return 0;
  const p = Math.max(0, Number(price) || 0);
  if (p === 0) return FREE_COURSE_BUDGET_SCORE;

  const comfort = referencePrice * BUDGET_COMFORT_RATIO;
  if (p <= comfort) return SCORE_WEIGHTS.budget;

  const limit = referencePrice * BUDGET_LIMIT_RATIO;
  if (p >= limit) return 0;
  return SCORE_WEIGHTS.budget * (1 - (p - comfort) / (limit - comfort));
}

/**
 * Điểm khớp tag: tổng trọng số các tag của ứng viên có trong hồ sơ sở thích
 * chia cho tổng trọng số hồ sơ.
 * @param {string[]} candidateTagIds
 * @param {Map<string, number>} tagAffinity - tag_id → trọng số
 * @returns {number}
 */
export function computeTagScore(candidateTagIds, tagAffinity) {
  let total = 0;
  for (const w of tagAffinity.values()) total += w;
  if (total === 0) return 0;

  let matched = 0;
  for (const tagId of new Set(candidateTagIds)) {
    matched += tagAffinity.get(String(tagId)) || 0;
  }
  return SCORE_WEIGHTS.tag * Math.min(1, matched / total);
}

/**
 * Điểm phổ biến toàn cục: rating (20) + lượt học (15) + lượt đánh giá (5).
 * @param {{ rating: number, total_students: number, total_reviews: number }} card
 * @param {{ maxStudents: number, maxReviews: number }} maxima
 * @returns {number}
 */
export function computePopularityScore(card, { maxStudents, maxReviews }) {
  const ratingPart = (Math.min(5, Math.max(0, Number(card.rating) || 0)) / 5) * 20;
  const studentPart = maxStudents > 0
    ? (Math.log1p(card.total_students || 0) / Math.log1p(maxStudents)) * 15
    : 0;
  const reviewPart = maxReviews > 0
    ? (Math.log1p(card.total_reviews || 0) / Math.log1p(maxReviews)) * 5
    : 0;
  return ratingPart + studentPart + reviewPart;
}

/**
 * Trọng số của hành vi thực tế (0 → 1) theo số tương tác (giỏ + đã mua).
 * 0 tương tác = người dùng mới (cold start, dựa hoàn toàn vào onboarding);
 * từ INTERACTIONS_FOR_FULL_BEHAVIOR tương tác trở lên = dựa hoàn toàn vào hành vi.
 * @param {number} interactions
 * @returns {number}
 */
export function computeBehaviorWeight(interactions) {
  const n = Math.max(0, Number(interactions) || 0);
  return Math.min(1, n / INTERACTIONS_FOR_FULL_BEHAVIOR);
}

function normalizeDistribution(weights) {
  let total = 0;
  for (const w of weights.values()) total += w;
  const dist = new Map();
  if (total === 0) return dist;
  for (const [k, w] of weights) dist.set(k, w / total);
  return dist;
}

/**
 * Trộn hồ sơ tag onboarding với hồ sơ tag hành vi.
 * Mỗi nguồn được chuẩn hóa về tổng 1 rồi trộn: (1 - w) * onboarding + w * hành vi.
 * Nếu thiếu một nguồn thì nguồn còn lại chiếm toàn bộ.
 * @param {string[]} onboardingTagIds
 * @param {Map<string, number>} behaviorWeights - tag_id → trọng số hành vi thô
 * @param {number} behaviorWeight - 0..1
 * @returns {Map<string, number>} tổng trọng số = 1 (hoặc rỗng)
 */
export function blendTagAffinity(onboardingTagIds, behaviorWeights, behaviorWeight) {
  const onboarding = normalizeDistribution(
    new Map(onboardingTagIds.map((id) => [String(id), 1])),
  );
  const behavior = normalizeDistribution(behaviorWeights);

  if (onboarding.size === 0) return behavior;
  if (behavior.size === 0) return onboarding;

  const w = Math.min(1, Math.max(0, behaviorWeight));
  const blended = new Map();
  for (const [id, v] of onboarding) blended.set(id, (1 - w) * v);
  for (const [id, v] of behavior) blended.set(id, (blended.get(id) || 0) + w * v);
  return blended;
}

/**
 * Điểm khớp trình độ onboarding, giảm dần khi hành vi thực tế chiếm ưu thế.
 * @param {string} courseLevel
 * @param {string|null} onboardingLevel
 * @param {number} behaviorWeight - 0..1
 * @returns {number}
 */
export function computeLevelScore(courseLevel, onboardingLevel, behaviorWeight) {
  if (!onboardingLevel || !courseLevel) return 0;
  if (String(courseLevel).toLowerCase() !== String(onboardingLevel).toLowerCase()) return 0;
  return SCORE_WEIGHTS.level * (1 - Math.min(1, Math.max(0, behaviorWeight)));
}

// ─── 2. Truy xuất dữ liệu (tối ưu: chỉ lấy trường cần chấm điểm) ──────────────

function toUserIdVariants(userId) {
  const variants = [String(userId)];
  if (ObjectId.isValid(userId)) variants.push(new ObjectId(String(userId)));
  return variants;
}

// Cache danh mục khóa học nhẹ (đã gắn tag) theo từng kết nối DB
let catalogCache = new WeakMap();
let mlEventsCache = new WeakMap();
let mlModelCache = new WeakMap();

/**
 * Xóa cache danh mục khóa học (gọi khi khóa học/tag thay đổi hoặc trong kiểm thử).
 */
export function clearRecommendationCache() {
  catalogCache = new WeakMap();
  mlEventsCache = new WeakMap();
  mlModelCache = new WeakMap();
}

function getMlFeatures(scoreBreakdown, behaviorWeight) {
  return {
    tag_affinity: Math.max(0, Math.min(1, scoreBreakdown.tag / SCORE_WEIGHTS.tag)),
    cooccurrence: Math.max(0, Math.min(1, scoreBreakdown.cooccurrence / SCORE_WEIGHTS.cooccurrence)),
    budget_fit: Math.max(0, Math.min(1, scoreBreakdown.budget / SCORE_WEIGHTS.budget)),
    popularity: Math.max(0, Math.min(1, scoreBreakdown.popularity / SCORE_WEIGHTS.popularity)),
    level_fit: Math.max(0, Math.min(1, scoreBreakdown.level / SCORE_WEIGHTS.level)),
    behavior_weight: behaviorWeight,
  };
}

async function fetchCourseFeedback(db, now) {
  const cached = mlEventsCache.get(db);
  if (cached && now - cached.at < ML_EVENTS_CACHE_TTL_MS) return cached.events;

  const [carts, owned, enrolled, reviews, progress] = await Promise.all([
    db.collection(COLLECTION_CARTS).find({}).project({ user_id: 1, userId: 1, course_id: 1, courseId: 1 }).limit(5000).toArray(),
    db.collection(COLLECTION_USER_COURSES).find({}).project({ user_id: 1, userId: 1, course_id: 1, courseId: 1 }).limit(5000).toArray(),
    db.collection(COLLECTION_ENROLLMENTS).find({}).project({ user_id: 1, userId: 1, course_id: 1, courseId: 1 }).limit(5000).toArray(),
    db.collection('course_reviews').find({}).project({ user_id: 1, userId: 1, course_id: 1, courseId: 1, rating: 1 }).limit(5000).toArray(),
    db.collection('user_course_progress').find({}).project({ user_id: 1, userId: 1, course_id: 1, courseId: 1, progress_percentage: 1, is_completed: 1 }).limit(5000).toArray(),
  ]);
  const labels = new Map();
  const add = (rows, labelForRow) => {
    for (const row of rows) {
      const userId = row.user_id ?? row.userId;
      const courseId = row.course_id ?? row.courseId;
      if (userId === undefined || courseId === undefined) continue;
      const key = `${String(userId)}|${String(courseId)}`;
      const label = labelForRow(row);
      const existing = labels.get(key);
      if (label < 0 || existing === -1) labels.set(key, -1);
      else if (label > 0) labels.set(key, 1);
      else if (existing === undefined) labels.set(key, 0);
    }
  };
  add(carts, () => 1);
  add(owned, () => 1);
  add(enrolled, () => 1);
  add(reviews, (row) => Number(row.rating) >= 4 ? 1 : (Number(row.rating) > 0 && Number(row.rating) <= 2 ? -1 : 0));
  add(progress, (row) => row.is_completed === true || Number(row.progress_percentage) >= 80 ? 1 : 0);

  // Unobserved interactions are not treated as dislikes. Only explicit low ratings
  // create negative labels; positives come from course ownership, strong ratings,
  // or substantial learning progress.
  const events = [...labels].filter(([, label]) => label !== 0).map(([key, label]) => {
    const [userId, courseId] = key.split('|');
    return { userId, courseId, label: label < 0 ? 0 : 1 };
  });
  mlEventsCache.set(db, { at: now, events });
  return events;
}

async function getCourseRanker(db, now, rankedById) {
  const cached = mlModelCache.get(db);
  if (cached && now - cached.at < ML_MODEL_CACHE_TTL_MS) return cached.model;
  const feedback = await fetchCourseFeedback(db, now);
  const events = feedback.map((event) => {
    const ranked = rankedById.get(event.courseId);
    if (!ranked) return null;
    return { label: event.label, features: ranked.ml_features };
  }).filter(Boolean);
  const model = trainCourseRanker(events, {
    minEvents: ML_MODEL_MIN_EVENTS,
    minPositive: ML_MODEL_MIN_LABELS_PER_CLASS,
    minNegative: ML_MODEL_MIN_LABELS_PER_CLASS,
  });
  mlModelCache.set(db, { at: now, model });
  return model;
}

/**
 * Lấy danh mục khóa học published dạng nhẹ kèm tag_ids, cache ngắn hạn.
 * Chỉ projection các trường phục vụ chấm điểm thay vì làm giàu toàn bộ thẻ.
 * @returns {Promise<Array<object>>}
 */
async function fetchCatalog(db) {
  const cached = catalogCache.get(db);
  if (cached && Date.now() - cached.at < CATALOG_CACHE_TTL_MS) return cached.items;

  const courses = await db.collection(COLLECTION_COURSES)
    .find({ status: 'published' })
    .project({
      course_id: 1, price: 1, original_price: 1, rating: 1,
      total_students: 1, total_reviews: 1, level: 1,
    })
    .toArray();
  const courseIds = courses.map((c) => String(c.course_id));
  const courseTags = courseIds.length > 0
    ? await db.collection(COLLECTION_COURSE_TAGS)
      .find({ course_id: { $in: courseIds } })
      .project({ course_id: 1, tag_id: 1 })
      .toArray()
    : [];

  const tagMap = new Map();
  for (const ct of courseTags) {
    const key = String(ct.course_id);
    if (!tagMap.has(key)) tagMap.set(key, []);
    tagMap.get(key).push(String(ct.tag_id));
  }

  const items = courses.map((c) => ({
    course_id: String(c.course_id),
    price: parseFloat(c.price ?? c.original_price ?? 0) || 0,
    rating: parseFloat(c.rating) || 0,
    total_students: parseInt(c.total_students, 10) || 0,
    total_reviews: parseInt(c.total_reviews, 10) || 0,
    level: c.level ? String(c.level).toLowerCase() : '',
    tag_ids: tagMap.get(String(c.course_id)) || [],
  }));
  catalogCache.set(db, { at: Date.now(), items });
  return items;
}

async function fetchCartCourseIds(db, userId) {
  const rows = await db.collection(COLLECTION_CARTS)
    .find({ $or: [{ user_id: { $in: toUserIdVariants(userId) } }, { userId: String(userId) }] })
    .toArray();
  const ids = new Set();
  for (const rec of rows) {
    if (rec.course_id) ids.add(String(rec.course_id));
    if (rec.courseId) ids.add(String(rec.courseId));
    if (Array.isArray(rec.items)) {
      rec.items.forEach((it) => {
        const id = it.id || it.course_id || it.courseId;
        if (id) ids.add(String(id));
      });
    }
  }
  return ids;
}

async function fetchPurchasedCourseIds(db, userId) {
  const filter = { $or: [{ user_id: { $in: toUserIdVariants(userId) } }, { userId: String(userId) }] };
  const [owned, enrolled] = await Promise.all([
    db.collection(COLLECTION_USER_COURSES).find(filter).project({ course_id: 1, courseId: 1 }).toArray(),
    db.collection(COLLECTION_ENROLLMENTS).find(filter).project({ course_id: 1, courseId: 1 }).toArray(),
  ]);
  const ids = new Set();
  for (const r of [...owned, ...enrolled]) {
    const id = r.course_id || r.courseId;
    if (id) ids.add(String(id));
  }
  return ids;
}

async function fetchOnboardingProfile(db, userId) {
  if (!ObjectId.isValid(userId)) return { tagIds: [], level: null };
  const answer = await db.collection('student_onboarding_answers')
    .findOne({ user_id: new ObjectId(String(userId)) });
  return {
    tagIds: Array.isArray(answer?.selected_tag_ids) ? answer.selected_tag_ids.map(String) : [],
    level: answer?.level ? String(answer.level).toLowerCase() : null,
  };
}

/**
 * Đếm số "đồng chủ sở hữu": với mỗi khóa ngoài anchor, có bao nhiêu học viên khác
 * cũng sở hữu cả khóa anchor.
 * @returns {Promise<Map<string, number>>} course_id → số học viên
 */
async function fetchCooccurrence(db, anchorIds, userId) {
  const counts = new Map();
  if (anchorIds.length === 0) return counts;

  const excludeSelf = userId ? { user_id: { $nin: toUserIdVariants(userId) } } : {};
  const collections = [COLLECTION_USER_COURSES, COLLECTION_ENROLLMENTS];
  const ownerRows = await Promise.all(collections.map((name) => db.collection(name)
    .find({ course_id: { $in: anchorIds }, ...excludeSelf })
    .project({ user_id: 1 })
    .limit(MAX_CO_OWNERS)
    .toArray()));

  const ownerSet = new Set();
  ownerRows.flat().forEach((r) => r.user_id && ownerSet.add(String(r.user_id)));
  if (ownerSet.size === 0) return counts;

  const ownerVariants = [...ownerSet].slice(0, MAX_CO_OWNERS).flatMap((id) => toUserIdVariants(id));
  const otherRows = await Promise.all(collections.map((name) => db.collection(name)
    .find({ user_id: { $in: ownerVariants }, course_id: { $nin: anchorIds } })
    .project({ user_id: 1, course_id: 1 })
    .toArray()));

  const perUser = new Map();
  for (const r of otherRows.flat()) {
    const key = String(r.user_id);
    if (!perUser.has(key)) perUser.set(key, new Set());
    perUser.get(key).add(String(r.course_id));
  }
  for (const courseSet of perUser.values()) {
    for (const cid of courseSet) counts.set(cid, (counts.get(cid) || 0) + 1);
  }
  return counts;
}

// ─── 3. Lõi xếp hạng dùng chung ──────────────────────────────────────────────

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Xếp hạng toàn bộ khóa học published cho 1 người dùng (hoặc khách) — chỉ dùng
 * dữ liệu nhẹ, chưa làm giàu thẻ.
 *
 * @param {object} params
 * @param {import('mongodb').Db} params.db
 * @param {string|null} params.userId
 * @param {Set<string>} params.cartIds
 * @param {boolean} params.excludeOwned - true: loại khóa đã mua + trong giỏ
 * @returns {Promise<{ ranked: object[], budget: object, blend: object, preferences: object|null }>}
 */
async function rankCatalog({ db, userId, cartIds, excludeOwned }) {
  const [catalog, purchasedIds, onboarding] = await Promise.all([
    fetchCatalog(db),
    userId ? fetchPurchasedCourseIds(db, userId) : new Set(),
    userId ? fetchOnboardingProfile(db, userId) : { tagIds: [], level: null },
  ]);

  const catalogById = new Map(catalog.map((c) => [c.course_id, c]));
  const cartItems = [...cartIds].map((id) => catalogById.get(id)).filter(Boolean);
  const purchasedItems = [...purchasedIds].map((id) => catalogById.get(id)).filter(Boolean);
  const anchorIds = [...new Set([...cartItems, ...purchasedItems].map((c) => c.course_id))];

  // Trộn onboarding (cold start) với hành vi: hành vi càng nhiều càng chiếm ưu thế
  const behaviorTagWeights = new Map();
  const addBehavior = (item, weight) => item.tag_ids.forEach((t) => {
    behaviorTagWeights.set(t, (behaviorTagWeights.get(t) || 0) + weight);
  });
  cartItems.forEach((c) => addBehavior(c, BEHAVIOR_TAG_WEIGHT.cart));
  purchasedItems.forEach((c) => addBehavior(c, BEHAVIOR_TAG_WEIGHT.purchased));

  const behaviorWeight = computeBehaviorWeight(anchorIds.length);
  const tagAffinity = blendTagAffinity(onboarding.tagIds, behaviorTagWeights, behaviorWeight);

  const budget = computeBudget(cartItems.map((c) => c.price), purchasedItems.map((c) => c.price));
  const cooccurrence = await fetchCooccurrence(db, anchorIds, userId);
  const maxCooc = Math.max(0, ...cooccurrence.values());

  const ownedSet = new Set([...cartIds, ...purchasedIds]);
  const candidates = excludeOwned ? catalog.filter((c) => !ownedSet.has(c.course_id)) : catalog;
  const maxima = {
    maxStudents: Math.max(0, ...candidates.map((c) => c.total_students)),
    maxReviews: Math.max(0, ...candidates.map((c) => c.total_reviews)),
  };

  const ranked = candidates.map((item) => {
    const breakdown = {
      tag: computeTagScore(item.tag_ids, tagAffinity),
      cooccurrence: maxCooc > 0
        ? SCORE_WEIGHTS.cooccurrence * ((cooccurrence.get(item.course_id) || 0) / maxCooc)
        : 0,
      budget: computeBudgetScore(item.price, budget.referencePrice),
      popularity: computePopularityScore(item, maxima),
      level: computeLevelScore(item.level, onboarding.level, behaviorWeight),
    };
    const total = Object.values(breakdown).reduce((s, n) => s + n, 0);
    return {
      course_id: item.course_id,
      total_students: item.total_students,
      recommend_score: round1(total),
      ml_features: getMlFeatures(breakdown, behaviorWeight),
      score_breakdown: Object.fromEntries(
        Object.entries(breakdown).map(([k, v]) => [k, round1(v)]),
      ),
    };
  });

  const model = await getCourseRanker(db, Date.now(), new Map(ranked.map((item) => [item.course_id, item])));
  if (model) {
    for (const item of ranked) {
      item.rule_recommend_score = item.recommend_score;
      item.ml_score = scoreCourseWithModel(model, item.ml_features);
      item.recommend_score = round1(item.ml_score * 100);
      item.recommendation_method = 'ml';
    }
  } else {
    for (const item of ranked) item.recommendation_method = 'rules';
  }

  ranked.sort((a, b) => b.recommend_score - a.recommend_score
    || b.total_students - a.total_students);

  return {
    ranked,
    budget: { reference_price: Math.round(budget.referencePrice), source: budget.source },
    blend: { behavior_weight: round1(behaviorWeight * 100) / 100, interactions: anchorIds.length },
    preferences: onboarding.tagIds.length > 0 || onboarding.level
      ? { selectedTagIds: onboarding.tagIds, level: onboarding.level }
      : null,
  };
}

/**
 * Làm giàu thẻ đầy đủ chỉ cho các khóa đã được chọn bằng đúng 1 lượt getCourseCards
 * (filters.course_ids), giữ nguyên thứ tự xếp hạng.
 */
async function hydrateCards(db, userId, picked, guestCartIds) {
  if (picked.length === 0) return [];

  const { courses } = await getCourseCards({
    userId,
    filters: { course_ids: picked.map((p) => p.course_id) },
    limit: 'all',
    guestCartIds,
    dbInstance: db,
  });
  const cardById = new Map(courses.map((c) => [String(c.course_id), c]));

  return picked
    .map((p) => {
      const card = cardById.get(p.course_id);
      return card ? {
        ...card,
        recommend_score: p.recommend_score,
        score_breakdown: p.score_breakdown,
        recommendation_method: p.recommendation_method,
      } : null;
    })
    .filter(Boolean);
}

function assertUserId(userId, { required }) {
  if (userId === null || userId === undefined) {
    if (required) throw createError('Thiếu mã học viên.', 400, 'userId');
    return;
  }
  if (typeof userId !== 'string' || !userId.trim()) {
    throw createError('Mã học viên không hợp lệ.', 400, 'userId');
  }
}

// ─── 4. Nghiệp vụ chính ──────────────────────────────────────────────────────

/**
 * Gợi ý khóa học (mặc định 4) cho khu vực giỏ hàng / mọi nơi cần "có thể bạn thích".
 * Loại trừ tuyệt đối khóa đã mua và khóa đang trong giỏ.
 * Tín hiệu: tag (trộn onboarding ↔ hành vi), co-occurrence, ngân sách, phổ biến, trình độ.
 *
 * @param {object} [params]
 * @param {string|null} [params.userId] - Học viên đã đăng nhập (null nếu là khách)
 * @param {string[]} [params.guestCartIds] - course_id trong giỏ tạm của khách
 * @param {number|string} [params.limit] - Số gợi ý, mặc định 4, tối đa 12
 * @param {import('mongodb').Db} [params.dbInstance] - Instance DB phục vụ kiểm thử
 * @returns {Promise<{ budget: object, blend: object, recommendations: object[] }>}
 * @throws {Error} status 400 khi tham số không hợp lệ
 */
export async function getRecommendedCourses({
  userId = null,
  guestCartIds = [],
  limit = DEFAULT_RECOMMEND_LIMIT,
  dbInstance = null,
} = {}) {
  assertUserId(userId, { required: false });
  if (!Array.isArray(guestCartIds)) {
    throw createError('Danh sách giỏ hàng tạm phải là mảng.', 400, 'guestCartIds');
  }
  const size = normalizeLimit(limit);
  const db = dbInstance || (await getMongoDb());

  const cartIds = userId
    ? await fetchCartCourseIds(db, userId)
    : new Set(guestCartIds.map(String));

  const { ranked, budget, blend } = await rankCatalog({ db, userId, cartIds, excludeOwned: true });
  const recommendations = await hydrateCards(db, userId, ranked.slice(0, size), [...cartIds]);
  return { budget, blend, recommendations };
}

/**
 * Danh sách khóa học cá nhân hóa cho trang chủ — thay thế cách sắp xếp tĩnh sau
 * onboarding. Người dùng mới (chưa có hành vi) được xếp theo onboarding; càng
 * tương tác (giỏ hàng, mua) thì càng xếp theo hành vi thực tế.
 * Không loại khóa nào (kể cả đã mua); thẻ có action_state để giao diện hiển thị đúng.
 *
 * @param {object} params
 * @param {string} params.userId - Bắt buộc (lấy từ JWT)
 * @param {number|string} [params.page] - Trang (1-indexed)
 * @param {number|string} [params.limit] - Số khóa / trang, mặc định 12, tối đa 50
 * @param {import('mongodb').Db} [params.dbInstance]
 * @returns {Promise<{ pagination: object, blend: object, preferences: object|null, courses: object[] }>}
 * @throws {Error} status 400 khi tham số không hợp lệ
 */
export async function getPersonalizedCourseFeed({
  userId,
  page = 1,
  limit = DEFAULT_FEED_LIMIT,
  dbInstance = null,
} = {}) {
  assertUserId(userId, { required: true });
  const pageNum = normalizePositiveInt(page, 1, Number.MAX_SAFE_INTEGER, 'page');
  const pageSize = normalizePositiveInt(limit, DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT, 'limit');
  const db = dbInstance || (await getMongoDb());

  const cartIds = await fetchCartCourseIds(db, userId);
  const { ranked, blend, preferences } = await rankCatalog({ db, userId, cartIds, excludeOwned: false });

  const start = (pageNum - 1) * pageSize;
  const courses = await hydrateCards(db, userId, ranked.slice(start, start + pageSize), [...cartIds]);

  return {
    pagination: {
      page: pageNum,
      limit: pageSize,
      total_items: ranked.length,
      total_pages: Math.ceil(ranked.length / pageSize),
      has_next: start + pageSize < ranked.length,
      has_prev: pageNum > 1,
    },
    blend,
    preferences,
    courses,
  };
}
