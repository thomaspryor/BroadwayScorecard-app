// The overnight run must never merge a UI change nobody looked at. These
// cover the fail-closed decision — the one guard that stops that — as a pure
// function, the same way overnight.test.mjs covers forbiddenIn.
//
// Run: node --test scripts/feedback/visual-gate.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { screensForFiles, unverifiableFiles, decideVisualGate, SCREENS } = require('./visual-gate.js');

test('no screenshots captured => do not merge', () => {
  const screens = [{ label: 'Watched', route: 'watched' }];
  assert.equal(decideVisualGate(screens, []).ok, false);
  assert.equal(decideVisualGate(screens, null).ok, false);
  assert.equal(decideVisualGate(screens, undefined).ok, false);
});

test('a capture step that ran but failed every screen still refuses', () => {
  const screens = [{ label: 'Watched', route: 'watched' }, { label: 'Browse', route: 'browse' }];
  const captures = [
    { label: 'Watched', ok: false, path: null },
    { label: 'Browse', ok: false, path: null },
  ];
  const decision = decideVisualGate(screens, captures);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /Watched/);
  assert.match(decision.reason, /Browse/);
});

test('one missing screenshot out of several blocks the whole merge', () => {
  const screens = [{ label: 'Watched', route: 'watched' }, { label: 'Browse', route: 'browse' }];
  const captures = [
    { label: 'Watched', ok: true, path: '/tmp/watched.png' },
    { label: 'Browse', ok: false, path: null },
  ];
  const decision = decideVisualGate(screens, captures);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /Browse/);
  assert.doesNotMatch(decision.reason, /Watched/);
});

test('a verified capture for every touched screen allows the merge', () => {
  const screens = [{ label: 'Watched', route: 'watched' }, { label: 'Browse', route: 'browse' }];
  const captures = [
    { label: 'Watched', ok: true, path: '/tmp/watched.png' },
    { label: 'Browse', ok: true, path: '/tmp/browse.png' },
  ];
  assert.equal(decideVisualGate(screens, captures).ok, true);
});

test('a capture marked ok but with no path still counts as missing', () => {
  // Guards against a future capture implementation that reports ok:true
  // without ever actually writing a file — the decision must trust the path,
  // not the flag.
  const screens = [{ label: 'Watched', route: 'watched' }];
  const captures = [{ label: 'Watched', ok: true, path: null }];
  assert.equal(decideVisualGate(screens, captures).ok, false);
});

test('no changed file maps to a screen => nothing to capture, merge proceeds', () => {
  const decision = decideVisualGate([], []);
  assert.equal(decision.ok, true);
});

test('extra unrelated captures do not satisfy a screen that was never captured', () => {
  const screens = [{ label: 'Settings', route: 'settings' }];
  const captures = [{ label: 'Watched', ok: true, path: '/tmp/watched.png' }];
  assert.equal(decideVisualGate(screens, captures).ok, false);
});

test('a direct tab-file change maps only to that tab', () => {
  assert.deepEqual(
    screensForFiles(['app/(tabs)/watched.tsx']).map((s) => s.label),
    ['Watched'],
  );
});

test('a shared component change maps to every core screen', () => {
  const hit = screensForFiles(['components/ShowCard.tsx']).map((s) => s.label);
  assert.deepEqual(hit, SCREENS.map((s) => s.label));
});

test('a change under lib/, hooks/, or constants/ also counts as shared', () => {
  for (const f of ['lib/score-utils.ts', 'hooks/useWatchlist.ts', 'constants/Colors.ts']) {
    const hit = screensForFiles([f]).map((s) => s.label);
    assert.deepEqual(hit, SCREENS.map((s) => s.label), `${f} should map to every screen`);
  }
});

test('a file that matches no screen and is not shared maps to nothing', () => {
  assert.deepEqual(screensForFiles(['app/show/[slug].tsx']), []);
  assert.deepEqual(screensForFiles(['app/rate/[showId].tsx']), []);
});

test('mixed direct + shared files dedupe to the union of screens', () => {
  const hit = screensForFiles(['app/settings.tsx', 'components/ShowCard.tsx']).map((s) => s.label);
  assert.deepEqual(new Set(hit), new Set(SCREENS.map((s) => s.label)));
});

test('the root and tab layouts wrap every screen, same as a shared component', () => {
  for (const f of ['app/_layout.tsx', 'app/(tabs)/_layout.tsx']) {
    const hit = screensForFiles([f]).map((s) => s.label);
    assert.deepEqual(hit, SCREENS.map((s) => s.label), `${f} should map to every screen`);
  }
});

// screensForFiles legitimately returns [] for a detail route with no fixed
// example (show/[slug], rate/[showId]) — but [] must never read as "verified".
// unverifiableFiles is what stops that class of file from fail-opening.
test('detail routes with no deep-linkable example are flagged unverifiable, not silently passed', () => {
  const files = ['app/show/[slug].tsx', 'app/diary-show/[id].tsx', 'app/rate/[showId].tsx', 'app/my-shows.tsx', 'app/import.tsx', 'app/search.tsx'];
  for (const f of files) {
    assert.deepEqual(screensForFiles([f]), [], `${f} has no known screen mapping`);
    assert.deepEqual(unverifiableFiles([f]), [f], `${f} must be flagged unverifiable`);
  }
});

test('ordinary tab and shared files are never flagged unverifiable', () => {
  assert.deepEqual(unverifiableFiles(['app/(tabs)/watched.tsx', 'components/ShowCard.tsx', 'app/_layout.tsx']), []);
});

test('an unverifiable file blocks the merge even when the rest of the diff has no known screen', () => {
  const decision = decideVisualGate([], [], ['app/show/[slug].tsx']);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /show\/\[slug\]/);
});

test('an unverifiable file blocks the merge even when every mapped screen was captured cleanly', () => {
  const screens = [{ label: 'Watched', route: 'watched' }];
  const captures = [{ label: 'Watched', ok: true, path: '/tmp/watched.png' }];
  const decision = decideVisualGate(screens, captures, ['app/my-shows.tsx']);
  assert.equal(decision.ok, false);
});

test('no unverifiable files and no screens still passes (unchanged default behavior)', () => {
  assert.equal(decideVisualGate([], [], []).ok, true);
  assert.equal(decideVisualGate([], []).ok, true);
});
