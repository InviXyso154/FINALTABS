import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReview } from '../core/scheduler.js';
import { PARAMS } from '../core/params.js';
import { createCard, loadStudyState } from '../state/study-state.js';

test('credit-adjusted interval uses a separate baseInterval chain', () => {
  const card = {
    interval: 12,
    baseInterval: 10,
    repetitions: 3,
    easeFactor: 2.5,
    exposureCredit: 1,
    lapses: 0
  };
  const result = calculateReview(card, 4, {
    now: Date.UTC(2026, 0, 1),
    deck: {},
    params: { GAMMA: 0.2, CREDIT_CAP: 1, MAX_MULT: 1.25, MIN_MULT: 0.8, E0: 0.25 }
  });
  assert.equal(result.baseInterval, 25);
  assert.ok(result.baseInterval <= result.interval);
  assert.ok(result.interval <= result.baseInterval * (1 + 0.2 * 1));
  assert.equal(result.interval, 30);
});

test('deadline cap can reduce an adjusted interval below the base interval', () => {
  const now = Date.UTC(2026, 0, 1);
  const result = calculateReview({
    interval: 10,
    baseInterval: 10,
    repetitions: 3,
    easeFactor: 2.5,
    exposureCredit: 1
  }, 4, {
    now,
    deck: { examDate: now + 2 * 86400000 },
    params: { GAMMA: 0.2, CREDIT_CAP: 1, MAX_MULT: 1.25, MIN_MULT: 0.8, E0: 0.25, K_REVIEWS: 3 }
  });
  assert.ok(result.interval <= 1);
  assert.equal(result.schedule.deadlineCap, 1);
});

test('study card migration initializes baseInterval from interval', () => {
  assert.equal(createCard({ interval: 12 }).baseInterval, 12);
  assert.equal(createCard({ interval: 12, baseInterval: 10 }).baseInterval, 10);
});

test('effective exposure interval max is 1.20', () => {
  const effectiveMax = Math.min(PARAMS.MAX_MULT, 1 + PARAMS.GAMMA * PARAMS.CREDIT_CAP);
  assert.equal(effectiveMax, 1.2);
});
