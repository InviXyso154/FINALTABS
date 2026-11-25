import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('stats renderer guards elements removed from the side panel', () => {
  const source = fs.readFileSync(new URL('../sidepanel/stats.js', import.meta.url), 'utf8');
  assert.match(source, /const sessionTime = \$\('session-time'\)/);
  assert.match(source, /if \(sessionTime\)/);
  assert.match(source, /if \(studyExposure\)/);
  assert.match(source, /if \(dueCards\)/);
  assert.match(source, /if \(tabCount\)/);
});

test('side panel keeps only the intended compact session stats', () => {
  const html = fs.readFileSync(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');
  for (const id of ['due-cards', 'session-time']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.doesNotMatch(html, /id="study-exposure"/);
  assert.doesNotMatch(html, /id="tab-count"/);
});
