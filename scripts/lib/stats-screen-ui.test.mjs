// Run with: npm test (globbed by package.json's "test" script)
// Guards the pure logic behind BRO-118's Stats P2 polish batch: venue
// whitespace normalization (#4), the theaters-drilldown venue grouping (#6),
// and unambiguous month-axis labels (#9). UI-only fixes in this batch
// (poster-shelf fade, tab-bar clearance, ModuleLocked scope copy, Stats
// remaining mounted, sticky year headers) have no pure logic to extract and
// are covered by typecheck/lint + manual verification instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as venueMod from '../../lib/show-format.ts';
import * as drilldownMod from '../../lib/stats-drilldown.ts';
import * as monthsMod from '../../lib/stats-months.ts';

const { normalizeVenue } = venueMod;
const { groupReviewsByVenue } = drilldownMod;
const { shortMonth, formatMonth } = monthsMod;

test('normalizeVenue collapses doubled internal whitespace', () => {
  assert.equal(normalizeVenue('Sabrage / Lafayette  '), 'Sabrage / Lafayette');
  assert.equal(normalizeVenue('The  Music   Box'), 'The Music Box');
});

test('normalizeVenue trims leading/trailing whitespace', () => {
  assert.equal(normalizeVenue('  Shubert Theatre '), 'Shubert Theatre');
});

test('normalizeVenue is a no-op on already-clean strings', () => {
  assert.equal(normalizeVenue('Imperial Theatre'), 'Imperial Theatre');
  assert.equal(normalizeVenue(''), '');
});

function review(id, showId) {
  return { id, user_id: 'u', show_id: showId, rating: 4, review_text: null, date_seen: null, visibility: 'public', created_at: '', updated_at: '' };
}

test('groupReviewsByVenue buckets reviews by their show venue', () => {
  const venues = { a: 'Shubert Theatre', b: 'Imperial Theatre', c: 'Shubert Theatre' };
  const reviews = [review('1', 'a'), review('2', 'b'), review('3', 'c')];
  const groups = groupReviewsByVenue(reviews, (showId) => venues[showId]);
  assert.deepEqual(groups.map(g => g.venue), ['Shubert Theatre', 'Imperial Theatre']);
  assert.equal(groups[0].reviews.length, 2);
  assert.equal(groups[1].reviews.length, 1);
});

test('groupReviewsByVenue sorts largest group first, ties alphabetically', () => {
  const venues = { a: 'Zebra House', b: 'Alpha House' };
  const reviews = [review('1', 'a'), review('2', 'b')];
  const groups = groupReviewsByVenue(reviews, (showId) => venues[showId]);
  assert.deepEqual(groups.map(g => g.venue), ['Alpha House', 'Zebra House']);
});

test('groupReviewsByVenue falls back to "Unknown venue" when venue is missing', () => {
  const reviews = [review('1', 'a')];
  const groups = groupReviewsByVenue(reviews, () => null);
  assert.deepEqual(groups.map(g => g.venue), ['Unknown venue']);
});

test('groupReviewsByVenue returns nothing for an empty review list', () => {
  assert.deepEqual(groupReviewsByVenue([], () => 'Venue'), []);
});

test('shortMonth produces unambiguous 3-letter labels, not single letters', () => {
  assert.equal(shortMonth('2026-01'), 'Jan');
  assert.equal(shortMonth('2026-06'), 'Jun');
  assert.equal(shortMonth('2026-07'), 'Jul');
  // The build-61 complaint: two adjacent single-letter "J" labels (Jan/Jun/Jul
  // all start with J) must now read differently from one another.
  assert.notEqual(shortMonth('2026-01'), shortMonth('2026-06'));
  assert.notEqual(shortMonth('2026-06'), shortMonth('2026-07'));
});

test('formatMonth still produces the full "Month Year" label', () => {
  assert.equal(formatMonth('2026-01'), 'January 2026');
});
