/**
 * Home tab — shows currently playing shows sorted by score.
 * Header with branding + FlatList of open shows.
 */

import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { Show } from '@/lib/types';
import { Colors, Spacing, FontSize } from '@/constants/theme';

export default function HomeScreen() {
  const { shows, isLoading, error, isStale } = useShows();
  const insets = useSafeAreaInsets();

  const openShows = useMemo(() => {
    return shows
      .filter(s => s.status === 'open' || s.status === 'previews')
      .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
  }, [shows]);

  const scoredCount = useMemo(() => shows.filter(s => s.compositeScore != null).length, [shows]);

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
        renderItem={({ item }) => <ShowCard show={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.brandText}>Broadway</Text>
            <Text style={styles.brandAccent}>Scorecard</Text>
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
  list: {
    paddingBottom: Spacing.xxl,
  },
});
