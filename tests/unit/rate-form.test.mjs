// Rating sheet dirty check and save-error copy (app/rate/[showId].tsx).
// Run: node --experimental-strip-types --test tests/unit/rate-form.test.mjs
//
// Swiping the rating sheet down used to throw away stars, notes and photos
// with no prompt: dirty lived in a ref, so it could not drive the native
// dismiss guard. The sheet now compares the form against a baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRateFormDirty,
  friendlySaveError,
  RATING_GONE_MESSAGE,
  OFFLINE_SAVE_MESSAGE,
  CONNECTION_SAVE_MESSAGE,
} from '../../lib/rate-form.ts';

const base = { rating: 4, text: 'Loved it', date: '2026-10-01', stagedCount: 0 };

test('untouched form is clean', () => {
  assert.equal(isRateFormDirty(base, { ...base }), false);
});

test('still loading (no baseline) is never dirty', () => {
  assert.equal(isRateFormDirty(null, { rating: 3, text: 'x', date: '', stagedCount: 2 }), false);
});

test('rating change is dirty, including clearing to null', () => {
  assert.equal(isRateFormDirty(base, { ...base, rating: 4.5 }), true);
  assert.equal(isRateFormDirty(base, { ...base, rating: null }), true);
});

test('text edits count, whitespace-only differences do not', () => {
  assert.equal(isRateFormDirty(base, { ...base, text: 'Loved it!' }), true);
  assert.equal(isRateFormDirty(base, { ...base, text: '  Loved it \n' }), false);
});

test('typing then undoing returns to clean', () => {
  const typed = { ...base, text: 'Loved it, saw it twice' };
  assert.equal(isRateFormDirty(base, typed), true);
  assert.equal(isRateFormDirty(base, { ...typed, text: 'Loved it' }), false);
});

test('date change or clear is dirty', () => {
  assert.equal(isRateFormDirty(base, { ...base, date: '2026-09-30' }), true);
  assert.equal(isRateFormDirty(base, { ...base, date: '' }), true);
});

test('a staged photo is dirty even with nothing else changed', () => {
  assert.equal(isRateFormDirty(base, { ...base, stagedCount: 1 }), true);
});

test('new rating opened from a star tap starts clean at that rating', () => {
  const fresh = { rating: 3.5, text: '', date: '2026-10-20', stagedCount: 0 };
  assert.equal(isRateFormDirty(fresh, { ...fresh }), false);
  assert.equal(isRateFormDirty(fresh, { ...fresh, rating: 4 }), true);
});

test('offline save shows the offline message, not the session error', () => {
  assert.equal(friendlySaveError('No valid session. Please sign in again.', false), OFFLINE_SAVE_MESSAGE);
  assert.equal(friendlySaveError('Network request failed', false), OFFLINE_SAVE_MESSAGE);
});

test('online network failure gets a retry message', () => {
  assert.equal(friendlySaveError('Network request failed', true), CONNECTION_SAVE_MESSAGE);
  assert.equal(friendlySaveError('TypeError: Failed to fetch', true), CONNECTION_SAVE_MESSAGE);
});

test('deleted-elsewhere message passes through unchanged', () => {
  assert.equal(friendlySaveError(RATING_GONE_MESSAGE, true), RATING_GONE_MESSAGE);
});

test('other server errors keep their detail', () => {
  assert.equal(friendlySaveError('HTTP 500', true), 'Save failed: HTTP 500');
  assert.equal(friendlySaveError('No valid session. Please sign in again.', true),
    'Save failed: No valid session. Please sign in again.');
});

test('a retried insert that hits its own primary key counts as saved', async () => {
  const { isOwnInsertDuplicate } = await import('../../lib/rate-form.ts');
  const pk = { code: '23505', message: 'duplicate key value violates unique constraint "reviews_pkey"' };
  assert.equal(isOwnInsertDuplicate(pk), true);
  assert.equal(isOwnInsertDuplicate({ code: '23505', message: 'duplicate key value violates unique constraint "reviews_user_show_key"' }), false);
  assert.equal(isOwnInsertDuplicate({ code: '42501', message: 'row-level security "reviews_pkey"' }), false);
  assert.equal(isOwnInsertDuplicate(null), false);
});

test('rate sheet: fixed insert id per sheet, and no dismissal while saving', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../app/rate/[showId].tsx', import.meta.url), 'utf8');
  assert.match(src, /newReviewIdRef\.current \?\?= Crypto\.randomUUID\(\)/);
  assert.match(src, /supabaseRestInsert<\{ id: string \}>\('reviews', \{\n\s+id: newId,/);
  assert.match(src, /usePreventRemove\(isDirty \|\| saving,/);
  assert.match(src, /if \(savingRef\.current\) return;\n/);
  assert.match(src, /if \(!mountedRef\.current\) return;\n\s+bypassGuardRef\.current = true;/);
});
