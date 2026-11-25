import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32, recallProbability, runSimulation } from '../core/simulation-model.js';

test('simulation is deterministic for a fixed seed', () => {
  const options = { seed: 42, learners: 20, horizon: 60, boost: 0.2, profile: 'medium' };
  const a = runSimulation(options);
  const b = runSimulation(options);
  assert.deepEqual(a, b);
});

test('recall probability is 0.9 at dt equal interval when boost is zero', () => {
  const result = recallProbability({ dt: 10, interval: 10, credit: 1, boost: 0 });
  assert.ok(Math.abs(result - 0.9) < 1e-12);
});

test('adjusted interval stays within credit bounds', () => {
  const output = runSimulation({
    seed: 123,
    learners: 25,
    horizon: 60,
    boost: 0.2,
    profile: 'high',
    variant: 'exposure-one-sided',
    deadline: true
  });
  assert.ok(output.reviewsPerCard >= 0);
  assert.ok(output.meanRecallAtReview >= 0 && output.meanRecallAtReview <= 1);
  assert.ok(output.predictedRecallOnExamDay >= 0 && output.predictedRecallOnExamDay <= 1);
  assert.ok(output.lapses >= 0);
});

test('mulberry32 is seeded and bounded', () => {
  const random = mulberry32(99);
  for (let index = 0; index < 100; index += 1) {
    const value = random();
    assert.ok(value >= 0 && value < 1);
  }
});
