/**
 * Pure helpers for the Theatr screenshot import (BRO-4618). Kept free of
 * React Native imports so tests/unit/theatr-import.test.mjs can load them
 * under plain node. Web twin: Broadwayscore src/lib/show-import.ts
 * (mergeTheatrRows / theatrRowsToEntries / theatrNotices); keep the two in step.
 *
 * Theatr has no data export and its profile pages and API need a Theatr
 * login, so the user picks screenshots of Profile → Collection → Attended /
 * Interested and the theatr-screenshot-import edge function reads them.
 */
import type { RawImportEntry } from './show-import';

export interface TheatrRow {
  title: string;
  venue: string | null;
  date: string | null;
  list: 'attended' | 'interested';
}

/** Mirror of the theatr-screenshot-import edge function's response contract
 *  (Broadwayscore supabase/functions/theatr-screenshot-import/index.ts,
 *  single-channel: always HTTP 200 with ok:false for handled failures). */
export interface TheatrScreenshotResponse {
  ok: boolean;
  error?: 'invalid_images' | 'too_many_images' | 'unauthorized' | 'rate_limited' | 'busy' | 'not_configured' | 'internal';
  entries?: TheatrRow[];
  unreadableImages?: number;
  dropped?: number;
}

export const THEATR_ERROR_COPY: Record<string, string> = {
  invalid_images: 'One of those images couldn’t be read as a screenshot. Pick your Theatr screenshots and try again.',
  too_many_images: 'Too many screenshots in one go. Try again with fewer.',
  unauthorized: 'Please sign in again and retry.',
  rate_limited: "You've hit the import limit for now. Try again in an hour.",
  busy: 'Theatr import is very busy today. Try again tomorrow.',
  not_configured: 'Theatr import isn’t available right now. Try again later.',
  internal: 'Something went wrong reading your screenshots. Try again in a few minutes.',
  no_shows: 'We couldn’t find any shows in those screenshots. In Theatr, open Profile, then Collection, then Attended (or Interested), and screenshot the list.',
};

/** Most screenshots per import; sent to the edge function in batches. */
export const THEATR_MAX_SCREENSHOTS = 30;
/** Must not exceed MAX_IMAGES_PER_CALL in the edge function's normalize.mjs. */
export const THEATR_BATCH_SIZE = 6;
/** Claude reads images at up to ~1568px on the long edge. */
export const THEATR_MAX_EDGE = 1568;

/** Split a list into consecutive batches of `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Collapse rows repeated across overlapping screenshots, keeping screenshot
 * order. Same rule as the edge function's per-batch pass (normalize.mjs) and
 * the web's mergeTheatrRows: one row per list + title + date, and an undated
 * Attended row folds into a dated row for the same title (its date was just
 * cropped off), so it can't race the dated copy into the watchlist.
 */
export function mergeTheatrRows(rows: TheatrRow[]): TheatrRow[] {
  const out: TheatrRow[] = [];
  const byKey = new Map<string, TheatrRow>();
  const titleKey = (r: TheatrRow) => `${r.list}|${r.title.toLowerCase()}`;
  const datedTitles = new Set(rows.filter((r) => r.list === 'attended' && r.date).map(titleKey));
  for (const r of rows) {
    const undatedDup = r.list === 'attended' && !r.date && datedTitles.has(titleKey(r));
    const key = undatedDup ? null : `${titleKey(r)}|${r.date || ''}`;
    const prev = key ? byKey.get(key) : out.find((o) => titleKey(o) === titleKey(r) && o.date);
    if (prev) {
      if (!prev.venue && r.venue) prev.venue = r.venue;
      continue;
    }
    if (!key) continue; // dated copy not reached yet: it will carry the row
    const copy = { ...r };
    byKey.set(key, copy);
    out.push(copy);
  }
  return out;
}

/** Error code for a failed functions.invoke: the gateway's own 401 (expired
 *  session, verify_jwt) must read as "sign in again", not "try later". */
export function invokeErrorCode(error: unknown): string {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 401 ? 'unauthorized' : 'internal';
}

/**
 * Map Theatr rows onto the shared import contract. Theatr reactions are
 * like / mixed / dislike, not star ratings, so attended shows carry no rating
 * and land in To Be Rated (the importer files unrated diary rows as dated
 * watchlist rows) rather than getting a guessed score.
 */
export function theatrRowsToEntries(rows: TheatrRow[]): RawImportEntry[] {
  return rows.map((r) => r.list === 'attended'
    ? { title: r.title, venue: r.venue, rating: null, sourceScore: null, date: r.date, reviewText: null, kind: 'diary' as const }
    : { title: r.title, venue: r.venue, rating: null, sourceScore: null, date: null, reviewText: null, kind: 'watchlist' as const, listName: 'Interested' });
}

/** Preview notices for a finished Theatr read. */
export function theatrNotices(
  entries: RawImportEntry[],
  counts: { picked: number; failedScreenshots: number; unreadable: number },
): string[] {
  const notices: string[] = [];
  if (counts.picked > THEATR_MAX_SCREENSHOTS) {
    notices.push(`Only the first ${THEATR_MAX_SCREENSHOTS} screenshots were read. Run the import again for the rest.`);
  }
  if (counts.failedScreenshots > 0) {
    notices.push(`${counts.failedScreenshots} screenshot(s) couldn’t be read this time, so some shows may be missing. You can import them again later.`);
  }
  if (counts.unreadable > 0) {
    notices.push(`${counts.unreadable} image(s) didn’t look like a Theatr collection and were skipped.`);
  }
  const attended = entries.filter((e) => e.kind === 'diary');
  if (attended.length > 0) {
    notices.push('Theatr reactions aren’t star ratings, so seen shows import to To Be Rated, where you can rate them.');
  }
  const undated = attended.filter((e) => !e.date).length;
  if (undated > 0) {
    notices.push(`${undated} seen show(s) had no readable date and will land on your watchlist instead. You can rate them from there.`);
  }
  return notices;
}
