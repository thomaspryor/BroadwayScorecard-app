// Source guards for the show page (app/show/[slug].tsx) and the cards that
// display a score. The rules themselves live in pure modules with their own
// tests (score-gate, breakdown, run-info, slug-fallback); these checks keep
// the screens wired to them, so an edit cannot quietly bring back the old
// copies that diverged from the website.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SKIP_NO_WEB, readWeb } from './web-repo.mjs';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = rel => readFileSync(`${APP_ROOT}/${rel}`, 'utf8');
const SHOW_PAGE = read('app/show/[slug].tsx');
const SHOW_CARD = read('components/ShowCard.tsx');
const SCORE_BADGE = read('components/show-cards/ScoreBadge.tsx');

test('tier word comes from the displayed score, never the feed label', () => {
  assert.doesNotMatch(SHOW_PAGE, /criticScore\??\.label/, 'use getScoreTierLabel(displayScore, category)');
  assert.match(SHOW_PAGE, /getScoreTierLabel\(displayScore, show\.category\)/);
});

// The show page gates on the feed's cr.pq (the website show page's rule:
// card gate plus the coverage floor), falling back to isScoreTBD for feeds
// without pq. Cards keep isScoreTBD (cr.q).
test('score, audience chip and breakdown are gated on isShowPageScoreTBD', () => {
  assert.match(SHOW_PAGE, /const scoreTBD = isShowPageScoreTBD\(show\)/);
  assert.match(SHOW_PAGE, /scoreTBD \? null : show\.compositeScore/);
  assert.match(SHOW_PAGE, /!scoreTBD && show\.audienceGrade/);
  assert.match(SHOW_PAGE, /!scoreTBD && \(\s*<View style=\{styles\.breakdownSection\}>/);
  assert.doesNotMatch(SHOW_PAGE, /getMarketMinReviews/, 'the review-count-only gate missed q and previews');
  assert.match(SHOW_CARD, /isScoreTBD\(show\) \? null : getQualifiedScore\(show\)/);
});

test('breakdown bar classifies reviews by score, not by the bucket word', () => {
  assert.match(SHOW_PAGE, /countBreakdown\(reviews, category\)/);
  assert.doesNotMatch(SHOW_PAGE, /\.bucket === '/);
});

test('Opens/Opened and the Quick Facts status use the shared helpers', () => {
  assert.doesNotMatch(SHOW_PAGE, /'Opens' : 'Opened'/);
  assert.match(SHOW_PAGE, /getOpeningVerb\(show\.openingDate, show\.status\)/);
  assert.match(SHOW_PAGE, /getStatusFactLabel\(show\.status\)/);
});

test('detail fetch is keyed on the show id, not the Show object', () => {
  assert.match(SHOW_PAGE, /fetchShowDetail\(showId\)/);
  assert.doesNotMatch(SHOW_PAGE, /fetchShowDetail\(show\.id\)/);
  assert.match(SHOW_PAGE, /\}, \[showId\]\);/);
});

test('an unknown slug waits for the feed, then offers retry and search', () => {
  assert.match(SHOW_PAGE, /resolveShowSlug\(slug, shows\)/);
  assert.match(SHOW_PAGE, /<ShowDetailSkeleton \/>/);
  assert.match(SHOW_PAGE, /Try Again/);
  assert.match(SHOW_PAGE, /Search Shows/);
});

test('ScoreBadge reads "TBD" without a score, not a dash', () => {
  assert.match(SCORE_BADGE, />\s*TBD\s*<\/Text>/);
  assert.match(SCORE_BADGE, /accessibilityLabel="Score to be determined"/);
  assert.doesNotMatch(SCORE_BADGE, />\s*(—|-|\\u2014)\s*<\/Text>/);
});

test('ShowCard run line and closing line come from lib/run-info', () => {
  assert.match(SHOW_CARD, /from '@\/lib\/run-info'/);
  assert.doesNotMatch(SHOW_CARD, /function getRunDuration|function getClosingInfo|MARKET_LABELS/);
});

test('initial review count matches the website CollapsibleReviews default', { skip: SKIP_NO_WEB }, () => {
  const web = readWeb('src/components/CollapsibleReviews.tsx');
  assert.ok(web, 'CollapsibleReviews.tsx missing from the web repo');
  const webCount = Number(web.match(/initialCount = (\d+)/)?.[1]);
  const appCount = Number(SHOW_PAGE.match(/const INITIAL_REVIEW_COUNT = (\d+);/)?.[1]);
  assert.ok(Number.isInteger(webCount), 'web initialCount default not found');
  assert.equal(appCount, webCount);
});
