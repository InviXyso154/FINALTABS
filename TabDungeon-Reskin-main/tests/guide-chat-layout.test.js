import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('Guide chat entry is pinned to the bottom of the guide panel', () => {
  const styles = fs.readFileSync(new URL('../sidepanel/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /#guide-panel\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /#guide-panel\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(styles, /\.chat-entry\s*\{[^}]*position:\s*sticky/s);
  assert.match(styles, /\.chat-entry\s*\{[^}]*bottom:\s*0/s);
  assert.match(styles, /\.chat-messages\s*\{[^}]*flex:\s*1\s+1\s+auto/s);
});

test('Guide panel fills the content height instead of message height', () => {
  const styles = fs.readFileSync(new URL('../sidepanel/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /#guide-panel\s*\{[^}]*height:\s*100%/s);
  assert.match(styles, /#guide-panel\s*\{[^}]*min-height:\s*0/s);
  assert.match(styles, /\.content:has\(#guide-panel\.active\)[^}]*\{[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.chat-messages\s*\{[^}]*height:\s*100%/s);
});

test('interface includes subtle motion and reduced-motion guards', () => {
  const styles = fs.readFileSync(new URL('../sidepanel/styles.css', import.meta.url), 'utf8');
  const settings = fs.readFileSync(new URL('../sidepanel/settings.js', import.meta.url), 'utf8');
  assert.match(styles, /@keyframes panel-enter/);
  assert.match(styles, /@keyframes chat-message-enter/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /body\.reduce-motion/);
  assert.match(settings, /classList\.toggle\('reduce-motion'/);
});
