import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyntheticCourseEvents,
  scoreCourseWithModel,
  trainCourseRanker,
} from '../course_ranker.js';

describe('Course ML ranker', () => {
  it('keeps rule-based ranking active until sample and class thresholds are met', () => {
    assert.equal(trainCourseRanker(createSyntheticCourseEvents({ users: 2, courses: 4 })), null);
  });

  it('trains from synthetic labeled interactions and ranks relevant courses higher', () => {
    const model = trainCourseRanker(createSyntheticCourseEvents());
    assert.ok(model);
    assert.equal(model.algorithm, 'regularized-logistic-regression');
    const relevant = scoreCourseWithModel(model, {
      tag_affinity: 1,
      cooccurrence: 0.8,
      budget_fit: 0.9,
      popularity: 0.4,
      level_fit: 1,
      behavior_weight: 0.8,
    });
    const irrelevant = scoreCourseWithModel(model, {
      tag_affinity: 0.1,
      cooccurrence: 0.15,
      budget_fit: 0.3,
      popularity: 0.4,
      level_fit: 0.2,
      behavior_weight: 0.8,
    });
    assert.ok(relevant > irrelevant);
    assert.equal(scoreCourseWithModel(null, {}), null);
  });
});
