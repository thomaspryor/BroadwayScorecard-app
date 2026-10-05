// Welcome step after a new account's first sign-in (BRO-4727, app port of
// the web's BRO-4619). Run:
//   node --experimental-strip-types --test tests/unit/welcome-onboarding.test.mjs
//
// These are the rules that decide who sees the welcome, which posters it
// offers, what a pick writes, and how "seen it, date not set" picks are
// listed under To Be Rated. The server claim (claim_onboarding) is what makes
// it once per account; these keep it to brand-new accounts and never invent
// a seen date.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WELCOME_ACCOUNT_MAX_AGE_MS,
  WELCOME_CLOCK_SKEW_MS,
  WELCOME_LONG_RUNNER_COUNT,
  nextWelcomeStep,
  pickWelcomeShows,
  seenUnratedToRate,
  shouldOfferWelcome,
  welcomeDoneMessage,
  welcomeFinishDestination,
  welcomeSaveStep,
  welcomeSeenKey,
  welcomeWriteFor,
} from '../../lib/welcome-onboarding.ts';
import { IMPORT_SOURCES, importSourceNames } from '../../lib/import-sources.ts';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

test('a brand-new account with an unclaimed welcome is offered it', () => {
  const profile = { onboarding_seen_at: null, created_at: iso(NOW - 60_000) };
  assert.equal(shouldOfferWelcome({ profile, now: NOW, locallySeen: false }), true);
});

test('never offered once seen, claimed, missing, or old', () => {
  const fresh = iso(NOW - 60_000);
  assert.equal(shouldOfferWelcome({ profile: null, now: NOW, locallySeen: false }), false);
  assert.equal(shouldOfferWelcome({ profile: { onboarding_seen_at: null, created_at: fresh }, now: NOW, locallySeen: true }), false);
  assert.equal(shouldOfferWelcome({ profile: { onboarding_seen_at: iso(NOW), created_at: fresh }, now: NOW, locallySeen: false }), false);
  // Column not in this database (undefined): do not show.
  assert.equal(shouldOfferWelcome({ profile: { created_at: fresh }, now: NOW, locallySeen: false }), false);
  assert.equal(shouldOfferWelcome({ profile: { onboarding_seen_at: null, created_at: null }, now: NOW, locallySeen: false }), false);
  assert.equal(shouldOfferWelcome({ profile: { onboarding_seen_at: null, created_at: 'garbage' }, now: NOW, locallySeen: false }), false);
  const old = iso(NOW - WELCOME_ACCOUNT_MAX_AGE_MS - 1);
  assert.equal(shouldOfferWelcome({ profile: { onboarding_seen_at: null, created_at: old }, now: NOW, locallySeen: false }), false);
});

test('a phone clock slightly behind the server still counts a new account', () => {
  const ahead = (ms) => ({ onboarding_seen_at: null, created_at: iso(NOW + ms) });
  assert.equal(shouldOfferWelcome({ profile: ahead(WELCOME_CLOCK_SKEW_MS), now: NOW, locallySeen: false }), true);
  assert.equal(shouldOfferWelcome({ profile: ahead(WELCOME_CLOCK_SKEW_MS + 1), now: NOW, locallySeen: false }), false);
});

test('the seen key is per account', () => {
  assert.equal(welcomeSeenKey('u1'), '@bsc:welcome_seen:u1');
  assert.notEqual(welcomeSeenKey('u1'), welcomeSeenKey('u2'));
});

test('steps run shows, import, done and stop at done', () => {
  assert.equal(nextWelcomeStep('shows'), 'import');
  assert.equal(nextWelcomeStep('import'), 'done');
  assert.equal(nextWelcomeStep('done'), 'done');
});

const show = (over) => ({
  id: over.id, title: over.title ?? over.id, slug: over.id, status: 'open', category: 'broadway',
  openingDate: '2010-01-01', closingDate: null, image: `/posters/${over.id}.jpg`, reviewCount: 50, ...over,
});

test('posters: long-runners oldest first, then recent hits, then recent closings', () => {
  const today = '2026-10-05';
  const picked = pickWelcomeShows([
    show({ id: 'recent-small', openingDate: '2025-03-01', reviewCount: 25 }),
    show({ id: 'phantom', status: 'closed', openingDate: '1988-01-26', closingDate: '2025-06-01', reviewCount: 40 }),
    show({ id: 'wicked', openingDate: '2003-10-30', reviewCount: 30 }),
    show({ id: 'chicago', openingDate: '1996-11-14', reviewCount: 10 }),
    show({ id: 'recent-big', openingDate: '2025-04-01', reviewCount: 60 }),
    show({ id: 'old-closing', status: 'closed', closingDate: '2020-01-01', reviewCount: 90 }),
  ], today);
  assert.deepEqual(picked.map(s => s.id), ['chicago', 'wicked', 'recent-big', 'recent-small', 'phantom']);
  assert.deepEqual(Object.keys(picked[0]).sort(), ['id', 'image', 'slug', 'title']);
});

test('posters skip no-image, non-Broadway, too-few-review and not-yet-open shows, one per title', () => {
  const today = '2026-10-05';
  const picked = pickWelcomeShows([
    show({ id: 'no-image', image: null }),
    show({ id: 'west-end', category: 'west-end' }),
    show({ id: 'stub', openingDate: '2025-01-01', reviewCount: 3 }),
    show({ id: 'previews', openingDate: '2026-12-01' }),
    show({ id: 'hamilton', title: 'Hamilton', openingDate: '2015-08-06' }),
    show({ id: 'hamilton-dup', title: 'HAMILTON!', openingDate: '2015-08-07' }),
    // No category reads as Broadway.
    show({ id: 'no-category', category: undefined, openingDate: '2016-01-01' }),
  ], today);
  assert.deepEqual(picked.map(s => s.id), ['hamilton', 'no-category']);
});

