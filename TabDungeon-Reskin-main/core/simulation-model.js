import { accumulateExposureVisit } from './exposure.js';
import { PARAMS } from './params.js';
import { calculateReview } from './scheduler.js';

export const PROFILES = Object.freeze({
  low: Object.freeze({ p: 0.25, minDwellMs: 60000, maxDwellMs: 120000 }),
  medium: Object.freeze({ p: 0.50, minDwellMs: 60000, maxDwellMs: 180000 }),
  high: Object.freeze({ p: 0.80, minDwellMs: 90000, maxDwellMs: 240000 })
});

export function mulberry32(seed = 123456) {
  let state = Number(seed) >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function recallProbability({ dt, interval, credit, boost = 0.2 }) {
  const kappa = -1 / Math.log(0.9);
  const strength = kappa * Math.max(1, interval) * (1 + boost * Math.max(0, credit));
  return Math.exp(-Math.max(0, dt) / strength);
}

export function runSimulation({
  seed = 123456,
  learners = 1,
  horizon = 60,
  boost = 0.2,
  profile = 'medium',
  variant = 'exposure-one-sided',
  deadline = false,
  examDay = 60
} = {}) {
  const random = mulberry32(seed);
  const profileConfig = PROFILES[profile] || PROFILES.medium;
  const kappa = -1 / Math.log(0.9);
  let totalReviews = 0;
  let recallSum = 0;
  let lapseSum = 0;
  let examRecallSum = 0;

  for (let learner = 0; learner < Math.max(1, learners); learner += 1) {
    const card = {
      interval: 0,
      baseInterval: 0,
      repetitions: 0,
      easeFactor: 2.5,
      exposureCredit: 0,
      lapses: 0
    };
    let dueDay = 0;
    let previousReviewDay = 0;
    let scheduledInterval = 0;
    let credit = 0;
    let visits = {};
    let learnerLapses = 0;
    let learnerReviews = 0;
    let learnerRecallSum = 0;

    for (let day = 0; day <= horizon; day += 1) {
      if (random() < profileConfig.p) {
        const dwellRange = profileConfig.maxDwellMs - profileConfig.minDwellMs;
        const dwellMs = profileConfig.minDwellMs + random() * dwellRange;
        const accumulated = accumulateExposureVisit(visits, {
          dayKey: String(day),
          deckId: 'simulation',
          urlHash: 'related',
          dwellIncrementMs: dwellMs,
          score: 1,
          params: PARAMS
        });
        visits = accumulated.visits;
        credit = Math.max(0, Math.min(PARAMS.CREDIT_CAP, credit + accumulated.credit));
      }

      if (day < dueDay) continue;
      const dt = learnerReviews === 0 ? 0 : day - previousReviewDay;
      scheduledInterval = learnerReviews === 0 ? 0 : scheduledInterval;
      const strength = learnerReviews === 0
        ? 1
        : kappa * Math.max(1, scheduledInterval) * (1 + boost * credit);
      const recall = learnerReviews === 0 ? 1 : Math.exp(-dt / strength);
      learnerRecallSum += recall;
      learnerReviews += 1;
      const successful = random() < recall;
      if (!successful) learnerLapses += 1;
      const quality = successful ? 4 : 1;
      const exposureVariant = variant.startsWith('exposure');
      const creditForReview = exposureVariant ? credit : 0;
      const updated = calculateReview(
        {
          ...card,
          exposureCredit: creditForReview,
          baseInterval: card.baseInterval,
          interval: card.interval
        },
        quality,
        {
          now: day * 86400000,
          deck: deadline ? { examDate: examDay * 86400000 } : {},
          params: {
            ...PARAMS,
            twoSided: variant === 'exposure-two-sided'
          }
        }
      );
      Object.assign(card, updated);
      scheduledInterval = updated.interval;
      dueDay = day + Math.max(1, updated.interval);
      previousReviewDay = day;
      credit = 0;
    }

    const examDt = Math.max(0, examDay - previousReviewDay);
    const examRecall = learnerReviews === 0
      ? 0
      : Math.exp(-examDt / (kappa * Math.max(1, scheduledInterval) * (1 + boost * 0)));
    totalReviews += learnerReviews;
    recallSum += learnerRecallSum;
    lapseSum += learnerLapses;
    examRecallSum += examRecall;
  }

  return {
    variant,
    deadline,
    boost,
    profile,
    horizon,
    seed,
    reviewsPerCard: totalReviews / Math.max(1, learners),
    meanRecallAtReview: totalReviews ? recallSum / totalReviews : 0,
    lapses: lapseSum / Math.max(1, learners),
    predictedRecallOnExamDay: examRecallSum / Math.max(1, learners)
  };
}
