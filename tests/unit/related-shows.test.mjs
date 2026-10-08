// Run with: node --experimental-strip-types --import ./tests/register-alias.mjs --test tests/unit/related-shows.test.mjs
//
// "Closed Shows You Might Like" on the show screen listed the LOWEST-rated closed shows
// (33, 41, 41, 43, 44, 45) for a show in previews: an unscored show used 0 as its score
// reference, so "closest score" meant "worst score". Ranking must never depend on that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getRelatedShows, decodeRelatedPicks, CLOSED_MIN_SCORE } from '../../lib/related-shows.ts';

let n = 0;
const mk = (over = {}) => {
  n += 1;
  const score = 'score' in over ? over.score : 70;
  return {
    id: `s${n}`, title: over.title ?? `Show ${n}`, slug: `s${n}`, venue: 'V',
    status: 'closed', type: 'play', category: 'broadway',
    openingDate: '2019-01-01', closingDate: null, ticketsOnSale: false,
    images: { thumbnail: null, poster: null },
    compositeScore: score,
    criticScore: score == null ? null : { score, reviewCount: 20, label: '', tier1Count: 3 },
    audienceGrade: null, tags: [], synopsis: null, ageRecommendation: null,
    isRevival: false, runtime: null, creativeTeam: [], ticketLinks: [], officialUrl: null,
    ...over,
  };
};

// The reported shape: a play in previews with no score, a big closed pool spanning 30..95.
const previews = mk({ status: 'previews', score: null, openingDate: '2026-10-18', title: 'Other Desert Cities' });
const closedPool = [30, 33, 41, 43, 44, 45, 62, 70, 78, 85, 90, 95].map(score => mk({ score }));
const openPool = [60, 70, 80].map(score => mk({ status: 'open', score }));
const all = [previews, ...closedPool, ...openPool];

test('unscored show: closed recs are the best-reviewed, never the worst', () => {
  const { closed } = getRelatedShows(previews, all);
  assert.equal(closed.length, 6);
  for (const s of closed) assert.ok(s.compositeScore >= CLOSED_MIN_SCORE, `${s.compositeScore} is below the floor`);
  assert.deepEqual(closed.map(s => s.compositeScore), [95, 90, 85, 78, 70, 62]);
});

test('closed list is closed-only and open list is active-only', () => {
  const { open, closed } = getRelatedShows(previews, all);
  assert.ok(closed.every(s => s.status === 'closed'));
  assert.ok(open.every(s => s.status === 'open' || s.status === 'previews'));
  assert.equal(open.length, 3);
});

test('scored show gets the same quality-first behaviour (no reference-score proximity)', () => {
  const scored = mk({ status: 'open', score: 40 });
  const { closed } = getRelatedShows(scored, [scored, ...closedPool]);
  assert.ok(closed.every(s => s.compositeScore >= CLOSED_MIN_SCORE));
});

test('shared creative team outranks a higher score', () => {
  const src = mk({ status: 'previews', score: null, creativeTeam: [{ name: 'Jo Playwright', role: 'Playwright' }] });
  const kin = mk({ score: 65, creativeTeam: [{ name: 'Jo Playwright', role: 'Playwright' }] });
  const { closed } = getRelatedShows(src, [src, kin, ...closedPool]);
  assert.equal(closed[0].id, kin.id);
});

test('other productions of the same title are not recommended, nor repeated across lists', () => {
  const sameTitleClosed = mk({ title: 'Other Desert Cities (2011)', score: 90 });
  const dupOpen = mk({ status: 'open', title: 'Hamilton', score: 90 });
  const dupClosed = mk({ title: 'Hamilton', score: 95 });
  const { open, closed } = getRelatedShows(previews, [previews, sameTitleClosed, dupOpen, dupClosed, ...closedPool]);
  assert.ok(!closed.some(s => s.id === sameTitleClosed.id));
  assert.ok(open.some(s => s.id === dupOpen.id));
  assert.ok(!closed.some(s => s.id === dupClosed.id));
});