test('the long-runner group is capped', () => {
  const many = Array.from({ length: WELCOME_LONG_RUNNER_COUNT + 4 }, (_, i) =>
    show({ id: `lr-${String(i).padStart(2, '0')}`, openingDate: `20${String(10 + (i % 10)).padStart(2, '0')}-01-0${1 + (i % 9)}` }));
  const picked = pickWelcomeShows(many, '2026-10-05');
  assert.equal(picked.length, WELCOME_LONG_RUNNER_COUNT);
});

test('a rated pick is a diary entry with no date; an unrated pick is "seen, date not set"', () => {
  assert.deepEqual(welcomeWriteFor({ showId: 'wicked', rating: 4.5 }),
    { table: 'reviews', row: { show_id: 'wicked', rating: 4.5, date_seen: null } });
  assert.deepEqual(welcomeWriteFor({ showId: 'wicked', rating: null }),
    { table: 'seen_unrated', row: { show_id: 'wicked' } });
  // Out-of-range stars never become a review.
  assert.equal(welcomeWriteFor({ showId: 'x', rating: 0 }).table, 'seen_unrated');
  assert.equal(welcomeWriteFor({ showId: 'x', rating: 6 }).table, 'seen_unrated');
});

test('a show on the watchlist still gets its pick, and leaves the watchlist; seen shows are not written twice', () => {
  const rated = { showId: 'wicked', rating: 4 };
  const unrated = { showId: 'wicked', rating: null };
  assert.deepEqual(welcomeSaveStep(rated, { seen: false, watchlisted: true }),
    { write: { table: 'reviews', row: { show_id: 'wicked', rating: 4, date_seen: null } }, clearWatchlist: true });
  assert.deepEqual(welcomeSaveStep(unrated, { seen: false, watchlisted: true }),
    { write: { table: 'seen_unrated', row: { show_id: 'wicked' } }, clearWatchlist: true });
  assert.equal(welcomeSaveStep(rated, { seen: false, watchlisted: false }).clearWatchlist, false);
  assert.deepEqual(welcomeSaveStep(rated, { seen: true, watchlisted: true }), { write: null, clearWatchlist: false });
  assert.deepEqual(welcomeSaveStep(unrated, { seen: true, watchlisted: false }), { write: null, clearWatchlist: false });
});

test('finishing goes to the diary only when something was added', () => {
  assert.equal(welcomeFinishDestination({ showsAdded: 0 }), 'stay');
  assert.equal(welcomeFinishDestination({ showsAdded: 2 }), 'my-shows');
});

test('done message mentions To Be Rated only for picks without stars', () => {
  assert.equal(welcomeDoneMessage({ showsAdded: 0, unratedAdded: 0 }), 'Rate a show from its page any time, and it lands in your diary.');
  assert.equal(welcomeDoneMessage({ showsAdded: 3, unratedAdded: 0 }), '3 shows added to your diary.');
  assert.equal(welcomeDoneMessage({ showsAdded: 1, unratedAdded: 0 }), '1 show added to your diary.');
  assert.match(welcomeDoneMessage({ showsAdded: 1, unratedAdded: 1 }), /^1 show added\. It waits for you under To Be Rated/);
  assert.match(welcomeDoneMessage({ showsAdded: 3, unratedAdded: 3 }), /^3 shows added\. They wait for you under To Be Rated/);
  assert.match(welcomeDoneMessage({ showsAdded: 3, unratedAdded: 1 }), /^3 shows added\. The one without stars waits for you under To Be Rated/);
  assert.match(welcomeDoneMessage({ showsAdded: 3, unratedAdded: 2 }), /^3 shows added\. The 2 without stars wait for you under To Be Rated/);
  // A bad count never claims more unrated shows than were added.
  assert.match(welcomeDoneMessage({ showsAdded: 2, unratedAdded: 5 }), /^2 shows added\. They wait/);
});

test('To Be Rated lists undated picks newest first, minus rated or already listed shows', () => {
  const rows = [
    { show_id: 'a', created_at: '2026-10-01T00:00:00Z' },
    { show_id: 'b', created_at: '2026-10-03T00:00:00Z' },
    { show_id: 'c', created_at: '2026-10-02T00:00:00Z' },
    { show_id: 'd', created_at: '2026-10-04T00:00:00Z' },
  ];
  const out = seenUnratedToRate(rows, new Set(['c']), new Set(['d']));
  assert.deepEqual(out.map(r => r.show_id), ['b', 'a']);
  // Input is not reordered in place.
  assert.equal(rows[0].show_id, 'a');
});

test('import offer names every source in order', () => {
  assert.deepEqual(IMPORT_SOURCES.map(s => s.id), ['show-score', 'mezzanine', 'theatr']);
  assert.equal(importSourceNames(), 'Show Score, Mezzanine or Theatr');
  assert.equal(importSourceNames([{ name: 'Show Score' }, { name: 'Mezzanine' }]), 'Show Score or Mezzanine');
  assert.equal(importSourceNames([{ name: 'Show Score' }]), 'Show Score');
  assert.equal(importSourceNames([]), '');
});
