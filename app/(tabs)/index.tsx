/**
 * Home tab — market picker, featured carousel, currently playing shows.
 * Defaults to NYC (broadway + off-broadway). Matches website behavior.
 */

import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { FeaturedCarousel } from '@/components/FeaturedCarousel';
import { MarketPicker, Market, filterByMarket } from '@/components/MarketPicker';
import { Show } from '@/lib/types';
import { Colors, Spacing, FontSize } from '@/constants/theme';

export default function HomeScreen() {
  const { shows, isLoading, error, isStale } = useShows();
  const insets = useSafeAreaInsets();
  const [market, setMarket] = useState<Market>('nyc');

  const openShows = useMemo(() => {
    return shows
      .filter(s =>
        (s.status === 'open' || s.status === 'previews') &&
        filterByMarket(s.category, market)
      )
      .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
  }, [shows, market]);

  const featuredShows = useMemo(() => {
    return shows
      .filter(s =>
        (s.status === 'open' || s.status === 'previews') &&
        s.compositeScore != null &&
        filterByMarket(s.category, market)
      )
      .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
      .slice(0, 10);
  }, [shows, market]);

  const scoredCount = useMemo(() =>
    shows.filter(s => s.compositeScore != null && filterByMarket(s.category, market)).length,
    [shows, market]
  );

  const renderItem = useCallback(({ item }: { item: Show }) => <ShowCard show={item} />, []);

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

            {/* Featured carousel */}
            <FeaturedCarousel shows={featuredShows} />

            {/* Section title */}
            <Text style={styles.sectionTitle}>Now Playing</Text>
          </View>
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
    paddingBottom: Spacing.lg,
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
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
});
