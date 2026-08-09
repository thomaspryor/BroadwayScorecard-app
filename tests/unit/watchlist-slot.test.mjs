// Which shelf a watchlist entry lands on (To Watch tab vs Watched tab).
// Run: node --experimental-strip-types --test tests/unit/watchlist-slot.test.mjs
//
// Regression guard for beta feedback AMRzGCE4 (2026-08-05) and AHJspB30
// (2026-08-07): a show already rated in the past and re-booked for a future
// date showed on To Watch's Upcoming shelf but vanished from Watched's,
// because each tab wrote its own filter and Watched's dropped anything rated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewIndex, classifyWatchlistEntry } from '../../lib/watchlist-slot.ts';

const TODAY = '2026-08-09';
const review = (show_id, date_seen) => ({ id: `r-${show_id}-${date_seen}`, show_id, date_seen, rating: 4 });
const entry = (show_id, planned_date) => ({ id: `w-${show_id}`, show_id, planned_date });

test('a future booking is Upcoming even when the show was rated before', () => {
  const index = buildReviewIndex([review('oh-mary', '2025-06-01')]);
  assert.equal(classifyWatchlistEntry(entry('oh-mary', '2026-10-10'), index, TODAY), 'upcoming');
});

test('a future booking of a never-rated show is Upcoming', () => {
  const index = buildReviewIndex([]);
  assert.equal(classifyWatchlistEntry(entry('the-pass', '2026-08-26'), index, TODAY), 'upcoming');
});

test("today's booking is Upcoming, never invisible to both tabs", () => {
  const index = buildReviewIndex([]);
  assert.equal(classifyWatchlistEntry(entry('the-pass', TODAY), index, TODAY), 'upcoming');
});

test('a past booking with no rating is To Be Rated', () => {
  const index = buildReviewIndex([]);
  assert.equal(classifyWatchlistEntry(entry('the-pass', '2026-08-01'), index, TODAY), 'to-be-rated');
});

test('a past booking already logged on that date drops off both shelves', () => {
  const index = buildReviewIndex([review('the-pass', '2026-08-01')]);
  assert.equal(classifyWatchlistEntry(entry('the-pass', '2026-08-01'), index, TODAY), 'not-booked');
});

test('a past booking rated a day late still counts as logged', () => {
  const index = buildReviewIndex([review('the-pass', '2026-08-02')]);
  assert.equal(classifyWatchlistEntry(entry('the-pass', '2026-08-01'), index, TODAY), 'not-booked');
});

test('a past booking that only has an OLDER rating still needs rating', () => {
  const index = buildReviewIndex([review('oh-mary', '2024-01-01')]);
  assert.equal(classifyWatchlistEntry(entry('oh-mary', '2026-08-01'), index, TODAY), 'to-be-rated');
});

test('an undated import settles a past booking (no resurrected nags)', () => {
  const index = buildReviewIndex([review('imported', null)]);
  assert.equal(classifyWatchlistEntry(entry('imported', '2026-08-01'), index, TODAY), 'not-booked');
});

test('an undated import does not hide a future booking', () => {
  const index = buildReviewIndex([review('imported', null)]);
  assert.equal(classifyWatchlistEntry(entry('imported', '2026-10-10'), index, TODAY), 'upcoming');
});

test('no planned date is Not Yet Booked', () => {
  const index = buildReviewIndex([]);
  assert.equal(classifyWatchlistEntry(entry('someday', null), index, TODAY), 'not-booked');
});

test('the index keeps the latest date_seen per show', () => {
  const index = buildReviewIndex([
    review('repeat', '2024-01-01'),
    review('repeat', '2026-08-01'),
    review('repeat', '2025-05-05'),
  ]);
  assert.equal(index.latestSeenByShow['repeat'], '2026-08-01');
});

test('every entry lands on exactly one shelf', () => {
  const index = buildReviewIndex([review('a', '2026-08-01'), review('b', null)]);
  const slots = ['a', 'b', 'c'].flatMap(id =>
    [null, '2026-08-01', TODAY, '2026-12-01'].map(d => classifyWatchlistEntry(entry(id, d), index, TODAY)),
  );
  for (const slot of slots) {
    assert.ok(['upcoming', 'to-be-rated', 'not-booked'].includes(slot), `unknown slot ${slot}`);
  }
});
