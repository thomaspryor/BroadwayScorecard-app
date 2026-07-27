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
  alignCritics,
  buildHouseIndex,
  canonProgress,
  computeDiaryStats,
  ratingsHistogram,
  seasonWindows,
  theaterCompletion,
  type AlignCriticsResult,
  type DiaryRow,
  type HouseIndex,
  type ShowMetaIndex,
  type StatsCanon,
  type StatsReviews,
} from '@/lib/stats';
import { EMPTY_CANON, HOUSE_NAMES, THEATER_HOUSES, loadStatsCanon } from '@/lib/stats-canon-source';
import { loadStatsReviews } from '@/lib/stats-reviews-source';
import {
  buildScopes,
  defaultScope,
  filterRows,
  localToday,
  type ScopeOption,
} from '@/lib/stats-scope';
import { audienceVsYou, goldCoverage, youVsCritics, type CriticShowIndex, type CriticShowMeta } from '@/lib/stats-you-vs-critics';
import { filterByMarket } from '@/components/MarketPicker';
import { useMarket } from '@/lib/market-context';
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
  /** Every scope the pill offers, in pill order. */
  scopes: ScopeOption[];
  /**
   * The scope every number in this bundle was computed under — the caller's
   * `scope` when it passed one, otherwise `defaultScope(scopes, …)`. Read this
   * rather than recomputing the default: two `defaultScope()` calls on either
   * side of the seam is exactly how the screen and its numbers drift apart.
   */
  scope: ScopeOption;
  /**
   * The ONE house index. Both reducers and every venue lookup in the UI must
   * use it — a second index built without `formerNames` counts a "Brooks
   * Atkinson Theatre" row in one place and not the other.
   */
  houseIndex: HouseIndex;
  diary: ReturnType<typeof computeDiaryStats>;
  theaters: ReturnType<typeof theaterCompletion>;
  canonStats: ReturnType<typeof canonProgress>;
  histogram: ReturnType<typeof ratingsHistogram>;
  critics: ReturnType<typeof youVsCritics>;
  gold: ReturnType<typeof goldCoverage>;
  audience: ReturnType<typeof audienceVsYou>;
  distinctShows: number;
  /** True when the Hours tile must drop out of the hero (spec §3.1, >25%). */
  demoteHours: boolean;
  /**
   * stats-reviews.json, once the background fetch resolves — null while
   * loading/offline-with-no-cache. Aisle Mates / Your Paper of Record (spec
   * §5.1) need the raw artifact (not just `aisleMates`) for the per-critic
   * drill-down sheet (lib/stats-aisle-mates.ts).
   */
  statsReviews: StatsReviews | null;
  /** True only on the very first, cache-less load — used for the module's
   *  brief loading state, never for the whole-screen canon-style gate. */
  statsReviewsLoading: boolean;
  /**
   * Aisle Mates / Your Paper of Record ranking, computed over the FULL diary
   * (allRows) — lifetime, like gold/canon/audience (build-61 fix pass): a
   * season-scoped "critics you align with" would silently shrink shared-show
   * counts below the volume floor for anyone browsing a thin scope.
   * Null until statsReviews resolves.
   */
  aisleMates: AlignCriticsResult | null;
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
    audienceGrade: s.audienceGrade?.grade ?? null,
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

/**
 * Longest the Stats screen will hold its first paint waiting for the canon.
 *
 * loadStatsCanon() is cache-first, so this only bites on the first ever visit
 * with no cache — but its network leg has no timeout of its own, so without a
 * cap a dead connection would spin the screen for RN's full fetch timeout.
 */
export const CANON_GATE_TIMEOUT_MS = 6000;

export function useStatsCanon(): { canon: StatsCanon; loading: boolean } {
  const [canon, setCanon] = useState<StatsCanon>(EMPTY_CANON);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let gaveUp = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      // Past the cap we paint with what we have (EMPTY_CANON = calendar-year
      // scopes only) AND refuse the late arrival: swapping the canon in after
      // first paint would re-run defaultScope() and change every number under
      // the user, which is precisely what the gate exists to prevent. The
      // fetch still populates the cache, so the next mount gets the real thing.
      gaveUp = true;
      setLoading(false);
    }, CANON_GATE_TIMEOUT_MS);
    loadStatsCanon()
      .then((c) => {
        if (!cancelled && !gaveUp) setCanon(c);
      })
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // `canon` is assigned at most once, and always before `loading` flips false.
  // Callers can therefore treat `loading === false` as "the scope decision is
  // now stable" — nothing downstream re-defaults after first paint.
  return { canon, loading };
}

/**
 * Background loader for stats-reviews.json (Aisle Mates / Your Paper of
 * Record, spec §5.1). Unlike useStatsCanon this never gates the Stats
 * screen's first paint — the artifact is ~290KB and the module it feeds is
 * below the fold, so a slow/offline first load just means the module shows
 * its own brief loading card while the rest of the screen is already usable.
 */
