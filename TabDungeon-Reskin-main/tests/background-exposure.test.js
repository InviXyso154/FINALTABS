import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  accumulateExposureVisit,
  advanceTrackingState,
  calculateExposureCreditIncrement,
  createTrackingState,
  isTrackingEligible,
  pruneExposureVisits,
  removeExposureVisitsForDeck
} from '../core/exposure.js';

const source = fs.readFileSync(new URL('../background/index.js', import.meta.url), 'utf8');

test('deck model lookup is scoped outside getAllTabsInfo', () => {
  assert.match(source, /async function getDeckModels\(studyState = null\)/);
  assert.doesNotMatch(source.slice(source.indexOf('async function getAllTabsInfo')), /async function getDeckModels/);
});

test('background relevance calls pass exported thresholds', () => {
  assert.ok(source.includes('scoreRelevance(request.metadata || {}, models.find(model => model.deckId === request.deckId), PARAMS)'));
  assert.ok(source.includes('scoreRelevance(pageMetadata, models.find(model => model.deckId === deck.id), PARAMS)'));
});

test('tracking state survives restarts and caps sleeping elapsed time', () => {
  const state = createTrackingState({
    tabId: 7,
    windowId: 3,
    urlKey: 'https://example.com/study',
    metadata: { title: 'Study page' },
    now: 1000
  });
  const advanced = advanceTrackingState(state, 1000 + 20 * 60 * 1000, 5 * 60 * 1000);
  assert.equal(advanced.elapsedMs, 5 * 60 * 1000);
  assert.equal(advanced.state.lastFlushedAt, 1000 + 20 * 60 * 1000);
  assert.equal(advanced.state.tabId, 7);
  assert.equal(advanced.state.urlKey, 'https://example.com/study');
});

test('worker persists and rehydrates active tracking state', () => {
  assert.match(source, /tabDungeonActiveExposure/);
  assert.ok(source.includes('chrome.storage?.session?.get'));
  assert.ok(source.includes('async function rehydrateTrackingState()'));
  assert.ok(source.includes('advanceTrackingState(activePage, now, MAX_TRACKING_ELAPSED_MS)'));
});

test('idle and unfocused tracking are ineligible', () => {
  const trackingState = createTrackingState({
    tabId: 7,
    windowId: 3,
    urlKey: 'https://example.com/study',
    now: 1000
  });
  assert.equal(isTrackingEligible({ idleState: 'idle', focusedWindowId: 3, trackingState }), false);
  assert.equal(isTrackingEligible({ idleState: 'active', focusedWindowId: 4, trackingState }), false);
  assert.equal(isTrackingEligible({ idleState: 'active', focusedWindowId: 3, trackingState }), true);
  assert.ok(source.includes('async function isTrackedPageActive()'));
  assert.ok(source.includes('activeTabs.some(tab => tab.id === activePage.tabId)'));
});

test('dwell credit accumulates by stay and caps at full dwell', () => {
  const params = { MIN_DWELL: 30, T_FULL: 120, LAMBDA: 0.5 };
  assert.equal(calculateExposureCreditIncrement({
    previousDwellMs: 0,
    totalDwellMs: 29 * 1000,
    score: 1,
    params
  }), 0);
  assert.ok(Math.abs(calculateExposureCreditIncrement({
    previousDwellMs: 0,
    totalDwellMs: 30 * 1000,
    score: 0.8,
    params
  }) - 0.1) < 1e-12);
  let visits = {};
  const first = accumulateExposureVisit(visits, {
    dayKey: '2026-11-24',
    deckId: 'deck-1',
    urlHash: 'abc',
    dwellIncrementMs: 60 * 1000,
    score: 0.8,
    params
  });
  visits = first.visits;
  assert.ok(first.credit > 0);
  assert.equal(visits['2026-11-24:deck-1:abc'].dwellMs, 60 * 1000);
  const second = accumulateExposureVisit(visits, {
    dayKey: '2026-11-24',
    deckId: 'deck-1',
    urlHash: 'abc',
    dwellIncrementMs: 120 * 1000,
    score: 0.8,
    params
  });
  assert.equal(second.visits['2026-11-24:deck-1:abc'].dwellMs, 180 * 1000);
  assert.ok(second.credit >= 0);
  const third = accumulateExposureVisit(second.visits, {
    dayKey: '2026-11-24',
    deckId: 'deck-1',
    urlHash: 'abc',
    dwellIncrementMs: 60 * 1000,
    score: 0.8,
    params
  });
  assert.equal(third.credit, 0);
});

test('exposure visits are pruned after seven days', () => {
  const visits = {
    '2026-11-17:deck-1:abc': { dwellMs: 30000, awardedMs: 30000 },
    '2026-11-18:deck-1:def': { dwellMs: 30000, awardedMs: 30000 },
    '2026-11-24:deck-1:ghi': { dwellMs: 30000, awardedMs: 30000 }
  };
  const pruned = pruneExposureVisits(visits, '2026-11-24');
  assert.deepEqual(Object.keys(pruned).sort(), [
    '2026-11-18:deck-1:def',
    '2026-11-24:deck-1:ghi'
  ]);
});

test('deleted deck exposure visits are removed without matching deck-id prefixes', () => {
  const visits = {
    '2026-11-25:deck-1:abc': { dwellMs: 1 },
    '2026-11-25:deck-10:def': { dwellMs: 2 },
    '2026-11-25:deck:with:colon:ghi': { dwellMs: 3 }
  };
  assert.deepEqual(removeExposureVisitsForDeck(visits, 'deck-1'), {
    '2026-11-25:deck-10:def': { dwellMs: 2 },
    '2026-11-25:deck:with:colon:ghi': { dwellMs: 3 }
  });
  assert.deepEqual(removeExposureVisitsForDeck(visits, 'deck:with:colon'), {
    '2026-11-25:deck-1:abc': { dwellMs: 1 },
    '2026-11-25:deck-10:def': { dwellMs: 2 }
  });
});
