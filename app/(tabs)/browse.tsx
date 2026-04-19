/**
 * Browse tab — all shows with market picker, score toggle, filter pills, and sort controls.
 * Defaults to NYC market (broadway + off-broadway).
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, ScrollView, Pressable, RefreshControl, Platform } from 'react-native';
import Fuse, { IFuseOptions } from 'fuse.js';
import { ShowListSkeleton } from '@/components/Skeleton';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShows } from '@/lib/data-context';
import { ShowCard } from '@/components/ShowCard';
import { AnimatedListItem } from '@/components/AnimatedListItem';
import { MarketPicker, Market, filterByMarketCategory } from '@/components/MarketPicker';
import { ScoreToggle, ScoreMode } from '@/components/ScoreToggle';
import { Show } from '@/lib/types';
import { StaleBanner } from '@/components/StaleBanner';
import { useAuth } from '@/lib/auth-context';
import { useWatchlist } from '@/hooks/useWatchlist';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { trackFilterChanged, trackScoreModeToggled, trackMarketChanged, trackDataRefreshed } from '@/lib/analytics';

// Grade ordering: A+ is best (0), then A (1), A- (2), B+ (3), etc.
const GRADE_ORDER: Record<string, number> = {
  'A+': 0, 'A': 1, 'A-': 2,
  'B+': 3, 'B': 4, 'B-': 5,
  'C+': 6, 'C': 7, 'C-': 8,
  'D+': 9, 'D': 10, 'D-': 11,
  'F': 12,
};

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
  const handlePress = () => {
    if (!active && Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };
  return (
    <Pressable
      style={[styles.pill, active && [styles.pillActive, { backgroundColor: activeColor + '20', borderColor: activeColor }]]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.pillText, active && [styles.pillTextActive, { color: activeColor }]]}>{label}</Text>
    </Pressable>
  );
}

const FUSE_OPTIONS: IFuseOptions<Show> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'venue', weight: 1 },
    { name: 'creativeTeam.name', weight: 0.7 },
  ],
  threshold: 0.35,
  includeScore: true,
  minMatchCharLength: 2,
};

export default function BrowseScreen() {
  const { shows, isLoading, refresh, error } = useShows();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const [market, setMarket] = useState<Market>('nyc');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('critics');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [includeOB, setIncludeOB] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const isWestEnd = market === 'london';
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { watchlist, addToWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);
  const watchlistSet = useMemo(() => new Set(watchlist.map(w => w.show_id)), [watchlist]);
  const toggleWatchlist = useCallback(async (showId: string) => {
    if (!isAuthenticated) { showSignIn('watchlist'); return; }
    try {
      if (watchlistSet.has(showId)) await removeFromWatchlist(showId);
      else await addToWatchlist(showId);
    } catch {
      // Hook already sets error state; swallow re-throw to prevent unhandled rejection
    }
  }, [isAuthenticated, showSignIn, watchlistSet, addToWatchlist, removeFromWatchlist]);

  // Fuse search
  const fuse = useMemo(() => new Fuse(shows, FUSE_OPTIONS), [shows]);
  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return null;
    return fuse.search(q, { limit: 50 }).map(r => r.item);
  }, [fuse, searchQuery]);

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
            const aOrder = GRADE_ORDER[a.audienceGrade?.grade ?? ''] ?? 99;
            const bOrder = GRADE_ORDER[b.audienceGrade?.grade ?? ''] ?? 99;
            if (aOrder !== bOrder) return aOrder - bOrder;
            // Tiebreaker: higher composite score first within same grade
            return (b.compositeScore ?? -1) - (a.compositeScore ?? -1);
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

  const renderItem = useCallback(({ item, index }: { item: Show; index: number }) => (
    <AnimatedListItem index={index}>
      <ShowCard show={item} scoreMode={scoreMode} hideStatus={statusFilter === 'open'} isWatchlisted={watchlistSet.has(item.id)} onToggleWatchlist={() => toggleWatchlist(item.id)} />
    </AnimatedListItem>
  ), [scoreMode, statusFilter, watchlistSet, toggleWatchlist]);

  const handleMarketChange = useCallback((m: Market) => {
    setMarket(m);
    trackMarketChanged(m, 'browse');
  }, []);

  const handleScoreModeChange = useCallback((m: ScoreMode) => {
    setScoreMode(m);
    trackScoreModeToggled(m, 'browse');
  }, []);

  const handleStatusFilter = useCallback((s: StatusFilter) => {
    setStatusFilter(s);
    trackFilterChanged('status', s, 'browse');
  }, []);

  const handleTypeFilter = useCallback((t: TypeFilter) => {
    setTypeFilter(t);
    trackFilterChanged('type', t, 'browse');
  }, []);

  const handleSortChange = useCallback((s: SortOption) => {
    setSortBy(s);
    trackFilterChanged('sort', s, 'browse');
  }, []);

  const handleOBToggle = useCallback(() => {
    const newVal = !includeOB;
    setIncludeOB(newVal);
    trackFilterChanged('off_broadway', String(newVal), 'browse');
  }, [includeOB]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    trackDataRefreshed('pull_to_refresh', 'browse');
    try { await refresh(); } catch {}
    setRefreshing(false);
  }, [refresh]);

  if (isLoading && shows.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ShowListSkeleton count={12} />
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
        data={searchResults ?? filteredShows}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            <StaleBanner />
            <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{isWestEnd ? 'West End Shows' : 'Browse'}</Text>
              <MarketPicker market={market} onChange={handleMarketChange} />
            </View>

            {/* Search bar */}
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Search shows..."
                placeholderTextColor={Colors.text.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {!searchResults && (
            <Text style={styles.count}>
              {filteredShows.length} of {totalForMarket} shows
            </Text>
            )}
            {searchResults && (
            <Text style={styles.count}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery.trim()}&rdquo;
            </Text>
            )}

            {/* Status filter + Score toggle (hidden during search) */}
            {!searchResults && <View style={styles.statusRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterGroup}>
                {STATUS_OPTIONS.map(opt => (
                  <FilterPill
                    key={opt.key}
                    label={opt.label}
                    active={statusFilter === opt.key}
                    onPress={() => handleStatusFilter(opt.key)}
                  />
                ))}
              </ScrollView>
              <ScoreToggle mode={scoreMode} onChange={handleScoreModeChange} />
            </View>

            }
            {/* Type + Sort + OB toggle */}
            {!searchResults && <View style={styles.filterRowInline}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterGroup}>
                {TYPE_OPTIONS.map(opt => (
                  <FilterPill
                    key={opt.key}
                    label={opt.label}
                    active={typeFilter === opt.key}
                    onPress={() => handleTypeFilter(opt.key)}
                  />
                ))}
                <View style={styles.sortDivider} />
                {SORT_OPTIONS.map(opt => (
                  <FilterPill
                    key={opt.key}
                    label={opt.label}
                    active={sortBy === opt.key}
                    onPress={() => handleSortChange(opt.key)}
                  />
                ))}
                {market === 'nyc' && (
                  <>
                    <View style={styles.sortDivider} />
                    <FilterPill
                      label="Off-Bway"
                      active={includeOB}
                      onPress={handleOBToggle}
                      color="#14b8a6"
                    />
                  </>
                )}
              </ScrollView>
            </View>}
          </View>
          </View>
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        windowSize={5}
        maxToRenderPerBatch={8}
        initialNumToRender={10}
        removeClippedSubviews
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: FontSize.md,
    padding: 0,
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
  errorText: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  hintText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
});
