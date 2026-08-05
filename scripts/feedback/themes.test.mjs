// Fixture-based tests for scripts/feedback/themes.js -- never copies its
// clustering logic, always requires the real module (CLAUDE.md rule #15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Isolated from the real ~/.claude/broadwayscore-feedback/ -- loadBuilds()
// writes a cache file there, and the tests below exercise that cache
// directly. Must be set before themes.js (and the ledger.js it requires)
// load, since ledger.HOME is computed once at require time.
process.env.BSC_FEEDBACK_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'themes-test-home-'));

const require = createRequire(import.meta.url);
const themes = require('./themes.js');

// A small fixture corpus, independent of the real (72-item, live) ledger, that
// exercises the same three named clusters from the card: labels too large,
// date placement on cards, and shelf-vs-list inconsistency -- plus one item
// that must NOT match anything, and one pair using curly TestFlight quotes to
// prove apostrophe normalization actually runs both sides of the comparison.
const FIXTURE = [
  { id: 'a-label-1', createdDate: '2026-07-25T04:29:00.000Z', comment: 'The labels here for MUSICAL, REVIVAL, etc are too large and visually prominent' },
  { id: 'b-date-1', createdDate: '2026-07-25T04:21:00.000Z', comment: 'The dates for Upcoming shows should be under the name not in between the name and the image' },
  { id: 'c-shelf-1', createdDate: '2026-07-25T04:26:00.000Z', comment: 'The upcoming cards should be the same format as the other cards in this list view' },
  { id: 'd-label-2', createdDate: '2026-07-26T14:06:00.000Z', comment: 'These “closed” and “tix on sale” labels are ugly and also too large' },
  { id: 'e-shelf-2', createdDate: '2026-08-03T13:21:00.000Z', comment: 'The sub headings here aren’t the same format as on the Watched tab' }, // curly apostrophe
  { id: 'f-unrelated', createdDate: '2026-07-31T23:16:00.000Z', comment: 'Reviews are supposed to be in descending order of score' },
  { id: 'g-label-3', createdDate: '2026-08-02T23:54:00.000Z', comment: 'CRITICAL GOLD text is way too big. Make it smaller so it doesn’t overhang the box' },
];

test('matchThemes tags the three named clusters and normalizes curly apostrophes', () => {
  assert.deepEqual(themes.matchThemes(FIXTURE[0]), ['labels-too-large']);
  assert.deepEqual(themes.matchThemes(FIXTURE[1]), ['date-placement']);
  assert.deepEqual(themes.matchThemes(FIXTURE[2]), ['shelf-list-inconsistency']);
  // Straight-apostrophe keyword ("aren't...") must match the curly-quote
  // comment TestFlight actually hands back ("aren’t...").
  assert.deepEqual(themes.matchThemes(FIXTURE[4]), ['shelf-list-inconsistency']);
});

test('matchThemes leaves an unrelated item with no theme', () => {
  assert.deepEqual(themes.matchThemes(FIXTURE[5]), []);
});

test('clusterThemes groups every fixture item under its theme, sorted oldest first', () => {
  const clusters = themes.clusterThemes(FIXTURE);
  const byKey = Object.fromEntries(clusters.map((c) => [c.key, c]));

  assert.equal(byKey['labels-too-large'].count, 3);
  assert.deepEqual(byKey['labels-too-large'].itemIds, ['a-label-1', 'd-label-2', 'g-label-3']);
  assert.equal(byKey['labels-too-large'].firstSeen, FIXTURE[0].createdDate);
  assert.equal(byKey['labels-too-large'].lastSeen, FIXTURE[6].createdDate);

  assert.equal(byKey['date-placement'].count, 1);
  assert.equal(byKey['shelf-list-inconsistency'].count, 2);
  assert.deepEqual(byKey['shelf-list-inconsistency'].itemIds, ['c-shelf-1', 'e-shelf-2']);

  // The unrelated item and any theme with zero matches never appear.
  assert.ok(!('rating-widget-consistency' in byKey));
  assert.ok(clusters.every((c) => c.count > 0));
});

test('clusterThemes reports buildsSpanned=null when no build data was supplied', () => {
  const clusters = themes.clusterThemes(FIXTURE, []);
  for (const c of clusters) {
    assert.equal(c.buildsSpanned, null);
    assert.deepEqual(c.builds, []);
  }
});

test('clusterThemes reports buildsSpanned=null (not 0) when build data exists but no item resolves to one', () => {
  // Builds present but missing appBuildVersion -- assignBuild() returns null
  // for every item. 0 would misleadingly claim "the span is zero builds"
  // when the truth is "we have no idea what build these were filed against".
  const builds = [{ createdAt: '2026-07-01T00:00:00.000Z' }];
  const clusters = themes.clusterThemes(FIXTURE, builds);
  const labels = clusters.find((c) => c.key === 'labels-too-large');
  assert.equal(labels.buildsSpanned, null);
  assert.deepEqual(labels.builds, []);
});

test('assignBuild picks the newest build at or before the item date', () => {
  const builds = [
    { appBuildVersion: '54', createdAt: '2026-07-24T00:00:00.000Z' },
    { appBuildVersion: '61', createdAt: '2026-07-30T00:00:00.000Z' },
    { appBuildVersion: '75', createdAt: '2026-08-04T00:00:00.000Z' },
  ];
  assert.equal(themes.assignBuild('2026-07-26T00:00:00.000Z', builds), '54');
  assert.equal(themes.assignBuild('2026-08-01T00:00:00.000Z', builds), '61');
  assert.equal(themes.assignBuild('2026-08-05T00:00:00.000Z', builds), '75');
  // Predates every known build -- falls back to the earliest on record
  // rather than dropping the item from the span silently.
  assert.equal(themes.assignBuild('2026-01-01T00:00:00.000Z', builds), '54');
  assert.equal(themes.assignBuild('2026-07-26T00:00:00.000Z', []), null);
});

