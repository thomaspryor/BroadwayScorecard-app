// Where a watchlist entry belongs — the split shared by To Watch and Watched.
// Run: node --experimental-strip-types --test tests/unit/watchlist-sections.test.mjs
//
// Regression guard for beta feedback AMRzGCE48c3FMxDnzGEHElU (2026-08-05) and
// AHJspB302WgglKxR2LbnF-U (2026-08-07): "Oh, Mary!" was watchlisted for Oct 10,
// showed on To Watch's Upcoming shelf, and was missing from Watched's Upcoming
// section — because the Watched tab additionally excluded any show that
// already had a review. Repeat viewings are normal ("Many users see shows
// multiple times"), so a past rating must not hide a future plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitWatchlist, watchlistSection } from '../../lib/watchlist-sections.ts';

const TODAY = '2026-08-09';

const entry = (id, planned_date) => ({
  id,
  user_id: 'u1',
  show_id: `show-${id}`,
  planned_date,
  created_at: '2026-01-01T00:00:00Z',
});

test('classifies by planned date only', () => {
  assert.equal(watchlistSection(entry('a', '2026-10-10'), TODAY), 'upcoming');
  assert.equal(watchlistSection(entry('b', TODAY), TODAY), 'upcoming', 'today counts as upcoming');
  assert.equal(watchlistSection(entry('c', '2026-08-08'), TODAY), 'toBeRated');
  assert.equal(watchlistSection(entry('d', null), TODAY), 'undated');
  assert.equal(watchlistSection(entry('e', undefined), TODAY), 'undated');
});

test('a future plan for an already-rated show stays upcoming', () => {
  // The exact reported shape: the show has a review from an earlier visit and
  // a fresh watchlist row for Oct 10. Nothing about the review is consulted.
  const ohMary = entry('oh-mary', '2026-10-10');
  const { upcoming, toBeRated, undated } = splitWatchlist([ohMary], TODAY);
  assert.deepEqual(upcoming.map(e => e.id), ['oh-mary']);
  assert.deepEqual(toBeRated, []);
  assert.deepEqual(undated, []);
});

test('every entry lands in exactly one section', () => {
  const all = [
    entry('past', '2026-07-01'),
    entry('today', TODAY),
    entry('future', '2026-12-25'),
    entry('nodate', null),
  ];
  const s = splitWatchlist(all, TODAY);
  const placed = [...s.upcoming, ...s.toBeRated, ...s.undated].map(e => e.id).sort();
  assert.deepEqual(placed, ['future', 'nodate', 'past', 'today']);
});

test('upcoming is soonest-first, to-be-rated is most-recent-first', () => {
  const s = splitWatchlist(
    [
      entry('u-late', '2026-12-01'),
      entry('u-soon', '2026-08-20'),
      entry('r-old', '2026-01-05'),
      entry('r-recent', '2026-08-01'),
    ],
    TODAY,
  );
  assert.deepEqual(s.upcoming.map(e => e.id), ['u-soon', 'u-late']);
  assert.deepEqual(s.toBeRated.map(e => e.id), ['r-recent', 'r-old']);
});

test('does not mutate the input array order', () => {
  const input = [entry('a', '2026-12-01'), entry('b', '2026-08-20')];
  splitWatchlist(input, TODAY);
  assert.deepEqual(input.map(e => e.id), ['a', 'b']);
});
