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
import { useRouter , useFocusEffect } from 'expo-router';
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
import { buildReviewIndex, classifyWatchlistEntry } from '@/lib/watchlist-slot';
import { showTitleFallback } from '@/lib/show-format';
import { featureFlags } from '@/lib/feature-flags';
import MiniStars from '@/components/user/MiniStars';
import { usePosterGrid } from '@/hooks/usePosterGrid';
import { POSTER_GRID_GAP, POSTER_GRID_ROW_GAP } from '@/lib/poster-grid';
import type { UserReview, WatchlistEntry } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { Skeleton } from '@/components/Skeleton';
import { ShowSearchModal } from '@/components/ShowSearchModal';
import { ContextMenu } from '@/components/user/ContextMenu';
import { StatsScreen } from '@/components/stats/StatsScreen';
import { FeedModeToggle, type FeedMode } from '@/components/user/FeedModeToggle';
import { PhotoFeedTimeline } from '@/components/user/PhotoFeedTimeline';
import { PhotoWallGrid } from '@/components/user/PhotoWallGrid';
import { DiaryCalendarMonth, buildDiaryCalendarMonths, buildReviewsByDate, buildUpcomingByDate } from '@/components/user/DiaryCalendarView';
import { DiaryLedgerRow, UpcomingLedgerRow, MonthBand, groupReviewsByMonth } from '@/components/user/DiaryListView';
import { usePhotoFeed } from '@/hooks/usePhotoFeed';
import * as haptics from '@/lib/haptics';

type DiarySort = 'date-desc' | 'date-asc' | 'rating-desc';
/**
 * Profile segments (spec §2 — the Mezzanine mental model users already have):
 *   grid  → "Diary", the log of what you've seen. Its own grid/calendar
 *           sub-toggle chooses the LAYOUT of that log.
 *   list  → "Feed", the photo scrapbook.
 *   stats → the Scorecard.
 *
 * The top segment used to be called "Grid", which collided head-on with the
 * grid/calendar sub-toggle sitting right beneath it — two controls, both
 * saying "grid", meaning different things (owner, 2026-08-03). Naming the
 * segment after its CONTENT and leaving the sub-toggle to name the LAYOUT
 * removes the collision; the internal id stays 'grid' so persisted state and
 * e2e test ids are untouched.
 */
type ViewMode = 'list' | 'grid' | 'stats';

const VIEW_MODES: ViewMode[] = ['grid', 'list', 'stats'];
const SEGMENT_LABELS: Record<ViewMode, string> = { grid: 'Diary', list: 'Feed', stats: 'Stats' };
// Existing e2e/screenshot flows tap diary-grid-view-toggle / diary-list-view-toggle;
// those ids stay put so the segmented control is a drop-in for the old pair.
const SEGMENT_TEST_IDS: Record<ViewMode, string> = {
  grid: 'diary-grid-view-toggle',
  list: 'diary-list-view-toggle',
  stats: 'diary-stats-view-toggle',
};

const VIEW_MODE_KEY = '@bsc:diary_view_mode';

// Diary layout sub-toggle. 'list' is the Ledger direction the owner picked
// (2026-08-03 mockup). Persisted — session-only state made the user re-pick
// their layout every launch.
type DiaryLayout = 'poster' | 'list' | 'calendar';
const DIARY_LAYOUTS: DiaryLayout[] = ['poster', 'list', 'calendar'];
const DIARY_LAYOUT_KEY = '@bsc:diary_layout';

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

