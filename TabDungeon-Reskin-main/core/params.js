// Provisional values. Tune these through simulation and labeled evaluation data.
export const PARAMS = Object.freeze({
  MIN_DWELL: 30,
  MIN_PAGE_TOKENS: 3,
  T_FULL: 120,
  LAMBDA: 0.5,
  // PROVISIONAL threshold tuning from the current 6-row sample after off-topic norm.
  T_HI: 0.15,
  T_LO: 0.05,
  CREDIT_CAP: 1,
  GAMMA: 0.2,
  MAX_MULT: 1.25,
  // PROVISIONAL effective max multiplier: min(MAX_MULT, 1 + GAMMA * CREDIT_CAP)
  // = min(1.25, 1 + 0.2 * 1) = 1.20.
  MIN_MULT: 0.8,
  E0: 0.25,
  K_REVIEWS: 3,
  CARD_LEVEL_MATCHING: false
});

export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
