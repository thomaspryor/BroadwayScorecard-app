/**
 * "You vs. the Critics" — the AGGREGATE view (spec §5.1 first three bullets):
 * taste-alignment gauge, contrarian picks, Critical Gold coverage.
 *
 * WHY THIS ISN'T IN lib/stats/ (the vendored engine): the shared engine's
 * `alignCritics` does PER-CRITIC alignment and needs stats-reviews.json, which
 * is v1.1 and deliberately not wired into V1. The aggregate math below needs
 * only `cs` from mobile-shows.json, which the app already has in memory. It is
 * written as pure functions with the same shape as the vendored reducers so
 * Sprint 5 (web V1) can lift it into src/lib/stats/ verbatim and this file can
 * become another vendored copy. Do NOT let it drift into a component.
 *
 * Everything here is pure: rows + show metadata in, plain objects out.
 */

import { parseRating, ratingToHundred } from '@/lib/stats';
import type { DiaryRow } from '@/lib/stats';
import { getGoldThreshold, getMarketMinReviews } from '@/lib/score-utils';

/** |your ★×20 − critic score| at or below this counts as agreement (spec §5.1). */
export const ALIGNMENT_WINDOW = 10;
/** Modules hide below this many rated shows that also carry a critic score. */
export const MIN_RATED_WITH_SCORE = 5;
/** A pick has to disagree by at least this much to be worth showing. */
export const CONTRARIAN_MIN_DELTA = 15;

/** The per-show facts this module needs. A subset of the app's `Show`. */
export interface CriticShowMeta {
  id: string;
  title: string;
  slug?: string;
  compositeScore?: number | null;
  criticReviewCount?: number | null;
  category?: string | null;
  status?: string | null;
  poster?: string | null;
}

export type CriticShowIndex = Record<string, CriticShowMeta>;

export interface ContrarianPick {
  showId: string;
  title: string;
  slug?: string;
  poster?: string | null;
  /** Your rating, 0.5–5. */
  rating: number;
  /** Critic composite, 0–100. */
  criticScore: number;
  category?: string | null;
  /** your★×20 − criticScore. Positive = you liked it more. */
  delta: number;
}

export interface GoldCoverage {
  /** Open shows currently at or above their market's Critical Gold threshold. */
  total: number;
  seen: number;
  /** Unseen gold, best score first — the to-see list. */
  unseen: CriticShowMeta[];
  seenShowIds: string[];
}

export interface YouVsCritics {
  /** Rated diary shows that also have a displayable critic score. */
  comparable: number;
  /** Comparable shows inside ±10 pts. */
  aligned: number;
  /** aligned / comparable, 0–1; 0 when nothing is comparable. */
  alignment: number;
  /** Friendly band label for the gauge. */
  label: string;
  /** mean(critic) − mean(yours), 0–100 scale. Negative = critics run colder. */
  bias: number;
  /** You liked it, critics didn't — biggest positive deltas first. */
  youLovedIt: ContrarianPick[];
  /** Critics raved, you shrugged — biggest negative deltas first. */
  criticsRaved: ContrarianPick[];
  /** Show ids behind the "aligned" number, for tap-through. */
  alignedShowIds: string[];
  comparableShowIds: string[];
}

/**
 * Alignment bands. Calibrated to the aggregate ±10 window, NOT to the
 * critic-vs-critic bands in align-critics.ts (those describe a different
 * distribution — spec §5.1 "Do not reuse critic-critic bands").
 */
export function alignmentLabel(alignment: number): string {
  if (alignment >= 0.7) return 'In step with the critics';
  if (alignment >= 0.5) return 'Mostly with the critics';
  if (alignment >= 0.3) return 'You go your own way';
  return 'Certified contrarian';
}

/** True when a show's critic score is safe to compare against (enough reviews). */
export function hasDisplayableScore(meta: CriticShowMeta | undefined): boolean {
  if (!meta || typeof meta.compositeScore !== 'number') return false;
  const min = getMarketMinReviews(meta.category ?? undefined);
  // Review count is optional in the index; absent means the app is already
  // displaying the score elsewhere, so trust it.
  if (typeof meta.criticReviewCount === 'number' && meta.criticReviewCount < min) return false;
  return true;
}

export interface YouVsCriticsOptions {
  window?: number;
  limit?: number;
  minDelta?: number;
}

export function youVsCritics(
  rows: DiaryRow[],
  shows: CriticShowIndex,
  opts: YouVsCriticsOptions = {},
): YouVsCritics {
  const window = opts.window ?? ALIGNMENT_WINDOW;
  const limit = opts.limit ?? 3;
  const minDelta = opts.minDelta ?? CONTRARIAN_MIN_DELTA;

  // One rating per show — repeat viewings averaged, so results don't depend on
  // row order (same rule as the vendored alignCritics).
  const byShow = new Map<string, number[]>();
  for (const row of rows) {
    const r = parseRating(row.rating);
    if (r === null) continue;
    const list = byShow.get(row.show_id);
    if (list) list.push(r);
    else byShow.set(row.show_id, [r]);
  }

  const picks: ContrarianPick[] = [];
  const alignedShowIds: string[] = [];
  const comparableShowIds: string[] = [];
  let sumYours = 0;
  let sumTheirs = 0;

  byShow.forEach((ratings, showId) => {
    const meta = shows[showId];
    if (!hasDisplayableScore(meta)) return;
    const rating = ratings.reduce((s, v) => s + v, 0) / ratings.length;
    const yours = ratingToHundred(rating);
    const theirs = meta.compositeScore as number;
    comparableShowIds.push(showId);
    sumYours += yours;
    sumTheirs += theirs;
    if (Math.abs(yours - theirs) <= window) alignedShowIds.push(showId);
    picks.push({
      showId,
      title: meta.title,
      slug: meta.slug,
      poster: meta.poster ?? null,
      rating,
      criticScore: theirs,
      category: meta.category ?? null,
      delta: yours - theirs,
    });
  });

  const comparable = comparableShowIds.length;
  const aligned = alignedShowIds.length;
  const alignment = comparable > 0 ? aligned / comparable : 0;

  const youLovedIt = picks
    .filter((p) => p.delta >= minDelta)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  const criticsRaved = picks
    .filter((p) => p.delta <= -minDelta)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);

  return {
    comparable,
    aligned,
    alignment,
    label: alignmentLabel(alignment),
    bias: comparable > 0 ? (sumTheirs - sumYours) / comparable : 0,
    youLovedIt,
    criticsRaved,
    alignedShowIds,
    comparableShowIds,
  };
}

/**
 * Critical Gold coverage — of the shows currently open at Gold, how many have
 * you seen? (spec §5.1). Unlike the rest of this module it is deliberately NOT
 * scope-filtered: "currently open" is a fact about today, so seeing a gold show
 * in 2019 still counts, and the unseen list is a to-see list for right now.
 */
export function goldCoverage(rows: DiaryRow[], openShows: CriticShowMeta[]): GoldCoverage {
  const seenIds = new Set(rows.map((r) => r.show_id));
  const gold = openShows.filter(
    (s) =>
      hasDisplayableScore(s) &&
      Math.round(s.compositeScore as number) >= getGoldThreshold(s.category ?? undefined),
  );
  const seen = gold.filter((s) => seenIds.has(s.id));
  const unseen = gold
    .filter((s) => !seenIds.has(s.id))
    .sort((a, b) => (b.compositeScore as number) - (a.compositeScore as number));
  return {
    total: gold.length,
    seen: seen.length,
    unseen,
    seenShowIds: seen.map((s) => s.id),
  };
}
