/**
 * Watched tab — diary of rated shows.
 *
 * Shows "To Be Rated" section at top (past planned dates, no rating).
 * Then year-grouped grid/list of rated shows with star ratings.
 * Not signed in: full-screen CTA with sign-in button.
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
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { featureFlags } from '@/lib/feature-flags';
import StarRating from '@/components/user/StarRating';
import MiniStars from '@/components/user/MiniStars';
import type { UserReview, WatchlistEntry } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import * as haptics from '@/lib/haptics';

type DiarySort = 'date-desc' | 'date-asc' | 'rating-desc';
type ViewMode = 'list' | 'grid';

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

// ─── Add show card (grid footer) ──────────────────────
function AddShowCard({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.addShowCard, pressed && styles.pressed]} onPress={onPress}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
        <Path strokeLinecap="round" d="M12 5v14M5 12h14" />
      </Svg>
      <Text style={styles.addShowLabel}>{label}</Text>
    </Pressable>
  );
}

export default function WatchedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, showSignIn } = useAuth();
  const { reviews, getAllReviews, deleteReview, loading: reviewsLoading } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, loading: watchlistLoading } = useWatchlist(user?.id || null);
  const { shows } = useShows();

  const [diarySort, setDiarySort] = useState<DiarySort>('date-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

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

  // To Be Rated — shows from watchlist where planned_date has passed but not yet rated
  const today = new Date().toISOString().split('T')[0];
  const reviewedShowIds = useMemo(() => new Set(reviews.map(r => r.show_id)), [reviews]);

  const toBeRated = useMemo(() => {
    return watchlist
      .filter(w => w.planned_date && w.planned_date < today && !reviewedShowIds.has(w.show_id))
      .sort((a, b) => (b.planned_date || '').localeCompare(a.planned_date || ''));
  }, [watchlist, today, reviewedShowIds]);

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

  // Grid data with spacers
  type GridItem = UserReview | { __spacer: true; id: string };
  const gridData: GridItem[] = useMemo(() => {
    const cols = 4;
    const remainder = sortedReviews.length % cols;
    if (remainder === 0) return sortedReviews;
    const spacers = Array.from({ length: cols - remainder }, (_, i) => ({
      __spacer: true as const,
      id: `spacer-${i}`,
    }));
    return [...sortedReviews, ...spacers];
  }, [sortedReviews]);

  const handleDeleteDiaryItem = useCallback((review: UserReview) => {
    haptics.action();
    const show = showMap[review.show_id];
    const title = show?.title || review.show_id;
    Alert.alert(
      'Delete Rating',
      `Delete your ${review.rating.toFixed(1)}★ rating for ${title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteReview(review.id),
        },
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
        <Text style={styles.pageTitle}>My Watched Shows</Text>
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

  // ─── List view render ────────────────────────────────
  const renderDiaryItem = ({ item }: { item: UserReview }) => {
    const show = showMap[item.show_id];
    const title = show?.title || item.show_id;
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={40}
        renderRightActions={(_progress, drag) => (
          <SwipeDeleteAction onDelete={() => handleDeleteDiaryItem(item)} drag={drag} />
        )}
        overshootRight={false}
      >
        <Pressable
          style={({ pressed }) => [styles.card, styles.cardSwipeable, pressed && styles.pressed]}
          onPress={() => show && router.push(`/show/${show.slug}`)}
          onLongPress={() => handleDeleteDiaryItem(item)}
        >
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.cardPoster} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.cardPoster, styles.cardPosterPlaceholder]}>
              <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
            {show?.venue && <Text style={styles.cardVenue} numberOfLines={1}>{show.venue}</Text>}
            {item.review_text && <Text style={styles.cardNote} numberOfLines={1}>{item.review_text}</Text>}
            {item.date_seen && (
              <Text style={styles.cardDate}>
                {new Date(item.date_seen + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </Text>
            )}
          </View>
          <View style={styles.cardRating}>
            <StarRating rating={item.rating} onRatingChange={() => {}} size="sm" readOnly hideLabel />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  // ─── Grid view render ────────────────────────────────
  const renderDiaryGridItem = ({ item }: { item: GridItem }) => {
    if ('__spacer' in item) return <View style={styles.gridCardSpacer} />;
    const show = showMap[item.show_id];
    const title = show?.title || item.show_id;
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <Pressable
        style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
        onPress={() => show && router.push(`/show/${show.slug}`)}
        onLongPress={() => handleDeleteDiaryItem(item)}
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
            <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.gridCardInfo}>
          {item.rating > 0 && <MiniStars rating={item.rating} />}
        </View>
        <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
      </Pressable>
    );
  };

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>My Watched Shows</Text>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          onPress={() => router.push('/(tabs)/search')}
          hitSlop={8}
          accessibilityLabel="Rate a show"
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2.5}>
            <Path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </Svg>
        </Pressable>
      </View>

      {/* Controls */}
      <View style={styles.controlsRow}>
        <Text style={styles.statsText}>
          <Text style={styles.statsNumber}>{showsSeen}</Text> seen
        </Text>
        <View style={styles.controlsRight}>
          <Pressable style={styles.sortButton} onPress={cycleDiarySort}>
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

      {/* To Be Rated section — poster grid with amber accent */}
      {toBeRated.length > 0 && (
        <View style={styles.toBeRatedSection}>
          <View style={styles.toBeRatedHeader}>
            <Text style={styles.toBeRatedLabel}>TO BE RATED</Text>
            <View style={styles.toBeRatedDot} />
            <Text style={styles.toBeRatedCount}>{toBeRated.length}</Text>
          </View>
          <View style={styles.toBeRatedGrid}>
            {toBeRated.map(item => {
              const show = showMap[item.show_id];
              const title = show?.title || item.show_id;
              const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
                  onPress={() => show && router.push({ pathname: '/rate/[showId]' as any, params: { showId: item.show_id, showTitle: title } })}
                >
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
                      <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={styles.toBeRatedPosterDate}>
                    {item.planned_date ? new Date(item.planned_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    }) : 'Rate'}
                  </Text>
                  <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
                </Pressable>
              );
            })}
            {/* Spacers to keep grid items same size */}
            {Array.from({ length: (4 - (toBeRated.length % 4)) % 4 }, (_, i) => (
              <View key={`tbr-spacer-${i}`} style={styles.gridCardSpacer} />
            ))}
          </View>
        </View>
      )}

      {/* Diary content */}
      {sortedReviews.length === 0 && toBeRated.length === 0 ? (
        <EmptyState
          emoji="🎭"
          title="Your diary is empty"
          subtitle="Rate shows you've seen to build your personal diary."
          actionLabel="Rate a Show"
          onAction={() => router.push('/(tabs)/search')}
        />
      ) : viewMode === 'grid' ? (
        <FlatList
          data={gridData}
          keyExtractor={item => ('__spacer' in item ? item.id : item.id)}
          renderItem={renderDiaryGridItem}
          numColumns={4}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <View style={styles.gridRow}>
              <AddShowCard label="Rate a show" onPress={() => router.push('/(tabs)/search')} />
              <View style={styles.gridCardSpacer} />
              <View style={styles.gridCardSpacer} />
              <View style={styles.gridCardSpacer} />
            </View>
          }
        />
      ) : (
        <FlatList
          data={sortedReviews}
          keyExtractor={item => item.id}
          renderItem={renderDiaryItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
          ListFooterComponent={
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() => router.push('/(tabs)/search')}
            >
              <View style={[styles.cardPoster, styles.cardPosterPlaceholder]}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                  <Path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </Svg>
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: Colors.text.muted }]}>Rate a show</Text>
              </View>
            </Pressable>
          }
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
  // To Be Rated
  toBeRatedSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: Spacing.sm, marginBottom: Spacing.sm,
  },
  toBeRatedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  toBeRatedLabel: { color: '#f59e0b', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  toBeRatedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  toBeRatedCount: { color: '#f59e0b', fontSize: 12, fontWeight: '600' },
  toBeRatedGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  toBeRatedPosterDate: {
    color: '#fcd34d', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 4,
  },
  // Cards (list view)
  card: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  cardSwipeable: { backgroundColor: Colors.surface.default },
  cardPoster: {
    width: 48, height: 64, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  cardPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Colors.text.muted, fontSize: 18, fontWeight: '600' },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '600' },
  cardVenue: { color: Colors.text.muted, fontSize: FontSize.xs },
  cardNote: { color: Colors.text.secondary, fontSize: FontSize.xs, fontStyle: 'italic' },
  cardDate: { color: Colors.text.muted, fontSize: FontSize.xs },
  cardRating: { alignItems: 'center', gap: 2 },
  ratingText: { color: Colors.text.secondary, fontSize: FontSize.xs },
  // Grid view
  gridContainer: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  gridRow: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  gridCard: { flex: 1, alignItems: 'center' },
  gridCardSpacer: { flex: 1 },
  gridPoster: {
    width: '100%', aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
  },
  gridCardInfo: { marginTop: 4, alignItems: 'center' },
  gridTitle: {
    color: Colors.text.secondary, fontSize: 11, fontWeight: '500',
    textAlign: 'center', lineHeight: 14, marginTop: 2,
  },
  // Add show card
  addShowCard: {
    flex: 1, aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.surface.overlay,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addShowLabel: { color: Colors.text.muted, fontSize: 10, fontWeight: '500' },
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
