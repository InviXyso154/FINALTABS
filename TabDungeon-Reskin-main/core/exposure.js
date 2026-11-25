export function createTrackingState({
  tabId,
  windowId,
  urlKey,
  metadata = {},
  now
}) {
  const timestamp = Number.isFinite(now) ? now : 0;
  return {
    tabId,
    windowId,
    urlKey,
    metadata,
    startedAt: timestamp,
    lastFlushedAt: timestamp,
    dwellMs: 0
  };
}

export function advanceTrackingState(state, now, maxElapsedMs = 5 * 60 * 1000) {
  const timestamp = Number.isFinite(now) ? now : 0;
  const previous = Number.isFinite(state?.lastFlushedAt)
    ? state.lastFlushedAt
    : Number.isFinite(state?.startedAt)
      ? state.startedAt
      : timestamp;
  const elapsedMs = Math.max(0, Math.min(maxElapsedMs, timestamp - previous));
  return {
    state: {
      ...(state || {}),
      lastFlushedAt: timestamp,
      dwellMs: (Number(state?.dwellMs) || 0) + elapsedMs
    },
    elapsedMs
  };
}

export function isTrackingEligible({
  idleState = 'active',
  focusedWindowId,
  trackingState
}) {
  if (idleState !== 'active' || !trackingState) return false;
  if (!Number.isFinite(trackingState.windowId)) return false;
  if (focusedWindowId === -1 || trackingState.windowId !== focusedWindowId) return false;
  return true;
}

export function calculateExposureCreditIncrement({
  previousDwellMs = 0,
  totalDwellMs = 0,
  score = 0,
  params = {}
}) {
  const minDwellMs = Math.max(0, Number(params.MIN_DWELL || 30) * 1000);
  const fullDwellMs = Math.max(1, Number(params.T_FULL || 120) * 1000);
  const lambda = Math.max(0, Number(params.LAMBDA || 0));
  const safeScore = Math.max(0, Math.min(1, Number(score) || 0));
  if (totalDwellMs < minDwellMs) return 0;
  const previousCapped = Math.max(0, Math.min(fullDwellMs, Number(previousDwellMs) || 0));
  const totalCapped = Math.max(0, Math.min(fullDwellMs, Number(totalDwellMs) || 0));
  return lambda * safeScore * Math.max(0, totalCapped - previousCapped) / fullDwellMs;
}

export function accumulateExposureVisit(visits, options = {}, params = {}) {
  const previousVisits = visits && typeof visits === 'object' ? visits : {};
  const dayKey = String(options.dayKey || options.day || '');
  const deckId = String(options.deckId || '');
  const urlHash = String(options.urlHash || '');
  const key = `${dayKey}:${deckId}:${urlHash}`;
  const existing = previousVisits[key] && typeof previousVisits[key] === 'object'
    ? previousVisits[key]
    : { dwellMs: 0, awardedMs: 0 };
  const passedParams = options.params || params;
  const previousDwellMs = Number(existing.dwellMs) || 0;
  const requestedDwellMs = Number.isFinite(options.dwellIncrementMs)
    ? previousDwellMs + Math.max(0, options.dwellIncrementMs)
    : Number.isFinite(options.totalDwellMs)
      ? options.totalDwellMs
      : Number.isFinite(options.dwellMs)
        ? options.dwellMs
        : previousDwellMs;
  const totalDwellMs = Math.max(previousDwellMs, requestedDwellMs);
  const credit = calculateExposureCreditIncrement({
    previousDwellMs,
    totalDwellMs,
    score: options.score,
    params: passedParams
  });
  const fullDwellMs = Math.max(1, Number(passedParams.T_FULL || 120) * 1000);
  const previousAwardable = Math.max(0, Math.min(fullDwellMs, previousDwellMs));
  const totalAwardable = Math.max(0, Math.min(fullDwellMs, totalDwellMs));
  const awardIncrementMs = Math.max(0, totalAwardable - previousAwardable);
  const next = {
    ...previousVisits,
    [key]: {
      dwellMs: totalDwellMs,
      awardedMs: (Number(existing.awardedMs) || 0) + awardIncrementMs
    }
  };
  return { visits: next, credit, key, dwellMs: totalDwellMs };
}

export function pruneExposureVisits(visits, now, retentionDays = 7) {
  const source = visits && typeof visits === 'object' ? visits : {};
  const today = typeof now === 'string'
    ? now.slice(0, 10)
    : new Date(Number.isFinite(now) ? now : Date.now()).toISOString().slice(0, 10);
  const [year, month, day] = today.split('-').map(Number);
  const cutoffMs = Date.UTC(year, month - 1, day) - Math.max(0, retentionDays - 1) * 86400000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const pruned = {};
  for (const [key, visit] of Object.entries(source)) {
    const dayKey = key.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey) && dayKey >= cutoff) pruned[key] = visit;
  }
  return pruned;
}

export function removeExposureVisitsForDeck(visits, deckId) {
  const source = visits && typeof visits === 'object' ? visits : {};
  const targetDeckId = String(deckId);
  return Object.fromEntries(Object.entries(source).filter(([key]) => {
    const parts = key.split(':');
    return parts.slice(1, -1).join(':') !== targetDeckId;
  }));
}
