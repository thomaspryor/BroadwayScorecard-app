/**
 * Home tab — market picker, score toggle, featured rows, currently playing shows.
 * Defaults to NYC market (broadway + off-broadway), critics mode.
 */

import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { FeaturedCarousel } from '@/components/FeaturedCarousel';
import { MarketPicker, Market, filterByMarket } from '@/components/MarketPicker';
import { ScoreToggle, ScoreMode } from '@/components/ScoreToggle';
import { Show } from '@/lib/types';
import { Colors, Spacing, FontSize } from '@/constants/theme';

/** A themed featured row definition */
interface FeaturedRow {
  title: string;
  filter: (s: Show) => boolean;
  sort?: (a: Show, b: Show) => number;
  limit?: number;
}

export default function HomeScreen() {
  const { shows, isLoading, error, isStale, refresh } = useShows();
  const insets = useSafeAreaInsets();
  const [market, setMarket] = useState<Market>('nyc');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('critics');
  const [refreshing, setRefreshing] = useState(false);

  const marketShows = useMemo(
    () => shows.filter(s => filterByMarket(s.category, market)),
    [shows, market]
  );

  const openShows = useMemo(() => {
    const filtered = marketShows.filter(s => s.status === 'open' || s.status === 'previews');
    if (scoreMode === 'audience') {
      return filtered.sort((a, b) => {
        const aGrade = a.audienceGrade?.grade ?? 'Z';
        const bGrade = b.audienceGrade?.grade ?? 'Z';
        return aGrade.localeCompare(bGrade);
      });
    }
    return filtered.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
  }, [marketShows, scoreMode]);

  // Themed featured rows
  const featuredRows = useMemo((): { title: string; shows: Show[] }[] => {
    const rows: { title: string; shows: Show[] }[] = [];
    const isOpen = (s: Show) => s.status === 'open' || s.status === 'previews';
    const byScore = (a: Show, b: Show) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0);

    // Top Shows (overall)
    const top = marketShows.filter(s => isOpen(s) && s.compositeScore != null).sort(byScore).slice(0, 10);
    if (top.length > 0) rows.push({ title: 'Top Shows', shows: top });

    // Best Musicals
    const musicals = marketShows.filter(s => isOpen(s) && s.type === 'musical' && s.compositeScore != null).sort(byScore).slice(0, 10);
    if (musicals.length >= 3) rows.push({ title: 'Best Musicals', shows: musicals });

    // Best Plays
    const plays = marketShows.filter(s => isOpen(s) && s.type === 'play' && s.compositeScore != null).sort(byScore).slice(0, 10);
    if (plays.length >= 3) rows.push({ title: 'Best Plays', shows: plays });

    // Closing Soon (has closingDate in the next 3 months)
    const now = new Date();
    const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const closing = marketShows.filter(s => {
      if (!s.closingDate || s.status === 'closed') return false;
      const d = new Date(s.closingDate);
      return d >= now && d <= threeMonths;
    }).sort((a, b) => (a.closingDate ?? '').localeCompare(b.closingDate ?? '')).slice(0, 10);
    if (closing.length >= 2) rows.push({ title: 'Closing Soon', shows: closing });

    // Great for Kids
    const kids = marketShows.filter(s => {
      if (!isOpen(s)) return false;
      const age = s.ageRecommendation?.toLowerCase() ?? '';
      return age.includes('kids') || age.includes('ages 5') || age.includes('ages 6') || age.includes('ages 7') || age.includes('ages 8') || age.includes('all ages');
    }).sort(byScore).slice(0, 10);
    if (kids.length >= 2) rows.push({ title: 'Great for Kids', shows: kids });

    // Upcoming / In Previews
    const previews = marketShows.filter(s => s.status === 'previews').sort((a, b) => (a.openingDate ?? '').localeCompare(b.openingDate ?? '')).slice(0, 10);
    if (previews.length >= 2) rows.push({ title: 'Coming Up', shows: previews });

    return rows;
  }, [marketShows]);

  const scoredCount = useMemo(() =>
    marketShows.filter(s => s.compositeScore != null).length,
    [marketShows]
  );

  const renderItem = useCallback(({ item }: { item: Show }) => <ShowCard show={item} scoreMode={scoreMode} />, [scoreMode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } catch {}
    setRefreshing(false);
  }, [refresh]);

  if (isLoading && shows.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.brand} />
        <Text style={styles.loadingText}>Loading shows...</Text>
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
        ListHeaderComponent={
          <View>
            {/* Brand header + market picker */}
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.brandText}>Broadway</Text>
                  <Text style={styles.brandAccent}>Scorecard</Text>
                </View>
                <MarketPicker market={market} onChange={setMarket} />
              </View>
              <Text style={styles.subtitle}>
                {scoredCount} shows scored by critics
              </Text>
              {isStale && (
                <View style={styles.staleBanner}>
                  <Text style={styles.staleText}>
                    Showing cached data. Pull to refresh.
                  </Text>
                </View>
              )}
            </View>

            {/* Score toggle */}
            <View style={styles.toggleRow}>
              <ScoreToggle mode={scoreMode} onChange={setScoreMode} />
            </View>

            {/* Featured rows */}
            {featuredRows.map((row, i) => (
              <View key={i}>
                <Text style={styles.sectionTitle}>{row.title}</Text>
                <FeaturedCarousel shows={row.shows} />
              </View>
            ))}

            {/* Main list title */}
            <Text style={styles.sectionTitle}>Now Playing</Text>
          </View>
        }
        contentContainerStyle={styles.list}
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
  brandText: {
    color: Colors.text.primary,
    fontSize: FontSize.title,
    fontWeight: '700',
  },
  brandAccent: {
    color: Colors.brand,
    fontSize: FontSize.title,
    fontWeight: '700',
    marginTop: -4,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  staleBanner: {
    backgroundColor: Colors.score.amber + '20',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    marginTop: Spacing.md,
  },
  staleText: {
    color: Colors.score.amber,
    fontSize: FontSize.sm,
  },
  toggleRow: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
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