// ─── Grid poster + date overlay (Round 2, Grid Direction B modified) ──
// Venue text dropped entirely; the date moves off the text block and onto
// the poster as a small low-alpha corner scrim instead (title + stars stay
// as plain text below). Callers pass a pre-formatted label so the
// year-omission logic (showYearGroups) stays with the caller.
function GridPoster({ posterUrl, title, dateLabel }: { posterUrl: string | null; title: string; dateLabel?: string | null }) {
  return (
    <View style={styles.gridPosterWrap}>
      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={styles.gridPoster} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.gridPoster, styles.cardPosterPlaceholder]}>
          <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
        </View>
      )}
      {!!dateLabel && (
        <View style={styles.gridDateOverlayWrap}>
          <View style={styles.gridDateOverlay}>
            <Text style={styles.gridDateOverlayText} numberOfLines={1}>{dateLabel}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Add show card (grid footer) ──────────────────────
function AddShowCard({ label, onPress, cardWidth }: { label: string; onPress: () => void; cardWidth?: number }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.addShowCard,
        cardWidth != null && [styles.addShowCardFixed, { width: cardWidth }],
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
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

  // A show absent from useShows() is either diary-only (matched at import
  // from diary-search.json, see lib/diary-catalog.ts) or a stale reference —
  // either way it always has a real destination now (app/diary-show/[id].tsx
  // renders from the title/venue cache recorded at import time), never a
  // dead-end toast.
  const goToShow = useCallback((show: Show | undefined, showId: string) => {
    router.push(show ? `/show/${show.slug}` : `/diary-show/${showId}` as any);
  }, [router]);

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

  // 3-up poster grid; exact column width, no stranded right-hand gap.
  const grid = usePosterGrid(3);
  const gridCardStyle = useMemo(() => ({ width: grid.cardWidth }), [grid.cardWidth]);

  const [diarySort, setDiarySort] = useState<DiarySort>('date-desc');
  const [viewMode, setViewModeState] = useState<ViewMode>('grid');
  // Layout toggle inside Diary (Round 2, Direction D calendar as a secondary
  // view; Ledger list added 2026-08-03 — the owner's pick from task #300).
  const [gridSubView, setGridSubViewState] = useState<DiaryLayout>('poster');
  const [showSearchModal, setShowSearchModal] = useState(false);
  // Long-press context menu for poster grids — replaces raw Alert.alert
  // confirms (Round 2, Option B pattern extended from To Watch).
  const [gridMenu, setGridMenu] = useState<
    | { kind: 'review'; review: UserReview }
    | { kind: 'upcoming'; entry: WatchlistEntry }
    | { kind: 'toBeRated'; entry: WatchlistEntry }
    | null
  >(null);

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
    AsyncStorage.getItem(DIARY_LAYOUT_KEY).then(stored => {
      if (DIARY_LAYOUTS.includes(stored as DiaryLayout)) setGridSubViewState(stored as DiaryLayout);
    }).catch(() => {});
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {});
  }, []);

  const setGridSubView = useCallback((layout: DiaryLayout) => {
    setGridSubViewState(layout);
    AsyncStorage.setItem(DIARY_LAYOUT_KEY, layout).catch(() => {});
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
  // Shelf assignment is shared with the To Watch tab (lib/watchlist-slot.ts) —
  // this screen used to drop anything already rated from Upcoming, which hid a
  // re-booked show that To Watch was still showing (beta feedback 2026-08-05
  // AMRzGCE4 / 2026-08-07 AHJspB30).
  const reviewIndex = useMemo(() => buildReviewIndex(reviews), [reviews]);

  // To Be Rated — planned date has passed and that outing isn't logged yet
  const toBeRated = useMemo(() => {
    return watchlist
      .filter(w => classifyWatchlistEntry(w, reviewIndex, today) === 'to-be-rated')
      .sort((a, b) => (b.planned_date || '').localeCompare(a.planned_date || ''));
  }, [watchlist, today, reviewIndex]);

  // Upcoming — watchlist entries with a future (or today) planned date.
  const upcomingWatchlistEntries = useMemo(() => {
    return watchlist
      .filter(w => classifyWatchlistEntry(w, reviewIndex, today) === 'upcoming')
      .sort((a, b) => (a.planned_date || '').localeCompare(b.planned_date || ''));
  }, [watchlist, today, reviewIndex]);

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

  // Calendar sub-view data — months as FlatList items (virtualized above)
  const calendarReviewsByDate = useMemo(() => buildReviewsByDate(pastReviews), [pastReviews]);
  // Booked nights ride on the calendar too, so it runs forward to the last date
  // the Upcoming shelf knows about instead of stopping at the newest rating
  // (beta feedback 2026-08-09, ADd7L27s).
  const calendarUpcomingByDate = useMemo(
    () => buildUpcomingByDate([
      ...upcomingWatchlistEntries.map(e => ({ show_id: e.show_id, date: e.planned_date })),
      ...upcomingReviews.map(r => ({ show_id: r.show_id, date: r.date_seen })),
    ]),
    [upcomingWatchlistEntries, upcomingReviews],
  );
  const calendarMonths = useMemo(
    () => buildDiaryCalendarMonths(calendarReviewsByDate, calendarUpcomingByDate),
    [calendarReviewsByDate, calendarUpcomingByDate],
  );

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
    const title = show?.title || showTitleFallback(review.show_id);
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

  const handleRemoveUpcoming = useCallback((entry: WatchlistEntry, alertTitle = 'Remove from Watchlist') => {
    haptics.action();
    const show = showMap[entry.show_id];
    const title = show?.title || 'this show';
    Alert.alert(
      alertTitle,
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

  // ─── Ledger list row (Diary list layout — owner's 2026-08-03 mockup pick) ────
  const renderDiaryLedgerRow = (item: UserReview) => {
    const show = showMap[item.show_id];
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
        // Feed-card spacing lives on the wrapper, not the card — a margin on
        // the card itself would let the red delete action peek through the gap.
        containerStyle={{ marginBottom: Spacing.sm }}
      >
        <DiaryLedgerRow
          review={item}
          show={show}
          fallbackTitle={showTitleFallback(item.show_id)}
          posterUrl={posterUrl}
          onPress={() => guardedPush(item.id, () => goToShow(show, item.show_id))}
          onLongPress={() => { haptics.action(); setGridMenu({ kind: 'review', review: item }); }}
          onEditRating={() => router.push({
            pathname: '/rate/[showId]' as any,
            params: { showId: item.show_id, showTitle: show?.title || showTitleFallback(item.show_id), reviewId: item.id },
          })}
          onDelete={() => handleDeleteDiaryItem(item)}
        />
      </ReanimatedSwipeable>
    );
  };

  // ─── Grid card (shared by To Be Rated is separate; this is for rated diary entries) ────
  const renderDiaryGridCard = (item: UserReview) => {
    const show = showMap[item.show_id];
    const title = show?.title || showTitleFallback(item.show_id);
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.gridCardFixed, gridCardStyle, pressed && styles.pressed]}
        onPress={() => goToShow(show, item.show_id)}
        onLongPress={() => { haptics.action(); setGridMenu({ kind: 'review', review: item }); }}
        accessibilityHint="Long press for more actions"
        accessibilityActions={[{ name: 'delete', label: 'Delete rating' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') handleDeleteDiaryItem(item); }}
      >
        {/* No corner delete button — owner reverted the Tier-1 sweep's X
            (beta feedback 2026-07-26: "Removing isn't a common action.
            They can long press or click in to delete instead"). Date now
            lives on the poster as a corner overlay, not below it (Round 2). */}
        <GridPoster
          posterUrl={posterUrl}
          title={title}
          dateLabel={item.date_seen
            ? new Date(item.date_seen + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', ...(showYearGroups ? {} : { year: 'numeric' }),
              })
            : null}
        />
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
        <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
      </Pressable>
    );
  };

  // Upcoming rows in the list layout share the Feed card anatomy — date on
  // the LEFT like every other row on the page (owner feedback 2026-08-03:
  // "Weird to have two different layouts on one page"); the countdown sits
  // where rated rows put their stars.
  const renderUpcomingRow = (entry: WatchlistEntry) => {
    const show = showMap[entry.show_id];
    const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
    const daysUntil = entry.planned_date
      ? Math.ceil((new Date(entry.planned_date + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const countdownLabel = daysUntil !== null && daysUntil > 0
      ? (daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`)
      : null;

    return (
      <UpcomingLedgerRow
        key={entry.id}
        plannedDate={entry.planned_date}
        show={show}
        fallbackTitle={showTitleFallback(entry.show_id)}
        posterUrl={posterUrl}
        countdownLabel={countdownLabel}
        onPress={() => goToShow(show, entry.show_id)}
        onLongPress={() => { haptics.action(); setGridMenu({ kind: 'upcoming', entry }); }}
        onRemove={() => handleRemoveUpcoming(entry)}
      />
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
              const title = show?.title || showTitleFallback(item.show_id);
              const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.gridCardFixed, gridCardStyle, pressed && styles.pressed]}
                  onPress={() => router.push({
                    pathname: '/rate/[showId]' as any,
                    params: { showId: item.show_id, showTitle: title, suggestedDate: item.planned_date || '' },
                  })}
                  // Escape hatch for shows you didn't end up seeing — without
                  // this a past-dated entry is stuck in To Be Rated forever
                  // (beta feedback 2026-08-02: The Potluck).
                  onLongPress={() => { haptics.action(); setGridMenu({ kind: 'toBeRated', entry: item }); }}
                  accessibilityHint="Long press for more actions"
                  accessibilityActions={[{ name: 'delete', label: 'Remove — didn’t see it' }]}
                  onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') handleRemoveUpcoming(item); }}
                >
                  <GridPoster
                    posterUrl={posterUrl}
                    title={title}
                    dateLabel={item.planned_date ? new Date(item.planned_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    }) : 'Rate'}
                  />
                  <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
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
          {gridSubView === 'poster' ? (
            // pastGrid, not toBeRatedGrid: this section sits inside the
            // already-padded list container, so the padded grid double-indented
            // it (beta feedback 2026-07-26: "upcoming list should be left
            // aligned to match the other rows").
            <View style={styles.pastGrid}>
              {upcomingWatchlistEntries.map(entry => {
                const show = showMap[entry.show_id];
                const title = show?.title || showTitleFallback(entry.show_id);
                const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
                const formattedDate = entry.planned_date
                  ? new Date(entry.planned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : null;
                return (
                  <Pressable
                    key={entry.id}
                    style={({ pressed }) => [styles.gridCardFixed, gridCardStyle, pressed && styles.pressed]}
                    onPress={() => goToShow(show, entry.show_id)}
                    onLongPress={() => { haptics.action(); setGridMenu({ kind: 'upcoming', entry }); }}
                    accessibilityHint="Long press for more actions"
                    accessibilityActions={[{ name: 'delete', label: 'Remove from watchlist' }]}
                    onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') handleRemoveUpcoming(entry); }}
                  >
                    <GridPoster posterUrl={posterUrl} title={title} dateLabel={formattedDate} />
                    <Text style={styles.gridTitle} numberOfLines={2}>{title}</Text>
                  </Pressable>
                );
              })}
              {upcomingReviews.map(renderDiaryGridCard)}
            </View>
          ) : (
            // No gap here: both row kinds carry their own marginBottom (the
            // ledger rows on the swipeable wrapper, the upcoming rows on the
            // card) — a parent gap would double the spacing between them.
            <View>
              {upcomingWatchlistEntries.map(renderUpcomingRow)}
              {upcomingReviews.map(renderDiaryLedgerRow)}
            </View>
          )}
        </View>
      )}

      {/* Past shows — grouped by year, flat when sorting by rating */}
      {pastReviews.length > 0 && (
        gridSubView === 'list' && showYearGroups ? (
          // Feed parity (owner 2026-08-03): the Feed's month bands carry the
          // year ("JULY 2026 · 4 entries"), so the list layout groups by month
          // only — a separate year band on top would be a second layout on the
          // same page, which is exactly what the owner objected to.
          <View>
            {groupReviewsByMonth(pastReviews).map(monthGroup => (
              <View key={monthGroup.key}>
                <MonthBand label={monthGroup.label} count={monthGroup.items.length} />
                {monthGroup.items.map(renderDiaryLedgerRow)}
              </View>
            ))}
          </View>
        ) : showYearGroups ? (
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
                <View style={styles.pastGrid}>
                  {reviewsByYear[year].map(renderDiaryGridCard)}
                  {year === sortedYears[sortedYears.length - 1] && (
                    <AddShowCard label="Rate a show" onPress={() => setShowSearchModal(true)} cardWidth={grid.cardWidth} />
                  )}
                </View>
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
            {gridSubView === 'poster' ? (
              <View style={styles.pastGrid}>
                {pastReviews.map(renderDiaryGridCard)}
                <AddShowCard label="Rate a show" onPress={() => setShowSearchModal(true)} cardWidth={grid.cardWidth} />
              </View>
            ) : (
              <View>
                {pastReviews.map(renderDiaryLedgerRow)}
              </View>
            )}
          </View>
        )
      )}

      {/* Add-show footer when there's no past section to attach it to */}
      {pastReviews.length === 0 && (
        gridSubView === 'poster' ? (
          <View style={styles.pastGrid}>
            <AddShowCard label="Rate a show" onPress={() => setShowSearchModal(true)} cardWidth={grid.cardWidth} />
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
            // Brand gold, not surface gray — the primary "log a show" action
            // was invisible next to the import button (beta feedback
            // 2026-08-05, ANCVRB3: "Make this a yellow action color").
            style={({ pressed }) => [styles.addButton, styles.addButtonPrimary, pressed && styles.pressed]}
            onPress={() => setShowSearchModal(true)}
            hitSlop={8}
            accessibilityLabel="Rate a show"
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.text.inverse} strokeWidth={2.5}>
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
              // 38pt visual (header-density pass) + 4pt slop keeps the
              // effective target at 46pt, above the 44pt HIG floor.
              hitSlop={{ top: 4, bottom: 4 }}
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
            <Pressable style={styles.sortButton} hitSlop={{ top: 6, bottom: 6 }} onPress={cycleDiarySort}>
              <Text style={styles.sortText}>{sortLabel}</Text>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </Svg>
            </Pressable>
            {/* Grid/list/calendar sub-view — segmented so ALL options are
                visible and the active one is highlighted (beta feedback
                2026-08-02: "not just a single icon that flips when you hit
                it"). */}
            <View style={styles.subViewSegmented} testID="diary-calendar-view-toggle">
              <Pressable
                style={[styles.subViewSegment, gridSubView === 'poster' && styles.subViewSegmentActive]}
                onPress={() => { haptics.tap(); setGridSubView('poster'); }}
                accessibilityRole="button"
                accessibilityState={{ selected: gridSubView === 'poster' }}
                accessibilityLabel="Poster grid view"
                testID="diary-poster-layout-toggle"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={gridSubView === 'poster' ? Colors.text.primary : Colors.text.muted} strokeWidth={2}>
                  <Path strokeLinecap="round" strokeLinejoin="round" d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
                </Svg>
              </Pressable>
              <Pressable
                style={[styles.subViewSegment, gridSubView === 'list' && styles.subViewSegmentActive]}
                onPress={() => { haptics.tap(); setGridSubView('list'); }}
                accessibilityRole="button"
                accessibilityState={{ selected: gridSubView === 'list' }}
                accessibilityLabel="List view"
                testID="diary-list-layout-toggle"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={gridSubView === 'list' ? Colors.text.primary : Colors.text.muted} strokeWidth={2}>
                  <Path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </Svg>
              </Pressable>
              <Pressable
                style={[styles.subViewSegment, gridSubView === 'calendar' && styles.subViewSegmentActive]}
                onPress={() => { haptics.tap(); setGridSubView('calendar'); }}
                accessibilityRole="button"
                accessibilityState={{ selected: gridSubView === 'calendar' }}
                accessibilityLabel="Calendar view"
                testID="diary-calendar-layout-toggle"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={gridSubView === 'calendar' ? Colors.text.primary : Colors.text.muted} strokeWidth={2}>
                  <Path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </Svg>
              </Pressable>
            </View>
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
      ) : gridSubView === 'calendar' ? (
        // Months are the FlatList items so the list can virtualize — a
        // 3-year diary would otherwise mount ~1,300 cells at once.
        <FlatList
          data={calendarMonths}
          keyExtractor={m => `${m.year}-${m.month}`}
          renderItem={({ item }) => (
            <DiaryCalendarMonth
              year={item.year}
              month={item.month}
              reviewsByDate={calendarReviewsByDate}
              upcomingByDate={calendarUpcomingByDate}
              showMap={showMap}
            />
          )}
          windowSize={5}
          initialNumToRender={3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.text.secondary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.gridContainer, { paddingBottom: listBottomPad }]}
        />
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
      {/* Long-press context menu — replaces raw Alert.alert confirms (Round 2,
          Option B pattern extended from To Watch to the diary/upcoming grids). */}
      <ContextMenu
        visible={!!gridMenu}
        title={
          gridMenu
            ? (showMap[gridMenu.kind === 'review' ? gridMenu.review.show_id : gridMenu.entry.show_id]?.title
              || showTitleFallback(gridMenu.kind === 'review' ? gridMenu.review.show_id : gridMenu.entry.show_id))
            : undefined
        }
        onClose={() => setGridMenu(null)}
        actions={(() => {
          if (!gridMenu) return [];
          if (gridMenu.kind === 'review') {
            const { review } = gridMenu;
            const show = showMap[review.show_id];
            return [
              { label: 'View show', onPress: () => goToShow(show, review.show_id) },
              {
                label: 'Edit rating',
                onPress: () => router.push({
                  pathname: '/rate/[showId]' as any,
                  params: { showId: review.show_id, showTitle: show?.title || '', reviewId: review.id },
                }),
              },
              { label: 'Delete rating', destructive: true, onPress: () => handleDeleteDiaryItem(review) },
            ];
          }
          const { entry } = gridMenu;
          const show = showMap[entry.show_id];
          if (gridMenu.kind === 'toBeRated') {
            return [
              {
                label: 'Rate this show',
                onPress: () => router.push({
                  pathname: '/rate/[showId]' as any,
                  params: { showId: entry.show_id, showTitle: show?.title || '', suggestedDate: entry.planned_date || '' },
                }),
              },
              { label: 'View show', onPress: () => goToShow(show, entry.show_id) },
              { label: 'Didn’t see it — remove', destructive: true, onPress: () => handleRemoveUpcoming(entry, 'Didn’t see it') },
            ];
          }
          return [
            { label: 'View show', onPress: () => goToShow(show, entry.show_id) },
            { label: 'Remove from Watchlist', destructive: true, onPress: () => handleRemoveUpcoming(entry) },
          ];
        })()}
      />

      {/* Search modal — select show → rate it immediately */}
      <ShowSearchModal
        visible={showSearchModal}
        title="Rate a Show"
        onSelect={(selection) => {
          setShowSearchModal(false);
          router.push({
            pathname: '/rate/[showId]' as any,
            params: { showId: selection.id, showTitle: selection.title },
          });
        }}
        onClose={() => setShowSearchModal(false)}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  // Compacted 2026-08-03 (owner: header chrome "too tall vertically, taking
  // up too much room" — the bottom bar is the native SwiftUI tab bar whose
  // height iOS owns, so the reclaimable space is all up here).
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xs,
  },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text.primary },
  addButton: {
    // 38pt visual + hitSlop 8 at both call sites keeps the effective target ≥44pt.
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surface.overlay, alignItems: 'center', justifyContent: 'center',
  },
  addButtonPrimary: { backgroundColor: Colors.brand },
  pressed: { opacity: 0.7 },
  controlsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: 6,
  },
  showsSeenLabel: { color: Colors.text.muted, fontSize: FontSize.xs },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sortButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface.overlay, borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
  },
  sortText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '500' },
  subViewSegmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.overlay,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  subViewSegment: {
    width: 38, height: 34, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  subViewSegmentActive: {
    backgroundColor: Colors.surface.raised,
  },
  // Diary · Feed · Stats segmented control. 38pt segments, not 44: each
  // segment is ~⅓ screen wide so the touch target stays generous, and the
  // shorter control is part of the same header-density pass.
  segmentedRow: { paddingHorizontal: Spacing.lg, paddingBottom: 6 },
  segmented: {
    flexDirection: 'row', backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.sm, overflow: 'hidden', padding: 2,
  },
  segment: {
    flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center',
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
    flexDirection: 'row', flexWrap: 'wrap',
    columnGap: POSTER_GRID_GAP, rowGap: POSTER_GRID_ROW_GAP,
    paddingHorizontal: Spacing.lg,
  },
  // Cards (list view)
  card: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, paddingVertical: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border.subtle,
  },
  cardPoster: {
    width: 48, height: 64, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  cardPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Colors.text.muted, fontSize: 18, fontWeight: '600' },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '600' },
  // Grid view
  gridContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  pastGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    // Gutters come from lib/poster-grid so they stay in lockstep with the card
    // width the columns are cut to (beta feedback 2026-08-09, APv8Zqbv: tiles
    // "too crowded").
    columnGap: POSTER_GRID_GAP, rowGap: POSTER_GRID_ROW_GAP,
  },
  // 3-up enriched grid (Round 2, Grid Direction B modified) — was 4-up/23%;
  // wider cards give the poster + overlay date room to breathe. Width itself
  // comes from usePosterGrid(3): at 31% the three columns plus two gaps left
  // ~13pt stranded on the right of every row, which read as "the gap on the
  // right is bigger than on the left" (beta feedback 2026-08-03, AKGsYTnH).
  gridCardFixed: { alignItems: 'center' },
  gridPosterWrap: { width: '100%', position: 'relative', borderRadius: BorderRadius.md, overflow: 'hidden' },
  gridPoster: {
    width: '100%', aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
  },
  // Date lives on the poster now, not the text block below (venue dropped
  // entirely) — small low-alpha corner scrim, unobtrusive by design.
  // Horizontally centered so the tag lines up with the centered title/stars
  // below the poster (beta feedback 2026-08-02).
  gridDateOverlayWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 6,
    alignItems: 'center',
  },
  gridDateOverlay: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  gridDateOverlayText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  addShowCardFixed: { flex: undefined },
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
