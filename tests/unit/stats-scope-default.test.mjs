// Run with: npx tsx --test tests/unit/stats-scope-default.test.mjs
// Guards the build-61 P0 fix: the Stats screen must open on All time, never a
// weeks-old current-season window; plus the audience-agreement reducer added
// in the same fix pass.
import test from 'node:test';
import assert from 'node:assert/strict';
// Namespace imports, not default: under `node --experimental-strip-types`
// these modules are real ESM and have no default export, which made both
// files fail to load at all. A namespace import works under tsx too.
import * as scopeMod from '../../lib/stats-scope.ts';
import * as critMod from '../../lib/stats-you-vs-critics.ts';

const { ALL_TIME, buildScopes, defaultScope, inScope } = scopeMod;
const { audienceVsYou } = critMod;

const canon = {
  ceremonies: [
    { date: '2025-06-08' },
    { date: '2026-06-07' },
  ],
  winners: [],
};

const rows = [
  { show_id: 'a', date_seen: '2026-07-01', rating: 4 },
  { show_id: 'b', date_seen: '2024-03-10', rating: 3.5 },
  { show_id: 'c', date_seen: null, rating: 5 },
];

test('defaultScope is All time even when the current season has entries', () => {
  const scopes = buildScopes(rows, canon, { today: '2026-07-26' });
  const def = defaultScope(scopes, rows, '2026-07-26');
  assert.equal(def.id, ALL_TIME.id);
  assert.equal(def.kind, 'all');
});

test('buildScopes still offers the current season for the quick toggle', () => {
  const scopes = buildScopes(rows, canon, { today: '2026-07-26' });
  const current = scopes.find((s) => s.kind === 'season' && s.inProgress);
  assert.ok(current, 'current in-progress season must be offered');
});

test('inScope: undated rows are only in All time', () => {
  const scopes = buildScopes(rows, canon, { today: '2026-07-26' });
  const year = scopes.find((s) => s.kind === 'year');
  assert.equal(inScope(ALL_TIME, null), true);
  assert.equal(inScope(year, null), false);
});

test('audienceVsYou: ±10pt band against grade midpoints, dedup by show', () => {
  const index = {
    a: { id: 'a', title: 'A', audienceGrade: 'A' },   // 93 vs 4★=80 → not aligned
    b: { id: 'b', title: 'B', audienceGrade: 'B' },   // 83 vs 3.5★=70 → not aligned
    d: { id: 'd', title: 'D', audienceGrade: 'A-' },  // 90 vs 4.5★=90 → aligned
    e: { id: 'e', title: 'E' },                        // no grade → excluded
  };
  const out = audienceVsYou(
    [
      { show_id: 'a', date_seen: '2026-01-01', rating: 4 },
      { show_id: 'b', date_seen: '2026-01-02', rating: 3.5 },
      { show_id: 'd', date_seen: '2026-01-03', rating: 4.5 },
      { show_id: 'd', date_seen: '2026-01-04', rating: 1 }, // dup show ignored
      { show_id: 'e', date_seen: '2026-01-05', rating: 5 },
      { show_id: 'f', date_seen: '2026-01-06', rating: null }, // unrated ignored
    ],
    index,
  );
  assert.equal(out.comparable, 3);
  assert.equal(out.aligned, 1);
  assert.deepEqual(out.alignedShowIds, ['d']);
});

test('audienceVsYou: empty diary → zero, no NaN', () => {
  const out = audienceVsYou([], {});
  assert.equal(out.comparable, 0);
  assert.equal(out.alignment, 0);
});
