// Signed-out watchlist rules ("save first, ask later", BRO-4727).
// Run: node --experimental-strip-types --test tests/unit/local-watchlist.test.mjs
//
// A signed-out bookmark tap on Home, Browse or the show hero used to open the
// sign-in sheet without saving anything, so the show was lost after sign-in.
// The show is now saved on the phone first and moved into the account on the
// next sign-in; these are the pure rules that decide what is kept and moved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LOCAL_SHOWS,
  PROMPT_COOLDOWN_MS,
  addEntry,
  parseLocalWatchlist,
  parsePromptedAt,
  removeEntry,
  shouldPromptAfterSave,
  showsToMigrate,
} from '../../lib/local-watchlist.ts';

test('malformed storage reads as an empty list', () => {
  assert.deepEqual(parseLocalWatchlist(null), []);
  assert.deepEqual(parseLocalWatchlist(''), []);
  assert.deepEqual(parseLocalWatchlist('{not json'), []);
  assert.deepEqual(parseLocalWatchlist('{"showId":"wicked"}'), []);
});

test('parsing drops bad rows and duplicates, keeps order', () => {
  const raw = JSON.stringify([
    { showId: 'wicked', savedAt: 3 },
    { showId: '', savedAt: 2 },
    null,
    { showId: 42 },
    { showId: 'wicked', savedAt: 1 },
    { showId: 'hamilton' },
  ]);
  assert.deepEqual(parseLocalWatchlist(raw), [
    { showId: 'wicked', savedAt: 3 },
    { showId: 'hamilton', savedAt: 0 },
  ]);
});

test('adding puts the newest first and never duplicates', () => {
  let list = addEntry([], 'wicked', 1);
  list = addEntry(list, 'hamilton', 2);
  assert.deepEqual(list.map(e => e.showId), ['hamilton', 'wicked']);
  assert.equal(addEntry(list, 'wicked', 3), list);
});

test('the list is capped so storage cannot grow without bound', () => {
  let list = [];
  for (let i = 0; i < MAX_LOCAL_SHOWS + 5; i++) list = addEntry(list, `show-${i}`, i);
  assert.equal(list.length, MAX_LOCAL_SHOWS);
  assert.equal(list[0].showId, `show-${MAX_LOCAL_SHOWS + 4}`);
});

test('removing takes out only that show', () => {
  const list = addEntry(addEntry([], 'wicked', 1), 'hamilton', 2);
  assert.deepEqual(removeEntry(list, 'wicked').map(e => e.showId), ['hamilton']);
  assert.deepEqual(removeEntry(list, 'nope'), list);
});

test('the sign-in sheet follows the first save, then waits out the cooldown', () => {
  const now = 10 * PROMPT_COOLDOWN_MS;
  assert.equal(shouldPromptAfterSave(0, null, now), false);
  assert.equal(shouldPromptAfterSave(1, null, now), true);
  assert.equal(shouldPromptAfterSave(2, now - 1000, now), false);
  assert.equal(shouldPromptAfterSave(2, now - PROMPT_COOLDOWN_MS, now), true);
});

test('migration copies only shows the account lacks, oldest first', () => {
  let list = addEntry([], 'wicked', 1);
  list = addEntry(list, 'hamilton', 2);
  list = addEntry(list, 'oh-mary', 3);
  assert.deepEqual(showsToMigrate(list, ['hamilton']), ['wicked', 'oh-mary']);
  assert.deepEqual(showsToMigrate(list, new Set(['wicked', 'hamilton', 'oh-mary'])), []);
});

test('a stored prompt time must be a positive number', () => {
  assert.equal(parsePromptedAt(null), null);
  assert.equal(parsePromptedAt(''), null);
  assert.equal(parsePromptedAt('abc'), null);
  assert.equal(parsePromptedAt('0'), null);
  assert.equal(parsePromptedAt('-5'), null);
  assert.equal(parsePromptedAt('1759700000000'), 1759700000000);
});
