import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('Phase 1 wording identifies TabDungeon as a study helper', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const sidepanel = fs.readFileSync(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');
  const background = fs.readFileSync(new URL('../background/index.js', import.meta.url), 'utf8');
  assert.equal(manifest.description, 'Flashcard study helper that adapts review timing to what you read');
  assert.match(sidepanel, /Flashcard study helper/);
  assert.match(background, /TabDungeon AI Guide, a concise study assistant/);
  assert.doesNotMatch(background, /You are the user's dungeon hero|pixel-art productivity RPG|Gamified learning environment/);
});
