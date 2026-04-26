/**
 * ShowPageRating — connected rating section on show detail page.
 *
 * Wraps presentational `RatingCard` with auth + Supabase wiring.
 * Watchlist + List controls live below the card.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useToastSafe } from '@/lib/toast-context';
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/deferred-auth';
import { featureFlags } from '@/lib/feature-flags';
import * as haptics from '@/lib/haptics';
import StarRating from './StarRating';
import WatchlistButton from './WatchlistButton';
import AddToListSheet from './AddToListSheet';
import RatingCard from './RatingCard';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface ShowPageRatingProps {
  showId: string;
  showTitle: string;
  previewDate?: string | null;
  closingDate?: string | null;
}

export default function ShowPageRating({
  showId,
  showTitle,
}: ShowPageRatingProps) {
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { reviews, getReviewsForShow, deleteReview, invalidateCache } = useUserReviews(user?.id || null);
  const {
    isWatchlisted,
    addToWatchlist,
    removeFromWatchlist,
    getWatchlist,
    updatePlannedDate,
    watchlist,
  } = useWatchlist(user?.id || null);
  const { showToast } = useToastSafe();
  const pathname = usePathname();
  const router = useRouter();

  const hasExecutedPending = useRef(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [showWatchlistDatePicker, setShowWatchlistDatePicker] = useState(false);
  const [pendingWatchlistDate, setPendingWatchlistDate] = useState<Date>(new Date());
  const [showListSheet, setShowListSheet] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      getReviewsForShow(showId);
      getWatchlist();
    }
  }, [isAuthenticated, user, showId, getReviewsForShow, getWatchlist]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user) {
        getReviewsForShow(showId);
        getWatchlist();
      }
    }, [isAuthenticated, user, showId, getReviewsForShow, getWatchlist]),
  );

  const showReviews = reviews.filter(r => r.show_id === showId);
  const hasRating = showReviews.length > 0;
  const watchlistEntry = watchlist.find(w => w.show_id === showId);

  // ─── Execute pending action after auth ───────────────────
  useEffect(() => {
    if (!isAuthenticated || !user || hasExecutedPending.current) return;

    (async () => {
      const pending = await getPendingAction();
      if (!pending || pending.showId !== showId) return;

      hasExecutedPending.current = true;
      await clearPendingAction();

      if (pending.type === 'rating' && pending.rating) {
        router.push({
          pathname: '/rate/[showId]',
          params: { showId, showTitle, initialRating: String(pending.rating) },
        });
      } else if (pending.type === 'watchlist') {
        try {
          await addToWatchlist(showId);
          await getWatchlist();
          showToast('Added to Watchlist', 'success', '/(tabs)/watched');
        } catch {
          showToast('Failed to add to watchlist.', 'error');
        }
      } else if (pending.type === 'add-to-list') {
        setShowListSheet(true);
      } else {
        showToast('Signed in successfully!', 'success');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once after auth, refs guard re-execution
  }, [isAuthenticated, user, showId]);

  // ─── Handlers ────────────────────────────────────────────

  const handleRatingChange = useCallback(
    (rating: number) => {
      if (!isAuthenticated) {
        savePendingAction({
          type: 'rating',
          showId,
          rating,
          returnRoute: pathname,
          timestamp: Date.now(),
        });
        showSignIn('rating');
        return;
      }
      router.push({
        pathname: '/rate/[showId]',
        params: { showId, showTitle, initialRating: String(rating) },
      });
    },
    [isAuthenticated, showId, showTitle, pathname, showSignIn, router],
  );

  const handleEdit = useCallback(
    (reviewId: string) => {
      router.push({
        pathname: '/rate/[showId]',
        params: { showId, showTitle, reviewId },
      });
    },
    [showId, showTitle, router],
  );

  const handleNewViewing = useCallback(() => {
    router.push({
      pathname: '/rate/[showId]',
      params: { showId, showTitle },
    });
  }, [showId, showTitle, router]);

  const handleDelete = useCallback(
    async (reviewId: string) => {
      try {
        await deleteReview(reviewId);
        await invalidateCache();
        haptics.action();
        showToast('Rating deleted.', 'info');
        await getReviewsForShow(showId);
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Unknown error';
        showToast(`Delete failed: ${detail}`, 'error');
      }
    },
    [deleteReview, invalidateCache, showToast, showId, getReviewsForShow],
  );

  const handleToggleWatchlist = useCallback(async () => {
    if (!isAuthenticated) {
      savePendingAction({
        type: 'watchlist',
        showId,
        returnRoute: pathname,
        timestamp: Date.now(),
      });
      showSignIn('watchlist');
      return;
    }
    setWatchlistLoading(true);
    try {
      if (isWatchlisted(showId)) {
        await removeFromWatchlist(showId);
        showToast('Removed from Watchlist', 'info');
      } else {
        await addToWatchlist(showId);
        showToast('Added to Watchlist', 'success', '/(tabs)/watched');
      }
    } catch {
      showToast('Failed to update watchlist.', 'error');
    } finally {
      setWatchlistLoading(false);
    }
  }, [isAuthenticated, showId, pathname, showSignIn, isWatchlisted, addToWatchlist, removeFromWatchlist, showToast]);

  const handleListPress = useCallback(() => {
    if (!isAuthenticated) {
      savePendingAction({
        type: 'add-to-list',
        showId,
        returnRoute: pathname,
        timestamp: Date.now(),
      });
      showSignIn('list');
      return;
    }
    haptics.tap();
    setShowListSheet(true);
  }, [isAuthenticated, showId, pathname, showSignIn]);

  const handleAllRatings = useCallback(() => {
    haptics.tap();
    router.push('/(tabs)/watched');
  }, [router]);

  const handleWatchlistDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS !== 'ios') {
        setShowWatchlistDatePicker(false);
        if (selectedDate) {
          const iso = selectedDate.toISOString().split('T')[0];
          updatePlannedDate(showId, iso).catch(() => {
            showToast('Failed to save date.', 'error');
          });
        }
      } else if (selectedDate) {
        setPendingWatchlistDate(selectedDate);
      }
    },
    [showId, updatePlannedDate, showToast],
  );

  // ─── Render ──────────────────────────────────────────────

  if (!featureFlags.userAccounts) return null;

  return (
    <View style={styles.container}>
      {hasRating ? (
        <RatingCard
          ratings={showReviews}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddViewing={handleNewViewing}
          onSeeAll={handleAllRatings}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.sectionLabel}>YOUR RATING</Text>
          <StarRating rating={null} onRatingChange={handleRatingChange} size="lg" />
        </View>
      )}

      {/* Watchlist + List controls — always shown */}
      <View style={styles.controlsRow}>
        <View style={styles.controlsLeft}>
          <WatchlistButton
            isWatchlisted={isWatchlisted(showId)}
            onToggle={handleToggleWatchlist}
            loading={watchlistLoading}
          />
          {isWatchlisted(showId) && (
            <Pressable
              style={styles.dateChip}
              onPress={() => {
                setPendingWatchlistDate(
                  watchlistEntry?.planned_date ? new Date(watchlistEntry.planned_date + 'T00:00:00') : new Date(),
                );
                setShowWatchlistDatePicker(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Set planned date"
            >
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </Svg>
              <Text style={styles.dateChipText}>
                {watchlistEntry?.planned_date
                  ? new Date(watchlistEntry.planned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'Add date'}
              </Text>
              {watchlistEntry?.planned_date && (
                <Pressable
                  onPress={() => updatePlannedDate(showId, null).catch(() => showToast('Failed to clear date.', 'error'))}
                  hitSlop={8}
                  style={styles.dateChipClear}
                >
                  <Text style={styles.dateChipClearText}>×</Text>
                </Pressable>
              )}
            </Pressable>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.listButton, pressed && styles.pressed]}
          onPress={handleListPress}
          accessibilityRole="button"
          accessibilityLabel="Add to list"
          testID="add-to-list-button"
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </Svg>
          <Text style={styles.listButtonText}>List</Text>
        </Pressable>
      </View>

      {showWatchlistDatePicker && (
        <View style={styles.datePickerContainer}>
          <View style={styles.datePickerHeader}>
            <Text style={styles.datePickerTitle}>When are you going?</Text>
            <Pressable onPress={() => {
              const iso = pendingWatchlistDate.toISOString().split('T')[0];
              updatePlannedDate(showId, iso).catch(() => {
                showToast('Failed to save date.', 'error');
              });
              setShowWatchlistDatePicker(false);
            }} hitSlop={8}>
              <Text style={styles.datePickerDone}>Done</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={pendingWatchlistDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleWatchlistDateChange}
            minimumDate={new Date()}
            themeVariant="dark"
            style={{ alignSelf: 'center' }}
          />
        </View>
      )}

      {isAuthenticated && user && (
        <AddToListSheet
          showId={showId}
          userId={user.id}
          visible={showListSheet}
          onClose={() => setShowListSheet(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  pressed: { opacity: 0.6 },

  // ─── Empty state (no ratings yet) ───────────────────────
  emptyState: {
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ─── Watchlist + List controls row ──────────────────────
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  controlsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  dateChipText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
  },
  dateChipClear: {
    marginLeft: 4,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipClearText: {
    color: Colors.text.muted,
    fontSize: 14,
    lineHeight: 14,
  },
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  listButtonText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },

  // ─── Date picker ────────────────────────────────────────
  datePickerContainer: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  datePickerTitle: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  datePickerDone: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
