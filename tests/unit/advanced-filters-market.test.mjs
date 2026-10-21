/**
 * The Browse "Score tier" filter must agree with the badge in every market.
 * London Gold starts at 85: a fixed 83+ filter put a London 84 under
 * "Critical Gold" while its badge said "Recommended" (web had the same bug in
 * src/components/filters/filter-ui-config.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCED_FILTER_GROUPS, advancedFilterGroupsFor, applyAdvancedFilters } from '../../lib/advanced-filters.ts';
import { getScoreTierLabel } from '../../lib/score-utils.ts';

const show = (id, category, compositeScore) => ({
  id, category, compositeScore, status: 'open', tags: [], isRevival: false,
  criticScore: { reviewCount: 10, tier1Count: 3, tier2Count: 2, qualified: true },
});
const ids = (list) => list.map((s) => s.id).sort();
const tierOf = (groups, id) => groups.find((g) => g.key === 'score_tier').options.find((o) => o.id === id);

const shows = [
  show('bway-83', 'broadway', 83),
  show('bway-82', 'broadway', 82.4),
  show('we-84', 'west-end', 84),
  show('we-85', 'west-end', 84.6),
  show('owe-83', 'off-west-end', 83),
];

test('Gold and Recommended filters follow each show\'s market, like its badge', () => {
  const gold = applyAdvancedFilters(shows, { score_tier: ['critical-gold'] });
  const rec = applyAdvancedFilters(shows, { score_tier: ['recommended'] });
  assert.deepEqual(ids(gold), ['bway-83', 'we-85']);
  assert.deepEqual(ids(rec), ['bway-82', 'owe-83', 'we-84']);
  for (const s of gold) assert.equal(getScoreTierLabel(s.compositeScore, s.category), 'Critical Gold', s.id);
  for (const s of rec) assert.equal(getScoreTierLabel(s.compositeScore, s.category), 'Recommended', s.id);
});

test('the sheet labels the London tiers 85+ and 75–84; NYC keeps 83+ and 75–82', () => {
  const nyc = advancedFilterGroupsFor('nyc');
  assert.equal(nyc, ADVANCED_FILTER_GROUPS);
  assert.equal(tierOf(nyc, 'critical-gold').label, 'Critical Gold (83+)');
  assert.equal(tierOf(nyc, 'recommended').label, 'Recommended (75–82)');
  const london = advancedFilterGroupsFor('london');
  assert.equal(tierOf(london, 'critical-gold').label, 'Critical Gold (85+)');
  assert.equal(tierOf(london, 'recommended').label, 'Recommended (75–84)');
  assert.equal(tierOf(london, 'critical-gold').predicate, tierOf(nyc, 'critical-gold').predicate, 'only labels change per market');
});

test('a show without a displayable score matches no tier', () => {
  const tbd = { ...show('tbd', 'west-end', 90), criticScore: { reviewCount: 1, tier1Count: 0, tier2Count: 0, qualified: false } };
  assert.deepEqual(applyAdvancedFilters([tbd], { score_tier: ['critical-gold'] }), []);
});
