// End-to-end test: runs the REAL background/index.js against a mocked chrome API.
// (tests/background-exposure.test.js only checks helper functions and source text; it cannot
// catch runtime errors such as assigning to a const.)
import test from 'node:test';
import assert from 'node:assert/strict';

const cards = [
  { id: '1', deckId: 'd1', front: 'What is cohesion in software design?', back: 'How strongly related the responsibilities of a single module are.' },
  { id: '2', deckId: 'd1', front: 'What is coupling?', back: 'The degree of interdependence between software modules.' },
  { id: '3', deckId: 'd1', front: 'What does the Observer pattern do?', back: 'Defines a subscription mechanism to notify multiple objects about events.' },
  { id: '4', deckId: 'd1', front: 'What is the Singleton pattern?', back: 'Ensures a class has only one instance with a global access point.' }
];
const pages = {
  observer: { title: 'Observer pattern in software design', description: 'Behavioral design pattern: notify multiple objects about events through a subscription mechanism', keywords: '', headings: ['Observer', 'Subscription'] },
  gym: { title: 'Home gym: how to pick your workout', description: 'Tips for choosing a gym module and building a routine at home', keywords: '', headings: [] },
  movies: { title: 'Top 10 movies this weekend', description: 'Trailers, reviews and showtimes near you', keywords: '', headings: [] }
};

let instance = 0;
async function boot(pageKey, shared = null) {
  const L = {};
  const reg = name => ({ addListener: fn => { (L[name] ??= []).push(fn); } });
  const local = shared?.local || { studyState: { decks: [{ id: 'd1', name: 'Software Design' }], cards: structuredClone(cards) } };
  const session = shared?.session || {};
  const area = store => ({
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : keys == null ? Object.keys(store) : [keys]).map(k => [k, store[k]])),
    set: async obj => { Object.assign(store, obj); },
    remove: async keys => { [].concat(keys).forEach(k => delete store[k]); }
  });
  const url = `https://example.com/${pageKey}`;
  globalThis.chrome = {
    runtime: { onMessage: reg('msg'), onStartup: reg('startup'), onInstalled: reg('installed'), sendMessage: () => Promise.resolve(), getURL: p => p },
    tabs: { onActivated: reg('activated'), onUpdated: reg('updated'), onRemoved: reg('removed'), onCreated: reg('created'),
      query: async () => [{ id: 1, windowId: 1, active: true, url }], get: async id => ({ id, windowId: 1, active: true, url }), create: () => {} },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: reg('focus'), getLastFocused: async () => ({ id: 1 }) },
    idle: { onStateChanged: reg('idle') }, alarms: { create: () => {}, onAlarm: reg('alarm') },
    scripting: { executeScript: async () => [{ result: pages[pageKey] }] },
    storage: { local: area(local), session: area(session), onChanged: reg('changed') }
  };
  const clock = { now: shared?.now ?? Date.UTC(2026, 10, 20) };
  Date.now = () => clock.now;
  await import(`../background/index.js?e2e=${++instance}`);
  return { L, local, session, clock };
}
const credit = env => env.local.studyState.cards[0].exposureCredit || 0;
const flush = env => env.L.alarm.at(-1)({ name: 'minuteUpdate' });

test('100 s on a related page records exposure credit (no runtime error)', async () => {
  const env = await boot('observer');
  await env.L.activated[0]({ tabId: 1, windowId: 1 });
  env.clock.now += 100_000;
  await flush(env);
  assert.ok(credit(env) > 0.15 && credit(env) < 0.3, `credit was ${credit(env)}`);
});

test('a stay under MIN_DWELL earns nothing', async () => {
  const env = await boot('observer');
  await env.L.activated[0]({ tabId: 1, windowId: 1 });
  env.clock.now += 10_000;
  await flush(env);
  assert.equal(credit(env), 0);
});

test('credit keeps accumulating over a long stay but stops at LAMBDA x score per page per day', async () => {
  const env = await boot('observer');
  await env.L.activated[0]({ tabId: 1, windowId: 1 });
  env.clock.now += 60_000; await flush(env);
  const first = credit(env);
  env.clock.now += 120_000; await flush(env);
  const second = credit(env);
  env.clock.now += 600_000; await flush(env);
  const third = credit(env);
  assert.ok(second > first, 'credit should grow over the stay');
  assert.ok(third >= second && third <= 0.5, `credit ${third} must not exceed LAMBDA`);
});

test('unrelated and one-keyword pages earn nothing', async () => {
  for (const key of ['movies', 'gym']) {
    const env = await boot(key);
    await env.L.activated[0]({ tabId: 1, windowId: 1 });
    env.clock.now += 100_000;
    await flush(env);
    assert.equal(credit(env), 0, `${key} should not earn credit`);
  }
});

test('tracking survives a service worker restart', async () => {
  const env = await boot('observer');
  await env.L.activated[0]({ tabId: 1, windowId: 1 });
  env.clock.now += 40_000;
  const restarted = await boot('observer', { local: env.local, session: env.session, now: env.clock.now });
  restarted.clock.now += 70_000;
  await flush(restarted);
  assert.ok(credit(restarted) > 0.15, `credit was ${credit(restarted)}`);
});

test('scoreRelevance message handler responds', async () => {
  const env = await boot('observer');
  const response = await new Promise(resolve => {
    env.L.msg[0]({ action: 'scoreRelevance', metadata: pages.observer, deckId: 'd1' }, {}, resolve);
    setTimeout(() => resolve(null), 1000);
  });
  assert.equal(response?.success, true);
  assert.equal(response.result.label, 'related');
});
