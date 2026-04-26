/**
 * Watched tab — diary of rated shows.
 *
 * Hero stat strip (Viewings / Shows / AVG ★) + inline search pill.
 * To Be Rated horizontal scroll row at top (past planned dates, no rating).
 * Grid (3-col) or List (Letterboxd day-col rows with sticky month dividers).
 * Not signed in: full-screen CTA with sign-in button.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useShows } from '@/lib/data-context';
import { featureFlags } from '@/lib/feature-flags';
import type { UserReview } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import { ShowSearchModal } from '@/components/ShowSearchModal';
import { StatHero } from '@/components/my-shows/StatHero';
import { WatchedGridPoster } from '@/components/my-shows/WatchedGridPoster';
import { ToBeRatedPoster } from '@/components/my-shows/ToBeRatedPoster';
import { DiaryRow } from '@/components/my-shows/DiaryRow';
import { MonthDivider } from '@/components/my-shows/MonthDivider';
import { groupReviewsByMonth, type DiarySection } from '@/lib/diary-grouping';
import * as haptics from '@/lib/haptics';

type DiarySort = 'date-desc' | 'date-asc' | 'rating-desc';
type ViewMode = 'list' | 'grid';

const GRID_COLS = 3;
const GRID_GAP = Spacing.xs;

// ─── Swipe delete action ─────────────────────────────
function SwipeDeleteAction({ onDelete, drag }: { onDelete: () => void; drag: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + 80 }],
  }));
  return (
    <Animated.View style={[styles.swipeDelete, animatedStyle]}>
      <Pressable style={styles.swipeDeleteInner} onPress={onDelete}>
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────
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

export default function WatchedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { user, isAuthenticated, loading: authLoading, showSignIn } = useAuth();
  const { reviews, getAllReviews, deleteReview, loading: reviewsLoading } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, loading: watchlistLoading } = useWatchlist(user?.id || null);
  const { shows } = useShows();

  const [diarySort, setDiarySort] = useState<DiarySort>('date-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showSearchModal, setShowSearchModal] = useState(false);

  const showMap = useMemo(() => {
    const map: Record<string, Show> = {};
    for (const s of shows) map[s.id] = s;
    return map;
  }, [shows]);

  useEffect(() => {
    if (isAuthenticated && user) {
      getAllReviews();
      getWatchlist();
    }
  }, [isAuthenticated, user, getAllReviews, getWatchlist]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user) {
        getAllReviews();
        getWatchlist();
      }
    }, [isAuthenticated, user, getAllReviews, getWatchlist]),
  );

  const loading = authLoading || reviewsLoading || watchlistLoading;
  const showsSeen = new Set(reviews.map(r => r.show_id)).size;

  // Hero stats
  const heroItems = useMemo(() => {
    const avg = reviews.length
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0;
    return [
      { value: String(reviews.length), label: 'VIEWINGS' },
      { value: String(showsSeen), label: 'SHOWS' },
      {
        value: avg ? avg.toFixed(1) : '—',
        label: 'AVG ★',
        accent: avg > 0,
      },
    ];
  }, [reviews, showsSeen]);

  // Sorted diary
  const sortedReviews = useMemo(() => {
    const sorted = [...reviews];
    switch (diarySort) {
      case 'date-desc':
        return sorted.sort((a, b) => {
          const dateA = a.date_seen || a.created_at;
          const dateB = b.date_seen || b.created_at;
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
      case 'date-asc':
        return sorted.sort((a, b) => {
          const dateA = a.date_seen || a.created_at;
          const dateB = b.date_seen || b.created_at;
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });
      case 'rating-desc':
        return sorted.sort((a, b) => b.rating - a.rating);
      default:
        return sorted;
    }
  }, [reviews, diarySort]);

  const diarySections: DiarySection[] = useMemo(
    () => groupReviewsByMonth(sortedReviews),
    [sortedReviews],
  );

  // To Be Rated — past planned dates, no rating yet
  const today = new Date().toISOString().split('T')[0];
  const reviewedShowIds = useMemo(() => new Set(reviews.map(r => r.show_id)), [reviews]);
  const toBeRated = useMemo(() => {
    return watchlist
      .filter(w => w.planned_date && w.planned_date < today && !reviewedShowIds.has(w.show_id))
      .sort((a, b) => (b.planned_date || '').localeCompare(a.planned_date || ''));
  }, [watchlist, today, reviewedShowIds]);

  // Card width: per-device, derived so all contexts on same device match
  const cardWidth = useMemo(() => {
    const pagePadding = Spacing.lg * 2;
    const totalGaps = GRID_GAP * (GRID_COLS - 1);
    return Math.floor((windowWidth - pagePadding - totalGaps) / GRID_COLS);
  }, [windowWidth]);

  // Grid data with trailing spacers to fill incomplete final row
  type GridItem = UserReview | { __spacer: true; id: string };
  const gridData: GridItem[] = useMemo(() => {
    const remainder = sortedReviews.length % GRID_COLS;
    if (remainder === 0) return sortedReviews;
    const spacers = Array.from({ length: GRID_COLS - remainder }, (_, i) => ({
      __spacer: true as const,
      id: `spacer-${i}`,
    }));
    return [...sortedReviews, ...spacers];
  }, [sortedReviews]);

  // Sort cycling
  const cycleDiarySort = useCallback(() => {
    haptics.tap();
    setDiarySort(prev => {
      if (prev === 'date-desc') return 'date-asc';
      if (prev === 'date-asc') return 'rating-desc';
      return 'date-desc';
    });
  }, []);

  const sortLabel = diarySort === 'date-desc' ? 'Newest' : diarySort === 'date-asc' ? 'Oldest' : 'Top Rated';

  const handleDeleteDiaryItem = useCallback((review: UserReview) => {
    haptics.action();
    const show = showMap[review.show_id];
    const title = show?.title || review.show_id;
    Alert.alert(
      'Delete Rating',
      `Delete your ${review.rating.toFixed(1)}★ rating for ${title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteReview(review.id) },
      ],
    );
  }, [showMap, deleteReview]);

  if (!featureFlags.userAccounts) return null;

  // Not authenticated
  if (!authLoading && !isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>My Watched Shows</Text>
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaEmoji}>🎭</Text>
          <Text style={styles.ctaTitle}>Track your Broadway journey</Text>
          <Text style={styles.ctaDescription}>
            Sign in to rate shows you{"'"}ve seen and keep a diary of your theater experiences.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
            onPress={() => showSignIn('rating')}
          >
            <Text style={styles.ctaButtonText}>Sign In to Get Started</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Loading
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>Watched</Text>
        <View style={styles.loadingContainer}>
          <View style={{ flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl }}>
            <Skeleton width={80} height={20} />
            <Skeleton width={100} height={20} />
          </View>
          {[0, 1, 2, 3, 4].map(i => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md }}>
              <Skeleton width={48} height={64} borderRadius={BorderRadius.sm} />
              <View style={{ flex: 1 }}>
                <Skeleton width="75%" height={16} />
                <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
              </View>
              <Skeleton width={40} height={40} borderRadius={BorderRadius.sm} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ─── Header chrome (rendered above the scroll body) ────
  const Header = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Watched</Text>
      </View>
      <StatHero items={heroItems} />
      <Pressable
        style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}
        onPress={() => { haptics.tap(); setShowSearchModal(true); }}
        accessibilityRole="search"
        accessibilityLabel="Search to log a viewing"
      >
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
          <Circle cx="11" cy="11" r="7" />
          <Path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </Svg>
        <Text style={styles.searchPillText}>Search to log a viewing…</Text>
      </Pressable>

      {toBeRated.length > 0 ? (
        <View style={styles.toBeRatedSection}>
          <View style={styles.toBeRatedHeader}>
            <Text style={styles.toBeRatedLabel}>TO BE RATED</Text>
            <View style={styles.toBeRatedDot} />
            <Text style={styles.toBeRatedCount}>{toBeRated.length}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalRow}
          >
            {toBeRated.map(item => (
              <ToBeRatedPoster
                key={item.id}
                watchlistEntry={item}
                show={showMap[item.show_id]}
                width={cardWidth}
                onPress={() => {
                  haptics.tap();
                  router.push({
                    pathname: '/rate/[showId]' as any,
                    params: { showId: item.show_id, showTitle: showMap[item.show_id]?.title || item.show_id },
                  });
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.controlsRow}>
        <Text style={styles.controlsHint}>
          {sortedReviews.length} {sortedReviews.length === 1 ? 'entry' : 'entries'}
        </Text>
        <View style={styles.controlsRight}>
          <Pressable style={styles.sortButton} onPress={cycleDiarySort}>
            <Text style={styles.sortText}>{sortLabel}</Text>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </Svg>
          </Pressable>
          <View style={styles.viewToggleContainer}>
            <Pressable
              style={[styles.viewToggleButton, viewMode === 'grid' && styles.viewToggleActive]}
              onPress={() => { haptics.tap(); setViewMode('grid'); }}
              hitSlop={4}
              accessibilityLabel="Grid view"
              accessibilityRole="button"
              testID="grid-view-toggle"
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={viewMode === 'grid' ? Colors.text.primary : Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" />
              </Svg>
            </Pressable>
            <Pressable
              style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleActive]}
              onPress={() => { haptics.tap(); setViewMode('list'); }}
              hitSlop={4}
              accessibilityLabel="List view"
              accessibilityRole="button"
              testID="list-view-toggle"
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={viewMode === 'list' ? Colors.text.primary : Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </Svg>
            </Pressable>
          </View>
        </View>
      </View>
    </>
  );

  // ─── Grid item render ────────────────────────────────
  const renderGridItem = ({ item }: { item: GridItem }) => {
    if ('__spacer' in item) return <View style={{ width: cardWidth }} />;
    return (
      <WatchedGridPoster
        review={item}
        show={showMap[item.show_id]}
        width={cardWidth}
        onPress={() => {
          haptics.tap();
          const slug = showMap[item.show_id]?.slug;
          if (slug) router.push(`/show/${slug}`);
        }}
        onLongPress={() => handleDeleteDiaryItem(item)}
      />
    );
  };

  // ─── List item ───────────────────────────────────────
  const renderListItem = ({ item }: { item: UserReview }) => (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      renderRightActions={(_progress, drag) => (
        <SwipeDeleteAction onDelete={() => handleDeleteDiaryItem(item)} drag={drag} />
      )}
      overshootRight={false}
    >
      <DiaryRow
        review={item}
        show={showMap[item.show_id]}
        onPress={() => {
          haptics.tap();
          const slug = showMap[item.show_id]?.slug;
          if (slug) router.push(`/show/${slug}`);
        }}
        onLongPress={() => handleDeleteDiaryItem(item)}
      />
    </ReanimatedSwipeable>
  );

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
      {sortedReviews.length === 0 && toBeRated.length === 0 ? (
        <>
          {Header}
          <EmptyState
            emoji="🎭"
            title="Your diary is empty"
            subtitle="Rate shows you've seen to build your personal diary."
            actionLabel="Rate a Show"
            onAction={() => setShowSearchModal(true)}
          />
        </>
      ) : viewMode === 'grid' ? (
        <FlatList
          key="grid"
          data={gridData}
          keyExtractor={item => ('__spacer' in item ? item.id : item.id)}
          renderItem={renderGridItem}
          numColumns={GRID_COLS}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          ListHeaderComponent={Header}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <SectionList
          key="list"
          sections={diarySections}
          keyExtractor={item => item.id}
          renderItem={renderListItem}
          renderSectionHeader={({ section }) => <MonthDivider label={section.title} />}
          ListHeaderComponent={Header}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        />
      )}

      <ShowSearchModal
        visible={showSearchModal}
        title="Rate a Show"
        onSelect={(show) => {
          setShowSearchModal(false);
          router.push({
            pathname: '/rate/[showId]' as any,
            params: { showId: show.id, showTitle: show.title },
          });
        }}
        onClose={() => setShowSearchModal(false)}
      />
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
  pressed: { opacity: 0.7 },

  // Search pill
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  searchPillText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },

  // Controls
  controlsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, paddingTop: Spacing.md,
  },
  controlsHint: { color: Colors.text.muted, fontSize: FontSize.xs },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sortButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface.overlay, borderRadius: 8,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  sortText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '500' },
  viewToggleContainer: {
    flexDirection: 'row', backgroundColor: Colors.surface.overlay, borderRadius: 8,
    overflow: 'hidden',
  },
  viewToggleButton: {
    padding: 6, alignItems: 'center', justifyContent: 'center',
  },
  viewToggleActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // To Be Rated
  toBeRatedSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  toBeRatedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  toBeRatedLabel: { color: '#f59e0b', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  toBeRatedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  toBeRatedCount: { color: '#f59e0b', fontSize: 12, fontWeight: '600' },
  horizontalRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },

  // Grid — gridContent has NO horizontal padding so the StatHero / search pill
  // (which carry their own marginHorizontal) render at consistent width with
  // the list view's SectionList. The card rows add their own paddingHorizontal.
  gridContent: { paddingBottom: Spacing.xxl },
  gridRow: { gap: GRID_GAP, marginBottom: Spacing.md, paddingHorizontal: Spacing.lg },

  // Swipe
  swipeDelete: {
    width: 80, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#dc2626',
  },
  swipeDeleteInner: { flex: 1, justifyContent: 'center', alignItems: 'center', width: 80 },
  swipeDeleteText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '600' },

  // Empty state
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { color: Colors.text.muted, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.xs },
  emptyAction: {
    marginTop: Spacing.lg, backgroundColor: Colors.brand, borderRadius: 10,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  emptyActionText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '600' },

  // CTA (not signed in)
  ctaContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  ctaEmoji: { fontSize: 64, marginBottom: Spacing.lg },
  ctaTitle: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700', textAlign: 'center' },
  ctaDescription: { color: Colors.text.secondary, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },
  ctaButton: {
    marginTop: Spacing.xl, backgroundColor: Colors.brand, borderRadius: 12,
    paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md,
  },
  ctaButtonText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '700' },
  loadingContainer: { paddingTop: Spacing.lg },
});
