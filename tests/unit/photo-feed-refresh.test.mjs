// Photo Feed refetch timing (app/(tabs)/watched.tsx + hooks/usePhotoFeed.ts).
// Run: node --experimental-strip-types --test tests/unit/photo-feed-refresh.test.mjs
//
// Signed photo URLs expire after 5 minutes but the Feed loaded them once per
// mount, so photos broke after five minutes on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshPhotoFeed, PHOTO_URL_REFRESH_MS, PHOTO_FEED_REVISIT_MS } from '../../lib/photo-feed-refresh.ts';
import { SIGNED_URL_TTL_SECONDS } from '../../lib/photo-types.ts';

test('periodic re-sign happens before the URLs expire', () => {
  assert.ok(PHOTO_URL_REFRESH_MS < SIGNED_URL_TTL_SECONDS * 1000);
  assert.ok(PHOTO_URL_REFRESH_MS >= 30_000, 'not a tight loop');
});

test('never loaded: refresh', () => {
  assert.equal(shouldRefreshPhotoFeed(null, 1_000), true);
});

test('quick tab flip back to Feed does not refetch', () => {
  assert.equal(shouldRefreshPhotoFeed(100_000, 100_000 + PHOTO_FEED_REVISIT_MS - 1), false);
});

test('returning after the revisit window refetches', () => {
  assert.equal(shouldRefreshPhotoFeed(100_000, 100_000 + PHOTO_FEED_REVISIT_MS), true);
  assert.equal(shouldRefreshPhotoFeed(0, SIGNED_URL_TTL_SECONDS * 1000 + 1), true);
});
