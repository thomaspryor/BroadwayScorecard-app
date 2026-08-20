/**
 * Diary catalog (diary-search.json) — the ~33k unscored productions the web
 * merges into its import matcher.
 *
 * Why this exists: iOS matched imports against useShows()'s scored catalog
 * only (~1.6k productions), so anything Off-Broadway/immersive/regional/
 * touring came back "Not on Broadway Scorecard" even though the website
 * matched it fine. Owner, 2026-08-02: the Mezzanine and Show Score imports
 * "miss shows that ARE on the site" and are "inconsistent with the web
 * imports". Verified 2026-08-03: 22 of the 23 titles in the owner's
 * unmatched screenshots (Sleep No More, Life and Trust, The Big Gay Jamboree,
 * Lizard Boy, The Choir of Man, Standing at the Sky's Edge, …) are present in
 * diary-search.json and absent from search-shows.json.
 *
 * The file is ~7.5MB, so it is fetched only when an import actually runs, and
 * memoised for the rest of the session. A failed fetch degrades to the scored
 * catalog (previous behaviour) plus a notice, never to a hard error.
 */
import type { MatchCandidate } from './show-match';
import type { Show } from './types';
import { normalizeVenue } from './show-format';

export const DIARY_SEARCH_URL = 'https://broadwayscorecard.com/data/diary-search.json';

/** Shape of an entry in public/data/diary-search.json (web's
 *  scripts/generate-diary-data.js). Keys are abbreviated in the payload. */
export interface DiarySearchEntry {
  id: string;
  title: string;
  slug?: string;
  status?: string;
  venue?: string | null;
  city?: string | null;
  category?: string;
  /** Opening date. The payload carries no closing date. */
  od?: string | null;
  /** Audience ratings count — popularity, used only for ordering. */
  rc?: number;
  dy?: boolean;
}

export function showToCandidate(show: Show): MatchCandidate {
  return {
    id: show.id,
    title: show.title,
    slug: show.slug,
    venue: show.venue ?? null,
    category: show.category,
    openingDate: show.openingDate ?? null,
    closingDate: show.closingDate ?? null,
  };
}

export function diaryEntryToCandidate(entry: DiarySearchEntry): MatchCandidate {
  return {
    id: entry.id,
    title: entry.title,
    slug: entry.slug ?? entry.id,
    venue: entry.venue ? normalizeVenue(entry.venue) : null,
    category: entry.category ?? 'other',
    openingDate: entry.od ?? null,
    closingDate: null,
    city: entry.city ?? null,
    diaryOnly: true,
    ratingsCount: entry.rc ?? 0,
  };
}

/**
 * Port of the web's mergeDiaryShows (src/lib/show-import.ts).
 *
 * The dedup key is frozen from the BASE (scored) catalog only — never shadow a
 * scored production with an unscored diary duplicate, and never let an earlier
 * diary row suppress a later one (doing that silently dropped ~35% of the
 * diary catalog on the web, ship-check 2026-07-14). Each diary entry has its
 * own unique id, so diary-vs-diary "duplicates" are left in.
 */
export function mergeDiaryCandidates(
  base: MatchCandidate[],
  diary: DiarySearchEntry[],
): MatchCandidate[] {
  const merged = [...base];
  const baseVenues = new Map<string, Set<string>>();
  for (const s of base) {
    const key = s.title.toLowerCase();
    let set = baseVenues.get(key);
    if (!set) {
      set = new Set<string>();
      baseVenues.set(key, set);
    }
    if (s.venue) set.add(s.venue.toLowerCase());
  }

  for (const entry of diary) {
    const baseSet = baseVenues.get(entry.title.toLowerCase());
    // No venue to tell it apart and the title is already scored → skip.
    if (!entry.venue && baseSet) continue;
    // Same venue already covered by a scored production → skip.
    if (entry.venue && baseSet?.has(entry.venue.toLowerCase())) continue;
    merged.push(diaryEntryToCandidate(entry));
  }
  return merged;
}

let cached: DiarySearchEntry[] | null = null;
let inFlight: Promise<DiarySearchEntry[]> | null = null;

/** Give up rather than leave the import spinner going forever on a stalled
 *  connection — NSURLSession's own default is 60s of nothing. */
export const DIARY_FETCH_TIMEOUT_MS = 30_000;

/** Fetch (and memoise for the session) the diary catalog. Throws on failure —
 *  callers decide whether to degrade. */
export async function fetchDiaryCatalog(signal?: AbortSignal): Promise<DiarySearchEntry[]> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), DIARY_FETCH_TIMEOUT_MS);
    const onOuterAbort = () => timeout.abort();
    signal?.addEventListener('abort', onOuterAbort);
    try {
      const res = await fetch(DIARY_SEARCH_URL, { signal: timeout.signal });
      if (!res.ok) throw new Error(`diary-search.json returned ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('diary-search.json is not an array');
      // Never memoise an empty catalog — that would silently disable the merge
      // for the rest of the session.
      if (data.length === 0) throw new Error('diary-search.json is empty');
      cached = data as DiarySearchEntry[];
      return cached;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Test seam — drops the session memo. */
export function __resetDiaryCatalogCache() {
  cached = null;
  inFlight = null;
}
