/**
 * Review breakdown bar tiers, a port of the website's getBreakdownTier
 * (src/components/show-cards/ScoreBreakdownBar.tsx). Each review is classified
 * from its SCORE, not from the feed's `bucket` word, so a "Pan" review counts
 * as Negative instead of vanishing from the bar.
 *
 *   Rave     = score >= gold threshold (83, or 85 in London)
 *   Positive = 70 to gold-1
 *   Mixed    = 55 to 69
 *   Negative = below 55
 *
 * Pure: no React Native imports.
 */

import { getGoldThreshold } from './score-utils';

export type BreakdownTier = 'rave' | 'positive' | 'mixed' | 'negative';

export const BREAKDOWN_POSITIVE_MIN = 70;
export const BREAKDOWN_MIXED_MIN = 55;

/** Tier for one review score; null for missing or non-finite scores. */
export function getBreakdownTier(score: number | null | undefined, category?: string): BreakdownTier | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const rounded = Math.round(score);
  if (rounded >= getGoldThreshold(category)) return 'rave';
  if (rounded >= BREAKDOWN_POSITIVE_MIN) return 'positive';
  if (rounded >= BREAKDOWN_MIXED_MIN) return 'mixed';
  return 'negative';
}

export interface BreakdownCounts {
  rave: number;
  positive: number;
  mixed: number;
  negative: number;
  total: number;
}

/** Count reviews into tiers, skipping reviews without a usable score. */
export function countBreakdown(
  reviews: readonly { score?: number | null }[],
  category?: string,
): BreakdownCounts {
  const counts: BreakdownCounts = { rave: 0, positive: 0, mixed: 0, negative: 0, total: 0 };
  for (const r of reviews) {
    const tier = getBreakdownTier(r.score, category);
    if (!tier) continue;
    counts[tier]++;
    counts.total++;
  }
  return counts;
}
