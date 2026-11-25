import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('due cards render r02_c12 only while idle', () => {
  const arena = fs.readFileSync(new URL('../game/arena.js', import.meta.url), 'utf8');
  const flashcards = fs.readFileSync(new URL('../sidepanel/flashcards.js', import.meta.url), 'utf8');
  assert.match(arena, /assets\/ui\/icons\/r02_c12\.png/);
  assert.match(arena, /dueCardCount\s*>\s*0\s*&&\s*!currentCard/);
  assert.match(arena, /!currentCard\s*&&\s*dueCardCount\s*===\s*0/);
  assert.match(flashcards, /showEmpty', dueCards\.length/);
  assert.match(flashcards, /dueCards\.length/);
  assert.match(arena, /empty-arena/);
});
