/**
 * stats-reviews.json loader — per-show scored critic reviews for Aisle Mates /
 * Your Paper of Record (spec §5.1, v1.1).
 *
 * Same cache-first contract as lib/stats-canon-source.ts (mobile-shows.json
 * pattern): serve the cache instantly, refresh in the background when stale.
 * Unlike the canon, the Stats screen does NOT gate its first paint on this —
 * the artifact is ~290KB and the module it feeds is below the fold, so the
 * fetch runs in the background from mount and the module renders once it
 * resolves (useStatsReviews() below never blocks StatsScreen's ghost/canon
 * gates). Ratings never leave the phone: this file only ever fetches the
 * PUBLIC critic-review artifact; alignment is computed on-device in
 * lib/stats/align-critics.ts against the private diary.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StatsReviews } from '@/lib/stats';

const REVIEWS_URL = 'https://broadwayscorecard.com/data/stats-reviews.json';
const CACHE_KEY = '@bsc:stats-reviews';
const TIMESTAMP_KEY = '@bsc:stats-reviews-ts';
/** Reviews rebuild ~every 30min, but a half-day-stale copy is harmless for a
 *  discovery feature — matches the canon's staleness tolerance. */
const TTL_MS = 12 * 60 * 60 * 1000;

export const EMPTY_STATS_REVIEWS: StatsReviews = { critics: [], outlets: [], shows: {} };

function parseReviews(json: string): StatsReviews {
  const data = JSON.parse(json) as Partial<StatsReviews>;
  return {
    _v: data._v,
    critics: Array.isArray(data.critics) ? data.critics : [],
    outlets: Array.isArray(data.outlets) ? data.outlets : [],
    shows: data.shows && typeof data.shows === 'object' ? data.shows : {},
  };
}

async function isStale(): Promise<boolean> {
  const ts = await AsyncStorage.getItem(TIMESTAMP_KEY);
  if (!ts) return true;
  return Date.now() - parseInt(ts, 10) > TTL_MS;
}

async function fetchAndCache(): Promise<StatsReviews> {
  const res = await fetch(REVIEWS_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`Failed to fetch stats reviews (HTTP ${res.status})`);
  const json = await res.text();
  const parsed = parseReviews(json); // parse before caching — never cache garbage
  await AsyncStorage.multiSet([[CACHE_KEY, json], [TIMESTAMP_KEY, String(Date.now())]]).catch(
    () => {},
  );
  return parsed;
}

/**
 * Cache-first reviews load. Returns null (not EMPTY_STATS_REVIEWS) when
 * nothing is available yet — callers use null to distinguish "still loading /
 * offline with no cache" (module shows a brief loading state) from "loaded,
 * genuinely nothing shared" (module shows its own locked/cold-start copy).
 */
export async function loadStatsReviews(): Promise<StatsReviews | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = parseReviews(cached);
      if (await isStale()) fetchAndCache().catch(() => {});
      return parsed;
    }
  } catch {
    // Corrupt cache — fall through to the network.
  }
  try {
    return await fetchAndCache();
  } catch {
    return null;
  }
}
