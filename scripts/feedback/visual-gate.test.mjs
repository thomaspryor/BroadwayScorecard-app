// The overnight run must never merge a UI change nobody looked at. These
// cover the fail-closed decision — the one guard that stops that — as a pure
// function, the same way overnight.test.mjs covers forbiddenIn.
//
// Run: node --test scripts/feedback/visual-gate.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { screensForFiles, unverifiableFiles, decideVisualGate, buildFlow, SCREENS } = require('./visual-gate.js');

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
  // show/[slug] used to be the example here; it is now PINNED (BRO-2986), so
  // these use screens that are still unpinned on purpose.
  assert.deepEqual(screensForFiles(['app/import.tsx']), []);
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
  // show/[slug].tsx deliberately absent: it is pinned now (BRO-2986). The
  // rest are still unpinned and must still be flagged.
  const files = ['app/diary-show/[id].tsx', 'app/rate/[showId].tsx', 'app/my-shows.tsx', 'app/import.tsx', 'app/search.tsx'];
  for (const f of files) {
    assert.deepEqual(screensForFiles([f]), [], `${f} has no known screen mapping`);
    assert.deepEqual(unverifiableFiles([f]), [f], `${f} must be flagged unverifiable`);
  }
});

test('ordinary tab and shared files are never flagged unverifiable', () => {
  assert.deepEqual(unverifiableFiles(['app/(tabs)/watched.tsx', 'components/ShowCard.tsx', 'app/_layout.tsx']), []);
});

