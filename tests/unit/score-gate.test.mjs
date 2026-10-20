// lib/score-gate.ts: the Critic Score display gate. Mirrors the website's
// scripts/lib/min-reviews.js, and trusts the feed's `cr.q` verdict when the
// feed carries it. The contract half runs only when the website repo is
// checked out next to this one (see web-repo.mjs); CI skips it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  getMarketMinReviews,
  reviewsRemainingForScore,
  hasEnoughReviewsForShow,
  reviewsRemainingForShow,
  getQualifiedScore,
  isScoreTBD,
  tier1And2CountOf,
  T3_ONLY_EXTRA,
} from '../../lib/score-gate.ts';
import { getGoldThreshold, getScoreTierLabel } from '../../lib/score-utils.ts';
import { mapMobileShow } from '../../lib/types.ts';
import { SKIP_NO_WEB, readWeb, webPath } from './web-repo.mjs';

const show = (over = {}) => ({
  compositeScore: 80,
  category: 'broadway',
  status: 'open',
  criticScore: { reviewCount: 10, tier1Count: 2, tier2Count: 1 },
  ...over,
});

test('market minimums match the website, including off-off-broadway', () => {
  assert.equal(getMarketMinReviews('broadway'), 5);
  assert.equal(getMarketMinReviews('west-end'), 5);
  assert.equal(getMarketMinReviews(undefined), 5);
  assert.equal(getMarketMinReviews('toString'), 5);
  for (const c of ['off-broadway', 'off-off-broadway', 'off-west-end', 'regional', 'tour']) {
    assert.equal(getMarketMinReviews(c), 3, c);
  }
});

test('all-T3 shows need two more reviews; unknown tier counts do not', () => {
  assert.equal(reviewsRemainingForScore(5, 'broadway', 0), T3_ONLY_EXTRA);
  assert.equal(reviewsRemainingForScore(7, 'broadway', 0), 0);
  assert.equal(reviewsRemainingForScore(5, 'broadway', undefined), 0);
  assert.equal(reviewsRemainingForScore(5, 'broadway', 1), 0);
});

test('tier1And2CountOf treats a zero T1 with no T2 as unknown, not zero', () => {
  assert.equal(tier1And2CountOf({ reviewCount: 5, tier1Count: 0 }), undefined);
  assert.equal(tier1And2CountOf({ reviewCount: 5, tier1Count: 2 }), 2);
  assert.equal(tier1And2CountOf({ reviewCount: 5, tier1Count: 0, tier2Count: 0 }), 0);
  assert.equal(tier1And2CountOf({ reviewCount: 5, tier1Count: 1, tier2Count: 2 }), 3);
  assert.equal(tier1And2CountOf(null), undefined);
});

test('the feed verdict cr.q wins over the local rule in both directions', () => {
  // Local rule says too few (2 < 5); the website says qualified (curated carve-out).
  assert.equal(getQualifiedScore(show({ criticScore: { reviewCount: 2, tier1Count: 1, qualified: true } })), 80);
  // Local rule says enough; the website is holding the score (coverage floor).
  const held = show({ criticScore: { reviewCount: 9, tier1Count: 3, tier2Count: 2, qualified: false } });
  assert.equal(getQualifiedScore(held), null);
  assert.equal(reviewsRemainingForShow(held), 1, 'never claims 0 more reviews while the site still says TBD');
});

test('without cr.q the local rule decides', () => {
  assert.equal(getQualifiedScore(show({ criticScore: { reviewCount: 4, tier1Count: 1 } })), null);
  assert.equal(getQualifiedScore(show({ criticScore: { reviewCount: 5, tier1Count: 1 } })), 80);
  assert.equal(getQualifiedScore(show({ category: 'off-broadway', criticScore: { reviewCount: 3, tier1Count: 1 } })), 80);
  assert.equal(getQualifiedScore(show({ criticScore: { reviewCount: 6, tier1Count: 0, tier2Count: 0 } })), null);
  assert.equal(getQualifiedScore(show({ compositeScore: null })), null);
  assert.equal(getQualifiedScore(show({ criticScore: null })), null);
});