test('other categories and types are excluded', () => {
  const musical = mk({ type: 'musical', score: 99 });
  const ob = mk({ category: 'off-broadway', score: 99 });
  const { closed } = getRelatedShows(previews, [previews, musical, ob, ...closedPool]);
  assert.ok(!closed.some(s => s.id === musical.id || s.id === ob.id));
});

// ---- curated picks (the website's related-shows data) ----

test('decodeRelatedPicks round-trips the compact file and ignores a malformed one', () => {
  const file = JSON.stringify({ _v: 1, ids: ['a', 'b', 'c', 'd'], r: { 0: [[1, 2], [3]], 3: [[], [0]] } });
  const picks = decodeRelatedPicks(file);
  assert.deepEqual(picks.get('a'), { open: ['b', 'c'], closed: ['d'] });
  assert.deepEqual(picks.get('d'), { open: [], closed: ['a'] });
  for (const bad of ['not json', '{}', '{"_v":2,"ids":[],"r":{}}', '{"_v":1,"ids":"x","r":{}}', 'null']) {
    assert.equal(decodeRelatedPicks(bad).size, 0, bad);
  }
});

test('curated picks come first and keep their order, then the local ranking tops up', () => {
  const c1 = closedPool[0]; // score 30, would never be chosen by the local ranking
  const c2 = closedPool[8]; // 78
  const o1 = openPool[0];
  // c1 is below the closed floor so it is dropped even though curated; c2 stays first.
  const { open, closed } = getRelatedShows(previews, all, { open: [o1.id], closed: [c1.id, c2.id] });
  assert.equal(open[0].id, o1.id);
  assert.equal(open.length, 3);
  assert.equal(closed[0].id, c2.id);
  assert.ok(!closed.some(s => s.id === c1.id));
  assert.equal(closed.length, 6);
});

test('stale curated picks are dropped: wrong status, other market, unknown id, the show itself', () => {
  const wrongStatus = closedPool[9];
  const london = mk({ category: 'west-end', score: 90 });
  const { open, closed } = getRelatedShows(previews, [...all, london], {
    open: [wrongStatus.id, 'gone', previews.id, london.id],
    closed: [openPool[0].id, 'gone', previews.id, london.id],
  });
  assert.ok(open.every(s => s.status === 'open' || s.status === 'previews'));
  assert.ok(!open.some(s => s.id === wrongStatus.id || s.id === previews.id || s.id === london.id));
  assert.ok(closed.every(s => s.status === 'closed'));
  assert.ok(!closed.some(s => s.id === london.id));
});

test('a curated closed pick whose title is already open is not repeated', () => {
  const dupOpen = mk({ status: 'open', title: 'Hamilton', score: 90 });
  const dupClosed = mk({ title: 'Hamilton', score: 95 });
  const { open, closed } = getRelatedShows(previews, [...all, dupOpen, dupClosed], {
    open: [dupOpen.id], closed: [dupClosed.id],
  });
  assert.ok(open.some(s => s.id === dupOpen.id));
  assert.ok(!closed.some(s => s.id === dupClosed.id));
});

test('a curated pick may be unscored (previews/new shows) and a market-mate in the other Broadway bucket', () => {
  const unscoredOpen = mk({ status: 'previews', score: null, category: 'off-broadway' });
  const { open } = getRelatedShows(previews, [...all, unscoredOpen], { open: [unscoredOpen.id], closed: [] });
  assert.equal(open[0].id, unscoredOpen.id);
});

test('no picks for the show means the same result as before', () => {
  const a = getRelatedShows(previews, all);
  const b = getRelatedShows(previews, all, undefined);
  const c = getRelatedShows(previews, all, { open: [], closed: [] });
  assert.deepEqual(a.closed.map(s => s.id), b.closed.map(s => s.id));
  assert.deepEqual(a.closed.map(s => s.id), c.closed.map(s => s.id));
});
