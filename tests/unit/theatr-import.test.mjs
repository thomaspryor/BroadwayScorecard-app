// Run with: node --experimental-strip-types --test tests/unit/theatr-import.test.mjs
// BRO-4618: Theatr screenshot import. Theatr reactions aren't star ratings,
// so attended rows must never carry a rating (they land in To Be Rated),
// Interested rows become dateless watchlist rows, and rows repeated across
// overlapping screenshot batches collapse to one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunk,
  mergeTheatrRows,
  invokeErrorCode,
  theatrRowsToEntries,
  theatrNotices,
  THEATR_BATCH_SIZE,
  THEATR_MAX_SCREENSHOTS,
} from '../../lib/theatr-import.ts';

test('attended rows become unrated diary entries with their date', () => {
  const [e] = theatrRowsToEntries([{ title: 'Hadestown', venue: 'Walter Kerr Theatre', date: '2023-09-02', list: 'attended' }]);
  assert.equal(e.kind, 'diary');
  assert.equal(e.rating, null);
  assert.equal(e.date, '2023-09-02');
});

test('interested rows become dateless watchlist entries', () => {
  const [e] = theatrRowsToEntries([{ title: 'Oh, Mary!', venue: null, date: '2025-01-01', list: 'interested' }]);
  assert.equal(e.kind, 'watchlist');
  assert.equal(e.date, null);
  assert.equal(e.listName, 'Interested');
});

test('dedupe collapses repeats, keeps a venue from either copy, keeps distinct viewings', () => {
  const rows = mergeTheatrRows([
    { title: 'Six', venue: null, date: '2024-04-01', list: 'attended' },
    { title: 'SIX', venue: 'Lena Horne Theatre', date: '2024-04-01', list: 'attended' },
    { title: 'Six', venue: null, date: '2025-02-01', list: 'attended' },
    { title: 'Six', venue: null, date: null, list: 'interested' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].venue, 'Lena Horne Theatre');
});

test('chunk splits a 30-screenshot pick into edge-function-sized batches', () => {
  const batches = chunk(Array.from({ length: THEATR_MAX_SCREENSHOTS }, (_, i) => i), THEATR_BATCH_SIZE);
  assert.equal(batches.length, 5);
  assert.ok(batches.every(b => b.length <= 6));
});

test('notices explain To Be Rated, undated rows, truncation and failures', () => {
  const entries = theatrRowsToEntries([
    { title: 'A', venue: null, date: '2024-01-01', list: 'attended' },
    { title: 'B', venue: null, date: null, list: 'attended' },
  ]);
  const n = theatrNotices(entries, { picked: 35, failedScreenshots: 6, unreadable: 1 });
  assert.equal(n.length, 5);
  assert.match(n.join(' '), /To Be Rated/);
  assert.match(n.join(' '), /first 30 screenshots/);
  assert.equal(theatrNotices([], { picked: 3, failedScreenshots: 0, unreadable: 0 }).length, 0);
});

test('an undated attended copy folds into the dated one in either order', () => {
  for (const rows of [
    [{ title: 'Six', venue: null, date: null, list: 'attended' }, { title: 'Six', venue: null, date: '2024-04-01', list: 'attended' }],
    [{ title: 'Six', venue: null, date: '2024-04-01', list: 'attended' }, { title: 'six', venue: 'Lena Horne', date: null, list: 'attended' }],
  ]) {
    assert.deepEqual(mergeTheatrRows(rows).map(r => r.date), ['2024-04-01']);
  }
});

test('a gateway 401 maps to the sign-in copy, anything else to internal', () => {
  assert.equal(invokeErrorCode({ context: { status: 401 } }), 'unauthorized');
  assert.equal(invokeErrorCode({ context: { status: 546 } }), 'internal');
  assert.equal(invokeErrorCode(null), 'internal');
});
