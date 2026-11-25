import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteArchivedDeck,
  getActiveCards,
  getActiveDecks,
  getDeckColor,
  getDeckIcon,
  groupCardsByDeck,
  isDeckArchived
} from '../state/deck-utils.js';

test('active deck and card helpers exclude archived and orphaned content', () => {
  const state = {
    decks: [
      { id: 'active' },
      { id: 'archived', archivedAt: 123 }
    ],
    cards: [
      { id: 'active-card', deckId: 'active' },
      { id: 'archived-card', deckId: 'archived' },
      { id: 'orphan-card', deckId: 'missing' }
    ]
  };

  assert.deepEqual(getActiveDecks(state).map(deck => deck.id), ['active']);
  assert.deepEqual(getActiveCards(state).map(card => card.id), ['active-card']);
  assert.equal(isDeckArchived(state.decks[1]), true);
  assert.equal(isDeckArchived(state.decks[0]), false);
});

test('card grouping indexes cards in one pass by deck id', () => {
  const grouped = groupCardsByDeck([
    { id: 'one', deckId: 'a' },
    { id: 'two', deckId: 'b' },
    { id: 'three', deckId: 'a' }
  ]);
  assert.deepEqual(grouped.get('a').map(card => card.id), ['one', 'three']);
  assert.deepEqual(grouped.get('b').map(card => card.id), ['two']);
});

test('only archived decks can be permanently deleted, with their own cards', () => {
  const state = {
    decks: [{ id: 'active' }, { id: 'archived', archivedAt: 456 }],
    cards: [{ id: 'keep', deckId: 'active' }, { id: 'remove', deckId: 'archived' }],
    history: [{ cardId: 'remove' }]
  };

  assert.equal(deleteArchivedDeck(state, 'active'), null);
  const deleted = deleteArchivedDeck(state, 'archived');
  assert.deepEqual(deleted.decks.map(deck => deck.id), ['active']);
  assert.deepEqual(deleted.cards.map(card => card.id), ['keep']);
  assert.deepEqual(deleted.history, []);
  assert.equal(getDeckColor({ color: 'unknown' }), 'forest');
  assert.equal(getDeckIcon({ icon: 'unknown' }).value, 'book');
});
