/**
 * Where a watchlist entry belongs — the ONE definition shared by the To Watch
 * tab and the Watched tab (pure, no react-native import, so
 * tests/unit/watchlist-sections.test.mjs can load it under
 * --experimental-strip-types).
 *
 * The two tabs used to each write their own filter, and they disagreed: To
 * Watch showed every future-dated entry, while Watched additionally dropped
 * any entry whose show already had a review. A show you've seen before and
 * booked again therefore appeared on To Watch's Upcoming shelf and nowhere on
 * Watched (beta feedback 2026-08-05 AMRzGCE4 and again 2026-08-07 AHJspB30:
 * "Many users see shows multiple times").
 *
 * A past review does NOT cancel a future plan. Rating a show already deletes
 * its watchlist row (app/rate/[showId].tsx performSave), so an entry that
 * co-exists with a review is one the user deliberately re-added for a repeat
 * viewing — exactly the case the old filter erased.
 */
import type { WatchlistEntry } from '@/lib/user-types';

export type WatchlistSection =
  /** Future (or today) planned date — "Upcoming" on both tabs. */
  | 'upcoming'
  /** Planned date has passed — "To Be Rated" on Watched, hidden on To Watch. */
  | 'toBeRated'
  /** No planned date — "Not Yet Booked" on To Watch, absent from Watched. */
  | 'undated';

/** `today` is a local YYYY-MM-DD string (lib/date-utils toLocalYMD). */
export function watchlistSection(entry: WatchlistEntry, today: string): WatchlistSection {
  if (!entry.planned_date) return 'undated';
  return entry.planned_date >= today ? 'upcoming' : 'toBeRated';
}

export interface WatchlistSections {
  /** Soonest first — the countdown order both tabs render. */
  upcoming: WatchlistEntry[];
  /** Most recent first — the freshest unrated night is the one you'll log. */
  toBeRated: WatchlistEntry[];
  /** Caller sorts these; the tab's sort control owns the order. */
  undated: WatchlistEntry[];
}

export function splitWatchlist(watchlist: WatchlistEntry[], today: string): WatchlistSections {
  const sections: WatchlistSections = { upcoming: [], toBeRated: [], undated: [] };
  for (const entry of watchlist) sections[watchlistSection(entry, today)].push(entry);
  sections.upcoming.sort((a, b) => (a.planned_date || '').localeCompare(b.planned_date || ''));
  sections.toBeRated.sort((a, b) => (b.planned_date || '').localeCompare(a.planned_date || ''));
  return sections;
}
