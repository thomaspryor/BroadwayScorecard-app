/**
 * Browse tab — all shows sorted by score with filter/sort options.
 * Sprint 2 will add filter pills and sort controls.
 */

import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { Colors, Spacing, FontSize } from '@/constants/theme';

export default function BrowseScreen() {
  const { shows, isLoading } = useShows();
  const insets = useSafeAreaInsets();

  const sortedShows = useMemo(() => {
    return [...shows].sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
  }, [shows]);

  if (isLoading && shows.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={sortedShows}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ShowCard show={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Browse Shows</Text>
            <Text style={styles.count}>{shows.length} shows</Text>
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
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  count: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
});
