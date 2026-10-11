/**
 * Pure helpers for the Theatr screenshot import (BRO-4618, BRO-5082). Kept free of
 * React Native imports so tests/unit/theatr-import.test.mjs can load them
 * under plain node. Web twin: Broadwayscore src/lib/show-import.ts
 * (resolveFeedDates / dropBackfillDates / mergeTheatrRows / theatrRowsToEntries /
 * theatrRowsPipeline / theatrNotices); keep the two in step.
 *
 * Theatr has no data export and its profile pages and API need a Theatr
 * login, so the user picks screenshots of Profile → Activity (or Collection →
 * Attended / Interested) and the theatr-screenshot-import edge function reads
 * them: shows, feed dates, reactions, and the user's own reviews and scores.
 */
import type { RawImportEntry } from './show-import';

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
  no_shows: 'We couldn’t find any shows in those screenshots. In Theatr, open Profile, then Activity, and screenshot the feed from the top as you scroll down.',
};

/** Most screenshots per import; sent to the edge function in batches. */
export const THEATR_MAX_SCREENSHOTS = 30;
/** Must not exceed MAX_IMAGES_PER_CALL in the edge function's normalize.mjs. */
export const THEATR_BATCH_SIZE = 6;
/** Claude reads images at up to ~1568px on the long edge. */
export const THEATR_MAX_EDGE = 1568;

export interface TheatrRow {
  title: string;
  venue: string | null;
  list: 'attended' | 'interested';
  /** Which Theatr screen the row was read from. */
  screen: 'activity' | 'collection' | 'other';
  /** Full date printed for the item (a "Date attended"), or after
   *  resolveFeedDates, the Activity feed date the item was logged under. */
  date: string | null;
  /** Activity feed date header (MM-DD); the feed omits the year. */
  monthDay: string | null;
  /** Year from a year divider above the item, when one was visible. */
  yearHint: number | null;
  /** The user's own written score as 0-100, and its half-star rating. */
  score: number | null;
  rating: number | null;
  review: string | null;
  reaction: 'recommend' | 'mixed' | 'dislike' | null;
  /** Set by resolveFeedDates when `date` came from the feed header. */
  dateFromFeed?: boolean;
}

/**
 * Give Activity feed rows a full date. The feed is newest first and prints
 * "Oct 12" with no year; a bare year line ("2025") appears only where an
 * older year begins. Walking rows in screenshot order: a row with no header
 * of its own sits under the last header seen (its header scrolled off into
 * the previous screenshot); a year divider sets the year; otherwise the year
 * starts at today's (last year's when the date is still ahead of today) and
 * drops by one whenever the month/day goes UP, which in a newest-first feed
 * means the walk crossed into the previous year.
 */
export function resolveFeedDates(rows: TheatrRow[], today: string): TheatrRow[] {
  const todayYear = Number(today.slice(0, 4));
  // Two days of slack: a user ahead of the device's clock (or of UTC) can
  // log "Oct 12" while "today" still reads Oct 11.
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
  let year: number | null = null;
  let lastMd: string | null = null;
  return rows.map((r) => {
    if (r.screen !== 'activity' || r.date) return { ...r };
    const md = r.monthDay || lastMd;
    if (!md) return { ...r };
    if (r.yearHint) year = r.yearHint;
    else if (year === null) year = `${todayYear}-${md}` > limit ? todayYear - 1 : todayYear;
    else if (lastMd && md > lastMd) year -= 1;
    lastMd = md;
    const date = `${year}-${md}`;
    // 02-29 in a non-leap year: the walk guessed the year wrong, so no date.
    const valid = !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).getUTCDate() === Number(md.slice(3));
    return { ...r, date: valid && r.list === 'attended' ? date : null, dateFromFeed: valid && r.list === 'attended' };
  });
}

/** A day with this many Attended entries is a backfill session (the user
 *  logging old shows), not a day of theatre, so its feed date is dropped. */
export const THEATR_BACKFILL_MIN = 3;

/** Drop feed dates on backfill days; returns how many were dropped. */
export function dropBackfillDates(rows: TheatrRow[]): { rows: TheatrRow[]; dropped: number } {
  const perDay = new Map<string, number>();
  for (const r of rows) if (r.dateFromFeed && r.date) perDay.set(r.date, (perDay.get(r.date) || 0) + 1);
  let dropped = 0;
  const out = rows.map((r) => {
    if (r.dateFromFeed && r.date && (perDay.get(r.date) || 0) >= THEATR_BACKFILL_MIN) {
      dropped++;
      return { ...r, date: null, dateFromFeed: false };
    }
    return r;
  });
  return { rows: out, dropped };
}

/**
 * Collapse rows repeated across overlapping screenshots, keeping screenshot
 * order: one row per list + title + date, and an undated Attended row folds
 * into a dated row for the same title (its date was just cropped off). A
 * repeat fills in whatever the kept copy lacked (venue, score, review).
 */
