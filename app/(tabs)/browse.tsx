/**
 * Browse tab — all shows with market picker, score toggle, filter pills, and sort controls.
 * Defaults to NYC market (broadway + off-broadway).
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { MarketPicker, Market, filterByMarketCategory } from '@/components/MarketPicker';
import { ScoreToggle, ScoreMode } from '@/components/ScoreToggle';
import { Show } from '@/lib/types';
import { StaleBanner } from '@/components/StaleBanner';
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

function FilterPill({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  const activeColor = color ?? Colors.brand;
  return (
    <Pressable
      style={[styles.pill, active && [styles.pillActive, { backgroundColor: activeColor + '20', borderColor: activeColor }]]}
      onPress={onPress}
    >
      <Text style={[styles.pillText, active && [styles.pillTextActive, { color: activeColor }]]}>{label}</Text>
    </Pressable>
  );
}

export default function BrowseScreen() {
  const { shows, isLoading, refresh } = useShows();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const [market, setMarket] = useState<Market>('nyc');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('critics');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [includeOB, setIncludeOB] = useState(false);

  const filteredShows = useMemo(() => {
    let result = shows.filter(s => filterByMarketCategory(s.category, market, includeOB));

    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(s => s.type === typeFilter);
    }

    switch (sortBy) {
      case 'score':
        if (scoreMode === 'audience') {
          result.sort((a, b) => {
            const aGrade = a.audienceGrade?.grade ?? 'Z';
            const bGrade = b.audienceGrade?.grade ?? 'Z';
            return aGrade.localeCompare(bGrade);
          });
        } else {
          result.sort((a, b) => (b.compositeScore ?? -1) - (a.compositeScore ?? -1));
        }
        break;
      case 'name':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'date':
        result.sort((a, b) => (b.openingDate ?? '').localeCompare(a.openingDate ?? ''));
        break;
    }

    return result;
  }, [shows, market, includeOB, statusFilter, typeFilter, sortBy, scoreMode]);

  const totalForMarket = useMemo(
    () => shows.filter(s => filterByMarketCategory(s.category, market, includeOB)).length,
    [shows, market, includeOB]
  );

  const renderItem = useCallback(({ item }: { item: Show }) => (
    <ShowCard show={item} scoreMode={scoreMode} hideStatus={statusFilter === 'open'} />
  ), [scoreMode, statusFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); } catch {}
    setRefreshing(false);
  }, [refresh]);

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
          <View>
            <StaleBanner />
            <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Browse Shows</Text>
              <MarketPicker market={market} onChange={setMarket} />
            </View>
            <Text style={styles.count}>
              {filteredShows.length} of {totalForMarket} shows
            </Text>

            {/* Status filter + Score toggle */}
            <View style={styles.statusRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterGroup}>
                {STATUS_OPTIONS.map(opt => (
                  <FilterPill
                    key={opt.key}
                    label={opt.label}
                    active={statusFilter === opt.key}
                    onPress={() => setStatusFilter(opt.key)}
                  />
                ))}
              </ScrollView>
              <ScoreToggle mode={scoreMode} onChange={setScoreMode} />
            </View>

            {/* Type + Sort + OB toggle */}
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
                <View style={styles.sortDivider} />
                {SORT_OPTIONS.map(opt => (
                  <FilterPill
                    key={opt.key}
                    label={opt.label}
                    active={sortBy === opt.key}
                    onPress={() => setSortBy(opt.key)}
                  />
                ))}
                {market === 'nyc' && (
                  <>
                    <View style={styles.sortDivider} />
                    <FilterPill
                      label="Off-Bway"
                      active={includeOB}
                      onPress={() => setIncludeOB(!includeOB)}
                      color="#14b8a6"
                    />
                  </>
                )}
              </ScrollView>
            </View>
          </View>
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
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No shows match your filters</Text>
            </View>
          ) : null
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  emptyState: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
});
