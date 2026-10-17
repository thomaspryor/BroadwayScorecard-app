// BRO-4254: national tours and regional productions must not be labeled
// "Broadway" in the show page's Other Productions list, tours use the web's
// 3-review minimum, and tours stay out of the Home/Browse market feeds.
// Run: node --test tests/unit/tour-labeling.test.mjs   (also picked up by `npm test`)
//
// Self-registers the "@/..." resolver so it runs under plain `node --test`
// as well as under the npm script's `--import ./tests/register-alias.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';

await import('../register-alias.mjs');
const { getProductionMarketLabel } = await import('../../lib/production-labels.ts');
const { getMarketMinReviews } = await import('../../lib/score-utils.ts');
const { filterByMarket, filterByMarketCategory, marketForCategory } = await import('../../lib/market-filter.ts');

test('tour and regional productions get their own labels, never "Broadway"', () => {
  assert.equal(getProductionMarketLabel('tour'), 'National Tour');
  assert.equal(getProductionMarketLabel('regional'), 'Regional');
  assert.equal(getProductionMarketLabel('off-west-end'), 'Off-West End');
});

test('existing market labels are unchanged', () => {
  assert.equal(getProductionMarketLabel('broadway'), 'Broadway');
  assert.equal(getProductionMarketLabel('off-broadway'), 'Off-Broadway');
  assert.equal(getProductionMarketLabel('west-end'), 'West End');
});

test('unknown or missing categories get no label instead of a guessed market', () => {
  assert.equal(getProductionMarketLabel(undefined), null);
  assert.equal(getProductionMarketLabel(null), null);
  assert.equal(getProductionMarketLabel(''), null);
  assert.equal(getProductionMarketLabel('international'), null);
  assert.equal(getProductionMarketLabel('toString'), null);
});

test('tour uses the web minimum of 3 reviews (markets.json tour.minReviews)', () => {
  assert.equal(getMarketMinReviews('tour'), 3);
  assert.equal(getMarketMinReviews('regional'), 3);
  assert.equal(getMarketMinReviews('broadway'), 5);
  assert.equal(getMarketMinReviews('west-end'), 5);
});

test('tours stay out of the Home/Browse market feeds', () => {
  for (const market of ['nyc', 'london']) {
    assert.equal(filterByMarket('tour', market), false);
    assert.equal(filterByMarketCategory('tour', market, true), false);
    assert.equal(filterByMarketCategory('tour', market, false), false);
  }
  assert.equal(marketForCategory('tour'), null);
});
