import { PARAMS, clamp } from './params.js';

export function calculateReview(card, quality, ctx) {
  const context = ctx || {};
  const params = { ...PARAMS, ...(context.params || {}) };
  const now = Number.isFinite(context.now) ? context.now : 0;
  const deck = context.deck || {};
  const grade = Math.max(0, Math.min(5, Number(quality)));
  let easeFactor = card.easeFactor || 2.5;
  let repetitions = card.repetitions || 0;
  let baseInterval = Number.isFinite(card.baseInterval)
    ? card.baseInterval
    : Number.isFinite(card.interval)
      ? card.interval
      : 0;

  const easeBefore = easeFactor;
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  const easeStep = {
    id: 'ease-factor-update',
    label: 'Ease-factor update',
    formula: 'ease = max(1.3, easeBefore + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))',
    inputs: { easeBefore, grade },
    result: easeFactor
  };
  const baseBefore = baseInterval;
  if (grade < 3) {
    repetitions = 0;
    baseInterval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) baseInterval = 1;
    else if (repetitions === 2) baseInterval = 6;
    else baseInterval = Math.max(1, Math.round(baseInterval * easeFactor));
  }
  const repetitionsStep = {
    id: 'repetitions-base-interval',
    label: 'Repetitions and base interval',
    formula: 'grade < 3: reps=0, base=1; reps=1: base=1; reps=2: base=6; reps>2: base=max(1, round(baseBefore*ease))',
    inputs: { grade, repetitionsBefore: card.repetitions || 0, baseBefore, easeFactor },
    result: { repetitions, baseInterval }
  };

  const credit = grade >= 3 ? clamp(card.exposureCredit || 0, 0, params.CREDIT_CAP) : 0;
  const creditStep = {
    id: 'credit-clamp',
    label: 'Exposure credit clamp',
    formula: 'credit = grade >= 3 ? clamp(exposureCredit, 0, CREDIT_CAP) : 0',
    inputs: { grade, exposureCredit: card.exposureCredit || 0, creditCap: params.CREDIT_CAP },
    result: credit
  };
  const oneSidedMultiplier = clamp(1 + params.GAMMA * credit, 1, params.MAX_MULT);
  const twoSidedMultiplier = clamp(
    1 + params.GAMMA * (credit - params.E0),
    params.MIN_MULT,
    params.MAX_MULT
  );
  const multiplier = params.twoSided ? twoSidedMultiplier : oneSidedMultiplier;
  const multiplierStep = {
    id: 'exposure-multiplier',
    label: 'Exposure multiplier',
    formula: 'one-sided: clamp(1 + GAMMA*credit, 1, MAX_MULT)',
    inputs: { credit, gamma: params.GAMMA, maxMult: params.MAX_MULT, twoSided: params.twoSided === true },
    result: multiplier
  };
  let deadlineCap = null;
  const intervalBeforeCap = Math.max(1, baseInterval * multiplier);
  const intervalBeforeCapStep = {
    id: 'interval-before-cap',
    label: 'Interval before deadline cap',
    formula: 'intervalBeforeCap = max(1, baseInterval * exposureMultiplier)',
    inputs: { baseInterval, exposureMultiplier: multiplier },
    result: intervalBeforeCap
  };
  let finalInterval = intervalBeforeCap;

  if (deck.examDate && deck.examDate > now) {
    deadlineCap = Math.max(1, (deck.examDate - now) / (params.K_REVIEWS * 86400000));
    finalInterval = Math.min(finalInterval, deadlineCap);
  }
  const deadlineStep = {
    id: 'deadline-cap',
    label: 'Deadline cap',
    formula: 'deadlineCap = examDate ? max(1, (examDate-now)/(K_REVIEWS*86400000)) : null',
    inputs: { examDate: deck.examDate || null, now, kReviews: params.K_REVIEWS },
    result: deadlineCap
  };
  const finalStep = {
    id: 'final-interval',
    label: 'Final interval',
    formula: 'finalInterval = deadlineCap ? min(intervalBeforeCap, deadlineCap) : intervalBeforeCap',
    inputs: { intervalBeforeCap, deadlineCap },
    result: finalInterval
  };

  return {
    ...card,
    baseInterval,
    interval: finalInterval,
    repetitions,
    easeFactor,
    dueAt: now + finalInterval * 86400000,
    exposureCredit: 0,
    lapses: (card.lapses || 0) + (grade < 3 ? 1 : 0),
    schedule: { baseInterval, exposureMultiplier: multiplier, deadlineCap, finalInterval },
    trace: [
      easeStep,
      repetitionsStep,
      creditStep,
      multiplierStep,
      intervalBeforeCapStep,
      deadlineStep,
      finalStep
    ]
  };
}

export function compareToStandard(card, quality, ctx) {
  const context = ctx || {};
  return calculateReview(
    { ...card, exposureCredit: 0 },
    quality,
    { ...context, deck: {}, params: { ...(context.params || {}), GAMMA: 0, CREDIT_CAP: 0, twoSided: false } }
  );
}

export function isDue(card, now) {
  return (card.dueAt || 0) <= now;
}

export function countDueCards(stateOrCards, now) {
  const cards = Array.isArray(stateOrCards)
    ? stateOrCards
    : Array.isArray(stateOrCards?.cards)
      ? stateOrCards.cards
      : [];
  return cards.filter(card => isDue(card, now)).length;
}
