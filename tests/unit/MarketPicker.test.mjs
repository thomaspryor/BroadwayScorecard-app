// Run with: node --test tests/unit/MarketPicker.test.mjs
// BRO-139: London market excluded ALL Off-West-End shows on Home, Browse,
// and Stats because filterByMarketCategory hardcoded 'west-end' regardless
// of includeOB, and filterByMarket never matched 'off-west-end' at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterByMarketCategory, filterByMarket } from '../../lib/market-filter.ts';

test('london + includeOB=false → west-end only', () => {
  assert.equal(filterByMarketCategory('west-end', 'london', false), true);
  assert.equal(filterByMarketCategory('off-west-end', 'london', false), false);
});

test('london + includeOB=true → both west-end and off-west-end', () => {
  assert.equal(filterByMarketCategory('west-end', 'london', true), true);
  assert.equal(filterByMarketCategory('off-west-end', 'london', true), true);
});

test('nyc behavior unchanged: includeOB swaps broadway for off-broadway', () => {
  assert.equal(filterByMarketCategory('broadway', 'nyc', false), true);
  assert.equal(filterByMarketCategory('off-broadway', 'nyc', false), false);
  assert.equal(filterByMarketCategory('broadway', 'nyc', true), false);
  assert.equal(filterByMarketCategory('off-broadway', 'nyc', true), true);
});

test('filterByMarket includes off-west-end for london (Stats gold coverage)', () => {
  assert.equal(filterByMarket('west-end', 'london'), true);
  assert.equal(filterByMarket('off-west-end', 'london'), true);
  assert.equal(filterByMarket('broadway', 'london'), false);
});

test('filterByMarket still includes off-broadway for nyc', () => {
  assert.equal(filterByMarket('broadway', 'nyc'), true);
  assert.equal(filterByMarket('off-broadway', 'nyc'), true);
  assert.equal(filterByMarket('west-end', 'nyc'), false);
});
