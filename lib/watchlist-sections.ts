/**
 * Which watchlist entries belong on an "Upcoming" shelf.
 *
 * Both tabs render that shelf, and they drifted: the Watched tab hid any entry
 * whose show had EVER been rated, so a show you had already seen once and then
 * booked again appeared under To Watch → Upcoming and nowhere at all under
 * Watched → Upcoming (beta feedback 2026-08-05 AMRzGCE4 and 2026-08-07
 * AHJspB30, both "Oh, Mary!"). Seeing a show twice is normal; a past rating
 * says nothing about a future ticket.
 *
 * The only thing that retires a planned date is having logged THAT viewing —
 * a review whose date_seen is the planned date. Rating a show already removes
 * its watchlist entry (app/rate/[showId].tsx), so in practice this is a guard
 * against imported data double-booking a date, not an everyday path.
 *
 * The predicate lives here rather than in either screen so the two shelves
 * cannot disagree again.
 */
import type { UserReview, WatchlistEntry } from '@/lib/user-types';

/** `${show_id}|${date_seen}` for every logged viewing that carries a date. */
export function loggedViewingKeys(reviews: UserReview[]): Set<string> {
  const keys = new Set<string>();
  for (const r of reviews) {
    if (r.date_seen) keys.add(`${r.show_id}|${r.date_seen}`);
  }
  return keys;
}

/**
 * True when `entry` is a booked future viewing: a planned date of today or
 * later that has not already been logged as a review on that same date.
 */
export function isUpcomingWatchlistEntry(
  entry: WatchlistEntry,
  today: string,
  loggedViewings: Set<string>,
): boolean {
  if (!entry.planned_date || entry.planned_date < today) return false;
  return !loggedViewings.has(`${entry.show_id}|${entry.planned_date}`);
}
