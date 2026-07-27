/**
 * stats-canon.json loader — Tony ceremony dates + Best Musical/Play winners.
 *
 * Mirrors the mobile-shows.json contract exactly (lib/api.ts + lib/cache.ts):
 * fetch from the same CDN, cache the raw JSON in AsyncStorage, serve the cache
 * instantly and refresh in the background when stale. Ceremony dates define the
 * scope pill's season boundaries, so the Stats screen must render from cache on
 * a cold/offline launch rather than block on the network.
 *
 * theater-houses.json is NOT fetched — it is vendored (lib/stats/), because the
 * web repo never publishes data/theater-metadata.json to the CDN.
 *
 * stats-reviews.json is deliberately NOT wired here: Aisle Mates / Paper of
 * Record are v1.1 (plan Sprint 6), and the artifact is ~290KB.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StatsCanon } from '@/lib/stats';
import houses from '@/lib/stats/theater-houses.json';

const CANON_URL = 'https://broadwayscorecard.com/data/stats-canon.json';
const CACHE_KEY = '@bsc:stats-canon';
const TIMESTAMP_KEY = '@bsc:stats-canon-ts';
/** Ceremony dates move once a year; a day-stale copy is harmless. */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Broadway houses in the completion-ring denominator, keyed by canonical venue
 * name. Vendored slice of the web repo's data/theater-metadata.json.
 */
export const THEATER_HOUSES = houses as Record<
  string,
  { capacity?: number; yearBuilt?: number; formerNames?: string[] }
>;

export const HOUSE_NAMES = Object.keys(THEATER_HOUSES);

/** Empty canon — season scoping degrades to calendar years, nothing crashes. */
export const EMPTY_CANON: StatsCanon = { ceremonies: [], bestMusical: [], bestPlay: [] };

function parseCanon(json: string): StatsCanon {
  const data = JSON.parse(json) as Partial<StatsCanon>;
  return {
    _v: data._v,
    ceremonies: Array.isArray(data.ceremonies) ? data.ceremonies : [],
    bestMusical: Array.isArray(data.bestMusical) ? data.bestMusical : [],
    bestPlay: Array.isArray(data.bestPlay) ? data.bestPlay : [],
  };
}

async function isStale(): Promise<boolean> {
  const ts = await AsyncStorage.getItem(TIMESTAMP_KEY);
  if (!ts) return true;
  return Date.now() - parseInt(ts, 10) > TTL_MS;
}

async function fetchAndCache(): Promise<StatsCanon> {
  const res = await fetch(CANON_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`Failed to fetch stats canon (HTTP ${res.status})`);
  const json = await res.text();
  const parsed = parseCanon(json); // parse before caching — never cache garbage
  await AsyncStorage.multiSet([[CACHE_KEY, json], [TIMESTAMP_KEY, String(Date.now())]]).catch(
    () => {},
  );
  return parsed;
}

/**
 * Cache-first canon load.
 *
 * Returns the cached copy immediately when present, kicking off a background
 * refresh if it's stale. Falls back to EMPTY_CANON when there's no cache and
 * the network fails — the caller renders calendar-year scopes only.
 */
export async function loadStatsCanon(): Promise<StatsCanon> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = parseCanon(cached);
      if (await isStale()) fetchAndCache().catch(() => {});
      return parsed;
    }
  } catch {
    // Corrupt cache — fall through to the network.
  }
  try {
    return await fetchAndCache();
  } catch {
    return EMPTY_CANON;
  }
}
