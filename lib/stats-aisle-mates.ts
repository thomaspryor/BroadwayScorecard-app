/**
 * Aisle Mates / Your Paper of Record — critic & outlet DETAIL drill-down
 * (spec §5.1 "critic detail sheet"): full agreement history for one
 * critic/outlet and "their picks you haven't seen".
 *
 * WHY THIS ISN'T IN lib/stats/ (the vendored engine): the vendored
 * `alignCritics` (lib/stats/align-critics.ts) computes the AGGREGATE ranking
 * for every critic/outlet at once — exactly what Aisle Mates' top-3 list and
 * Your Paper of Record need, no changes required there. This file answers a
 * different, UI-only question — "show me everything about THIS ONE critic" —
 * which only the drill-down sheet needs. Written as a pure function with the
 * same shape as the vendored reducers (same rule stats-you-vs-critics.ts
 * follows) so a future web V1 drill-down can lift it into src/lib/stats/
 * verbatim. Do NOT let this logic drift into a component.
 *
 * Everything here is pure: diary rows + the stats-reviews artifact in, plain
 * objects out. Ratings never leave the phone — this only reads what's already
 * in memory.
 */

import { NO_CRITIC_INDEX } from '@/lib/stats';
import type { DiaryRow, StatsReviews } from '@/lib/stats';
import { parseRating, ratingToHundred } from '@/lib/stats';

/** Selects a single critic (by index into StatsReviews.critics) or a single
 *  outlet (by name, matching alignCritics' outlet-keyed-by-name convention —
 *  one publication can span tiers/indices, e.g. TheaterMania T1/T2). */
export type Reviewer = { kind: 'critic'; index: number } | { kind: 'outlet'; name: string };

export interface ReviewerDetail {
  /** Shows both you and this reviewer covered, with their score. */
  shared: { showId: string; theirScore: number }[];
  /** showId of the closest match (smallest |your score − their score|), or
   *  null when there is nothing shared. */
  biggestAgreementShowId: string | null;
  /** showId of the widest gap, or null when there is nothing shared. */
  biggestFightShowId: string | null;
  /** Shows this reviewer scored that you have not rated, best score first. */
  unseen: { showId: string; theirScore: number }[];
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** True when a review row belongs to the requested reviewer. */
function matches(row: [number, number, number], reviews: StatsReviews, who: Reviewer): boolean {
  const [criticIdx, outletIdx] = row;
  if (who.kind === 'critic') return criticIdx === who.index && criticIdx !== NO_CRITIC_INDEX;
  const outletName = reviews.outlets[outletIdx]?.[0];
  return outletName === who.name;
}

/**
 * Full detail for one critic or outlet: every shared show with a score delta,
 * the biggest agreement/fight, and every show they scored that you haven't
 * rated — mirrors alignCritics' per-show loop, but for a single reviewer
 * instead of tallying all of them at once.
 */
export function reviewerDetail(rows: DiaryRow[], reviews: StatsReviews, who: Reviewer): ReviewerDetail {
  const userRatings = new Map<string, number[]>();
  for (const row of rows) {
    const r = parseRating(row.rating);
    if (r === null) continue;
    const list = userRatings.get(row.show_id);
    if (list) list.push(ratingToHundred(r));
    else userRatings.set(row.show_id, [ratingToHundred(r)]);
  }

  const shared: { showId: string; theirScore: number }[] = [];
  const unseen: { showId: string; theirScore: number }[] = [];
  let biggestAgreementShowId: string | null = null;
  let biggestFightShowId: string | null = null;
  let smallestDelta = Infinity;
  let largestDelta = -Infinity;

  for (const [showId, reviewRows] of Object.entries(reviews.shows ?? {})) {
    const theirScores = reviewRows.filter((r) => matches(r, reviews, who)).map((r) => r[2]);
    if (theirScores.length === 0) continue;
    const theirScore = mean(theirScores);

    const yourScores = userRatings.get(showId);
    if (!yourScores) {
      unseen.push({ showId, theirScore });
      continue;
    }
    const yourScore = mean(yourScores);
    shared.push({ showId, theirScore });
    const delta = Math.abs(yourScore - theirScore);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      biggestAgreementShowId = showId;
    }
    if (delta > largestDelta) {
      largestDelta = delta;
      biggestFightShowId = showId;
    }
  }

  unseen.sort((a, b) => b.theirScore - a.theirScore);

  return { shared, biggestAgreementShowId, biggestFightShowId, unseen };
}
