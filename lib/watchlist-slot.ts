/**
 * Which shelf a watchlist entry belongs on — the SINGLE rule both the To Watch
 * and Watched tabs ask, so the two can never disagree about the same entry.
 *
 * They did disagree: each tab wrote its own filter, and Watched's Upcoming
 * dropped anything the user had ever rated. A show you have already seen and
 * booked again (Oh, Mary! on Oct 10) therefore sat on To Watch's Upcoming shelf
 * and was missing from Watched's — beta feedback 2026-08-05 (AMRzGCE4) and
 * again 2026-08-07 (AHJspB30): "Many users see shows multiple times."
 *
 * The rule:
 *   no planned date            → 'not-booked'
 *   planned date today/future  → 'upcoming'   (a future plan is a future
 *                                outing, whatever you rated in the past)
 *   planned date in the past   → 'to-be-rated' unless that outing is already
 *                                logged, i.e. a review dated on or after the
 *                                planned date exists. Undated reviews (diary
 *                                imports) also count as logged for past dates,
 *                                so an import can't resurrect years of
 *                                "to be rated" nags.
 *
 * Pure module (no react-native import) so tests/unit/watchlist-slot.test.mjs
 * can load it under --experimental-strip-types.
 */
import type { UserReview } from './user-types';

export type WatchlistSlot = 'upcoming' | 'to-be-rated' | 'not-booked';

export interface ReviewIndex {
  /** Latest date_seen (YYYY-MM-DD) per show. */
  latestSeenByShow: Record<string, string>;
  /** Shows with at least one review carrying no date at all. */
  undatedShowIds: Set<string>;
}

export function buildReviewIndex(reviews: UserReview[]): ReviewIndex {
  const latestSeenByShow: Record<string, string> = {};
  const undatedShowIds = new Set<string>();
  for (const r of reviews) {
    if (!r.date_seen) {
      undatedShowIds.add(r.show_id);
      continue;
    }
    const current = latestSeenByShow[r.show_id];
    if (!current || r.date_seen > current) latestSeenByShow[r.show_id] = r.date_seen;
  }
  return { latestSeenByShow, undatedShowIds };
}

export function classifyWatchlistEntry(
  entry: { show_id: string; planned_date: string | null },
  index: ReviewIndex,
  today: string,
): WatchlistSlot {
  const planned = entry.planned_date;
  if (!planned) return 'not-booked';
  if (planned >= today) return 'upcoming';
  const latestSeen = index.latestSeenByShow[entry.show_id];
  const outingLogged = (!!latestSeen && latestSeen >= planned) || index.undatedShowIds.has(entry.show_id);
  return outingLogged ? 'not-booked' : 'to-be-rated';
}
