/**
 * Home tab shelf rules, ported from the website's home page
 * (src/app/page.tsx). The Home screen composes these; keeping them here,
 * free of React Native imports, lets tests/unit/home-shelves.test.mjs pin
 * each rule.
 */

import type { Show } from './types';
import { parseLocalDate, toLocalYMD } from './date-utils';

type ShelfShow = Pick<Show, 'status' | 'type' | 'openingDate' | 'closingDate' | 'previewsStartDate' | 'tags' | 'ageRecommendation'>;

// ─── Closing Soon ──────────────────────────────────────────────────────────

/** Web page.tsx: open shows closing within the next 120 days. */
export const CLOSING_SOON_DAYS = 120;

/** Whole calendar days from local `today` to a YYYY-MM-DD date. */
function calendarDaysFrom(today: Date, ymd: string): number | null {
  const target = parseLocalDate(ymd);
  if (!target) return null;
  const start = parseLocalDate(toLocalYMD(today));
  if (!start) return null;
  // Both at local noon, so a DST change cannot tip the rounding.
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Open (not previews, not upcoming) and closing between today and 120 days
 * out. Today counts: the shelf's countdown reads "Final show" for it.
 */
export function isClosingSoon(show: ShelfShow, now: Date = new Date()): boolean {
  if (show.status !== 'open' || !show.closingDate) return false;
  const days = calendarDaysFrom(now, show.closingDate);
  return days != null && days >= 0 && days <= CLOSING_SOON_DAYS;
}

export function selectClosingSoon<T extends ShelfShow>(shows: readonly T[], now: Date = new Date()): T[] {
  return shows
    .filter(s => isClosingSoon(s, now))
    .sort((a, b) => (a.closingDate ?? '').localeCompare(b.closingDate ?? ''));
}

// ─── Ranked shelves ────────────────────────────────────────────────────────

/** Score-ranked shelves leave opera out: it has its own shelf on the web and
 *  its tiny critic pool would otherwise crowd the Off-Broadway rankings. */
export function isRankedShelfEligible(show: Pick<Show, 'type'>): boolean {
  return show.type !== 'opera';
}

/** YYYY-MM-DD twelve calendar months before `now` (local), like the web's setMonth(-12). */
export function twelveMonthsAgoYMD(now: Date = new Date()): string {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - 12);
  return toLocalYMD(d);
}

/** Top Recent / Best Recent Shows: open musicals and plays that opened in the last 12 months. */
export function isTopRecentCandidate(show: ShelfShow, now: Date = new Date()): boolean {
  if (show.status !== 'open') return false;
  if (show.type !== 'musical' && show.type !== 'play') return false;
  if (!show.openingDate) return false;
  return show.openingDate.slice(0, 10) >= twelveMonthsAgoYMD(now);
}

const lowerTags = (show: Pick<Show, 'tags'>) => (show.tags ?? []).map(t => t.toLowerCase());

/** Date Night: romantic OR drama (tags compared case-insensitively), not a kids show. */
export function isDateNightShow(show: Pick<Show, 'tags' | 'ageRecommendation'>): boolean {
  const tags = lowerTags(show);
  if (!tags.includes('romantic') && !tags.includes('drama')) return false;
  const age = show.ageRecommendation?.toLowerCase() ?? '';
  const isKidsOnly = age.includes('ages 5') || age.includes('ages 6') || age.includes('ages 7') || age.includes('ages 8');
  return !isKidsOnly;
}

/** Case-insensitive tag test (the feed carries both 'family' and 'Family'). */
export function hasTagCI(show: Pick<Show, 'tags'>, tag: string): boolean {
  const want = tag.toLowerCase();
  return (show.tags ?? []).some(t => t.toLowerCase() === want);
}

// ─── Starting Soon ─────────────────────────────────────────────────────────

/** In previews, or upcoming with a known first-preview or opening date. */
export function isStartingSoon(show: ShelfShow): boolean {
  if (show.status === 'previews') return true;
  return show.status === 'upcoming' && !!(show.previewsStartDate || show.openingDate);
}

/** Next milestone: opening night for a show in previews, first preview (else opening) for an upcoming one. */
export function startingSoonDate(show: ShelfShow): string | null {
  if (show.status === 'previews') return show.openingDate || null;
  return show.previewsStartDate || show.openingDate || null;
}

export function selectStartingSoon<T extends ShelfShow>(shows: readonly T[]): T[] {
  const key = (s: T) => startingSoonDate(s) ?? '2099-01-01';
  return shows.filter(isStartingSoon).sort((a, b) => key(a).localeCompare(key(b)));
}

/** "Mar 5" for a stored calendar date, or null when it cannot be parsed. */
export function shortMonthDay(dateStr: string | null | undefined): string | null {
  const d = parseLocalDate(dateStr);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
}

/** Web subtitle: previews "Opens <opening>", upcoming "Starts <first preview or opening>". */
export function startingSoonSubtitle(show: ShelfShow): string | undefined {
  const d = shortMonthDay(startingSoonDate(show));
  if (!d) return undefined;
  return show.status === 'previews' ? `Opens ${d}` : `Starts ${d}`;
}
