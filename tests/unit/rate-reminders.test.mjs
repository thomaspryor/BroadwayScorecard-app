// Planned-date reminders were never scheduled: hooks/useWatchlist only
// scheduled when the caller passed a show title, and no caller did. The hook
// now resolves the title itself (lib/rate-reminders.ts). The launch-time
// reschedule also read whichever @bsc:watchlist:* key it found first, which
// could be another account's; it now parses only the current user's cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShowTitleLookup, parseCachedWatchlist, resolveShowTitle } from '../../lib/rate-reminders.ts';
import { setDiaryTitleCache } from '../../lib/show-format.ts';

const SHOWS = [
  { id: 'hamilton-2015', title: 'Hamilton' },
  { id: 'maybe-happy-ending-2024', title: 'Maybe Happy Ending' },
];

test('the catalog title wins', () => {
  assert.equal(resolveShowTitle('hamilton-2015', SHOWS), 'Hamilton');
  assert.equal(makeShowTitleLookup(SHOWS)('maybe-happy-ending-2024'), 'Maybe Happy Ending');
});

test('an explicit title is used as given', () => {
  assert.equal(resolveShowTitle('hamilton-2015', SHOWS, 'Hamilton (tour)'), 'Hamilton (tour)');
  assert.equal(resolveShowTitle('hamilton-2015', SHOWS, '  '), 'Hamilton');
});

test('a show outside the catalog falls back to its diary title, then the humanized id', () => {
  setDiaryTitleCache({
    'sleep-no-more-2011': { title: 'Sleep No More', venue: null, city: null, category: null, openingDate: null },
  });
  assert.equal(resolveShowTitle('sleep-no-more-2011', SHOWS), 'Sleep No More');
  assert.equal(makeShowTitleLookup([])('sleep-no-more-2011'), 'Sleep No More');
  assert.equal(resolveShowTitle('the-outsiders-2024', []), 'The Outsiders 2024');
  setDiaryTitleCache({});
});

test('cached watchlist parsing keeps show ids and dates, drops junk', () => {
  const raw = JSON.stringify([
    { id: 'a', user_id: 'u1', show_id: 'hamilton-2015', planned_date: '2026-11-02', created_at: 'x' },
    { show_id: 'wicked-2003', planned_date: null },
    { show_id: '', planned_date: '2026-11-03' },
    null,
    { planned_date: '2026-11-04' },
    { show_id: 'cats-1982', planned_date: 20261105 },
  ]);
  assert.deepEqual(parseCachedWatchlist(raw), [
    { show_id: 'hamilton-2015', planned_date: '2026-11-02' },
    { show_id: 'wicked-2003', planned_date: null },
    { show_id: 'cats-1982', planned_date: null },
  ]);
});

test('malformed cache reads as empty', () => {
  for (const raw of [null, undefined, '', '{nope', '{"show_id":"x"}', '42']) {
    assert.deepEqual(parseCachedWatchlist(raw), []);
  }
});
