// Run with: npx tsx --test tests/unit/stats-aisle-mates.test.mjs
// Guards lib/stats-aisle-mates.ts — the Aisle Mates / Your Paper of Record
// critic/outlet DETAIL drill-down (spec §5.1 "critic detail sheet").
import test from 'node:test';
import assert from 'node:assert/strict';
// tsx compiles the app's TS as CJS (no "type": "module"), so named exports
// arrive on the default object.
import aisleMod from '../../lib/stats-aisle-mates.ts';

const { reviewerDetail } = aisleMod;

// critics[0] = Ben Brantley, critics[1] = Adam Feldman
// outlets[0] = ['NY Times', 1], outlets[1] = ['TheaterMania', 1], outlets[2] = ['TheaterMania', 2]
const reviews = {
  critics: ['Ben Brantley', 'Adam Feldman'],
  outlets: [
    ['NY Times', 1],
    ['TheaterMania', 1],
    ['TheaterMania', 2],
  ],
  shows: {
    hamilton: [
      [0, 0, 95], // Brantley / NY Times
      [1, 1, 90], // Feldman / TheaterMania (T1 slot)
    ],
    oklahoma: [
      [0, 0, 60],
    ],
    // TheaterMania review split across two tier indices for the same show —
    // outlet matching must key by name, folding both into one score.
    cats: [
      [1, 2, 40],
    ],
    // A show Brantley reviewed that the user has not rated.
    'the-outsiders': [
      [0, 0, 88],
    ],
    // Byline-less review (NO_CRITIC_INDEX) — must not match any critic, but
    // still counts for its outlet.
    proof: [
      [-1, 0, 70],
    ],
  },
};

const rows = [
  { show_id: 'hamilton', date_seen: '2026-01-01', rating: 5 }, // 100
  { show_id: 'oklahoma', date_seen: '2026-01-02', rating: 4 }, // 80
  { show_id: 'cats', date_seen: '2026-01-03', rating: 2 }, // 40
  { show_id: 'proof', date_seen: '2026-01-04', rating: 3.5 }, // 70
];

test('reviewerDetail (critic): shared shows + biggest agreement/fight', () => {
  const detail = reviewerDetail(rows, reviews, { kind: 'critic', index: 0 });
  const byId = Object.fromEntries(detail.shared.map((s) => [s.showId, s.theirScore]));
  assert.deepEqual(byId, { hamilton: 95, oklahoma: 60 });
  // hamilton: |100-95|=5 (closest), oklahoma: |80-60|=20 (widest)
  assert.equal(detail.biggestAgreementShowId, 'hamilton');
  assert.equal(detail.biggestFightShowId, 'oklahoma');
});

test('reviewerDetail (critic): unseen picks sorted desc by score', () => {
  const detail = reviewerDetail(rows, reviews, { kind: 'critic', index: 0 });
  // proof's review has no byline (NO_CRITIC_INDEX), so it never becomes a
  // Brantley "unseen pick" even though the user hasn't rated it either.
  assert.deepEqual(
    detail.unseen.map((u) => u.showId),
    ['the-outsiders'],
  );
});

test('reviewerDetail (critic): NO_CRITIC_INDEX rows never match a critic', () => {
  const detail = reviewerDetail(rows, reviews, { kind: 'critic', index: 0 });
  assert.ok(!detail.shared.some((s) => s.showId === 'proof'));
  assert.ok(!detail.unseen.some((u) => u.showId === 'proof'));
});

test('reviewerDetail (outlet): keyed by name, folds tier-split indices together', () => {
  const detail = reviewerDetail(rows, reviews, { kind: 'outlet', name: 'TheaterMania' });
  // hamilton has a TheaterMania T1 review (index 1); cats has a T2 slot (index 2) —
  // both must resolve under the same outlet name.
  const byId = Object.fromEntries(detail.shared.map((s) => [s.showId, s.theirScore]));
  assert.deepEqual(byId, { hamilton: 90, cats: 40 });
});

test('reviewerDetail (outlet): byline-less rows still count', () => {
  const detail = reviewerDetail(rows, reviews, { kind: 'outlet', name: 'NY Times' });
  const byId = Object.fromEntries(detail.shared.map((s) => [s.showId, s.theirScore]));
  assert.deepEqual(byId, { hamilton: 95, oklahoma: 60, proof: 70 });
});

test('reviewerDetail: no shared shows → nulls, empty arrays, no throw', () => {
  const detail = reviewerDetail([], reviews, { kind: 'critic', index: 1 });
  assert.deepEqual(detail.shared, []);
  assert.equal(detail.biggestAgreementShowId, null);
  assert.equal(detail.biggestFightShowId, null);
  assert.ok(detail.unseen.length > 0);
});
