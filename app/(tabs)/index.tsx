/**
 * Home tab — featured rows, currently playing shows.
 * Defaults to NYC market (Broadway only — no off-broadway). Critics mode only.
 * Profile icon top-right links to settings/profile screen.
 */

import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { ShowListSkeleton } from '@/components/Skeleton';
import { BottomScrim } from '@/components/BottomScrim';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { useShows } from '@/lib/data-context';
import { useMarket } from '@/lib/market-context';
import { useAuth } from '@/lib/auth-context';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useLocalWatchlist } from '@/hooks/useLocalWatchlist';
import { useMyRatingsMap } from '@/hooks/useMyRatingsMap';
import { ShowCard } from '@/components/ShowCard';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { FeaturedCarousel } from '@/components/FeaturedCarousel';
import { ClosingSoon } from '@/components/ClosingSoon';
import { filterByMarketCategory } from '@/components/MarketPicker';
import { Show } from '@/lib/types';
import { getQualifiedScore } from '@/lib/score-utils';
import { toLocalYMD } from '@/lib/date-utils';
import {
  hasTagCI,
  isDateNightShow,
  isRankedShelfEligible,
  isTopRecentCandidate,
  selectClosingSoon,
  selectStartingSoon,
  shortMonthDay,
  startingSoonSubtitle,
} from '@/lib/home-shelves';
import { StaleBanner } from '@/components/StaleBanner';
import { Colors, Spacing, FontSize, BorderRadius, TAB_BAR_CLEARANCE } from '@/constants/theme';
import { trackDataRefreshed } from '@/lib/analytics';

