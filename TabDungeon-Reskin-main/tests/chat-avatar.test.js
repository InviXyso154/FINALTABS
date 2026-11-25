import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('Guide chat renders the Avatar_05 icon in guide messages', () => {
  const html = fs.readFileSync(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');
  const chat = fs.readFileSync(new URL('../sidepanel/chat.js', import.meta.url), 'utf8');
  assert.match(html, /Avatars_05\.png/);
  assert.match(chat, /className = 'chat-avatar'/);
  assert.match(chat, /kind === 'guide'/);
  assert.match(chat, /'Guide: '/);
});
