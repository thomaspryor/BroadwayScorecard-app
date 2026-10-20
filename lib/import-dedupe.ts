/**
 * Duplicate guard for the bulk import (app/import.tsx). No React Native
 * imports so it runs under `node --test`.
 *
 * The `reviews` table has no unique constraint (several viewings of one show
 * are allowed), so the database never rejects a repeat. Before this, a resumed
 * import replayed rows that had landed before the app was killed, and a second
 * import of the same Mezzanine file doubled every diary entry. A viewing is
 * the same viewing when the show and the date seen match.
 */

export interface ReviewKeyRow {
  show_id: string;
  date_seen: string | null;
}

/** Same show + same date seen (or both undated) = the same viewing. */
export function reviewDedupeKey(showId: string, dateSeen: string | null | undefined): string {
  return `${showId}|${dateSeen || ''}`;
}

export function buildReviewKeySet(rows: readonly ReviewKeyRow[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r && typeof r.show_id === 'string') keys.add(reviewDedupeKey(r.show_id, r.date_seen));
  }
  return keys;
}

/**
 * Checks one review plan against the keys already in the account and records
 * it, so two identical rows in the same file are caught too. Returns true
 * when the plan should be skipped.
 */
export function claimReviewKey(keys: Set<string>, showId: string, dateSeen: string | null | undefined): boolean {
  const key = reviewDedupeKey(showId, dateSeen);
  if (keys.has(key)) return true;
  keys.add(key);
  return false;
}

/** PostgREST caps a response at its max-rows (1000 on Supabase). */
export const REVIEW_KEY_PAGE_SIZE = 1000;
/** 50 pages = 50,000 diary rows; past that, stop rather than loop forever. */
export const REVIEW_KEY_MAX_PAGES = 50;

/**
 * Pages through `fetchPage` until a short page comes back. Returns null when
 * any page fails, so the caller can fall back instead of trusting half a list.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[] | null>,
  pageSize: number = REVIEW_KEY_PAGE_SIZE,
  maxPages: number = REVIEW_KEY_MAX_PAGES,
): Promise<T[] | null> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await fetchPage(page * pageSize, pageSize);
    if (!rows) return null;
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  return out;
}