test('clusterThemes counts distinct builds spanned per theme', () => {
  const builds = [
    { appBuildVersion: '54', createdAt: '2026-07-20T00:00:00.000Z' },
    { appBuildVersion: '61', createdAt: '2026-07-26T00:00:00.000Z' },
    { appBuildVersion: '75', createdAt: '2026-08-02T00:00:00.000Z' },
  ];
  const clusters = themes.clusterThemes(FIXTURE, builds);
  const labels = clusters.find((c) => c.key === 'labels-too-large');
  // a-label-1 (07-25, pre-61 -> 54), d-label-2 (07-26, ->61), g-label-3 (08-02 exactly ->75)
  assert.equal(labels.buildsSpanned, 3);
  assert.deepEqual(labels.builds, ['54', '61', '75']);
});

test('themeContextForItem returns the full cluster history for a matching item, not just itself', () => {
  const ctx = themes.themeContextForItem(FIXTURE[3], FIXTURE); // d-label-2
  assert.equal(ctx.length, 1);
  assert.equal(ctx[0].key, 'labels-too-large');
  assert.equal(ctx[0].count, 3); // sees all 3 siblings, not just the one item passed in
});

test('themeContextForItem returns empty for an item matching no theme', () => {
  assert.deepEqual(themes.themeContextForItem(FIXTURE[5], FIXTURE), []);
});

test('formatReport names the theme, its item ids, and a build span', () => {
  const clusters = themes.clusterThemes(FIXTURE, [{ appBuildVersion: '61', createdAt: '2026-07-01T00:00:00.000Z' }]);
  const report = themes.formatReport(clusters);
  assert.match(report, /Labels \/ overlay text rendered too large/);
  assert.match(report, /a-label-1, d-label-2, g-label-3/);
  assert.match(report, /1 build\(s\): 61/);
});

test('formatReport handles an empty cluster list', () => {
  assert.equal(themes.formatReport([]), 'No recurring themes matched.');
});

test('siblingFiles walks a code directory and returns only pattern-matching files, relative to baseDir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'themes-sibling-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'components', 'show-cards'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'components', '.hidden'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'components', 'show-cards', 'CategoryBadge.tsx'), 'export const CategoryBadge = () => null;');
    fs.writeFileSync(path.join(tmp, 'components', 'show-cards', 'Unrelated.tsx'), 'export const Unrelated = () => null;');
    fs.writeFileSync(path.join(tmp, 'components', '.hidden', 'Skip.tsx'), 'CategoryBadge');

    const theme = { codeDirs: ['components'], codePattern: /CategoryBadge/ };
    const found = themes.siblingFiles(theme, tmp);
    assert.deepEqual(found, [path.join('components', 'show-cards', 'CategoryBadge.tsx')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('siblingFiles with shallow:true does not recurse into subdirectories', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'themes-sibling-shallow-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'components', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'components', 'Top.tsx'), 'the date here');
    fs.writeFileSync(path.join(tmp, 'components', 'nested', 'Deep.tsx'), 'the date here');

    const theme = { codeDirs: ['components'], codePattern: /\bdate\b/, shallow: true };
    const found = themes.siblingFiles(theme, tmp);
    assert.deepEqual(found, [path.join('components', 'Top.tsx')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('siblingFiles codePattern does not substring-match inside unrelated words', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'themes-sibling-boundary-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'components'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'components', 'OnlyUpdate.tsx'), 'function update() {}');
    fs.writeFileSync(path.join(tmp, 'components', 'HasDate.tsx'), 'const date = new Date();');

    const theme = { codeDirs: ['components'], codePattern: /\bdate\b/i };
    const found = themes.siblingFiles(theme, tmp);
    assert.deepEqual(found, [path.join('components', 'HasDate.tsx')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadBuilds returns the cached builds without touching the network when the cache is fresh', () => {
  const BUILDS_CACHE = path.join(process.env.BSC_FEEDBACK_HOME, 'builds-cache.json');
  fs.mkdirSync(process.env.BSC_FEEDBACK_HOME, { recursive: true });
  const cached = [{ appBuildVersion: '99', createdAt: '2026-08-01T00:00:00.000Z' }];
  fs.writeFileSync(BUILDS_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), builds: cached }));
  assert.deepEqual(themes.loadBuilds(), cached);
});

test('loadBuilds never throws once a stale cache forces a real eas-cli attempt', () => {
  const BUILDS_CACHE = path.join(process.env.BSC_FEEDBACK_HOME, 'builds-cache.json');
  fs.mkdirSync(process.env.BSC_FEEDBACK_HOME, { recursive: true });
  const stale = [{ appBuildVersion: '1', createdAt: '2020-01-01T00:00:00.000Z' }];
  // 7h old -- past the 6h TTL, so loadBuilds must attempt a real fetch here.
  // Whether that fetch succeeds or fails on this machine, the call must
  // return (an array), never throw -- the "enrichment, never blocks" contract.
  fs.writeFileSync(BUILDS_CACHE, JSON.stringify({
    fetchedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    builds: stale,
  }));
  let result;
  assert.doesNotThrow(() => { result = themes.loadBuilds(); });
  assert.ok(Array.isArray(result));
});
