/**
 * Stats — the third segment of the Watched (profile) tab.
 *
 * Owns three things and nothing else:
 *   1. the active scope,
 *   2. the module order (spec §2: hero → shows/year → theaters → critics →
 *      canon → ratings),
 *   3. the drill-down payload every module hands back.
 *
 * All stats maths lives in the vendored engine (lib/stats/) behind
 * useStatsData. If you find yourself computing a number in this file, it
 * belongs in a reducer.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useStatsCanon, useStatsData, useStatsReviews, MIN_ENTRIES_FOR_STATS } from '@/hooks/useStatsData';
import { localToday, scopeSuffix, type ScopeOption } from '@/lib/stats-scope';
import { ScopePill } from './ScopePill';
import type { CanonEntry, HouseVisit } from '@/lib/stats';
import { matchVenueToHouse } from '@/lib/stats';
import { reviewerDetail, type Reviewer } from '@/lib/stats-aisle-mates';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';
import { GhostState, ModuleHeader, StatsCard } from './StatsPrimitives';
import { HeroTiles, formatHours } from './HeroTiles';
import { ShowsPerYear, formatMonth } from './ShowsPerYear';
import { TheaterTracker, houseShortName } from './TheaterTracker';
import { YouVsCritics } from './YouVsCritics';
import { AisleMates } from './AisleMates';
import { CanonChecklists } from './CanonChecklists';
import { RatingsModule } from './RatingsModule';
import { StatsDrilldownSheet, type DrilldownPayload } from './StatsDrilldownSheet';

export interface StatsScreenProps {
  reviews: UserReview[];
  shows: Show[];
  /** True while the show catalog or the diary is still loading. */
  loading?: boolean;
  /** Diary fetch error — renders the retry state instead of stats. */
  error?: string | null;
  onRetry?: () => void;
  /** Bottom padding so the tab bar never covers the last module. */
  bottomPad: number;
  onRateShow?: () => void;
  /** Pull-to-refresh, wired to the same handler as the Grid and Feed segments. */
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function StatsScreen({
  reviews,
  shows,
  loading = false,
  error = null,
  onRetry,
  bottomPad,
  onRateShow,
  refreshing = false,
  onRefresh,
}: StatsScreenProps) {
  const today = localToday();
  const { canon, loading: canonLoading } = useStatsCanon();
  // Background fetch, never gates first paint (unlike the canon above) — see
  // lib/stats-reviews-source.ts.
  const { statsReviews, loading: statsReviewsLoading } = useStatsReviews();
  const [scope, setScope] = useState<ScopeOption | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownPayload | null>(null);

  // Scopes and the default scope are owned by the hook — computing them here
  // too meant two `defaultScope()` calls that could disagree, and
  // `bundle.scopes` was never read.
  const bundle = useStatsData({ reviews, shows, canon, scope, statsReviews, statsReviewsLoading, today });
  const { allRows, scopes, scope: active, houseIndex, reviewsInScope, showsById } = bundle;

  /** Diary rows behind a set of show ids, newest first — the drill-down list. */
  const reviewsFor = useCallback(
    (ids: Iterable<string>, from: UserReview[] = reviewsInScope) => {
      const wanted = new Set(ids);
      return from
        .filter((r) => wanted.has(r.show_id))
        .sort((a, b) => (b.date_seen ?? '').localeCompare(a.date_seen ?? ''));
    },
    [reviewsInScope],
  );

  const sortedInScope = useMemo(
    () => [...reviewsInScope].sort((a, b) => (b.date_seen ?? '').localeCompare(a.date_seen ?? '')),
    [reviewsInScope],
  );

  /** Diary rows logged at a specific Broadway house. */
  const reviewsAtHouse = useCallback(
    (house: string) =>
      sortedInScope.filter((r) => {
        const meta = bundle.showMeta[r.show_id];
        return matchVenueToHouse(meta?.venue, houseIndex, { category: meta?.category }) === house;
      }),
    [sortedInScope, bundle.showMeta, houseIndex],
  );

  const refresh = onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.text.secondary} />
  ) : undefined;

  // ── Canon gate ──────────────────────────────────────────────────────
  // Season boundaries come from stats-canon.json. Rendering before it resolves
  // paints EMPTY_CANON — which offers no season scopes, so `defaultScope`
  // returns All time — and then every number on screen silently changes when
  // the canon lands and the default becomes the current season. Hold the whole
  // screen for one AsyncStorage read instead (cache-first, so this is a frame
  // or two on a warm launch).
  if (canonLoading || loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.brand} />
      </View>
    );
  }

  // A failed diary fetch must say so — silently rendering the empty-diary
  // ghost to a full diary reads as data loss (plan Sprint 2 item 4).
  if (error) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Stats are unavailable right now.</Text>
        {onRetry && (
          <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ── Ghost state ─────────────────────────────────────────────────────
  if (allRows.length < MIN_ENTRIES_FOR_STATS) {
    return (
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        refreshControl={refresh}
      >
        <GhostState logged={allRows.length} needed={MIN_ENTRIES_FOR_STATS} onAction={onRateShow} />
      </ScrollView>
    );
  }

  const suffix = scopeSuffix(active);

  // ── Tap-through handlers ────────────────────────────────────────────
  const openHero = (which: 'shows' | 'hours' | 'theaters' | 'period') => {
    if (which === 'hours') {
      setDrilldown({
        title: 'Hours in a seat',
        caption: `${formatHours(bundle.diary.minutesInSeat)} across ${bundle.diary.total} shows${suffix}`,
        reviews: sortedInScope,
        facts: [
          { label: 'Total', value: formatHours(bundle.diary.minutesInSeat) },
          {
            label: 'Average show',
            value: formatHours(Math.round(bundle.diary.minutesInSeat / Math.max(bundle.diary.total, 1))),
          },
          { label: 'Estimated runtimes', value: `${Math.round(bundle.diary.runtimeFallbackShare * 100)}%` },
        ],
      });
      return;
    }
    if (which === 'theaters') {
      setDrilldown({
        title: 'Theaters',
        caption: `${bundle.diary.distinctTheaters} venues${suffix} · ${bundle.diary.distinctBroadwayHouses} Broadway houses`,
        reviews: sortedInScope,
      });
      return;
    }
    setDrilldown({
      title: which === 'period' ? active.label : `Shows${suffix || ' — all time'}`,
      caption: `${bundle.diary.total} ${bundle.diary.total === 1 ? 'entry' : 'entries'}`,
      reviews: sortedInScope,
    });
  };

  const openMonth = (monthKey: string) => {
    const rows = sortedInScope.filter((r) => (r.date_seen ?? '').startsWith(monthKey));
    setDrilldown({
      title: formatMonth(monthKey),
      caption: `${rows.length} ${rows.length === 1 ? 'show' : 'shows'}`,
      reviews: rows,
    });
  };

  const openRecord = (kind: 'busiest' | 'streak') => {
    const { diary } = bundle;
    if (kind === 'busiest' && diary.busiestMonth) {
      openMonth(diary.busiestMonth.month);
      return;
    }
    if (kind === 'streak') {
      // The streak's months are the trailing run of non-empty months.
      // slice(-0) is slice(0) — the WHOLE array — so a zero streak would open a
      // sheet listing every show in scope. Guard it explicitly.
      if (diary.currentStreak <= 0) return;
      const months = diary.byMonth.slice(-diary.currentStreak).map((m) => m.month);
      const rows = sortedInScope.filter((r) => months.some((m) => (r.date_seen ?? '').startsWith(m)));
      setDrilldown({
        title: 'Current streak',
        caption: `${diary.currentStreak} consecutive months with a show`,
        reviews: rows,
      });
    }
  };

  const openHouse = (house: HouseVisit) => {
    const rows = reviewsAtHouse(house.name);
    setDrilldown({
      title: house.name,
      caption: house.visited
        ? `${house.count} ${house.count === 1 ? 'visit' : 'visits'}${suffix}`
        : 'You have not been here yet',
      reviews: rows,
      shows: house.visited
        ? undefined
        : // Unvisited sheet shows what's playing there now, with a route to the
          // show page → tickets (spec §3.3: the completion mechanic feeds bookings).
          shows.filter(
            (s) =>
              (s.status === 'open' || s.status === 'previews') &&
              matchVenueToHouse(s.venue, houseIndex, { category: s.category }) === house.name,
          ),
      facts: [
        { label: 'Capacity', value: house.capacity ? house.capacity.toLocaleString() : '—' },
        { label: 'Opened', value: house.yearBuilt ? String(house.yearBuilt) : '—' },
        { label: 'Your visits', value: String(house.count) },
      ],
      emptyText: house.visited ? 'No shows in this scope.' : 'Nothing playing here right now.',
    });
  };

  const openHouseRecord = (kind: 'home' | 'biggest' | 'smallest' | 'oldest') => {
    const rec = bundle.theaters.records[
      kind === 'home' ? 'homeTheater' : kind
    ];
    if (rec) openHouse(rec);
  };

  const openRing = () => {
    const visited = bundle.theaters.houses.filter((h) => h.visited).map((h) => h.name);
    setDrilldown({
      title: `${bundle.theaters.visited} of ${bundle.theaters.operating} Broadway houses`,
      caption: visited.map(houseShortName).join(' · '),
      reviews: sortedInScope.filter((r) => {
        const meta = bundle.showMeta[r.show_id];
        return !!matchVenueToHouse(meta?.venue, houseIndex, { category: meta?.category });
      }),
    });
  };

  const openExtraCredit = () => {
    const venues = new Set(bundle.theaters.extraCredit.map((e) => e.venue));
    setDrilldown({
      title: 'Beyond Broadway',
      caption: `${venues.size} off-Broadway, West End and regional venues${suffix}`,
      reviews: sortedInScope.filter((r) => venues.has(bundle.showMeta[r.show_id]?.venue ?? '')),
    });
  };

  const openAudience = () => {
    setDrilldown({
      title: 'The audience & you',
      caption: `${bundle.audience.aligned} of ${bundle.audience.comparable} shows within a grade of the audience`,
      reviews: reviewsFor(bundle.audience.alignedShowIds),
    });
  };

  const openAligned = () => {
    setDrilldown({
      title: bundle.critics.label,
      caption: `${bundle.critics.aligned} of ${bundle.critics.comparable} shows within 10 points of the critics`,
      reviews: reviewsFor(bundle.critics.alignedShowIds),
    });
  };

  const openPick = (showId: string) => {
    setDrilldown({
      title: showsById[showId]?.title ?? 'Show',
      caption: 'Your rating vs. the critics',
      reviews: reviewsFor([showId]),
    });
  };

  const openReviewer = (who: Reviewer, label: string) => {
    if (!bundle.statsReviews) return;
    // Lifetime, like Aisle Mates itself — the diary passed to reviewerDetail
    // must match what alignCritics ranked this reviewer against (allRows).
    const detail = reviewerDetail(bundle.allRows, bundle.statsReviews, who);
    const scoreOverrides: Record<string, number> = {};
    for (const s of detail.shared) scoreOverrides[s.showId] = s.theirScore;
    for (const u of detail.unseen) scoreOverrides[u.showId] = u.theirScore;
    const facts =
      detail.biggestAgreementShowId || detail.biggestFightShowId
        ? [
            detail.biggestAgreementShowId
              ? { label: 'Biggest agreement', value: showsById[detail.biggestAgreementShowId]?.title ?? '—' }
              : null,
            detail.biggestFightShowId
              ? { label: 'Biggest fight', value: showsById[detail.biggestFightShowId]?.title ?? '—' }
              : null,
          ].filter((f): f is { label: string; value: string } => f !== null)
        : undefined;
    setDrilldown({
      title: label,
      caption: `${detail.shared.length} shared shows`,
      // Lifetime history, not scoped — reads from the full diary, not reviewsInScope.
      reviews: reviewsFor(
        detail.shared.map((s) => s.showId),
        reviews,
      ),
      shows: detail.unseen.slice(0, 10).map((u) => showsById[u.showId]).filter((s): s is Show => !!s),
      showsLabel: 'Their picks you haven’t seen',
      scoreOverrides,
      facts,
      emptyText: 'No shared shows yet.',
    });
  };

  const openGold = (which: 'seen' | 'unseen') => {
    if (which === 'seen') {
      setDrilldown({
        title: 'Critical Gold you have seen',
        caption: `${bundle.gold.seen} of ${bundle.gold.total} currently open`,
        // Gold coverage is all-time by design, so it reads the full diary.
        reviews: reviewsFor(bundle.gold.seenShowIds, reviews),
      });
      return;
    }
    setDrilldown({
      title: 'Critical Gold to see',
      caption: `${bundle.gold.unseen.length} open shows scoring at Critical Gold`,
      shows: bundle.gold.unseen.map((g) => showsById[g.id]).filter(Boolean),
      emptyText: 'You have seen every Critical Gold show open right now.',
    });
  };

  const openCanonList = (which: 'musical' | 'play', filter: 'seen' | 'unseen' | 'before') => {
    const list = which === 'musical' ? bundle.canonStats.bestMusical : bundle.canonStats.bestPlay;
    const label = which === 'musical' ? 'Best Musical' : 'Best Play';
    if (filter === 'unseen') {
      // Caption must match the rows beneath it: only a fraction of historical
      // winners exist in the catalog, so "51 of 51" over 22 rows read as a bug.
      const inCatalog = list.unseen.map((e) => showsById[e.id]).filter(Boolean);
      const missing = list.unseen.length - inCatalog.length;
      setDrilldown({
        title: `${label} winners to see`,
        caption:
          missing > 0
            ? `${list.unseen.length} unseen · ${inCatalog.length} in the catalog`
            : `${list.unseen.length} of ${list.total}`,
        shows: inCatalog,
        emptyText: 'Every winner in the catalog is in your diary.',
      });
      return;
    }
    const entries = filter === 'before' ? list.entries.filter((e) => e.sawBeforeItWon) : list.entries.filter((e) => e.seen);
    setDrilldown({
      title: filter === 'before' ? `${label}: saw it before it won` : `${label} winners you've seen`,
      caption: `${entries.length} of ${list.total}`,
      reviews: reviewsFor(entries.map((e) => e.id)),
    });
  };

  const openCanonEntry = (entry: CanonEntry) => {
    if (entry.seen) {
      setDrilldown({
        title: entry.t,
        caption: `${entry.season} winner${entry.sawBeforeItWon ? ' — you saw it before it won' : ''}`,
        reviews: reviewsFor([entry.id]),
      });
      return;
    }
    const show = showsById[entry.id];
    setDrilldown({
      title: entry.t,
      caption: `${entry.season} winner — not in your diary`,
      shows: show ? [show] : [],
      emptyText: 'Not in the current catalog.',
    });
  };

  const openBucket = (value: number) => {
    const rows = sortedInScope.filter((r) => Math.round(r.rating * 2) / 2 === value);
    setDrilldown({
      title: `${value}★`,
      caption: `${rows.length} ${rows.length === 1 ? 'show' : 'shows'}${suffix}`,
      reviews: rows,
    });
  };

  const openUnrated = () => {
    const ids = new Set(bundle.histogram.unratedShowIds);
    const rows = sortedInScope.filter((r) => ids.has(r.show_id) && !(r.rating > 0));
    setDrilldown({
      title: 'Not yet rated',
      caption: `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} in your diary without a rating`,
      reviews: rows,
    });
  };

  const selectYear = (year: number) => {
    const target = scopes.find((s) => s.kind === 'year' && s.year === year);
    if (target) setScope(target);
  };

  return (
    <View style={styles.root}>
      {/* Pinned under the header — outside the ScrollView so it never scrolls
          away from the modules it filters (spec §2). */}
      <ScopePill scopes={scopes} active={active} onChange={setScope} />

      <ScrollView
        testID="stats-scroll"
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh}
      >
        <HeroTiles bundle={bundle} scope={active} onOpen={openHero} />
        <ShowsPerYear
          bundle={bundle}
          scope={active}
          onSelectYear={selectYear}
          onOpenMonth={openMonth}
          onOpenRecord={openRecord}
        />
        <TheaterTracker
          bundle={bundle}
          scope={active}
          onOpenHouse={openHouse}
          onOpenRecord={openHouseRecord}
          onOpenRing={openRing}
          onOpenExtraCredit={openExtraCredit}
        />
        <YouVsCritics bundle={bundle} onOpenAligned={openAligned} onOpenPick={openPick} onOpenGold={openGold} />
        {/* "The audience & you" — promised on the mockup's screen 4 as V1 and
            missing from build 61 (audit finding #5). Same ±10-pt band and ≥5
            threshold as the critics gauge. */}
        {bundle.audience.comparable >= 5 && (
          <StatsCard>
            {/* Lifetime module — label it under a dated scope (APoDDAi). */}
            <ModuleHeader
              title="The audience & you"
              caption={active.kind !== 'all' ? 'All time' : undefined}
            />
            <Pressable
              testID="stats-audience-row"
              onPress={openAudience}
              accessibilityRole="button"
              accessibilityLabel={`You agree with the audience grade ${Math.round(bundle.audience.alignment * 100)} percent of the time. Opens the list.`}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Text style={styles.audienceText}>
                You agree with the audience grade{' '}
                <Text style={styles.audiencePct}>{Math.round(bundle.audience.alignment * 100)}%</Text> of the time
                {bundle.audience.alignment >= 0.7
                  ? ' — one of the crowd.'
                  : bundle.audience.alignment >= 0.45
                    ? ' — you go your own way sometimes.'
                    : ' — a true contrarian.'}
              </Text>
            </Pressable>
          </StatsCard>
        )}
        <AisleMates bundle={bundle} onOpenReviewer={openReviewer} />
        <CanonChecklists bundle={bundle} scope={active} onOpenList={openCanonList} onOpenEntry={openCanonEntry} />
        <RatingsModule bundle={bundle} onOpenBucket={openBucket} onOpenUnrated={openUnrated} />

        {bundle.diary.undated > 0 && (
          <Text style={styles.footnote}>
            {bundle.diary.undated} {bundle.diary.undated === 1 ? 'entry has' : 'entries have'} no date, so{' '}
            {bundle.diary.undated === 1 ? 'it does' : 'they do'} not appear in the year, month or season views.
          </Text>
        )}
      </ScrollView>

      <StatsDrilldownSheet payload={drilldown} showsById={showsById} onClose={() => setDrilldown(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.xxl },
  errorText: { color: Colors.text.primary, fontSize: FontSize.md, marginBottom: Spacing.md },
  retryText: { color: Colors.brand, fontSize: FontSize.md, fontWeight: '700', padding: Spacing.sm },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  audienceText: { color: Colors.text.secondary, fontSize: FontSize.sm, lineHeight: 20 },
  audiencePct: { color: Colors.brand, fontWeight: '800' },
  footnote: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
});
