// lib/breakdown.ts: the review breakdown bar classifies each review from its
// score (website getBreakdownTier), so a "Pan" bucket counts as Negative
// instead of falling out of the bar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBreakdownTier, countBreakdown, BREAKDOWN_POSITIVE_MIN, BREAKDOWN_MIXED_MIN } from '../../lib/breakdown.ts';
import { SKIP_NO_WEB, readWeb } from './web-repo.mjs';

test('tier boundaries (Broadway gold 83, London 85)', () => {
  assert.equal(getBreakdownTier(83, 'broadway'), 'rave');
  assert.equal(getBreakdownTier(82.6, 'broadway'), 'rave', 'rounded like the badge');
  assert.equal(getBreakdownTier(84, 'west-end'), 'positive');
  assert.equal(getBreakdownTier(85, 'off-west-end'), 'rave');
  assert.equal(getBreakdownTier(70, 'broadway'), 'positive');
  assert.equal(getBreakdownTier(69, 'broadway'), 'mixed');
  assert.equal(getBreakdownTier(55, 'broadway'), 'mixed');
  assert.equal(getBreakdownTier(54, 'broadway'), 'negative');
  assert.equal(getBreakdownTier(10, 'broadway'), 'negative');
  assert.equal(getBreakdownTier(null), null);
  assert.equal(getBreakdownTier(NaN), null);
});

test('counts every scored review, whatever its bucket word says', () => {
  const reviews = [
    { score: 95, bucket: 'Rave' },
    { score: 30, bucket: 'Pan' },
    { score: 60, bucket: 'Mixed' },
    { score: 72, bucket: 'Positive' },
    { score: null, bucket: 'Positive' },
  ];
  assert.deepEqual(countBreakdown(reviews, 'broadway'), { rave: 1, positive: 1, mixed: 1, negative: 1, total: 4 });
});

test('contract: thresholds match the website ScoreBreakdownBar', { skip: SKIP_NO_WEB }, () => {
  const src = readWeb('src/components/show-cards/ScoreBreakdownBar.tsx');
  const body = /export function getBreakdownTier[\s\S]*?\n\}/.exec(src ?? '')?.[0];
  assert.ok(body, 'found getBreakdownTier on the website');
  assert.ok(body.includes('getGoldThreshold(category)'), 'rave uses the market gold threshold');
  const mins = [...body.matchAll(/rounded >= (\d+)\) return '(\w+)'/g)].map(m => [m[2], Number(m[1])]);
  assert.deepEqual(mins, [['positive', BREAKDOWN_POSITIVE_MIN], ['mixed', BREAKDOWN_MIXED_MIN]]);
});