test('previews and upcoming are always TBD, like the website show page', () => {
  assert.equal(isScoreTBD(show()), false);
  assert.equal(isScoreTBD(show({ status: 'previews' })), true);
  assert.equal(isScoreTBD(show({ status: 'upcoming' })), true);
  assert.equal(isScoreTBD(show({ criticScore: { reviewCount: 1, tier1Count: 1 } })), true);
});

test('mapMobileShow carries cr.q, cr.t2 and ps through, and never invents a type', () => {
  const mapped = mapMobileShow({ id: 'x', t: 'X', s: 'x', v: 'V', st: 'previews', cs: 70, cr: { s: 70, rc: 2, l: 'Worth Seeing', t1: 1, t2: 0, q: 1 }, ps: '2026-11-02' });
  assert.equal(mapped.criticScore.qualified, true);
  assert.equal(mapped.criticScore.tier2Count, 0);
  assert.equal(mapped.previewsStartDate, '2026-11-02');
  assert.equal(mapped.type, '');
  const old = mapMobileShow({ id: 'y', t: 'Y', s: 'y', v: 'V', st: 'open', ty: 'play', cr: { s: 70, rc: 2, l: 'x', t1: 0 } });
  assert.equal('qualified' in old.criticScore, false, 'older feeds leave the verdict undefined');
  assert.equal('tier2Count' in old.criticScore, false);
  assert.equal(old.previewsStartDate, null);
  assert.equal(mapMobileShow({ id: 'z', t: 'Z', s: 'z', v: '', st: 'open', cr: { s: 1, rc: 1, l: '', t1: 0, q: 0 } }).criticScore.qualified, false);
});

test('the tier word comes from the score, not the feed label', () => {
  assert.equal(getScoreTierLabel(84, 'broadway'), 'Critical Gold');
  assert.equal(getScoreTierLabel(84, 'west-end'), 'Recommended');
  assert.equal(getScoreTierLabel(null, 'broadway'), null);
});

// ─── Contract with the website (skipped when it is not checked out) ─────────

test('contract: gate matches the website min-reviews.js on a grid of inputs', { skip: SKIP_NO_WEB }, () => {
  const web = createRequire(import.meta.url)(webPath('scripts/lib/min-reviews.js'));
  const cats = ['broadway', 'off-broadway', 'off-off-broadway', 'west-end', 'off-west-end', 'regional', 'tour', undefined, 'other'];
  for (const cat of cats) {
    assert.equal(getMarketMinReviews(cat), web.getMarketMinReviews(cat), `min for ${cat}`);
    for (let rc = 0; rc <= 9; rc++) {
      for (const t12 of [undefined, 0, 1, 3]) {
        assert.equal(
          reviewsRemainingForScore(rc, cat, t12),
          web.reviewsRemainingForScore(rc, cat, t12, false),
          `remaining(${rc}, ${cat}, ${t12})`,
        );
      }
    }
  }
  assert.equal(T3_ONLY_EXTRA, web.T3_ONLY_EXTRA);
});

test('contract: Critical Gold thresholds match the website score-buckets.ts', { skip: SKIP_NO_WEB }, () => {
  const src = readWeb('src/config/score-buckets.ts');
  assert.ok(src, 'score-buckets.ts present');
  const block = /MARKET_GOLD_THRESHOLD[^=]*=\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
  const entries = [...block.matchAll(/'([^']+)':\s*(\d+)/g)].map(m => [m[1], Number(m[2])]);
  assert.ok(entries.length >= 1, 'parsed the web thresholds');
  for (const [cat, n] of entries) assert.equal(getGoldThreshold(cat), n, cat);
  const def = Number(/DEFAULT_GOLD_THRESHOLD\s*=\s*(\d+)/.exec(src)?.[1]);
  assert.equal(getGoldThreshold('broadway'), def);
});
