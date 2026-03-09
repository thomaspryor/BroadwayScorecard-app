/**
 * To Watch tab — watchlist of shows to see.
 *
 * Sections: Upcoming (with planned dates), regular Watchlist (no dates).
 * Grid/list view toggle, sort options: added-desc, alphabetical, closing-soon.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { featureFlags } from '@/lib/feature-flags';
import type { WatchlistEntry } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import * as haptics from '@/lib/haptics';

type WatchlistSort = 'added-desc' | 'alphabetical' | 'closing-soon';
type ViewMode = 'list' | 'grid';

function SwipeDeleteAction({ onDelete, drag }: { onDelete: () => void; drag: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + 80 }],
  }));
  return (
    <Animated.View style={[styles.swipeDelete, animatedStyle]}>
      <Pressable style={styles.swipeDeleteInner} onPress={onDelete}>
        <Text style={styles.swipeDeleteText}>Remove</Text>
      </Pressable>
    </Animated.View>
  );
}

function EmptyState({ emoji, title, subtitle, actionLabel, onAction }: {
  emoji: string; title: string; subtitle: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <Pressable style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]} onPress={onAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ToWatchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, showSignIn } = useAuth();
  const { reviews, getAllReviews } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, removeFromWatchlist, updatePlannedDate, loading: watchlistLoading } = useWatchlist(user?.id || null);
  const { shows } = useShows();

  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>('added-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [datePickingShowId, setDatePickingShowId] = useState<string | null>(null);

  const showMap = useMemo(() => {
    const map: Record<string, Show> = {};
    for (const s of shows) map[s.id] = s;
    return map;
  }, [shows]);

  useEffect(() => {
    if (isAuthenticated && user) {
      getWatchlist();
      getAllReviews();
    }
  }, [isAuthenticated, user, getWatchlist, getAllReviews]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user) {
        getWatchlist();
        getAllReviews();
      }
    }, [isAuthenticated, user, getWatchlist, getAllReviews]),
  );

  const loading = authLoading || watchlistLoading;
  const today = new Date().toISOString().split('T')[0];
  const reviewedShowIds = useMemo(() => new Set(reviews.map(r => r.show_id)), [reviews]);

  // Split: upcoming (future planned dates), regular (no date or no planned date)
  // Exclude "to be rated" items (past date, no review) — those go to Watched tab
  const { upcomingWatchlist, regularWatchlist } = useMemo(() => {
    const upcoming: WatchlistEntry[] = [];
    const regular: WatchlistEntry[] = [];
    for (const w of watchlist) {
      if (w.planned_date && w.planned_date < today && !reviewedShowIds.has(w.show_id)) {
        continue; // "to be rated" — handled by Watched tab
      } else if (w.planned_date && w.planned_date >= today) {
        upcoming.push(w);
      } else {
        regular.push(w);
      }
    }
    upcoming.sort((a, b) => (a.planned_date || '').localeCompare(b.planned_date || ''));
    return { upcomingWatchlist: upcoming, regularWatchlist: regular };
  }, [watchlist, today, reviewedShowIds]);

  const sortedWatchlist = useMemo(() => {
    const sorted = [...regularWatchlist];
    switch (watchlistSort) {
      case 'added-desc':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'alphabetical':
        return sorted.sort((a, b) => {
          const titleA = showMap[a.show_id]?.title || '';
          const titleB = showMap[b.show_id]?.title || '';
          return titleA.localeCompare(titleB);
        });
      case 'closing-soon':
        return sorted.sort((a, b) => {
          const closingA = showMap[a.show_id]?.closingDate || '9999-12-31';
          const closingB = showMap[b.show_id]?.closingDate || '9999-12-31';
          return closingA.localeCompare(closingB);
        });
      default:
        return sorted;
    }
  }, [regularWatchlist, watchlistSort, showMap]);

  const totalCount = upcomingWatchlist.length + regularWatchlist.length;

  const handleRemove = useCallback(async (showId: string) => {
    await removeFromWatchlist(showId);
  }, [removeFromWatchlist]);

  const handleDateChange = useCallback((_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') setDatePickingShowId(null);
    if (selectedDate && datePickingShowId) {
      const isoDate = selectedDate.toISOString().split('T')[0];
      updatePlannedDate(datePickingShowId, isoDate);
    }
  }, [datePickingShowId, updatePlannedDate]);

  const cycleSort = useCallback(() => {
    haptics.tap();
    setWatchlistSort(prev => {
      if (prev === 'added-desc') return 'alphabetical';
      if (prev === 'alphabetical') return 'closing-soon';
      return 'added-desc';
    });
  }, []);

  const sortLabel = watchlistSort === 'added-desc' ? 'Recent' : watchlistSort === 'alphabetical' ? 'A-Z' : 'Closing Soon';

  if (!featureFlags.userAccounts) return null;

  if (!authLoading && !isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>To Watch</Text>
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaEmoji}>🎟️</Text>
          <Text style={styles.ctaTitle}>Plan your next show</Text>
          <Text style={styles.ctaDescription}>
            Sign in to build your watchlist and track when you{"'"}re going.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
            onPress={() => showSignIn('watchlist')}
          >
            <Text style={styles.ctaButtonText}>Sign In to Get Started</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>To Watch</Text>
        <View style={{ paddingTop: Spacing.lg }}>
          {[0, 1, 2, 3, 4].map(i => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md }}>
              <Skeleton width={48} height={64} borderRadius={BorderRadius.sm} />
              <View style={{ flex: 1 }}>
                <Skeleton width="75%" height={16} />
                <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const renderUpcomingItem = (item: WatchlistEntry) => {
    const show = showMap[item.show_id];
    const title = show?.title || item.show_id;
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
    const daysUntil = item.planned_date
      ? Math.ceil((new Date(item.planned_date + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
        onPress={() => show && router.push(`/show/${show.slug}`)}
        onLongPress={() => setDatePickingShowId(item.show_id)}
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
            <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
          </View>
        )}
        {item.planned_date && (
          <Text style={styles.posterDate}>
            {new Date(item.planned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {daysUntil !== null && daysUntil >= 0 && daysUntil <= 7 && (
              daysUntil === 0 ? ' · Today!' : daysUntil === 1 ? ' · Tomorrow' : ` · ${daysUntil}d`
            )}
          </Text>
        )}
        <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
      </Pressable>
    );
  };

  const renderWatchlistGridItem = (item: WatchlistEntry) => {
    const show = showMap[item.show_id];
    const title = show?.title || item.show_id;
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
        onPress={() => show && router.push(`/show/${show.slug}`)}
        onLongPress={() => {
          Alert.alert('Remove from Watchlist', `Remove ${title}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => handleRemove(item.show_id) },
          ]);
        }}
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
            <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
          </View>
        )}
        <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
      </Pressable>
    );
  };

  const allEmpty = upcomingWatchlist.length === 0 && sortedWatchlist.length === 0;

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>To Watch</Text>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          onPress={() => router.push('/(tabs)/search')}
          hitSlop={8}
          accessibilityLabel="Add to watchlist"
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2.5}>
            <Path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </Svg>
        </Pressable>
      </View>

      <View style={styles.controlsRow}>
        <Text style={styles.statsText}>
          <Text style={styles.statsNumber}>{totalCount}</Text> shows
        </Text>
        <View style={styles.controlsRight}>
          <Pressable style={styles.sortButton} onPress={cycleSort}>
            <Text style={styles.sortText}>{sortLabel}</Text>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </Svg>
          </Pressable>
          <Pressable
            style={styles.viewToggle}
            onPress={() => { haptics.tap(); setViewMode(prev => prev === 'list' ? 'grid' : 'list'); }}
            hitSlop={8}
          >
            {viewMode === 'list' ? (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" />
              </Svg>
            ) : (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </Svg>
            )}
          </Pressable>
        </View>
      </View>

      {allEmpty ? (
        <EmptyState
          emoji="🎟️"
          title="Your watchlist is empty"
          subtitle="Save shows you want to see and set reminders for when you're going."
          actionLabel="Browse Shows"
          onAction={() => router.push('/(tabs)/browse')}
        />
      ) : (
        <FlatList
          data={['content']}
          keyExtractor={() => 'content'}
          renderItem={() => (
            <View>
              {/* Upcoming section */}
              {upcomingWatchlist.length > 0 && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Upcoming</Text>
                    <Text style={styles.sectionCount}>{upcomingWatchlist.length} shows</Text>
                  </View>
                  <View style={styles.posterGrid}>
                    {upcomingWatchlist.map(renderUpcomingItem)}
                  </View>
                </View>
              )}

              {/* Regular watchlist */}
              {sortedWatchlist.length > 0 && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Watchlist</Text>
                    <Text style={styles.sectionCount}>{sortedWatchlist.length} shows</Text>
                  </View>
                  <View style={styles.posterGrid}>
                    {sortedWatchlist.map(renderWatchlistGridItem)}
                    <Pressable
                      style={({ pressed }) => [styles.addShowCard, pressed && styles.pressed]}
                      onPress={() => router.push('/(tabs)/search')}
                    >
                      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                        <Path strokeLinecap="round" d="M12 5v14M5 12h14" />
                      </Svg>
                      <Text style={styles.addShowLabel}>Add Show</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        />
      )}

      {/* Date picker */}
      {datePickingShowId && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
  },
  pageTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.text.primary },
  addButton: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.surface.overlay, alignItems: 'center', justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  controlsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  statsText: { color: Colors.text.secondary, fontSize: FontSize.sm },
  statsNumber: { color: Colors.text.primary, fontWeight: '700' },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sortButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface.overlay, borderRadius: 8,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  sortText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '500' },
  viewToggle: {
    backgroundColor: Colors.surface.overlay, borderRadius: 8,
    padding: 6, alignItems: 'center', justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  sectionTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '600' },
  sectionCount: { color: Colors.text.muted, fontSize: FontSize.xs },
  posterGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  gridCard: { width: '23%', alignItems: 'center' },
  gridPoster: {
    width: '100%', aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
  },
  cardPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Colors.text.muted, fontSize: 18, fontWeight: '600' },
  posterDate: { color: Colors.text.secondary, fontSize: 11, fontWeight: '500', textAlign: 'center', marginTop: 4 },
  gridTitle: {
    color: Colors.text.secondary, fontSize: 11, fontWeight: '500',
    textAlign: 'center', lineHeight: 14, marginTop: 2,
  },
  addShowCard: {
    width: '23%', aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.surface.overlay,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addShowLabel: { color: Colors.text.muted, fontSize: 10, fontWeight: '500' },
  // Swipe
  swipeDelete: { width: 80, justifyContent: 'center', alignItems: 'center', backgroundColor: '#dc2626' },
  swipeDeleteInner: { flex: 1, justifyContent: 'center', alignItems: 'center', width: 80 },
  swipeDeleteText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },
  // Empty / CTA
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { color: Colors.text.muted, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.xs },
  emptyAction: {
    marginTop: Spacing.lg, backgroundColor: Colors.brand, borderRadius: 10,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  emptyActionText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '600' },
  ctaContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  ctaEmoji: { fontSize: 64, marginBottom: Spacing.lg },
  ctaTitle: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  ctaDescription: { color: Colors.text.secondary, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
  ctaButton: {
    marginTop: Spacing.xl, backgroundColor: Colors.brand, borderRadius: 12,
    paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md,
  },
  ctaButtonText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '700' },
});