test('an unverifiable file blocks the merge even when the rest of the diff has no known screen', () => {
  const decision = decideVisualGate([], [], ['app/import.tsx']);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /app\/import\.tsx/);
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

// ---- BRO-2986: the show detail screen is pinned, not unverifiable --------
// For about a month every night that touched app/show/[slug].tsx was refused
// with "no deep-linkable example" and its branch left unmerged, because that
// file sat in UNVERIFIABLE_APP_FILES while .maestro-manual/
// beta-feedback-r3-verify2.yaml already deep-linked show/oh-mary. These pin
// the fix in both directions: detail is now capturable, AND a screen that is
// still unpinned must still refuse.

test('show detail maps to a pinned screen instead of being unverifiable', () => {
  const files = ['app/show/[slug].tsx'];
  const screens = screensForFiles(files);
  assert.deepEqual(screens.map((s) => s.label), ['Show Detail']);
  assert.equal(screens[0].route, 'show/oh-mary', 'route must be a concrete deep-linkable instance');
  assert.deepEqual(unverifiableFiles(files), [], 'show detail must no longer be unverifiable');
});

test('show detail passes only with a real capture, and still fails closed without one', () => {
  const files = ['app/show/[slug].tsx'];
  const screens = screensForFiles(files);
  const unver = unverifiableFiles(files);
  const good = decideVisualGate(screens, [{ label: 'Show Detail', ok: true, path: '/tmp/shot.png' }], unver);
  assert.equal(good.ok, true, good.reason);
  // Pinning must not weaken fail-closed: no capture is still a refusal.
  assert.equal(decideVisualGate(screens, [], unver).ok, false);
  assert.equal(decideVisualGate(screens, [{ label: 'Show Detail', ok: false, path: null }], unver).ok, false);
});

test('a screen that is still unpinned continues to refuse', () => {
  // Deliberately NOT fixing every screen at once. If this ever starts
  // passing, someone emptied UNVERIFIABLE_APP_FILES instead of pinning a
  // fixture, which is the failure mode that silently merges unseen UI.
  for (const f of ['app/import.tsx', 'app/search.tsx', 'app/my-shows.tsx']) {
    const unver = unverifiableFiles([f]);
    assert.deepEqual(unver, [f], `${f} must still be unverifiable`);
    assert.equal(decideVisualGate(screensForFiles([f]), [], unver).ok, false);
  }
});

test('Show Detail is reachable from the exported SCREENS list', () => {
  const detail = SCREENS.find((s) => s.label === 'Show Detail');
  assert.ok(detail, 'SCREENS must carry Show Detail so buildFlow deep-links it');
  assert.match(detail.route, /^show\/[a-z0-9-]+$/, 'route must be a concrete slug, not a template');
});

// ---- buildFlow: the screenshot must prove the screen rendered -----------
// buildFlow had ZERO tests, which is how the Show Detail fail-open shipped:
// app/show/[slug].tsx renders "Show not found" on a slug miss, that renders
// perfectly, captureScreens sets ok purely on the file existing, and
// decideVisualGate never looks at image content. Nothing downstream can tell
// a loaded screen from an empty one, so the flow itself has to.

test('a screen with assertText waits for that text before the shutter fires', () => {
  const flow = buildFlow('com.example.app', [{ label: 'Show Detail', route: 'show/oh-mary', assertText: 'Oh, Mary!' }], '/tmp/out');
  assert.match(flow, /- openLink: broadwayscorecard:\/\/\/show\/oh-mary/);
  assert.match(flow, /- extendedWaitUntil:/);
  assert.match(flow, /visible: "Oh, Mary!"/);
  // Ordering is the whole point: asserting AFTER the screenshot proves
  // nothing. Scope to the text AFTER the openLink -- indexOf on the whole
  // flow matches the launchApp preamble's own extendedWaitUntil, which is
  // always before the screenshot, making the check a tautology that passes
  // even when the per-screen assertion is moved after the shutter.
  const body = flow.slice(flow.indexOf('- openLink:'));
  const wait = body.indexOf('extendedWaitUntil');
  const shot = body.indexOf('takeScreenshot');
  assert.ok(wait > -1, 'the per-screen assertion must exist after the openLink');
  assert.ok(shot > wait, 'the content assertion must precede takeScreenshot');
});

test('the pinned Show Detail screen actually carries an assertion', () => {
  // Guards the specific regression: pinning a data-dependent screen WITHOUT
  // assertText is what makes a "Show not found" render pass the gate.
  const detail = SCREENS.find((s) => s.label === 'Show Detail');
  assert.ok(detail, 'Show Detail must be in SCREENS');
  assert.ok(detail.assertText && detail.assertText.length > 0,
    'Show Detail is data-dependent, so it MUST assert on rendered content');
  const flow = buildFlow('com.example.app', [detail], '/tmp/out');
  assert.match(flow, /extendedWaitUntil/);
});

test('the emitted deep link keeps the three-slash scheme form', () => {
  // broadwayscorecard://show/x and broadwayscorecard:///show/x are not the
  // same URL; nothing else in the suite pinned this.
  const flow = buildFlow('com.example.app', [{ label: 'Browse', route: 'browse' }], '/tmp/out');
  assert.match(flow, /- openLink: broadwayscorecard:\/\/\/browse/);
  assert.doesNotMatch(flow, /openLink: broadwayscorecard:\/\/[^/]/);
});

test('a screen with no assertText still screenshots (tab screens are unchanged)', () => {
  // The launchApp preamble always emits one extendedWaitUntil on "Broadway
  // Scorecard", so count rather than match: a screen without assertText must
  // add NO second one, while one with assertText must.
  const count = (f) => (f.match(/extendedWaitUntil:/g) || []).length;
  const plain = buildFlow('com.example.app', [{ label: 'Watched', route: 'watched' }], '/tmp/out');
  assert.match(plain, /takeScreenshot/);
  assert.equal(count(plain), 1, 'only the launch wait; no per-screen assertion added');
  const asserted = buildFlow('com.example.app', [{ label: 'Show Detail', route: 'show/oh-mary', assertText: 'Oh, Mary!' }], '/tmp/out');
  assert.equal(count(asserted), 2, 'launch wait plus the per-screen content assertion');
});

// ---- the pinned fixture must actually resolve -------------------------
// Without this, `route` and `assertText` are just two strings that happen to
// sit next to each other: an earlier version asserted on 'MY RATING & REVIEW',
// which appears NOWHERE in the app, and every test still passed because
// nothing checked the fixture against real data. A fixture that rots (show
// pulled, slug renamed, title changed) must fail HERE, in CI, not silently at
// 02:15 by timing out and stranding the night.

test('the pinned Show Detail slug resolves in the shipped seed data, and assertText is its title', () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const seedPath = path.join(HERE, '..', '..', 'assets', 'seed-data.json');
  // SETUP ASSERTION: a missing or reshaped seed file must FAIL, not skip —
  // otherwise this test reads as green while checking nothing.
  assert.ok(fs.existsSync(seedPath), `seed data missing at ${seedPath}`);
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const rows = seed.shows;
  assert.ok(Array.isArray(rows) && rows.length > 0, 'seed-data.json must carry a non-empty shows array');
  // Keys are abbreviated in the shipped seed: s = slug, t = title, st = status.
  assert.ok(rows[0].s !== undefined && rows[0].t !== undefined,
    'seed rows must expose s (slug) and t (title); the shape changed');

  const detail = SCREENS.find((sc) => sc.label === 'Show Detail');
  assert.ok(detail, 'Show Detail must be pinned in SCREENS');
  const slugFromRoute = detail.route.replace(/^show\//, '');
  assert.notEqual(slugFromRoute, detail.route, 'route must be of the form show/<slug>');

  const row = rows.find((r) => r.s === slugFromRoute);
  assert.ok(row, `pinned slug '${slugFromRoute}' does not exist in seed-data.json — the fixture has rotted`);
  assert.equal(detail.assertText, row.t,
    `assertText must be the show's title so it discriminates loaded from "Show not found"; expected ${JSON.stringify(row.t)}`);
});
