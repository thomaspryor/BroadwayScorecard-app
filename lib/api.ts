/**
 * API layer for fetching show data from the CDN.
 *
 * Broadway Scorecard has no REST API — data is a static JSON file
 * generated at build time and served from the web CDN.
 *
 * Show detail responses are cached to AsyncStorage for offline use, capped
 * at the DETAIL_CACHE_CAP most recently viewed shows.
 *
 * Every request has a timeout (lib/fetch-utils.ts): a stalled connection
 * fails over to the cache instead of leaving a spinner up forever.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCachedDetail, getCachedDetail, setCachedRelatedPicks } from './cache';
import { DEFAULT_TIMEOUT_MS, fetchWithTimeout, parseLruIndex, singleFlight, touchLru } from './fetch-utils';

// Dev override so a locally-generated data build can be previewed in the
// simulator (e.g. EXPO_PUBLIC_DATA_BASE=http://localhost:8090). Baked at
// bundle time; unset in production builds.
const CDN_BASE = process.env.EXPO_PUBLIC_DATA_BASE || 'https://broadwayscorecard.com/data';
const SHOWS_URL = `${CDN_BASE}/mobile-shows.json`;
const NO_CACHE: RequestInit = { headers: { 'Cache-Control': 'no-cache' } };

/** The catalog is ~2 MB uncompressed, so it gets a little longer than the default. */
const SHOWS_TIMEOUT_MS = 20_000;

// ─── Show-detail cache cap ────────────────────────────────────────────────
// Must equal DETAIL_PREFIX in lib/cache.ts (tests/unit/fetch-utils.test.mjs
// checks): eviction deletes the keys setCachedDetail wrote.
const DETAIL_PREFIX = 'show-detail-';
/** Deliberately NOT under DETAIL_PREFIX, so it can never be mistaken for a show. */
const DETAIL_LRU_KEY = 'detail-cache-lru-v1';
export const DETAIL_CACHE_CAP = 50;

let lruQueue: Promise<void> = Promise.resolve();

/** Mark a show's cached detail as just used; delete the least recently used beyond the cap. */
function recordDetailUse(showId: string): void {
  lruQueue = lruQueue
    .then(async () => {
      let index = parseLruIndex(await AsyncStorage.getItem(DETAIL_LRU_KEY));
      if (index == null) {
        // First run with the cap: adopt details cached before it existed.
        const keys = await AsyncStorage.getAllKeys();
        index = keys.filter(k => k.startsWith(DETAIL_PREFIX)).map(k => k.slice(DETAIL_PREFIX.length));
      }
      const { next, evicted } = touchLru(index, showId, DETAIL_CACHE_CAP);
      await AsyncStorage.setItem(DETAIL_LRU_KEY, JSON.stringify(next));
      if (evicted.length > 0) await AsyncStorage.multiRemove(evicted.map(id => DETAIL_PREFIX + id));
    })
    .catch(() => {});
}

async function requestMobileShows(): Promise<string> {
  return fetchWithTimeout(SHOWS_URL, NO_CACHE, async response => {
    if (!response.ok) {
      throw new Error(`Failed to fetch shows (HTTP ${response.status})`);
    }
    return response.text();
  }, SHOWS_TIMEOUT_MS);
}

/**
 * Fetch mobile show data from the CDN.
 * Returns the raw JSON string (caller handles parsing).
 * Throws on network or HTTP errors, and on a timeout.
 * Overlapping calls (cold launch racing a pull-to-refresh) share one request.
 */
export const fetchMobileShows: () => Promise<string> = singleFlight(requestMobileShows);

/**
 * Fetch per-show detail data from the CDN.
 * Caches responses for offline use.
 * Falls back to cache on network failure.
 * Returns null on 404 (show detail not generated yet).
 */
export async function fetchShowDetail(showId: string): Promise<object | null> {
  try {
    const url = `${CDN_BASE}/shows/${encodeURIComponent(showId)}.json`;
    const data = await fetchWithTimeout(url, NO_CACHE, async response => {
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Failed to fetch show detail (HTTP ${response.status})`);
      }
      return (await response.json()) as object;
    }, DEFAULT_TIMEOUT_MS);
    if (data == null) return null;
    // Cache for offline use (fire and forget), then bump it in the LRU.
    setCachedDetail(showId, data).then(() => recordDetailUse(showId), () => {});
    return data;
  } catch {
    // Network failure or timeout: try cache
    const cached = await getCachedDetail(showId).catch(() => null);
    if (cached) recordDetailUse(showId);
    return cached;
  }
}

/**
 * Fetch social pulse data for a show from the CDN.
 * Returns null on 404 or network failure (many shows have no social data).
 */
export async function fetchSocialPulse(showId: string): Promise<object | null> {
  try {
    const url = `${CDN_BASE}/shows/${encodeURIComponent(showId)}.social.json`;
    return await fetchWithTimeout(url, NO_CACHE, async response => {
      if (!response.ok) return null;
      return (await response.json()) as object;
    });
  } catch {
    return null;
  }
}

/**
 * Fetch the curated "shows you might like" picks (~30 KB gzip) from the CDN.
 * Returns the raw JSON string, or null on 404 / network failure: the show screen
 * then uses its own ranking (lib/related-shows.ts), so this is never required.
 */
export async function fetchRelatedPicks(): Promise<string | null> {
  try {
    const raw = await fetchWithTimeout(`${CDN_BASE}/related-shows-mobile.json`, NO_CACHE, async response => {
      if (!response.ok) return null;
      return response.text();
    });
    if (raw == null) return null;
    setCachedRelatedPicks(raw).catch(() => {});
    return raw;
  } catch {
    return null;
  }
}
