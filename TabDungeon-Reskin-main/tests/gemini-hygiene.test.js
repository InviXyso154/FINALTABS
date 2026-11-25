import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('Gemini API key is sent by header and never by URL', () => {
  const source = fs.readFileSync(new URL('../background/index.js', import.meta.url), 'utf8');
  assert.match(source, /['"]x-goog-api-key['"]\s*:\s*(cleanKey|apiKey\.trim\(\))/);
  assert.doesNotMatch(source, /GEMINI_API_URL\}\?key=/);
  assert.doesNotMatch(source, /GEMINI_API_URL\?key=/);
  assert.doesNotMatch(source, /console\.log\('\[TabDungeon\] Chat request/);
  assert.doesNotMatch(source, /console\.log\('\[TabDungeon\] API/);
});
