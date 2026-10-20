/**
 * The Critic Score display gate, a port of the website's
 * scripts/lib/min-reviews.js (getMarketMinReviews / reviewsRemainingForScore).
 *
 * The feed now carries the website's own verdict as `cr.q` (1 = the site shows
 * the score, 0 = it shows TBD). When `q` is present it wins: it already folds
 * in rules the app cannot recompute (the curated-historical carve-out, the
 * coverage floor). The local rule below is the fallback for older feeds and the
 * bundled seed, which have no `q`.
 *
 * Pure: no React Native imports, so tests/unit/score-gate.test.mjs can load it.
 */

/** Base minimum reviews per market (web getMarketMinReviews). */
export const MARKET_MIN_REVIEWS: Readonly<Record<string, number>> = {
  'off-broadway': 3,
  'off-off-broadway': 3,
  regional: 3,
  tour: 3,
  'off-west-end': 3,
  'west-end': 5,
};

/** Broadway and any unknown market. */
export const DEFAULT_MIN_REVIEWS = 5;

/** Extra reviews required when every scored review is from a tier-3/4 outlet. */
export const T3_ONLY_EXTRA = 2;

/** Base minimum reviews before a market's Critic Score is shown. */
export function getMarketMinReviews(category?: string | null): number {
  if (category && Object.prototype.hasOwnProperty.call(MARKET_MIN_REVIEWS, category)) {
    return MARKET_MIN_REVIEWS[category];
  }
  return DEFAULT_MIN_REVIEWS;
}

/**
 * How many more reviews a show needs before its Critic Score may be shown
 * (0 = it qualifies). `tier1And2Count` undefined means "unknown" and skips the
 * T3-only extra, exactly like the website.
 */
export function reviewsRemainingForScore(
  reviewCount: number,
  category?: string | null,
  tier1And2Count?: number,
): number {
  let min = getMarketMinReviews(category);
  if (tier1And2Count !== undefined && tier1And2Count === 0) min += T3_ONLY_EXTRA;
  return Math.max(0, min - reviewCount);
}

export interface GateInput {
  compositeScore: number | null;
  category: string;
  criticScore: {
    reviewCount: number;
    tier1Count?: number | null;
    tier2Count?: number | null;
    /** The website's verdict from the feed (`cr.q`); undefined on older feeds. */
    qualified?: boolean | null;
  } | null;
}

/**
 * T1 + T2 review count when it is knowable. Feeds without `t2` only tell us
 * T1; a non-zero T1 is still enough to rule out the T3-only extra, but a zero
 * T1 with no T2 is "unknown", not "zero".
 */
export function tier1And2CountOf(cs: GateInput['criticScore']): number | undefined {
  if (!cs) return undefined;
  const t1 = cs.tier1Count ?? null;
  const t2 = cs.tier2Count ?? null;
  if (t1 == null && t2 == null) return undefined;
  if (t2 == null) return (t1 ?? 0) > 0 ? (t1 as number) : undefined;
  return (t1 ?? 0) + t2;
}

/** True when the show has enough critic reviews for its score to be shown. */
export function hasEnoughReviewsForShow(show: GateInput): boolean {
  const cs = show.criticScore;
  if (cs?.qualified != null) return cs.qualified;
  return reviewsRemainingForScore(cs?.reviewCount ?? 0, show.category, tier1And2CountOf(cs)) === 0;
}

/** Reviews still needed before a score appears (0 when the site already shows one). */
export function reviewsRemainingForShow(show: GateInput): number {
  const cs = show.criticScore;
  const local = reviewsRemainingForScore(cs?.reviewCount ?? 0, show.category, tier1And2CountOf(cs));
  if (cs?.qualified === true) return 0;
  // The site says TBD but the local count says enough: the site is holding the
  // score for a reason we cannot see (coverage). Never claim "0 more".
  if (cs?.qualified === false) return Math.max(1, local);
  return local;
}

/**
 * Composite score gated by the display rule: the single predicate for "does
 * this show have a displayable Critic Score?". Null means badges read TBD and
 * ranked shelves and score sorts leave the show out.
 */
export function getQualifiedScore(show: GateInput): number | null {
  if (show.compositeScore == null) return null;
  return hasEnoughReviewsForShow(show) ? show.compositeScore : null;
}

/**
 * The web show page's `showTBD`: no displayable score yet, or the show has not
 * opened (previews and upcoming always read TBD, even with early reviews).
 */
export function isScoreTBD(show: GateInput & { status: string }): boolean {
  return getQualifiedScore(show) == null || show.status === 'previews' || show.status === 'upcoming';
}
