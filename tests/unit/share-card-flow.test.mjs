// Score-card share flow (lib/share-card-flow.ts, used by components/ShareCard).
// Run: node --experimental-strip-types --import ./tests/register-alias.mjs --test tests/unit/share-card-flow.test.mjs
//
// A view-shot failure used to land in a catch labelled "user cancelled", so
// the share button silently did nothing. Now it tells the user and still
// shares the show link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shareShowCard } from '../../lib/share-card-flow.ts';

const show = { title: 'Oh, Mary!', slug: 'oh-mary' };

function deps(overrides = {}) {
  const calls = { shared: [], imageFailed: 0, shareFailed: [] };
  const d = {
    show,
    platform: 'ios',
    capture: async () => 'file:///tmp/card.png',
    share: async (payload) => { calls.shared.push(payload); return { action: 'sharedAction' }; },
    dismissedAction: 'dismissedAction',
    notifyImageFailed: async () => { calls.imageFailed++; },
    notifyShareFailed: (m) => { calls.shareFailed.push(m); },
    ...overrides,
  };
  return { d, calls };
}

test('capture works: shares the image and the link', async () => {
  const { d, calls } = deps();
  assert.equal(await shareShowCard(d), 'shared');
  assert.equal(calls.shared[0].url, 'file:///tmp/card.png');
  assert.match(calls.shared[0].message, /broadwayscorecard\.com\/show\/oh-mary$/);
  assert.equal(calls.imageFailed, 0);
});

test('capture throws: tells the user, then shares the link only', async () => {
  const order = [];
  const { d, calls } = deps({
    capture: async () => { throw new Error('view not laid out'); },
    notifyImageFailed: async () => { order.push('alert'); },
    share: async (p) => { order.push('share'); calls.shared.push(p); return { action: 'sharedAction' }; },
  });
  assert.equal(await shareShowCard(d), 'shared');
  assert.deepEqual(order, ['alert', 'share']);
  assert.equal(calls.shared[0].url, undefined);
  assert.match(calls.shared[0].message, /oh-mary/);
});

test('no view-shot module: shares the link without an alert', async () => {
  const { d, calls } = deps({ capture: undefined });
  assert.equal(await shareShowCard(d), 'shared');
  assert.equal(calls.imageFailed, 0);
  assert.equal(calls.shared[0].url, undefined);
});

test('user closes the share sheet: dismissed, no error shown', async () => {
  const { d, calls } = deps({ share: async () => ({ action: 'dismissedAction' }) });
  assert.equal(await shareShowCard(d), 'dismissed');
  assert.deepEqual(calls.shareFailed, []);
});

test('share sheet throws: the error is shown, not swallowed', async () => {
  const { d, calls } = deps({ share: async () => { throw new Error('no window'); } });
  assert.equal(await shareShowCard(d), 'failed');
  assert.deepEqual(calls.shareFailed, ['no window']);
});
