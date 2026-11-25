export const DECK_COLOR_OPTIONS = Object.freeze([
  { value: 'forest', label: 'Forest' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'gold', label: 'Gold' },
  { value: 'rose', label: 'Rose' },
  { value: 'violet', label: 'Violet' },
  { value: 'teal', label: 'Teal' }
]);

export const DECK_ICON_OPTIONS = Object.freeze([
  { value: 'book', label: 'Book', glyph: '▤' },
  { value: 'star', label: 'Star', glyph: '✦' },
  { value: 'diamond', label: 'Diamond', glyph: '◆' },
  { value: 'circle', label: 'Circle', glyph: '●' },
  { value: 'triangle', label: 'Triangle', glyph: '▲' },
  { value: 'flower', label: 'Flower', glyph: '✿' }
]);

export function getDeckColor(deck) {
  return DECK_COLOR_OPTIONS.some(option => option.value === deck?.color)
    ? deck.color
    : DECK_COLOR_OPTIONS[0].value;
}

export function getDeckIcon(deck) {
  return DECK_ICON_OPTIONS.find(option => option.value === deck?.icon) || DECK_ICON_OPTIONS[0];
}

export function isDeckArchived(deck) {
  return deck?.archivedAt != null;
}

export function getActiveDecks(state) {
  return (state?.decks || []).filter(deck => !isDeckArchived(deck));
}

export function getActiveCards(state) {
  const activeDeckIds = new Set(getActiveDecks(state).map(deck => deck.id));
  return (state?.cards || []).filter(card => activeDeckIds.has(card.deckId));
}

export function groupCardsByDeck(cards = []) {
  const grouped = new Map();
  for (const card of cards || []) {
    if (!grouped.has(card.deckId)) grouped.set(card.deckId, []);
    grouped.get(card.deckId).push(card);
  }
  return grouped;
}

export function deleteArchivedDeck(state, deckId) {
  const deck = (state?.decks || []).find(item => item.id === deckId);
  if (!isDeckArchived(deck)) return null;
  const deletedCardIds = new Set((state.cards || [])
    .filter(card => card.deckId === deckId)
    .map(card => card.id));
  return {
    ...state,
    decks: state.decks.filter(item => item.id !== deckId),
    cards: (state.cards || []).filter(card => card.deckId !== deckId),
    history: (state.history || []).filter(entry => !deletedCardIds.has(entry.cardId))
  };
}
