/**
 * Small dependency-free logistic regression ranker for course recommendations.
 * It trains only when enough real, labeled user/course interactions exist.
 */
export const ML_MIN_LABELED_EVENTS = 200;
export const ML_MIN_POSITIVE_EVENTS = 30;
export const ML_MIN_NEGATIVE_EVENTS = 30;
export const ML_FEATURES = Object.freeze([
  'tag_affinity',
  'cooccurrence',
  'budget_fit',
  'popularity',
  'level_fit',
  'behavior_weight',
]);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const sigmoid = (value) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));

function normalizeFeatures(features) {
  return ML_FEATURES.map((key) => clamp01(features?.[key]));
}

function sigmoidScore(weights, features) {
  const vector = normalizeFeatures(features);
  return sigmoid(weights[0] + vector.reduce((sum, value, index) => sum + value * weights[index + 1], 0));
}

/** Train regularized logistic regression; returns null until evidence is adequate. */
export function trainCourseRanker(events, options = {}) {
  const minEvents = options.minEvents ?? ML_MIN_LABELED_EVENTS;
  const minPositive = options.minPositive ?? ML_MIN_POSITIVE_EVENTS;
  const minNegative = options.minNegative ?? ML_MIN_NEGATIVE_EVENTS;
  if (!Array.isArray(events)) return null;

  const rows = events.filter((event) =>
    (event?.label === 0 || event?.label === 1) && event.features &&
    ML_FEATURES.every((key) => Number.isFinite(Number(event.features[key]))),
  );
  const positives = rows.reduce((count, row) => count + row.label, 0);
  const negatives = rows.length - positives;
  if (rows.length < minEvents || positives < minPositive || negatives < minNegative) return null;

  const weights = Array(ML_FEATURES.length + 1).fill(0);
  const learningRate = 0.08;
  const regularization = 0.02;
  const epochs = 300;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradient = Array(weights.length).fill(0);
    for (const row of rows) {
      const vector = [1, ...normalizeFeatures(row.features)];
      const error = sigmoidScore(weights, row.features) - row.label;
      vector.forEach((value, index) => { gradient[index] += error * value; });
    }
    const scale = 1 / rows.length;
    weights.forEach((weight, index) => {
      const penalty = index === 0 ? 0 : regularization * weight;
      weights[index] = weight - learningRate * (gradient[index] * scale + penalty);
    });
  }

  return {
    version: 1,
    algorithm: 'regularized-logistic-regression',
    trainedAt: new Date().toISOString(),
    sampleCount: rows.length,
    positiveCount: positives,
    negativeCount: negatives,
    weights,
  };
}

export function scoreCourseWithModel(model, features) {
  if (!model || !Array.isArray(model.weights) || model.weights.length !== ML_FEATURES.length + 1) return null;
  return Math.round(sigmoidScore(model.weights, features) * 10000) / 10000;
}

/** Synthetic deterministic fixture for isolated model checks; never writes to MongoDB. */
export function createSyntheticCourseEvents({ users = 80, courses = 20 } = {}) {
  const events = [];
  for (let user = 0; user < users; user += 1) {
    const preferredTopic = user % 5;
    for (let course = 0; course < courses; course += 1) {
      const affinity = course % 5 === preferredTopic ? 1 : 0.1;
      const features = {
        tag_affinity: affinity,
        cooccurrence: course % 3 === user % 3 ? 0.8 : 0.15,
        budget_fit: course % 4 === user % 4 ? 0.9 : 0.3,
        popularity: (course % 7) / 7,
        level_fit: course % 2 === user % 2 ? 1 : 0.2,
        behavior_weight: Math.min(1, (user % 7) / 5),
      };
      const label = affinity === 1 || (features.cooccurrence > 0.7 && user % 2 === 0) ? 1 : 0;
      events.push({ userId: `synthetic-user-${user}`, courseId: `synthetic-course-${course}`, features, label });
    }
  }
  return events;
}