export default function HomeScreen() {
  const { shows, isLoading, error, refresh } = useShows();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { market } = useMarket();
  const [refreshing, setRefreshing] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { localList, toggleLocal } = useLocalWatchlist();
  const { watchlist, addToWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);
  // Signed out, the bookmarks show what's saved on this phone (BRO-4727).
  const watchlistSet = useMemo(
    () => new Set(isAuthenticated ? watchlist.map(w => w.show_id) : localList.map(e => e.showId)),
    [isAuthenticated, watchlist, localList],
  );
  const ratingsMap = useMyRatingsMap(user?.id || null);
  const toggleWatchlist = useCallback(async (showId: string) => {
    if (!isAuthenticated) { await toggleLocal(showId, 'show_bookmark'); return; }
    try {
      if (watchlistSet.has(showId)) await removeFromWatchlist(showId);
      else await addToWatchlist(showId);
    } catch {
      // Hook already sets error state; swallow re-throw to prevent unhandled rejection
    }
  }, [isAuthenticated, toggleLocal, watchlistSet, addToWatchlist, removeFromWatchlist]);

  // Home: Broadway-only for NYC (no off-broadway), all west-end for London
  const marketShows = useMemo(
    () => shows.filter(s => filterByMarketCategory(s.category, market, false)),
    [shows, market]
  );

  // Main list: open shows only (no previews), sorted by newest opening date
  const openShows = useMemo(() => {
    return marketShows
      .filter(s => s.status === 'open')
      .sort((a, b) => (b.openingDate ?? '').localeCompare(a.openingDate ?? ''));
  }, [marketShows]);

  // Themed featured rows. Each rule is a port of the website home page
  // (src/app/page.tsx) kept in lib/home-shelves.ts with unit tests.
  const featuredRows = useMemo((): { title: string; shows: Show[]; getSubtitle?: (show: Show) => string | undefined }[] => {
    const rows: { title: string; shows: Show[]; getSubtitle?: (show: Show) => string | undefined }[] = [];
    const now = new Date();
    const isOpen = (s: Show) => s.status === 'open' || s.status === 'previews';
    // Score-ranked shelves leave opera out (the website gives it its own
    // shelf). Kept local so non-ranked shelves (Just Opened, Starting Soon)
    // still list a Met production.
    const ranked = marketShows.filter(isRankedShelfEligible);
    // Ranked shelves only admit shows whose score clears the market min-review
    // gate — a 1-review 98 must not top the shelf (Gruffalo, beta 2026-08-01).
    const byScore = (a: Show, b: Show) => (getQualifiedScore(b) ?? 0) - (getQualifiedScore(a) ?? 0);

    // Top Shows (overall)
    const top = ranked.filter(s => isOpen(s) && getQualifiedScore(s) != null).sort(byScore).slice(0, 10);
    if (top.length > 0) rows.push({ title: 'Top Shows', shows: top });

    // Just Opened — second shelf, most recently opened first (owner ask 2026-08-01)
    // Local-date strings, not toISOString (UTC): in the ET evening UTC is
    // already tomorrow, which would show "Opened <tomorrow>".
    const todayLocal = toLocalYMD(now);
    const sixtyDaysAgo = toLocalYMD(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
    const justOpened = marketShows
      .filter(s => s.status === 'open' && s.openingDate && s.openingDate >= sixtyDaysAgo && s.openingDate <= todayLocal)
      .sort((a, b) => (b.openingDate ?? '').localeCompare(a.openingDate ?? ''))
      .slice(0, 10);
    if (justOpened.length >= 2) rows.push({
      title: 'Just Opened',
      shows: justOpened,
      getSubtitle: (s) => {
        const d = shortMonthDay(s.openingDate);
        return d ? `Opened ${d}` : undefined;
      },
    });

    // ─── Shelves 3-5 (owner ask 2026-08-03, ADnQ3mUB: "move these three
    // shelves to be the 3rd, 4th and 5th") — Best Off-Broadway, Starting Soon,
    // then Closing Soon, which is rendered by its own component right after
    // this list's 4th entry (see CLOSING_SOON_INDEX in the render).

    // Best Off-Broadway (NYC market only, separate from main Broadway filter)
    if (market === 'nyc') {
      const offBway = shows
        .filter(s => s.category === 'off-broadway' && isRankedShelfEligible(s) && isOpen(s) && getQualifiedScore(s) != null)
        .sort(byScore).slice(0, 10);
      if (offBway.length >= 3) rows.push({ title: 'Best Off-Broadway', shows: offBway });
    }

    // Starting Soon: in previews, or upcoming with a first-preview/opening
    // date, by next milestone. Previews read "Opens <opening>", upcoming
    // "Starts <first preview>". This replaces the separate "Coming Up"
    // (previews) shelf, which repeated the same shows.
    const startingSoon = selectStartingSoon(marketShows).slice(0, 10);
    if (startingSoon.length >= 2) rows.push({
      title: 'Starting Soon',
      shows: startingSoon,
      getSubtitle: startingSoonSubtitle,
    });

    // Top Recent Shows: open musicals and plays that opened in the last 12 months
    const recent = ranked
      .filter(s => isTopRecentCandidate(s, now) && getQualifiedScore(s) != null)
      .sort(byScore).slice(0, 10);
    if (recent.length >= 3) rows.push({ title: 'Top Recent Shows', shows: recent });

    // NYT Critic's Picks
    const nytPicks = ranked.filter(s => isOpen(s) && hasTagCI(s, 'nyt-pick')).sort(byScore).slice(0, 10);
    if (nytPicks.length >= 2) rows.push({ title: "New York Times Critic's Picks", shows: nytPicks });

    // Tony Award Winners (open shows with tony-winner tag)
    const tonyWinners = ranked.filter(s => isOpen(s) && hasTagCI(s, 'tony-winner')).sort(byScore).slice(0, 10);
    if (tonyWinners.length >= 2) rows.push({ title: 'Tony Award Winners', shows: tonyWinners });

    // Best Plays — above Best Musicals (beta feedback 2026-08-04, AIYmmSht)
    const plays = ranked.filter(s => isOpen(s) && s.type === 'play' && getQualifiedScore(s) != null).sort(byScore).slice(0, 10);
    if (plays.length >= 3) rows.push({ title: 'Best Plays', shows: plays });

    // Best Musicals
    const musicals = ranked.filter(s => isOpen(s) && s.type === 'musical' && getQualifiedScore(s) != null).sort(byScore).slice(0, 10);
    if (musicals.length >= 3) rows.push({ title: 'Best Musicals', shows: musicals });

    // Jukebox Musicals
    const jukebox = ranked.filter(s => isOpen(s) && hasTagCI(s, 'jukebox')).sort(byScore).slice(0, 10);
    if (jukebox.length >= 2) rows.push({ title: 'Jukebox Musicals', shows: jukebox });

    // Perfect for Date Night: romantic or drama, no kids-only age recommendation
    const dateNight = ranked.filter(s => isOpen(s) && isDateNightShow(s)).sort(byScore).slice(0, 10);
    if (dateNight.length >= 2) rows.push({ title: 'Perfect for Date Night', shows: dateNight });

    // Great for Kids
    const kids = ranked.filter(s => {
      if (!isOpen(s)) return false;
      const age = s.ageRecommendation?.toLowerCase() ?? '';
      return age.includes('kids') || age.includes('ages 5') || age.includes('ages 6') || age.includes('ages 7') || age.includes('ages 8') || age.includes('all ages') || hasTagCI(s, 'family');
    }).sort(byScore).slice(0, 10);
    if (kids.length >= 2) rows.push({ title: 'Great for Kids', shows: kids });

    return rows;
  }, [market, marketShows, shows]);

  // Closing Soon — dedicated section with countdown badges: open shows
  // closing within 120 days (website rule; lib/home-shelves.ts).
  const closingSoon = useMemo(() => selectClosingSoon(marketShows), [marketShows]);

  // Closing Soon renders as the 5th shelf — after featuredRows[3] (owner ask
  // 2026-08-03, ADnQ3mUB). Clamped so a short row list still renders it once.
  const showClosingSoon = closingSoon.length >= 2;
  const closingSoonAfterIndex = Math.min(3, featuredRows.length - 1);

  // Counts shows with a displayable score (the same gate as every badge), so
  // a 1-review show the app shows as TBD is not counted as "scored".
  const scoredCount = useMemo(() =>
    marketShows.filter(s => getQualifiedScore(s) != null).length,
    [marketShows]
  );

  const totalReviews = useMemo(() =>
    marketShows.reduce((sum, s) => sum + (s.criticScore?.reviewCount ?? 0), 0),
    [marketShows]
  );

  const isWestEnd = market === 'london';
  const accentColor = isWestEnd ? Colors.brandWestEnd : Colors.brand;

  const renderItem = useCallback(({ item, index }: { item: Show; index: number }) => (
    <AnimatedListItem index={index}>
      <ShowCard show={item} hideStatus isWatchlisted={watchlistSet.has(item.id)} onToggleWatchlist={() => toggleWatchlist(item.id)} myRating={ratingsMap.get(item.id) ?? null} />
    </AnimatedListItem>
  ), [watchlistSet, toggleWatchlist, ratingsMap]);

  const handleProfilePress = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    trackDataRefreshed('pull_to_refresh', 'home');
    try { await refresh(); } catch {}
    setRefreshing(false);
  }, [refresh]);

  if (isLoading && shows.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ShowListSkeleton count={10} />
      </View>
    );
  }

  if (error && shows.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.hintText}>Check your internet connection and try again.</Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
          onPress={onRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          accessibilityState={{ busy: refreshing }}
        >
          <Text style={styles.retryText}>{refreshing ? 'Loading…' : 'Try Again'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={openShows}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        windowSize={5}
        maxToRenderPerBatch={8}
        initialNumToRender={10}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            {/* Brand header + profile icon */}
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <Text style={styles.brandText}>
                  {isWestEnd ? 'WestEnd' : 'Broadway'}{' '}
                  <Text style={[styles.brandAccent, { color: accentColor }]}>Scorecard</Text>
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.profileIcon, pressed && { opacity: 0.7 }]}
                  onPress={handleProfilePress}
                  hitSlop={8}
                  accessibilityLabel="Profile and settings"
                >
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2}>
                    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <Circle cx={12} cy={7} r={4} />
                  </Svg>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>
                {scoredCount} shows scored by {totalReviews.toLocaleString()} reviews
              </Text>
              <StaleBanner />
            </View>

            {/* Featured rows. Closing Soon is its own component (countdown
                badges) but the owner wants it as the 5th shelf, i.e. straight
                after the 4th entry above (ADnQ3mUB) — so it's interleaved
                here rather than appended. If fewer than 4 shelves survive
                their thresholds it falls to the end, which is still last. */}
            {featuredRows.map((row, i) => (
              <View key={i}>
                <Text style={styles.sectionTitle}>{row.title}</Text>
                <FeaturedCarousel shows={row.shows} watchlistSet={watchlistSet} onToggleWatchlist={toggleWatchlist} getSubtitle={row.getSubtitle} ratingsMap={ratingsMap} />
                {showClosingSoon && i === closingSoonAfterIndex && <ClosingSoon shows={closingSoon} />}
              </View>
            ))}
            {showClosingSoon && featuredRows.length === 0 && <ClosingSoon shows={closingSoon} />}

            {/* Main list title */}
            <Text style={styles.sectionTitle}>Now Playing</Text>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ padding: Spacing.xxl, alignItems: 'center' as const }}>
              <Text style={styles.hintText}>No open shows found in this market.</Text>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.brand}
          />
        }
      />
      <BottomScrim height={insets.bottom + TAB_BAR_CLEARANCE / 2} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    marginTop: Spacing.md,
  },
  errorText: {
    color: Colors.score.red,
    fontSize: FontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  hintText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.brand,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  retryText: {
    color: Colors.text.inverse,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  profileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  brandText: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  brandAccent: {
    color: Colors.brand,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
});
