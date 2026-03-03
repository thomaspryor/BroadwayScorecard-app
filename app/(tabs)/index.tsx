/**
 * Home tab — market picker, featured rows, currently playing shows.
 * Defaults to NYC market (Broadway only — no off-broadway). Critics mode only.
 */

import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { FeaturedCarousel } from '@/components/FeaturedCarousel';
import { MarketPicker, Market, filterByMarketCategory } from '@/components/MarketPicker';
import { Show } from '@/lib/types';
import { StaleBanner } from '@/components/StaleBanner';
import { Colors, Spacing, FontSize } from '@/constants/theme';

export default function HomeScreen() {
  const { shows, isLoading, error, refresh } = useShows();
  const insets = useSafeAreaInsets();
  const [market, setMarket] = useState<Market>('nyc');
  const [refreshing, setRefreshing] = useState(false);

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
  const featuredRows = useMemo((): { title: string; shows: Show[] }[] => {
    const rows: { title: string; shows: Show[] }[] = [];
    const now = new Date();
    const isOpen = (s: Show) => s.status === 'open' || s.status === 'previews';
    const byScore = (a: Show, b: Show) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0);

    // Top Shows (overall)
    const top = marketShows.filter(s => isOpen(s) && s.compositeScore != null).sort(byScore).slice(0, 10);
    if (top.length > 0) rows.push({ title: 'Top Shows', shows: top });

    // Top Recent Shows (opened in last 12 months)
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recent = marketShows.filter(s =>
      isOpen(s) && s.compositeScore != null && s.openingDate && s.openingDate >= twelveMonthsAgo
    ).sort(byScore).slice(0, 10);
    if (recent.length >= 3) rows.push({ title: 'Top Recent Shows', shows: recent });

    // Best Musicals
    const musicals = marketShows.filter(s => isOpen(s) && s.type === 'musical' && s.compositeScore != null).sort(byScore).slice(0, 10);
    if (musicals.length >= 3) rows.push({ title: 'Best Musicals', shows: musicals });

    // Best Plays
    const plays = marketShows.filter(s => isOpen(s) && s.type === 'play' && s.compositeScore != null).sort(byScore).slice(0, 10);
    if (plays.length >= 3) rows.push({ title: 'Best Plays', shows: plays });

    // Closing Soon (has closingDate in the next 3 months)
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

  const renderItem = useCallback(({ item, index }: { item: Show; index: number }) => (
    <AnimatedListItem index={index}>
      <ShowCard show={item} hideStatus />
    </AnimatedListItem>
  ), []);

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
                <Text style={styles.brandText}>
                  Broadway{' '}
                  <Text style={styles.brandAccent}>Scorecard</Text>
                </Text>
                <MarketPicker market={market} onChange={setMarket} />
              </View>
              <Text style={styles.subtitle}>
                {scoredCount} shows scored by critics
              </Text>
              <StaleBanner />
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
