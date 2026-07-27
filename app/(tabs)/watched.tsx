/**
 * Watched tab — diary of rated shows.
 *
 * Sections: To Be Rated (past planned dates, no rating), Upcoming (future
 * planned watchlist dates), then year-grouped grid/list of rated shows with
 * star ratings — a "No date" bucket catches undated entries (imports).
 * Not signed in: full-screen CTA with sign-in button.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { toLocalYMD } from '@/lib/date-utils';
import { humanizeShowId } from '@/lib/show-format';
import { useToastSafe } from '@/lib/toast-context';
import { featureFlags } from '@/lib/feature-flags';
import StarRating from '@/components/user/StarRating';
import MiniStars from '@/components/user/MiniStars';
import type { UserReview, WatchlistEntry } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import { ShowSearchModal } from '@/components/ShowSearchModal';
import { StatsScreen } from '@/components/stats/StatsScreen';
import { FeedModeToggle, type FeedMode } from '@/components/user/FeedModeToggle';
import { PhotoFeedTimeline } from '@/components/user/PhotoFeedTimeline';
import { PhotoWallGrid } from '@/components/user/PhotoWallGrid';
import { usePhotoFeed } from '@/hooks/usePhotoFeed';
import * as haptics from '@/lib/haptics';
import DiaryCalendar from '@/components/diary-fable/DiaryCalendar';
import DiaryMarquee from '@/components/diary-fable/DiaryMarquee';
import DiaryLedger from '@/components/diary-fable/DiaryLedger';
import { FABLE_REVIEWS } from '@/constants/diary-fable-fixture';

// DESIGN ROUND ONLY (task #300): when not 'off', the Grid segment's body is
// replaced by one of the FABLE Diary directions (D/E/F) — the real header,
// segmented control and Stats/Feed segments stay live, so captures show how
// each direction coexists with the shipped screen. Uses the signed-in user's
// real diary when present, else the design fixture.
const FABLE_DIARY_VARIANT = 'off' as 'off' | 'D' | 'E' | 'F';
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (FABLE_DIARY_VARIANT !== 'off') require('react-native').LogBox.ignoreAllLogs(true);

type DiarySort = 'date-desc' | 'date-asc' | 'rating-desc';
/**
 * Profile segments (spec §2 — the Mezzanine mental model users already have):
 *   grid  → the poster wall
 *   list  → "Feed", the diary timeline. Sprint 4 turns this into the photo
 *           scrapbook; until then the segment shows the existing timeline
 *           rather than an empty promise.
 *   stats → the Scorecard.
 */
type ViewMode = 'list' | 'grid' | 'stats';

const VIEW_MODES: ViewMode[] = ['grid', 'list', 'stats'];
const SEGMENT_LABELS: Record<ViewMode, string> = { grid: 'Grid', list: 'Feed', stats: 'Stats' };
// Existing e2e/screenshot flows tap diary-grid-view-toggle / diary-list-view-toggle;
// those ids stay put so the segmented control is a drop-in for the old pair.
const SEGMENT_TEST_IDS: Record<ViewMode, string> = {
  grid: 'diary-grid-view-toggle',
  list: 'diary-list-view-toggle',
  stats: 'diary-stats-view-toggle',
};

