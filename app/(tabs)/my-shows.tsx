/**
 * My Shows tab — diary of rated shows + watchlist.
 *
 * Not signed in: full-screen CTA with sign-in button.
 * Signed in: stats bar, Diary / Watchlist tabs, FlatList of cards.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { featureFlags } from '@/lib/feature-flags';
import StarRating from '@/components/user/StarRating';
import type { UserReview, WatchlistEntry } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

type Tab = 'diary' | 'watchlist';
type DiarySort = 'date-desc' | 'date-asc' | 'rating-desc';
type WatchlistSort = 'added-desc' | 'alphabetical' | 'closing-soon';

export default function MyShowsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, showSignIn, devSignIn } = useAuth();
  const { reviews, getAllReviews, loading: reviewsLoading } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, removeFromWatchlist, loading: watchlistLoading } = useWatchlist(user?.id || null);
  const { shows } = useShows();

  const [activeTab, setActiveTab] = useState<Tab>('diary');
  const [diarySort, setDiarySort] = useState<DiarySort>('date-desc');
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>('added-desc');

  // Show lookup map
  const showMap = useMemo(() => {
    const map: Record<string, Show> = {};
    for (const s of shows) map[s.id] = s;
    return map;
  }, [shows]);

  // Load user data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      getAllReviews();
      getWatchlist();
    }
  }, [isAuthenticated, user, getAllReviews, getWatchlist]);

  const loading = authLoading || reviewsLoading || watchlistLoading;

  // Stats
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

  // Sorted watchlist
  const sortedWatchlist = useMemo(() => {
    const sorted = [...watchlist];
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
  }, [watchlist, watchlistSort, showMap]);

  const handleRemoveFromWatchlist = useCallback(async (showId: string) => {
    await removeFromWatchlist(showId);
  }, [removeFromWatchlist]);

  // Sort cycling
  const cycleDiarySort = useCallback(() => {
    setDiarySort(prev => {
      if (prev === 'date-desc') return 'date-asc';
      if (prev === 'date-asc') return 'rating-desc';
      return 'date-desc';
    });
  }, []);

  const cycleWatchlistSort = useCallback(() => {
    setWatchlistSort(prev => {
      if (prev === 'added-desc') return 'alphabetical';
      if (prev === 'alphabetical') return 'closing-soon';
      return 'added-desc';
    });
  }, []);

  const sortLabel = activeTab === 'diary'
    ? diarySort === 'date-desc' ? 'Newest' : diarySort === 'date-asc' ? 'Oldest' : 'Top Rated'
    : watchlistSort === 'added-desc' ? 'Recent' : watchlistSort === 'alphabetical' ? 'A-Z' : 'Closing Soon';

  // Feature flag check — in render section, after all hooks (React rules)
  if (!featureFlags.userAccounts) return null;

  // ─── Not authenticated ─────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>My Shows</Text>
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaEmoji}>🎭</Text>
          <Text style={styles.ctaTitle}>Track your Broadway journey</Text>
          <Text style={styles.ctaDescription}>
            Sign in to rate shows, keep a diary of what you've seen, and build your watchlist.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
            onPress={() => showSignIn('rating')}
          >
            <Text style={styles.ctaButtonText}>Sign In to Get Started</Text>
          </Pressable>
          {__DEV__ && devSignIn && (
            <Pressable
              style={({ pressed }) => [styles.devButton, pressed && styles.pressed]}
              onPress={devSignIn}
              accessibilityRole="button"
              accessibilityLabel="Dev Sign In"
            >
              <Text style={styles.devButtonText}>Dev Sign In (fake auth)</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ─── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.pageTitle}>My Shows</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </View>
    );
  }

  // ─── Render diary item ─────────────────────────────────
  const renderDiaryItem = ({ item }: { item: UserReview }) => {
    const show = showMap[item.show_id];
    const title = show?.title || item.show_id;
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => show && router.push(`/show/${show.slug}`)}
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
    );
  };

  // ─── Render watchlist item ─────────────────────────────
  const renderWatchlistItem = ({ item }: { item: WatchlistEntry }) => {
    const show = showMap[item.show_id];
    const title = show?.title || item.show_id;
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
    const isClosingSoon = show?.closingDate && (() => {
      const closing = new Date(show.closingDate!);
      const fourWeeks = 28 * 24 * 60 * 60 * 1000;
      return closing.getTime() - Date.now() < fourWeeks && closing > new Date();
    })();

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => show && router.push(`/show/${show.slug}`)}
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
          {isClosingSoon && (
            <View style={styles.closingSoonBadge}>
              <Text style={styles.closingSoonText}>Closing Soon</Text>
            </View>
          )}
          {item.planned_date && (
            <Text style={styles.cardDate}>
              Planned: {new Date(item.planned_date + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              })}
            </Text>
          )}
        </View>
        <Pressable
          style={styles.removeButton}
          onPress={() => handleRemoveFromWatchlist(item.show_id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove from watchlist"
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </Svg>
        </Pressable>
      </Pressable>
    );
  };

  // ─── Main content ──────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.pageTitle}>My Shows</Text>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <Text style={styles.statText}>
          <Text style={styles.statNumber}>{showsSeen}</Text> seen
        </Text>
        <Text style={styles.statText}>
          <Text style={styles.statNumber}>{watchlist.length}</Text> watchlist
        </Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'diary' && styles.tabActive]}
          onPress={() => setActiveTab('diary')}
          accessibilityRole="tab"
          accessibilityLabel="Diary"
          accessibilityState={{ selected: activeTab === 'diary' }}
        >
          <Text style={[styles.tabText, activeTab === 'diary' && styles.tabTextActive]}>
            Diary
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'watchlist' && styles.tabActive]}
          onPress={() => setActiveTab('watchlist')}
          accessibilityRole="tab"
          accessibilityLabel={`Watchlist${watchlist.length > 0 ? `, ${watchlist.length} shows` : ''}`}
          accessibilityState={{ selected: activeTab === 'watchlist' }}
        >
          <Text style={[styles.tabText, activeTab === 'watchlist' && styles.tabTextActive]}>
            Watchlist
            {watchlist.length > 0 && (
              <Text style={styles.tabBadge}> {watchlist.length}</Text>
            )}
          </Text>
        </Pressable>
        <Pressable
          style={styles.sortButton}
          onPress={activeTab === 'diary' ? cycleDiarySort : cycleWatchlistSort}
          accessibilityRole="button"
          accessibilityLabel={activeTab === 'diary' ? 'Sort diary' : 'Sort watchlist'}
        >
          <Text style={styles.sortText}>{sortLabel}</Text>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </Svg>
        </Pressable>
      </View>

      {/* Diary list */}
      {activeTab === 'diary' && (
        sortedReviews.length === 0 ? (
          <EmptyState
            title="Your diary is empty"
            description="Start rating shows to build your personal theater diary!"
            ctaLabel="Browse Shows"
            onCta={() => router.push('/(tabs)/browse')}
          />
        ) : (
          <FlatList
            data={sortedReviews}
            renderItem={renderDiaryItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            windowSize={5}
            removeClippedSubviews
          />
        )
      )}

      {/* Watchlist list */}
      {activeTab === 'watchlist' && (
        sortedWatchlist.length === 0 ? (
          <EmptyState
            title="Your watchlist is empty"
            description="Add shows you want to see!"
            ctaLabel="Browse Shows"
            onCta={() => router.push('/(tabs)/browse')}
          />
        ) : (
          <FlatList
            data={sortedWatchlist}
            renderItem={renderWatchlistItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            windowSize={5}
            removeClippedSubviews
          />
        )
      )}
    </View>
  );
}

function EmptyState({ title, description, ctaLabel, onCta }: {
  title: string;
  description: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      <Pressable style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]} onPress={onCta}>
        <Text style={styles.ctaButtonText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  pageTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  statsBar: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  statText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  statNumber: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    paddingHorizontal: Spacing.lg,
  },
  tab: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: {
    borderBottomColor: Colors.brand,
  },
  tabText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.text.primary,
  },
  tabBadge: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  sortButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  sortText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  cardPoster: {
    width: 48,
    height: 64,
    borderRadius: BorderRadius.sm,
  },
  cardPosterPlaceholder: {
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  cardVenue: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  cardNote: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  cardDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  cardRating: {
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    color: '#fcd34d',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  closingSoonBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  closingSoonText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  removeButton: {
    padding: Spacing.sm,
  },
  // CTA
  ctaContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  ctaEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  ctaTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  ctaDescription: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    maxWidth: 280,
  },
  ctaButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFD700',
    borderRadius: BorderRadius.md,
  },
  ctaButtonText: {
    color: '#000',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  devButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  devButtonText: {
    color: '#f59e0b',
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  emptyDescription: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
});
