/**
 * useStatsData — the single data seam for the Stats screen.
 *
 * Diary rows come from the EXISTING reviews path (useUserReviews →
 * AsyncStorage cache → Supabase). There is deliberately no second fetcher: the
 * Watched tab and the Stats tab must never disagree about how many shows you've
 * seen, and a parallel query would drift the moment one of them gained a filter.
 *
 * Show metadata comes from useShows() (mobile-shows.json, already in memory).
 * Canon comes from lib/stats-canon-source. Houses are vendored.
 *
 * Everything below the fetch is memoized pure-function output from the vendored
 * engine — no stats math lives in this file or in any component.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  canonProgress,
  computeDiaryStats,
  ratingsHistogram,
  seasonWindows,
  theaterCompletion,
  type DiaryRow,
  type ShowMetaIndex,
  type StatsCanon,
} from '@/lib/stats';
import { EMPTY_CANON, HOUSE_NAMES, THEATER_HOUSES, loadStatsCanon } from '@/lib/stats-canon-source';
import {
  buildScopes,
  defaultScope,
  filterRows,
  localToday,
  type ScopeOption,
} from '@/lib/stats-scope';
import { goldCoverage, youVsCritics, type CriticShowIndex, type CriticShowMeta } from '@/lib/stats-you-vs-critics';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';

/** Below this the whole screen shows the ghost state (spec §7). */
export const MIN_ENTRIES_FOR_STATS = 3;
/** Per-module thresholds (spec §7). */
export const MIN_RATED_FOR_HISTOGRAM = 5;
export const MIN_DATED_FOR_YEAR_CHART = 3;

export interface StatsBundle {
  /** All diary rows, unfiltered — the denominator for the ghost state. */
  allRows: DiaryRow[];
  /** Rows inside the active scope. */
  rows: DiaryRow[];
  /** The diary rows as their original review objects, for drill-down lists. */
  reviewsInScope: UserReview[];
  showMeta: ShowMetaIndex;
  showsById: Record<string, Show>;
  canon: StatsCanon;
  scopes: ScopeOption[];
  diary: ReturnType<typeof computeDiaryStats>;
  theaters: ReturnType<typeof theaterCompletion>;
  canonStats: ReturnType<typeof canonProgress>;
  histogram: ReturnType<typeof ratingsHistogram>;
  critics: ReturnType<typeof youVsCritics>;
  gold: ReturnType<typeof goldCoverage>;
  /** True when the Hours tile must drop out of the hero (spec §3.1, >25%). */
  demoteHours: boolean;
}

/** mobile-shows `Show[]` → the index shape the vendored reducers expect. */
export function buildShowMeta(shows: Show[]): ShowMetaIndex {
  const out: ShowMetaIndex = {};
  for (const s of shows) {
    out[s.id] = {
      type: s.type,
      runtime: s.runtime,
      venue: s.venue,
      category: s.category,
      title: s.title,
    };
  }
  return out;
}

/** mobile-shows `Show[]` → the index the You-vs-Critics module expects. */
export function buildCriticIndex(shows: Show[]): CriticShowIndex {
  const out: CriticShowIndex = {};
  for (const s of shows) {
    out[s.id] = toCriticMeta(s);
  }
  return out;
}

function toCriticMeta(s: Show): CriticShowMeta {
  return {
    id: s.id,
    title: s.title,
    slug: s.slug,
    compositeScore: s.compositeScore,
    criticReviewCount: s.criticScore?.reviewCount ?? null,
    category: s.category,
    status: s.status,
    poster: s.images.poster ?? s.images.thumbnail ?? null,
  };
}

/** Supabase reviews → the vendored engine's DiaryRow shape. */
export function toDiaryRows(reviews: UserReview[]): DiaryRow[] {
  return reviews.map((r) => ({
    show_id: r.show_id,
    rating: r.rating,
    date_seen: r.date_seen,
  }));
}

export function useStatsCanon(): { canon: StatsCanon; loading: boolean } {
  const [canon, setCanon] = useState<StatsCanon>(EMPTY_CANON);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadStatsCanon()
      .then((c) => {
        if (!cancelled) setCanon(c);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { canon, loading };
}

export interface UseStatsDataArgs {
  reviews: UserReview[];
  shows: Show[];
  canon: StatsCanon;
  scope: ScopeOption | null;
  /** Overridable for deterministic tests/screenshots. */
  today?: string;
}

export function useStatsData({ reviews, shows, canon, scope, today }: UseStatsDataArgs): StatsBundle {
  const day = today ?? localToday();

  const showMeta = useMemo(() => buildShowMeta(shows), [shows]);
  const criticIndex = useMemo(() => buildCriticIndex(shows), [shows]);
  const showsById = useMemo(() => {
    const out: Record<string, Show> = {};
    for (const s of shows) out[s.id] = s;
    return out;
  }, [shows]);

  const allRows = useMemo(() => toDiaryRows(reviews), [reviews]);
  const scopes = useMemo(() => buildScopes(allRows, canon, { today: day }), [allRows, canon, day]);
  const active = scope ?? defaultScope(scopes, allRows, day);

  const reviewsInScope = useMemo(() => filterRows(reviews, active), [reviews, active]);
  const rows = useMemo(() => toDiaryRows(reviewsInScope), [reviewsInScope]);

  const diary = useMemo(
    () => computeDiaryStats(rows, showMeta, { houseNames: HOUSE_NAMES, today: day }),
    [rows, showMeta, day],
  );
  const theaters = useMemo(
    () => theaterCompletion(rows, showMeta, THEATER_HOUSES),
    [rows, showMeta],
  );
  const windows = useMemo(() => seasonWindows(canon, { today: day }), [canon, day]);
  const canonStats = useMemo(
    () => canonProgress(rows, canon, { windows }),
    [rows, canon, windows],
  );
  const histogram = useMemo(() => ratingsHistogram(rows), [rows]);
  const critics = useMemo(() => youVsCritics(rows, criticIndex), [rows, criticIndex]);

  // Gold coverage is intentionally computed against ALL rows, not the scope:
  // "of the gold shows open right now, how many have you ever seen".
  const openShows = useMemo(
    () => shows.filter((s) => s.status === 'open' || s.status === 'previews').map(toCriticMeta),
    [shows],
  );
  const gold = useMemo(() => goldCoverage(allRows, openShows), [allRows, openShows]);

  return {
    allRows,
    rows,
    reviewsInScope,
    showMeta,
    showsById,
    canon,
    scopes,
    diary,
    theaters,
    canonStats,
    histogram,
    critics,
    gold,
    demoteHours: diary.runtimeFallbackShare > 0.25,
  };
}
