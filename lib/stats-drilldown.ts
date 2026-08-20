/**
 * Pure grouping helper for StatsDrilldownSheet.
 *
 * The three hero tiles (shows / hours / theaters) all open the sheet with the
 * same flat, date-sorted review list — for "Theaters" that meant a 52-row
 * flat list of every visit with no structure, when the whole point of that
 * tile is "which houses have you been to" (build-61 sim QA). This groups
 * reviews by venue so the sheet can render a divider per house instead.
 */
import type { UserReview } from './user-types';

export interface VenueGroup {
  venue: string;
  reviews: UserReview[];
}

const UNKNOWN_VENUE = 'Unknown venue';

/** Groups reviews by venue, largest group first (ties broken alphabetically),
 *  with the group's own reviews kept in their incoming order. */
export function groupReviewsByVenue(
  reviews: UserReview[],
  venueForShow: (showId: string) => string | null | undefined,
): VenueGroup[] {
  const order: string[] = [];
  const groups = new Map<string, UserReview[]>();
  for (const r of reviews) {
    const venue = venueForShow(r.show_id) || UNKNOWN_VENUE;
    let bucket = groups.get(venue);
    if (!bucket) {
      bucket = [];
      groups.set(venue, bucket);
      order.push(venue);
    }
    bucket.push(r);
  }
  return order
    .map((venue) => ({ venue, reviews: groups.get(venue)! }))
    .sort((a, b) => b.reviews.length - a.reviews.length || a.venue.localeCompare(b.venue));
}
