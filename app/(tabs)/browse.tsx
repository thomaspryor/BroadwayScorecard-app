/**
 * Browse tab — all shows with market picker, filter pills, and sort controls.
 * Defaults to NYC market (broadway + off-broadway).
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { MarketPicker, Market, filterByMarket } from '@/components/MarketPicker';
import { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

type StatusFilter = 'all' | 'open' | 'previews' | 'closed';
type TypeFilter = 'all' | 'musical' | 'play';
type SortOption = 'score' | 'name' | 'date';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Now Playing' },
  { key: 'previews', label: 'Previews' },
  { key: 'closed', label: 'Closed' },
];

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'musical', label: 'Musicals' },
  { key: 'play', label: 'Plays' },
];

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'name', label: 'A-Z' },
  { key: 'date', label: 'Newest' },
];

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function BrowseScreen() {
  const { shows, isLoading } = useShows();
  const insets = useSafeAreaInsets();
  const [market, setMarket] = useState<Market>('nyc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score');

  const filteredShows = useMemo(() => {
    let result = shows.filter(s => filterByMarket(s.category, market));

    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(s => s.type === typeFilter);
    }

    switch (sortBy) {
      case 'score':
        result.sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1));
        break;
      case 'name':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'date':
        result.sort((a, b) => (b.openingDate ?? '').localeCompare(a.openingDate ?? ''));
        break;
    }

    return result;
  }, [shows, market, statusFilter, typeFilter, sortBy]);

  const totalForMarket = useMemo(
    () => shows.filter(s => filterByMarket(s.category, market)).length,
    [shows, market]
  );

  const renderItem = useCallback(({ item }: { item: Show }) => <ShowCard show={item} />, []);

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
        data={filteredShows}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Browse Shows</Text>
              <MarketPicker market={market} onChange={setMarket} />
            </View>
            <Text style={styles.count}>
              {filteredShows.length} of {totalForMarket} shows
            </Text>

            {/* Status filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {STATUS_OPTIONS.map(opt => (
                <FilterPill
                  key={opt.key}
                  label={opt.label}
                  active={statusFilter === opt.key}
                  onPress={() => setStatusFilter(opt.key)}
                />
              ))}
            </ScrollView>

            {/* Type + Sort */}
            <View style={styles.filterRowInline}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterGroup}>
                {TYPE_OPTIONS.map(opt => (
                  <FilterPill
                    key={opt.key}
                    label={opt.label}
                    active={typeFilter === opt.key}
                    onPress={() => setTypeFilter(opt.key)}
                  />
                ))}
              </ScrollView>
              <View style={styles.sortDivider} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterGroup}>
                {SORT_OPTIONS.map(opt => (
                  <FilterPill
                    key={opt.key}
                    label={opt.label}
                    active={sortBy === opt.key}
                    onPress={() => setSortBy(opt.key)}
                  />
                ))}
              </ScrollView>
            </View>
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
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
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
    paddingHorizontal: Spacing.lg,
  },
  filterRow: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  filterRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  filterGroup: {
    flexShrink: 1,
  },
  sortDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border.default,
    marginHorizontal: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surface.raised,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  pillActive: {
    backgroundColor: Colors.brand + '20',
    borderColor: Colors.brand,
  },
  pillText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  pillTextActive: {
    color: Colors.brand,
    fontWeight: '600',
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
});
