import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const sidepanelSource = fs.readFileSync(new URL('../sidepanel/flashcards.js', import.meta.url), 'utf8');
const managerSource = fs.readFileSync(new URL('../deck-manager/deck-manager.js', import.meta.url), 'utf8');

test('side panel stores exam dates instead of overwriting card dueAt values', () => {
  assert.match(sidepanelSource, /Exam date/);
  assert.match(sidepanelSource, /deck\.examDate\s*=/);
  assert.doesNotMatch(sidepanelSource, /cards\.forEach\(card\s*=>\s*\{\s*card\.dueAt\s*=/);
});

test('Deck Manager provides an explicit reset due dates action', () => {
  assert.match(managerSource, /Reset due dates/);
  assert.match(managerSource, /card\.dueAt\s*=\s*0/);
});
