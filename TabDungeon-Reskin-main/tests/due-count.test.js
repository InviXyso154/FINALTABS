import assert from 'node:assert/strict';
import test from 'node:test';
import { countDueCards, isDue } from '../core/scheduler.js';

test('due count uses card schedule dueAt', () => {
  const now = 1000;
  const cards = [
    { id: 'due', dueAt: 1000 },
    { id: 'overdue', dueAt: 500 },
    { id: 'future', dueAt: 1500 }
  ];
  assert.equal(countDueCards(cards, now), 2);
  assert.equal(countDueCards({ cards }, now), 2);
  assert.equal(isDue(cards[2], now), false);
});
