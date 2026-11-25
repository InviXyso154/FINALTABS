import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReview, compareToStandard } from '../core/scheduler.js';

test('calculateReview trace matches returned schedule values', () => {
  const now = Date.UTC(2026, 0, 1);
  const card = {
    interval: 10,
    baseInterval: 10,
    repetitions: 3,
    easeFactor: 2.5,
    exposureCredit: 0.5,
    lapses: 0
  };
  const result = calculateReview(card, 4, {
    now,
    deck: { examDate: now + 10 * 86400000 },
    params: { GAMMA: 0.2, CREDIT_CAP: 1, MAX_MULT: 1.25, MIN_MULT: 0.8, E0: 0.25, K_REVIEWS: 3 }
  });
  const steps = Object.fromEntries(result.trace.map(step => [step.id, step]));
  assert.equal(steps['ease-factor-update'].result, result.easeFactor);
  assert.equal(steps['repetitions-base-interval'].result.repetitions, result.repetitions);
  assert.equal(steps['repetitions-base-interval'].result.baseInterval, result.baseInterval);
  assert.equal(steps['interval-before-cap'].result, result.schedule.baseInterval * result.schedule.exposureMultiplier);
  assert.equal(steps['deadline-cap'].result, result.schedule.deadlineCap);
  assert.equal(steps['final-interval'].result, result.interval);
});

test('compareToStandard returns plain SM-2 without exposure or deadline', () => {
  const now = Date.UTC(2026, 0, 1);
  const card = {
    interval: 10,
    baseInterval: 10,
    repetitions: 3,
    easeFactor: 2.5,
    exposureCredit: 1,
    lapses: 0
  };
  const standard = compareToStandard(card, 4, {
    now,
    deck: { examDate: now + 86400000 },
    params: { GAMMA: 0.2, CREDIT_CAP: 1, MAX_MULT: 1.25, MIN_MULT: 0.8, E0: 0.25, K_REVIEWS: 3 }
  });
  assert.equal(standard.exposureCredit, 0);
  assert.equal(standard.schedule.exposureMultiplier, 1);
  assert.equal(standard.schedule.deadlineCap, null);
  assert.equal(standard.baseInterval, 25);
  assert.equal(standard.interval, 25);
});
