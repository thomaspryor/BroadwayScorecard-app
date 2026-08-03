/**
 * Home tab — featured rows, currently playing shows.
 * Defaults to NYC market (Broadway only — no off-broadway). Critics mode only.
 * Profile icon top-right links to settings/profile screen.
 */

import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { ShowListSkeleton } from '@/components/Skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { useShows } from '@/lib/data-context';
import { useMarket } from '@/lib/market-context';
import { useAuth } from '@/lib/auth-context';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useMyRatingsMap } from '@/hooks/useMyRatingsMap';
import { ShowCard } from '@/components/ShowCard';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { FeaturedCarousel } from '@/components/FeaturedCarousel';
import { ClosingSoon } from '@/components/ClosingSoon';
import { filterByMarketCategory } from '@/components/MarketPicker';
import { Show } from '@/lib/types';
import { getQualifiedScore } from '@/lib/score-utils';
import { StaleBanner } from '@/components/StaleBanner';
import { Colors, Spacing, FontSize } from '@/constants/theme';
import { trackDataRefreshed } from '@/lib/analytics';

export default function HomeScreen() {
  const { shows, isLoading, error, refresh } = useShows();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { market } = useMarket();
  const [refreshing, setRefreshing] = useState(false);
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { watchlist, addToWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);
  const watchlistSet = useMemo(() => new Set(watchlist.map(w => w.show_id)), [watchlist]);
  const ratingsMap = useMyRatingsMap(user?.id || null);
  const toggleWatchlist = useCallback(async (showId: string) => {
    if (!isAuthenticated) { showSignIn('watchlist'); return; }
    try {
      if (watchlistSet.has(showId)) await removeFromWatchlist(showId);
      else await addToWatchlist(showId);
    } catch {
      // Hook already sets error state; swallow re-throw to prevent unhandled rejection
    }
  }, [watchlistSet, addToWatchlist, removeFromWatchlist]);

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

  // Themed featured rows
  const featuredRows = useMemo((): { title: string; shows: Show[]; getSubtitle?: (show: Show) => string | undefined }[] => {
    const rows: { title: string; shows: Show[]; getSubtitle?: (show: Show) => string | undefined }[] = [];
    const now = new Date();
    const shortDate = (d: string) => {
      // new Date('T12:00:00') doesn't throw — it yields Invalid Date, whose
      // toLocaleDateString is the literal string "Invalid Date" (beta feedback
      // 2026-07-25: "Opens Invalid Date" on the Starting Soon shelf).
      const parsed = new Date(d + 'T12:00:00');
      if (isNaN(parsed.getTime())) return null;
      return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    const isOpen = (s: Show) => s.status === 'open' || s.status === 'previews';
    // Ranked shelves only admit shows whose score clears the market min-review
    // gate — a 1-review 98 must not top the shelf (Gruffalo, beta 2026-08-01).
    const byScore = (a: Show, b: Show) => (getQualifiedScore(b) ?? 0) - (getQualifiedScore(a) ?? 0);

    // Top Shows (overall)
    const top = marketShows.filter(s => isOpen(s) && getQualifiedScore(s) != null).sort(byScore).slice(0, 10);
    if (top.length > 0) rows.push({ title: 'Top Shows', shows: top });

    // Just Opened — second shelf, most recently opened first (owner ask 2026-08-01)
    // Local-date strings, not toISOString (UTC): in the ET evening UTC is
    // already tomorrow, which would show "Opened <tomorrow>".
    const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayLocal = toLocalDateStr(now);
    const sixtyDaysAgo = toLocalDateStr(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
    const justOpened = marketShows
      .filter(s => s.status === 'open' && s.openingDate && s.openingDate >= sixtyDaysAgo && s.openingDate <= todayLocal)
      .sort((a, b) => (b.openingDate ?? '').localeCompare(a.openingDate ?? ''))
      .slice(0, 10);
    if (justOpened.length >= 2) rows.push({
      title: 'Just Opened',
      shows: justOpened,
      getSubtitle: (s) => {
        const d = shortDate(s.openingDate ?? '');
        return d ? `Opened ${d}` : undefined;
      },
    });

    // Top Recent Shows (opened in last 12 months)
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recent = marketShows.filter(s =>
      isOpen(s) && getQualifiedScore(s) != null && s.openingDate && s.openingDate >= twelveMonthsAgo
    ).sort(byScore).slice(0, 10);
    if (recent.length >= 3) rows.push({ title: 'Top Recent Shows', shows: recent });

    // NYT Critic's Picks
    const nytPicks = marketShows.filter(s => isOpen(s) && s.tags.includes('nyt-pick')).sort(byScore).slice(0, 10);
    if (nytPicks.length >= 2) rows.push({ title: "New York Times Critic's Picks", shows: nytPicks });

    // Tony Award Winners (open shows with tony-winner tag)
    const tonyWinners = marketShows.filter(s => isOpen(s) && s.tags.includes('tony-winner')).sort(byScore).slice(0, 10);
    if (tonyWinners.length >= 2) rows.push({ title: 'Tony Award Winners', shows: tonyWinners });

    // Best Musicals
    const musicals = marketShows.filter(s => isOpen(s) && s.type === 'musical' && getQualifiedScore(s) != null).sort(byScore).slice(0, 10);
    if (musicals.length >= 3) rows.push({ title: 'Best Musicals', shows: musicals });

    // Best Plays
    const plays = marketShows.filter(s => isOpen(s) && s.type === 'play' && getQualifiedScore(s) != null).sort(byScore).slice(0, 10);
    if (plays.length >= 3) rows.push({ title: 'Best Plays', shows: plays });

    // Jukebox Musicals
    const jukebox = marketShows.filter(s => isOpen(s) && s.tags.includes('jukebox')).sort(byScore).slice(0, 10);
    if (jukebox.length >= 2) rows.push({ title: 'Jukebox Musicals', shows: jukebox });

    // Perfect for Date Night (romantic tag, no kids-only age recommendations)
    const dateNight = marketShows.filter(s => {
      if (!isOpen(s)) return false;
      const age = s.ageRecommendation?.toLowerCase() ?? '';
      const isKidsOnly = age.includes('ages 5') || age.includes('ages 6') || age.includes('ages 7') || age.includes('ages 8');
      return !isKidsOnly && s.tags.includes('romantic');
    }).sort(byScore).slice(0, 10);
    if (dateNight.length >= 2) rows.push({ title: 'Perfect for Date Night', shows: dateNight });

    // Great for Kids
    const kids = marketShows.filter(s => {
      if (!isOpen(s)) return false;
      const age = s.ageRecommendation?.toLowerCase() ?? '';
      return age.includes('kids') || age.includes('ages 5') || age.includes('ages 6') || age.includes('ages 7') || age.includes('ages 8') || age.includes('all ages') || s.tags.includes('family');
    }).sort(byScore).slice(0, 10);
    if (kids.length >= 2) rows.push({ title: 'Great for Kids', shows: kids });

    // Best Off-Broadway (NYC market only, separate from main Broadway filter)
    if (market === 'nyc') {
      const offBway = shows
        .filter(s => s.category === 'off-broadway' && isOpen(s) && getQualifiedScore(s) != null)
        .sort(byScore).slice(0, 10);
      if (offBway.length >= 3) rows.push({ title: 'Best Off-Broadway', shows: offBway });
    }

    // Upcoming / In Previews
    const previews = marketShows.filter(s => s.status === 'previews').sort((a, b) => (a.openingDate ?? '').localeCompare(b.openingDate ?? '')).slice(0, 10);
    if (previews.length >= 2) rows.push({
      title: 'Coming Up',
      shows: previews,
      getSubtitle: (s) => {
        const d = shortDate(s.openingDate ?? '');
        return d ? `Opens ${d}` : undefined;
      },
    });

    // Shows Starting Soon (upcoming, not yet in previews)
    const startingSoon = marketShows
      .filter(s => s.status === 'upcoming')
      .sort((a, b) => (a.openingDate ?? '').localeCompare(b.openingDate ?? ''))
      .slice(0, 10);
    if (startingSoon.length >= 2) rows.push({
      title: 'Starting Soon',
      shows: startingSoon,
      getSubtitle: (s) => {
        const d = shortDate(s.openingDate ?? '');
        return d ? `Opens ${d}` : undefined;
      },
    });

    return rows;
  }, [market, marketShows, shows]);

  // Closing Soon — dedicated section with 30-day window and countdown badges
  const closingSoon = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return marketShows
      .filter(s => {
        if (!s.closingDate || s.status === 'closed') return false;
        // Bare `new Date(s.closingDate)` parses YYYY-MM-DD as UTC midnight —
        // in ET that's always earlier than local midnight `now`, so a show
        // closing today silently drops off the shelf.
        const d = new Date(s.closingDate + 'T00:00:00');
        return d >= now && d <= cutoff;
      })
      .sort((a, b) => (a.closingDate ?? '').localeCompare(b.closingDate ?? ''));
  }, [marketShows]);

  const scoredCount = useMemo(() =>
    marketShows.filter(s => s.compositeScore != null).length,
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

            {/* Featured rows */}
            {featuredRows.map((row, i) => (
              <View key={i}>
                <Text style={styles.sectionTitle}>{row.title}</Text>
                <FeaturedCarousel shows={row.shows} watchlistSet={watchlistSet} onToggleWatchlist={toggleWatchlist} getSubtitle={row.getSubtitle} ratingsMap={ratingsMap} />
              </View>
            ))}

            {/* Closing Soon — dedicated section with countdown badges */}
            {closingSoon.length >= 2 && <ClosingSoon shows={closingSoon} />}

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
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 72 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.brand}
          />
        }
      />
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