export function useStatsReviews(): { statsReviews: StatsReviews | null; loading: boolean } {
  const [statsReviews, setStatsReviews] = useState<StatsReviews | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadStatsReviews()
      .then((r) => {
        if (!cancelled) setStatsReviews(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { statsReviews, loading };
}

export interface UseStatsDataArgs {
  reviews: UserReview[];
  shows: Show[];
  canon: StatsCanon;
  scope: ScopeOption | null;
  /** stats-reviews.json, from useStatsReviews() — null while it's still
   *  loading. Owned by the screen (not fetched here) so its background
   *  fetch survives scope changes without re-triggering. */
  statsReviews?: StatsReviews | null;
  statsReviewsLoading?: boolean;
  /** Overridable for deterministic tests/screenshots. */
  today?: string;
}

/**
 * The single Broadway-house index for the whole Stats screen.
 *
 * Built once, module-scope, from the vendored house list PLUS every
 * `formerNames` entry in the metadata. `computeDiaryStats` would otherwise
 * build its own from bare `houseNames` (no former names) while
 * `theaterCompletion` built one with them, so a diary row logged at "Brooks
 * Atkinson Theatre" counted toward the completion ring but not toward the hero
 * tile's "N Broadway" sublabel.
 *
 * THEATER_HOUSES is a static vendored JSON import, so this can't go stale.
 */
export const HOUSE_INDEX: HouseIndex = buildHouseIndex(
  HOUSE_NAMES,
  {},
  Object.fromEntries(
    Object.entries(THEATER_HOUSES)
      .filter(([, meta]) => meta.formerNames?.length)
      .map(([name, meta]) => [name, meta.formerNames as string[]]),
  ),
);

export function useStatsData({
  reviews,
  shows,
  canon,
  scope,
  statsReviews = null,
  statsReviewsLoading = false,
  today,
}: UseStatsDataArgs): StatsBundle {
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
  const active = useMemo(
    () => scope ?? defaultScope(scopes, allRows, day),
    [scope, scopes, allRows, day],
  );

  const reviewsInScope = useMemo(() => filterRows(reviews, active), [reviews, active]);
  const rows = useMemo(() => toDiaryRows(reviewsInScope), [reviewsInScope]);

  // Both reducers take the SAME prebuilt index (opts.houseIndex wins over the
  // houseNames / theaterMetadata fallbacks each would otherwise build from).
  const diary = useMemo(
    () => computeDiaryStats(rows, showMeta, { houseIndex: HOUSE_INDEX, today: day }),
    [rows, showMeta, day],
  );
  // Theater completion is likewise lifetime — "2 of 42 houses" under a season
  // scope read as lost data (build-61 P0). The ring always answers "ever".
  const theaters = useMemo(
    () => theaterCompletion(allRows, showMeta, THEATER_HOUSES, { houseIndex: HOUSE_INDEX }),
    [allRows, showMeta],
  );
  const windows = useMemo(() => seasonWindows(canon, { today: day }), [canon, day]);
  // Canon coverage is a lifetime fact ("winners you've EVER seen") — computing
  // it from scoped rows produced "51 to go" for a user who'd seen 8 (sim QA #7).
  const canonStats = useMemo(
    () => canonProgress(allRows, canon, { windows }),
    [allRows, canon, windows],
  );
  const histogram = useMemo(() => ratingsHistogram(rows), [rows]);
  const critics = useMemo(() => youVsCritics(rows, criticIndex), [rows, criticIndex]);
  // Lifetime like gold/canon — scoped rows made the card silently vanish
  // under a thin scope with no locked state (fix-branch verify #2).
  const audience = useMemo(() => audienceVsYou(allRows, criticIndex), [allRows, criticIndex]);
  // Distinct shows for the hero tile — diary.total counts ENTRIES (repeat
  // viewings), which put Stats one ahead of the Grid's "shows seen" line.
  const distinctShows = useMemo(() => new Set(rows.map((r) => r.show_id)).size, [rows]);

  // Gold coverage is intentionally computed against ALL rows, not the scope:
  // "of the gold shows open right now, how many have you ever seen".
  // Market-scoped (build-61 owner report): a to-see list of London shows is
  // noise for a NYC user, and vice versa — same rule Home/Browse follow.
  const { market } = useMarket();
  const openShows = useMemo(
    () =>
      shows
        .filter((s) => s.status === 'open' || s.status === 'previews')
        .filter((s) => filterByMarket(s.category ?? '', market))
        .map(toCriticMeta),
    [shows, market],
  );
  const gold = useMemo(() => goldCoverage(allRows, openShows), [allRows, openShows]);

  // Aisle Mates / Your Paper of Record — lifetime like gold/canon/audience
  // above, computed from the vendored engine once stats-reviews.json resolves.
  const aisleMates = useMemo(
    () => (statsReviews ? alignCritics(allRows, statsReviews) : null),
    [allRows, statsReviews],
  );

  return {
    allRows,
    rows,
    reviewsInScope,
    showMeta,
    showsById,
    canon,
    scopes,
    scope: active,
    houseIndex: HOUSE_INDEX,
    diary,
    theaters,
    canonStats,
    histogram,
    critics,
    audience,
    distinctShows,
    gold,
    demoteHours: diary.runtimeFallbackShare > 0.25,
    statsReviews,
    statsReviewsLoading,
    aisleMates,
  };
}