const VIEW_MODE_KEY = '@bsc:diary_view_mode';

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
function AddShowCard({ label, onPress, fixedWidth }: { label: string; onPress: () => void; fixedWidth?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.addShowCard, fixedWidth && styles.addShowCardFixed, pressed && styles.pressed]} onPress={onPress}>
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
  const { reviews, getAllReviews, deleteReview, loading: reviewsLoading, error: reviewsError, invalidateCache } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, removeFromWatchlist, loading: watchlistLoading } = useWatchlist(user?.id || null);
  const { shows, isLoading: showsLoading } = useShows();
  const { showToast } = useToastSafe();

  const handleMissingShow = useCallback(() => {
    showToast("This show isn't in the current catalog yet.", 'info');
  }, [showToast]);

  // Feed segment (Sprint 4) — private photo scrapbook, own sub-toggle.
  const [feedMode, setFeedMode] = useState<FeedMode>('timeline');
  const { monthGroups, allPhotosFlat, signedUrls: photoSignedUrls, dismissNudge, refresh: refreshPhotoFeed } =
    usePhotoFeed(user?.id || null, reviews);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([getAllReviews(), getWatchlist()]);
    } finally {
      setRefreshing(false);
    }
  }, [getAllReviews, getWatchlist]);

  const [diarySort, setDiarySort] = useState<DiarySort>('date-desc');
  const [viewMode, setViewModeState] = useState<ViewMode>('grid');
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Guards nested-Pressable rows (card + its rating chip) against a rapid
  // double-tap firing two router.push calls for the SAME row (e.g. a
  // mis-slopped touch registering on both the card and the chip in quick
  // succession). Keyed by row id so tapping a different row isn't blocked.
  const lastNavAtRef = useRef<Map<string, number>>(new Map());
  const guardedPush = useCallback((key: string, push: () => void) => {
    const now = Date.now();
    const last = lastNavAtRef.current.get(key) ?? 0;
    if (now - last < 600) return;
    lastNavAtRef.current.set(key, now);
    push();
  }, []);

  // Restore the user's last view mode (web parity — persisted, not reset per session).
  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY).then(stored => {
      if (VIEW_MODES.includes(stored as ViewMode)) setViewModeState(stored as ViewMode);
    }).catch(() => {});
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {});
  }, []);

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

  const today = toLocalYMD(new Date());
  const reviewedShowIds = useMemo(() => new Set(reviews.map(r => r.show_id)), [reviews]);

  // To Be Rated — shows from watchlist where planned_date has passed but not yet rated
  const toBeRated = useMemo(() => {
    return watchlist
      .filter(w => w.planned_date && w.planned_date < today && !reviewedShowIds.has(w.show_id))
      .sort((a, b) => (b.planned_date || '').localeCompare(a.planned_date || ''));
  }, [watchlist, today, reviewedShowIds]);

  // Upcoming — watchlist entries with a future (or today) planned date, not yet rated.
  // Mirrors the To Watch tab's own Upcoming split (>= today) so a today-dated
  // show is never invisible to both tabs at once.
  const upcomingWatchlistEntries = useMemo(() => {
    return watchlist
      .filter(w => w.planned_date && w.planned_date >= today && !reviewedShowIds.has(w.show_id))
      .sort((a, b) => (a.planned_date || '').localeCompare(b.planned_date || ''));
  }, [watchlist, today, reviewedShowIds]);

  // Reviews with a future date_seen (diary imports / manual back-dating could
  // produce these even though the rate sheet itself caps at today).
  const upcomingReviews = useMemo(
    () => sortedReviews.filter(r => r.date_seen && r.date_seen > today),
    [sortedReviews, today],
  );
  const pastReviews = useMemo(
    () => sortedReviews.filter(r => !(r.date_seen && r.date_seen > today)),
    [sortedReviews, today],
  );

  // Past reviews grouped by year (date_seen only — created_at fallback filed
  // undated imports under the year they were IMPORTED, web parity fix 2026-07-14).
  const showYearGroups = diarySort !== 'rating-desc';
  const reviewsByYear = useMemo(() => {
    const map: Record<string, UserReview[]> = {};
    for (const review of pastReviews) {
      const dateStr = review.date_seen;
      const parsedYear = dateStr ? new Date(dateStr + 'T00:00:00').getFullYear() : NaN;
      const year = Number.isFinite(parsedYear) ? parsedYear.toString() : 'No date';
      if (!map[year]) map[year] = [];
      map[year].push(review);
    }
    return map;
  }, [pastReviews]);
  const sortedYears = useMemo(() => {
    return Object.keys(reviewsByYear).sort((a, b) => {
      if (a === 'No date') return 1;
      if (b === 'No date') return -1;
      return diarySort === 'date-asc' ? a.localeCompare(b) : b.localeCompare(a);
    });
  }, [reviewsByYear, diarySort]);

  const showsSeen = new Set(reviews.map(r => r.show_id)).size;

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
    const title = show?.title || humanizeShowId(review.show_id);
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

  const handleRemoveUpcoming = useCallback((entry: WatchlistEntry) => {
    haptics.action();
    const show = showMap[entry.show_id];
    const title = show?.title || 'this show';
    Alert.alert(
      'Remove from Watchlist',
      `Remove ${title} from your watchlist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => { removeFromWatchlist(entry.show_id).catch(() => {}); },
        },
      ],
    );
  }, [showMap, removeFromWatchlist]);

  // Clearance for the native tab bar: FlatList content must scroll past it
  // (fixed Spacing.xxl left the last row hidden behind the bar).
  const listBottomPad = insets.bottom + 72;

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

  // ─── List row (shared by To Be Rated is separate; this is for rated diary entries) ────
  const renderDiaryListRow = (item: UserReview) => {
    const show = showMap[item.show_id];
    const title = show?.title || humanizeShowId(item.show_id);
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <ReanimatedSwipeable
        key={item.id}
        friction={2}
        rightThreshold={40}
        renderRightActions={(_progress, drag) => (
          <SwipeDeleteAction onDelete={() => handleDeleteDiaryItem(item)} drag={drag} />
        )}
        overshootRight={false}
      >
        <Pressable
          style={({ pressed }) => [styles.card, styles.cardSwipeable, pressed && styles.pressed]}
          onPress={() => show ? guardedPush(item.id, () => router.push(`/show/${show.slug}`)) : handleMissingShow()}
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
          </View>
          {/* Stars only + date on the right (beta feedback 2026-07-26: "Move
              the dates to the right. Remove 4.0 — the stars themselves are
              clear."). */}
          <Pressable
            style={styles.cardRating}
            onPress={() => guardedPush(item.id, () => router.push({
              pathname: '/rate/[showId]' as any,
              params: { showId: item.show_id, showTitle: title, reviewId: item.id },
            }))}
            hitSlop={{ top: 8, bottom: 8, right: 8, left: 2 }}
            accessibilityRole="button"
            accessibilityLabel={`Edit your ${item.rating.toFixed(1)} star rating`}
          >
            <StarRating rating={item.rating} onRatingChange={() => {}} size="sm" readOnly hideLabel />
            {item.date_seen && (
              <Text style={styles.cardDate}>
                {new Date(item.date_seen + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', ...(showYearGroups ? {} : { year: 'numeric' }),
                })}
              </Text>
            )}
          </Pressable>
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  // ─── Grid card (shared by To Be Rated is separate; this is for rated diary entries) ────
  const renderDiaryGridCard = (item: UserReview) => {
    const show = showMap[item.show_id];
    const title = show?.title || humanizeShowId(item.show_id);
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.gridCardFixed, pressed && styles.pressed]}
        onPress={() => show ? router.push(`/show/${show.slug}`) : handleMissingShow()}
        onLongPress={() => handleDeleteDiaryItem(item)}
        accessibilityHint="Long press to delete this rating"
        accessibilityActions={[{ name: 'delete', label: 'Delete rating' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') handleDeleteDiaryItem(item); }}
      >
        <View style={styles.gridPosterWrap}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
              <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
            </View>
          )}
          {/* No corner delete button — owner reverted the Tier-1 sweep's X
              (beta feedback 2026-07-26: "Removing isn't a common action.
              They can long press or click in to delete instead"). */}
        </View>
        <Pressable
          style={styles.gridCardInfo}
          onPress={() => router.push({
            pathname: '/rate/[showId]' as any,
            params: { showId: item.show_id, showTitle: title, reviewId: item.id },
          })}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Edit your rating for ${title}`}
        >
          {item.rating > 0 && <MiniStars rating={item.rating} />}
        </Pressable>
        {/* Name above date (beta feedback 2026-07-25: date sat between image
            and name; web order is name → date) */}
        <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
        {/* Year dropped when a year header already frames the group (beta
            feedback 2026-07-26: "Seen shows don't need the year"). */}
        <Text style={styles.gridDateText}>
          {item.date_seen
            ? new Date(item.date_seen + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', ...(showYearGroups ? {} : { year: 'numeric' }),
              })
            : ' '}
        </Text>
      </Pressable>
    );
  };

  const renderUpcomingRow = (entry: WatchlistEntry) => {
    const show = showMap[entry.show_id];
    const title = show?.title || humanizeShowId(entry.show_id);
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
    const daysUntil = entry.planned_date
      ? Math.ceil((new Date(entry.planned_date + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const formattedDate = entry.planned_date
      ? new Date(entry.planned_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : null;

    // Same row anatomy as the rated diary rows (beta feedback 2026-07-25:
    // Upcoming rows had their own boxed format — inconsistent with the list).
    return (
      <Pressable
        key={entry.id}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => show ? router.push(`/show/${show.slug}`) : handleMissingShow()}
        onLongPress={() => handleRemoveUpcoming(entry)}
        accessibilityHint="Long press to remove from watchlist"
        accessibilityActions={[{ name: 'delete', label: 'Remove from watchlist' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') handleRemoveUpcoming(entry); }}
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
        </View>
        {/* Date on the right, no X (beta feedback 2026-07-26: removing isn't
            a common action — long-press handles it). */}
        {formattedDate && (
          <Text style={styles.upcomingDateText}>
            {formattedDate}
            {daysUntil !== null && daysUntil > 0 && (daysUntil === 1 ? ' · Tomorrow' : ` · ${daysUntil}d`)}
          </Text>
        )}
      </Pressable>
    );
  };

  const isDiaryEmpty = sortedReviews.length === 0 && toBeRated.length === 0 && upcomingWatchlistEntries.length === 0;
  const hasOtherSections = upcomingWatchlistEntries.length > 0 || upcomingReviews.length > 0 || toBeRated.length > 0;
  const showYearHeaders = viewMode === 'grid' || sortedYears.length > 1 || hasOtherSections;

  const diaryContent = (
    <View>
      {/* To Be Rated — at top so users notice it */}
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
              const title = show?.title || humanizeShowId(item.show_id);
              const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.gridCardFixed, pressed && styles.pressed]}
                  onPress={() => router.push({
                    pathname: '/rate/[showId]' as any,
                    params: { showId: item.show_id, showTitle: title, suggestedDate: item.planned_date || '' },
                  })}
                >
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
                      <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
                  <Text style={styles.toBeRatedPosterDate}>
                    {item.planned_date ? new Date(item.planned_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    }) : 'Rate'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Upcoming — future planned watchlist dates + (rare) future date_seen reviews */}
      {(upcomingWatchlistEntries.length > 0 || upcomingReviews.length > 0) && (
        <View style={styles.upcomingSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>UPCOMING</Text>
            <Text style={styles.sectionCount}>
              {upcomingWatchlistEntries.length + upcomingReviews.length} {(upcomingWatchlistEntries.length + upcomingReviews.length) === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          {viewMode === 'grid' ? (
            // pastGrid, not toBeRatedGrid: this section sits inside the
            // already-padded list container, so the padded grid double-indented
            // it (beta feedback 2026-07-26: "upcoming list should be left
            // aligned to match the other rows").
            <View style={styles.pastGrid}>
              {upcomingWatchlistEntries.map(entry => {
                const show = showMap[entry.show_id];
                const title = show?.title || humanizeShowId(entry.show_id);
                const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
                const formattedDate = entry.planned_date
                  ? new Date(entry.planned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : null;
                return (
                  <Pressable
                    key={entry.id}
                    style={({ pressed }) => [styles.gridCardFixed, pressed && styles.pressed]}
                    onPress={() => show ? router.push(`/show/${show.slug}`) : handleMissingShow()}
                    onLongPress={() => handleRemoveUpcoming(entry)}
                    accessibilityHint="Long press to remove from watchlist"
                    accessibilityActions={[{ name: 'delete', label: 'Remove from watchlist' }]}
                    onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') handleRemoveUpcoming(entry); }}
                  >
                    {posterUrl ? (
                      <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
                    ) : (
                      <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
                        <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
                      </View>
                    )}
                    <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
                    {formattedDate && <Text style={styles.toBeRatedPosterDate}>{formattedDate}</Text>}
                  </Pressable>
                );
              })}
              {upcomingReviews.map(renderDiaryGridCard)}
            </View>
          ) : (
            <View style={{ gap: Spacing.xs, paddingHorizontal: 0 }}>
              {upcomingWatchlistEntries.map(renderUpcomingRow)}
              {upcomingReviews.map(renderDiaryListRow)}
            </View>
          )}
        </View>
      )}

      {/* Past shows — grouped by year, flat when sorting by rating */}
      {pastReviews.length > 0 && (
        showYearGroups ? (
          <View style={{ gap: Spacing.xl }}>
            {sortedYears.map(year => (
              <View key={year}>
                {showYearHeaders && (
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionLabel}>
                      {year}{year === 'No date' ? ' — edit to add a date' : ''}
                    </Text>
                    <Text style={styles.sectionCount}>
                      {reviewsByYear[year].length} {reviewsByYear[year].length === 1 ? 'entry' : 'entries'}
                    </Text>
                  </View>
                )}
                {viewMode === 'grid' ? (
                  <View style={styles.pastGrid}>
                    {reviewsByYear[year].map(renderDiaryGridCard)}
                    {year === sortedYears[sortedYears.length - 1] && (
                      <AddShowCard label="Rate a show" onPress={() => setShowSearchModal(true)} fixedWidth />
                    )}
                  </View>
                ) : (
                  <View style={{ gap: Spacing.xs, paddingHorizontal: 0 }}>
                    {reviewsByYear[year].map(renderDiaryListRow)}
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View>
            {hasOtherSections && (
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>ALL RATED</Text>
                <Text style={styles.sectionCount}>{pastReviews.length} {pastReviews.length === 1 ? 'entry' : 'entries'}</Text>
              </View>
            )}
            {viewMode === 'grid' ? (
              <View style={styles.pastGrid}>
                {pastReviews.map(renderDiaryGridCard)}
                <AddShowCard label="Rate a show" onPress={() => setShowSearchModal(true)} fixedWidth />
              </View>
            ) : (
              <View style={{ gap: Spacing.xs }}>
                {pastReviews.map(renderDiaryListRow)}
              </View>
            )}
          </View>
        )
      )}

      {/* Add-show footer when there's no past section to attach it to */}
      {pastReviews.length === 0 && (
        viewMode === 'grid' ? (
          <View style={styles.pastGrid}>
            <AddShowCard label="Rate a show" onPress={() => setShowSearchModal(true)} fixedWidth />
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() => setShowSearchModal(true)}
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
        )
      )}
    </View>
  );

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>My Watched Shows</Text>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            onPress={() => router.push('/import' as any)}
            hitSlop={8}
            accessibilityLabel="Import shows from Show Score or Mezzanine"
            testID="import-shows-button"
          >
            {/* Arrow INTO the tray (import), not the share-out icon (beta
                feedback 2026-07-25: share icon implied exporting) */}
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </Svg>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            onPress={() => setShowSearchModal(true)}
            hitSlop={8}
            accessibilityLabel="Rate a show"
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2.5}>
              <Path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </Svg>
          </Pressable>
        </View>
      </View>

      {/* Segmented control — Grid · Feed · Stats (spec §2). Its own row rather
          than a corner toggle: this switches MODE, not just card density, and
          three text segments don't fit beside the sort control on an SE. */}
      <View style={styles.segmentedRow}>
        <View style={styles.segmented}>
          {VIEW_MODES.map(mode => (
            <Pressable
              key={mode}
              testID={SEGMENT_TEST_IDS[mode]}
              style={[styles.segment, viewMode === mode && styles.segmentActive]}
              onPress={() => { haptics.tap(); setViewMode(mode); }}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === mode }}
              accessibilityLabel={`${SEGMENT_LABELS[mode]} view`}
            >
              <Text style={[styles.segmentText, viewMode === mode && styles.segmentTextActive]}>
                {SEGMENT_LABELS[mode]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Controls — sort only; per-section headers already carry their own
          counts, so a top stats line just pushed content down (web parity,
          owner 2026-07-17). Hidden in Stats + Feed, which have their own
          scope pill / sub-toggle. */}
      {viewMode !== 'stats' && viewMode !== 'list' && (
        <View style={styles.controlsRow}>
          <Text style={styles.showsSeenLabel}>{showsSeen} {showsSeen === 1 ? 'show' : 'shows'} seen</Text>
          <View style={styles.controlsRight}>
            <Pressable style={styles.sortButton} onPress={cycleDiarySort}>
              <Text style={styles.sortText}>{sortLabel}</Text>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </Svg>
            </Pressable>
          </View>
        </View>
      )}

      {/* Feed — private photo scrapbook (task #571). Own screen: the
          mockup's screen 3 has no Upcoming/To-Be-Rated sections, and this
          is the segment's dedicated identity now, not the placeholder
          timeline it used to fall back to. */}
      {viewMode === 'list' ? (
        <>
          <View style={styles.feedHeaderRow}>
            <View style={styles.lockPill}>
              <Text style={styles.lockPillText}>🔒 Only you</Text>
            </View>
            <FeedModeToggle mode={feedMode} onChange={setFeedMode} />
          </View>
          <FlatList
            data={['content']}
            keyExtractor={() => 'content'}
            renderItem={() => (
              feedMode === 'timeline' ? (
                <PhotoFeedTimeline
                  monthGroups={monthGroups}
                  signedUrls={photoSignedUrls}
                  showMap={showMap}
                  onDismissNudge={dismissNudge}
                />
              ) : (
                <PhotoWallGrid photos={allPhotosFlat} signedUrls={photoSignedUrls} />
              )
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { onRefresh(); refreshPhotoFeed(); }} tintColor={Colors.text.secondary} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.gridContainer, { paddingBottom: listBottomPad }]}
          />
        </>
      ) : viewMode === 'stats' ? (
        <StatsScreen
          /* pastReviews, not sortedReviews: a future-dated entry is a show you
             have not sat through yet, so it must not count toward hours,
             theaters or the season tile. */
          reviews={pastReviews}
          shows={shows}
          /* Stats must never paint from a partial world: without these gates a
             pre-catalog render showed "0 of 42 houses" then every number
             jumped, and a failed diary fetch rendered the empty-diary ghost to
             a 107-entry user (build-61 audit #6/#9). */
          loading={showsLoading || reviewsLoading}
          error={reviewsError}
          onRetry={() => { invalidateCache(); getAllReviews(); }}
          bottomPad={listBottomPad}
          onRateShow={() => setShowSearchModal(true)}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      ) : FABLE_DIARY_VARIANT !== 'off' ? (
        (() => {
          const variantReviews = (reviews.length >= 8 ? [...reviews] : [...FABLE_REVIEWS])
            .filter(r => r.date_seen)
            .sort((a, b) => (b.date_seen || '').localeCompare(a.date_seen || ''));
          const props = { reviews: variantReviews, showMap, topInset: 0, embedded: true };
          if (FABLE_DIARY_VARIANT === 'D') return <DiaryCalendar {...props} />;
          if (FABLE_DIARY_VARIANT === 'E') return <DiaryMarquee {...props} />;
          return <DiaryLedger {...props} />;
        })()
      ) : isDiaryEmpty ? (
        <EmptyState
          emoji="🎭"
          title="Your diary is empty"
          subtitle="Rate shows you've seen to build your personal diary."
          actionLabel="Rate a Show"
          onAction={() => setShowSearchModal(true)}
        />
      ) : (
        <FlatList
          data={['content']}
          keyExtractor={() => 'content'}
          renderItem={() => diaryContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.text.secondary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.gridContainer, { paddingBottom: listBottomPad }]}
        />
      )}
      {/* Search modal — select show → rate it immediately */}
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
  addButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface.overlay, alignItems: 'center', justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  controlsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  showsSeenLabel: { color: Colors.text.muted, fontSize: FontSize.xs },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sortButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface.overlay, borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  sortText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '500' },
  // Grid · Feed · Stats segmented control.
  segmentedRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  segmented: {
    flexDirection: 'row', backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.sm, overflow: 'hidden', padding: 2,
  },
  segment: {
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 6,
  },
  segmentActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  segmentText: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '600' },
  segmentTextActive: { color: Colors.text.primary, fontWeight: '700' },
  // Section headers (Upcoming / year groups / All Rated) — full-width bands so
  // year boundaries read at a glance (beta feedback 2026-07-25).
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 8,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface.raised,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border.subtle,
  },
  sectionLabel: { color: Colors.text.primary, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionCount: { color: Colors.text.muted, fontSize: 12 },
  upcomingSection: { marginBottom: Spacing.xl },
  upcomingDateText: { color: '#fcd34d', fontSize: FontSize.xs, fontWeight: '600' },
  // To Be Rated
  toBeRatedSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: Spacing.sm, marginBottom: Spacing.xl,
    marginHorizontal: -Spacing.lg,
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
    color: '#fcd34d', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4,
  },
  // Cards (list view)
  card: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, paddingVertical: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border.subtle,
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
  cardRating: { alignItems: 'flex-end', gap: 3 },
  // Grid view
  gridContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  pastGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
  },
  gridDateText: { color: Colors.text.muted, fontSize: 12, marginTop: 2 },
  // Fixed-width card for the flexWrap sections (Upcoming/Past-by-year) — a
  // flex:1 card inside flexWrap stretches unevenly on partial rows, so these
  // use the same fixed-percentage convention as the To Watch tab's grid.
  gridCardFixed: { width: '23%', alignItems: 'center' },
  gridPosterWrap: { width: '100%' },
  gridPoster: {
    width: '100%', aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
  },
  gridCardInfo: { marginTop: 4, alignItems: 'center' },
  gridTitle: {
    color: Colors.text.secondary, fontSize: 12, fontWeight: '500',
    textAlign: 'center', lineHeight: 15, marginTop: 2,
    // Reserve both title lines so the date below always sits on the same
    // baseline across cards (beta feedback 2026-07-26).
    minHeight: 30,
  },
  // Add show card
  addShowCard: {
    flex: 1, aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.surface.overlay,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addShowCardFixed: { flex: undefined, width: '23%' },
  addShowLabel: { color: Colors.text.muted, fontSize: 12, fontWeight: '500' },
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
  // Feed (photo scrapbook, task #571)
  feedHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  lockPill: {
    backgroundColor: Colors.surface.overlay, borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  lockPillText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text.muted },
});