export function mergeTheatrRows(rows: TheatrRow[]): TheatrRow[] {
  const out: TheatrRow[] = [];
  const byKey = new Map<string, TheatrRow>();
  const titleKey = (r: TheatrRow) => `${r.list}|${r.title.toLowerCase()}`;
  const datedTitles = new Set(rows.filter((r) => r.list === 'attended' && r.date).map(titleKey));
  const fill = (into: TheatrRow, from: TheatrRow) => {
    if (!into.venue && from.venue) into.venue = from.venue;
    if (into.score === null && from.score !== null) { into.score = from.score; into.rating = from.rating; }
    if (!into.review && from.review) into.review = from.review;
    if (!into.reaction && from.reaction) into.reaction = from.reaction;
  };
  const pending: TheatrRow[] = [];
  for (const r of rows) {
    const undatedDup = r.list === 'attended' && !r.date && datedTitles.has(titleKey(r));
    if (undatedDup) {
      const prev = out.find((o) => titleKey(o) === titleKey(r) && o.date);
      if (prev) fill(prev, r);
      else pending.push(r); // its dated copy comes later
      continue;
    }
    const key = `${titleKey(r)}|${r.date || ''}`;
    const prev = byKey.get(key);
    if (prev) { fill(prev, r); continue; }
    const copy = { ...r };
    byKey.set(key, copy);
    out.push(copy);
  }
  for (const r of pending) {
    const dated = out.find((o) => titleKey(o) === titleKey(r) && o.date);
    if (dated) fill(dated, r);
  }
  return out;
}

/** Split a list into consecutive batches of `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A 0.5-5 half-star rating, or null: the edge function's output is checked
 *  again here so a contract drift can never write an off-scale rating. */
function halfStar(v: number | null): number | null {
  return typeof v === 'number' && v >= 0.5 && v <= 5 && Number.isInteger(v * 2) ? v : null;
}

/**
 * Map Theatr rows onto the shared import contract. A score the user wrote in
 * their review ("84/100") becomes the rating, with the review as review text.
 * A bare reaction (like / mixed / dislike) is not a star rating, so those
 * shows import unrated and land in To Be Rated rather than get a guess.
 */
export function theatrRowsToEntries(rows: TheatrRow[]): RawImportEntry[] {
  return rows.map((r) => r.list === 'attended'
    ? { title: r.title, venue: r.venue, rating: halfStar(r.rating), sourceScore: r.score, date: r.date, reviewText: r.review, kind: 'diary' as const }
    : { title: r.title, venue: r.venue, rating: null, sourceScore: null, date: null, reviewText: null, kind: 'watchlist' as const, listName: 'Interested' });
}

/** The whole client-side pipeline after the edge function: feed dates,
 *  backfill days, repeats, then import entries. */
export function theatrRowsPipeline(rows: TheatrRow[], today: string): { entries: RawImportEntry[]; feedDates: number; backfillDropped: number } {
  const dated = resolveFeedDates(rows, today);
  const { rows: cleaned, dropped } = dropBackfillDates(dated);
  const merged = mergeTheatrRows(cleaned);
  return {
    entries: theatrRowsToEntries(merged),
    feedDates: merged.filter((r) => r.dateFromFeed && r.date).length,
    backfillDropped: dropped,
  };
}

/** Preview notices for a finished Theatr read. */
export function theatrNotices(
  entries: RawImportEntry[],
  counts: { picked: number; failedScreenshots: number; unreadable: number; feedDates?: number; backfillDropped?: number },
): string[] {
  const notices: string[] = [];
  if (counts.picked > THEATR_MAX_SCREENSHOTS) {
    notices.push(`Only the first ${THEATR_MAX_SCREENSHOTS} screenshots were read. Run the import again for the rest.`);
  }
  if (counts.failedScreenshots > 0) {
    notices.push(`${counts.failedScreenshots} screenshot(s) couldn’t be read this time, so some shows may be missing. You can import them again later.`);
  }
  if (counts.unreadable > 0) {
    notices.push(`${counts.unreadable} image(s) didn’t look like a Theatr profile and were skipped.`);
  }
  const attended = entries.filter((e) => e.kind === 'diary');
  const scored = attended.filter((e) => e.rating !== null).length;
  if (scored > 0) {
    notices.push(`${scored} show(s) have a score in your review (like 84/100). It becomes the nearest half-star, and your review comes too.`);
  }
  if (attended.some((e) => e.rating === null && e.date)) {
    notices.push('Shows with only a Theatr reaction (no written score) import to To Be Rated, where you can rate them.');
  }
  if (counts.feedDates || counts.backfillDropped) {
    notices.push(`Dates are when you logged each show in Theatr, so check them.${counts.backfillDropped ? ' A day you logged several shows at once isn’t used.' : ''}`);
  }
  const undatedUnrated = attended.filter((e) => !e.date && e.rating === null).length;
  if (undatedUnrated > 0) {
    notices.push(`${undatedUnrated} seen show(s) have no date or score, so they go to your watchlist. You can rate them from there.`);
  }
  return notices;
}

/** Error code for a failed functions.invoke: the gateway's own 401 (expired
 *  session, verify_jwt) must read as "sign in again", not "try later". */
export function invokeErrorCode(error: unknown): string {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 401 ? 'unauthorized' : 'internal';
}
