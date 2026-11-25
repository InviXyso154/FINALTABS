import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const managerHtml = fs.readFileSync(new URL('../deck-manager/deck-manager.html', import.meta.url), 'utf8');
const managerSource = fs.readFileSync(new URL('../deck-manager/deck-manager.js', import.meta.url), 'utf8');
const sidepanelHtml = fs.readFileSync(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');
const sidepanelSource = fs.readFileSync(new URL('../sidepanel/flashcards.js', import.meta.url), 'utf8');

test('deck manager provides search, archive view, sorting, and customizable deck fields', () => {
  assert.match(managerHtml, /id="deck-search"/);
  assert.match(managerHtml, /id="deck-view"/);
  assert.match(managerHtml, /id="deck-sort"/);
  assert.match(managerSource, /DECK_COLOR_OPTIONS/);
  assert.match(managerSource, /DECK_ICON_OPTIONS/);
  assert.match(managerSource, /Short description/);
  assert.match(managerSource, /Keywords \(comma-separated\)/);
});

test('card lists render on expansion and are paginated', () => {
  assert.match(managerSource, /section\.addEventListener\('toggle'/);
  assert.match(managerSource, /CARD_PAGE_SIZE = 25/);
  assert.match(managerSource, /renderCardPage/);
  assert.match(managerSource, /DECK_PAGE_SIZE = 50/);
  assert.match(sidepanelSource, /DECK_PAGE_SIZE = 20/);
  assert.match(sidepanelHtml, /id="deck-page-previous"/);
});

test('permanent deletion is offered for archived decks only', () => {
  assert.match(managerSource, /if \(isDeckArchived\(deck\)\) \{/);
  assert.match(managerSource, /Delete permanently/);
  assert.match(managerSource, /deleteArchivedDeck\(state, deck\.id\)/);
  assert.match(managerSource, /getBytesInUse/);
  assert.match(managerHtml, /id="storage-usage"/);
});
