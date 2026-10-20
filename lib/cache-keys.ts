/**
 * Which AsyncStorage keys Settings → "Clear cache" may delete.
 *
 * It used to call AsyncStorage.clear() and restore three hand-picked keys,
 * which also wiped everything that is NOT a cache: a signed-out user's saved
 * shows (@bsc:local_watchlist), edits waiting to sync (@bsc:offlineQueue,
 * @bsc:photoUploadQueue), the chosen market, the welcome-seen flag and the
 * imported diary titles. A "clear cache" tap could lose real user data.
 *
 * This is an ALLOWLIST of data the app can download again. A key not listed
 * here survives, so a new kind of stored state is safe by default; a new cache
 * has to be added here on purpose. Pure (no React Native imports) so
 * tests/unit/cache-keys.test.mjs can load it.
 */

/** Exact keys holding re-downloadable data. */
const CACHE_KEYS: ReadonlySet<string> = new Set([
  'mobile-shows-data', // lib/cache.ts: the show feed
  'mobile-shows-timestamp',
  'related-picks-data',
  '@bsc:stats-canon', // lib/stats-canon-source.ts
  '@bsc:stats-canon-ts',
  '@bsc:stats-reviews', // lib/stats-reviews-source.ts
  '@bsc:stats-reviews-ts',
]);

/** Key prefixes holding re-downloadable data. The three account prefixes are
 *  copies of server rows (hooks/useUserReviews, useWatchlist, useUserLists),
 *  read back from the server on the next open; edits that have not reached the
 *  server live in the offline queue, which is never cleared here. */
const CACHE_PREFIXES: readonly string[] = [
  'show-detail-', // lib/cache.ts: per-show detail
  '@bsc:reviews:',
  '@bsc:watchlist:',
  '@bsc:lists:',
];

export function isClearableCacheKey(key: string): boolean {
  if (CACHE_KEYS.has(key)) return true;
  return CACHE_PREFIXES.some(prefix => key.startsWith(prefix) && key.length > prefix.length);
}

/** The subset of `keys` that "Clear cache" should remove. */
export function cacheKeysToClear(keys: readonly string[]): string[] {
  return keys.filter(isClearableCacheKey);
}
