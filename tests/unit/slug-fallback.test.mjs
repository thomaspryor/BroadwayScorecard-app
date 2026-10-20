// lib/slug-fallback.ts: what an unknown /show/<slug> link does. The contract
// half replays the website's vercel.json /show/* redirects against the
// website's own feed: the app's rule must never send a redirect to the wrong
// show, and every ambiguous case must offer the right one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShowSlug, slugToQuery } from '../../lib/slug-fallback.ts';
import { SKIP_NO_WEB, readWeb } from './web-repo.mjs';

const show = (slug, over = {}) => ({ id: slug, slug, title: slug, status: 'closed', openingDate: '2000-01-01', ...over });
const SHOWS = [
  show('hamilton-2015', { status: 'open', openingDate: '2015-08-06' }),
  show('cabaret-1998'),
  show('cabaret-2024', { status: 'open', openingDate: '2024-04-21' }),
  show('cabaret-2014', { openingDate: '2014-04-24' }),
  show('wicked', { id: 'wicked-2003', status: 'open' }),
];

test('exact slug is found', () => {
  assert.deepEqual(resolveShowSlug('hamilton-2015', SHOWS), { kind: 'found', show: SHOWS[0] });
});

test('a unique extension of an old slug redirects', () => {
  assert.equal(resolveShowSlug('hamilton', SHOWS).kind, 'redirect');
  assert.equal(resolveShowSlug('hamilton', SHOWS).show.slug, 'hamilton-2015');
});

test('an id or a case-only difference redirects', () => {
  assert.equal(resolveShowSlug('wicked-2003', SHOWS).show.slug, 'wicked');
  assert.equal(resolveShowSlug('Hamilton-2015', SHOWS).show.slug, 'hamilton-2015');
});

test('several candidates become suggestions, running and newest first', () => {
  const r = resolveShowSlug('cabaret', SHOWS);
  assert.equal(r.kind, 'suggest');
  assert.deepEqual(r.shows.map(s => s.slug), ['cabaret-2024', 'cabaret-2014', 'cabaret-1998']);
});

test('nothing similar falls back to a search for the slug words', () => {
  assert.deepEqual(resolveShowSlug('the-great-gatsby-2024', SHOWS), { kind: 'search', query: 'the great gatsby' });
  assert.deepEqual(resolveShowSlug('', SHOWS), { kind: 'search', query: '' });
  assert.equal(slugToQuery('six_the-musical'), 'six the musical');
});

test('contract: the website /show/* redirects never resolve to the wrong show', { skip: SKIP_NO_WEB }, (t) => {
  const vercel = readWeb('vercel.json');
  const feed = readWeb('public/data/mobile-shows.json');
  if (!vercel || !feed) return t.skip('vercel.json or public/data/mobile-shows.json missing');
  const shows = JSON.parse(feed).shows.map(s => ({ id: s.id, slug: s.s, title: s.t, status: s.st, openingDate: s.od ?? null }));
  const slugs = new Set(shows.map(s => s.slug));
  const redirects = (JSON.parse(vercel).redirects ?? [])
    .map(r => [/^\/show\/([^/:*()]+)\/?$/.exec(r.source)?.[1], /^\/show\/([^/:*()]+)\/?$/.exec(r.destination)?.[1]])
    .filter(([from, to]) => from && to && slugs.has(to) && !slugs.has(from));
  assert.ok(redirects.length > 50, `enough redirects to mean something (${redirects.length})`);
  let resolved = 0;
  for (const [from, to] of redirects) {
    const r = resolveShowSlug(from, shows);
    if (r.kind === 'redirect') {
      assert.equal(r.show.slug, to, `/show/${from} must redirect to ${to}`);
      resolved++;
    } else if (r.kind === 'suggest') {
      assert.ok(r.shows.some(s => s.slug === to), `/show/${from} suggestions include ${to}`);
    }
  }
  assert.ok(resolved > redirects.length / 2, `most old slugs resolve directly (${resolved}/${redirects.length})`);
});
