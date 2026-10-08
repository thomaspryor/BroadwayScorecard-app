// BRO-4881: outlet tier chips. The copy mirrors the website's
// src/config/tier-display.ts; weights mirror TIER_WEIGHTS in scoring.ts there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TIER_DISPLAY, TIERS, asOutletTier, isLondonCategory, showsTierChips, tierExplanation } from '../../lib/tier-display.ts';
import { mapShowDetail } from '../../lib/types.ts';

test('weights match the website (T1 1.0, T2 0.75, T3 0.40, T4 0.20)', () => {
  assert.deepEqual(TIERS.map(t => TIER_DISPLAY[t].weight), [1, 0.75, 0.4, 0.2]);
});

test('only tiers 1-4 get a chip', () => {
  assert.equal(asOutletTier(1), 1);
  assert.equal(asOutletTier(4), 4);
  assert.equal(asOutletTier(0), null);
  assert.equal(asOutletTier(5), null);
  assert.equal(asOutletTier(undefined), null);
});

test('opera hides chips, everything else shows them', () => {
  assert.equal(showsTierChips('opera'), false);
  assert.equal(showsTierChips('musical'), true);
  assert.equal(showsTierChips('play'), true);
});

test('London examples on West End and Off-West End shows', () => {
  assert.equal(isLondonCategory('west-end'), true);
  assert.equal(isLondonCategory('off-west-end'), true);
  assert.equal(isLondonCategory('broadway'), false);
  assert.match(tierExplanation(1, { london: true }).detail, /The Guardian/);
  assert.match(tierExplanation(1, { london: false }).detail, /New York Times/);
});

test('a top critic at a smaller outlet is explained as a top critic', () => {
  const e = tierExplanation(1, { london: false, isTopCritic: true, criticName: 'Chris Jones' });
  assert.equal(e.title, 'Top critic');
  assert.match(e.detail, /^Chris Jones is one of a small group/);
  assert.equal(tierExplanation(2, { london: false, isTopCritic: true }).title, 'Major outlet');
});

test('mapShowDetail carries the top-critic flag from rv[].tc', () => {
  const d = mapShowDetail({ _v: 1, id: 'x', rv: [
    { cn: 'Chris Jones', o: 'Chicago Tribune', s: 80, b: 'Positive', t: 1, tc: 1 },
    { cn: 'A Critic', o: 'TheaterMania', s: 70, b: 'Mixed', t: 2 },
  ] });
  assert.deepEqual(d.reviews.map(r => [r.tier, r.isTopCritic]), [[1, true], [2, false]]);
});
