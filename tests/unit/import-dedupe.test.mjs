// Bulk-import duplicate guard (app/import.tsx).
// Run: node --experimental-strip-types --test tests/unit/import-dedupe.test.mjs
//
// The reviews table allows several viewings per show, so the database never
// rejects a repeat insert. A resumed or re-run import used to double the
// diary; the import now skips a row whose show + date seen already exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewDedupeKey,
  buildReviewKeySet,
  claimReviewKey,
  fetchAllPages,
} from '../../lib/import-dedupe.ts';

test('key joins show id and date, undated rows share one key', () => {
  assert.equal(reviewDedupeKey('hamilton-2015', '2026-01-02'), 'hamilton-2015|2026-01-02');
  assert.equal(reviewDedupeKey('hamilton-2015', null), 'hamilton-2015|');
  assert.equal(reviewDedupeKey('hamilton-2015', undefined), 'hamilton-2015|');
  assert.equal(reviewDedupeKey('hamilton-2015', ''), 'hamilton-2015|');
});

test('existing viewing on the same date is skipped', () => {
  const keys = buildReviewKeySet([{ show_id: 'wicked-2003', date_seen: '2024-05-01' }]);
  assert.equal(claimReviewKey(keys, 'wicked-2003', '2024-05-01'), true);
});

test('same show on a different date is a new viewing', () => {
  const keys = buildReviewKeySet([{ show_id: 'wicked-2003', date_seen: '2024-05-01' }]);
  assert.equal(claimReviewKey(keys, 'wicked-2003', '2025-05-01'), false);
});

test('two identical rows in one file: first imports, second skips', () => {
  const keys = new Set();
  assert.equal(claimReviewKey(keys, 'six-2021', '2023-03-03'), false);
  assert.equal(claimReviewKey(keys, 'six-2021', '2023-03-03'), true);
});

test('malformed cache rows are ignored, not thrown on', () => {
  const keys = buildReviewKeySet([null, { show_id: 7 }, { show_id: 'ok', date_seen: null }]);
  assert.deepEqual([...keys], ['ok|']);
});

test('pagination stops on a short page', async () => {
  const calls = [];
  const all = Array.from({ length: 2500 }, (_, i) => i);
  const rows = await fetchAllPages(async (offset, limit) => {
    calls.push(offset);
    return all.slice(offset, offset + limit);
  }, 1000, 50);
  assert.equal(rows.length, 2500);
  assert.deepEqual(calls, [0, 1000, 2000]);
});

test('exact multiple of the page size needs one empty page to finish', async () => {
  const all = Array.from({ length: 2000 }, (_, i) => i);
  const rows = await fetchAllPages(async (offset, limit) => all.slice(offset, offset + limit), 1000, 50);
  assert.equal(rows.length, 2000);
});

test('any failed page returns null so the caller falls back', async () => {
  const rows = await fetchAllPages(async (offset) => (offset === 0 ? [1, 2] : null), 2, 50);
  assert.equal(rows, null);
});

test('max pages bounds a server that never returns a short page', async () => {
  let n = 0;
  const rows = await fetchAllPages(async (_o, limit) => { n++; return new Array(limit).fill(0); }, 10, 3);
  assert.equal(n, 3);
  assert.equal(rows.length, 30);
});
