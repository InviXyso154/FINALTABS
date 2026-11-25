import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('test-card exit control is removed', () => {
  const html = fs.readFileSync(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');
  const flashcards = fs.readFileSync(new URL('../sidepanel/flashcards.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../sidepanel/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="exit-test"|exit-test/);
  assert.doesNotMatch(flashcards, /exit-test|exitTest/);
  assert.doesNotMatch(styles, /\.exit-test/);
});
