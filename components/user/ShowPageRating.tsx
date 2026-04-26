/**
 * ShowPageRating — connected rating section on the show detail page.
 *
 * Wraps presentational `RatingCard` with auth + Supabase wiring. Owns ratings
 * only — Watchlist + List buttons live in `ShowPageWatchlistAndList`, rendered
 * inside the action-links row by the show page (mirrors web mobile design).
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useToastSafe } from '@/lib/toast-context';
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/deferred-auth';
import { featureFlags } from '@/lib/feature-flags';
import * as haptics from '@/lib/haptics';
import StarRating from './StarRating';
import RatingCard from './RatingCard';
import { Colors, Spacing, FontSize } from '@/constants/theme';

interface ShowPageRatingProps {
  showId: string;
  showTitle: string;
  previewDate?: string | null;
  closingDate?: string | null;
}

export default function ShowPageRating({ showId, showTitle }: ShowPageRatingProps) {
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { reviews, getReviewsForShow, deleteReview, invalidateCache } = useUserReviews(user?.id || null);
  const { showToast } = useToastSafe();
  const pathname = usePathname();
  const router = useRouter();

  const hasExecutedPending = useRef(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      getReviewsForShow(showId);
    }
  }, [isAuthenticated, user, showId, getReviewsForShow]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user) {
        getReviewsForShow(showId);
      }
    }, [isAuthenticated, user, showId, getReviewsForShow]),
  );

  const showReviews = reviews.filter(r => r.show_id === showId);
  const hasRating = showReviews.length > 0;

  // Consume pending rating action after auth. Watchlist + add-to-list pending
  // are owned by ShowPageWatchlistAndList — leave them for that component.
  useEffect(() => {
    if (!isAuthenticated || !user || hasExecutedPending.current) return;

    (async () => {
      const pending = await getPendingAction();
      if (!pending || pending.showId !== showId) return;
      if (pending.type !== 'rating' || !pending.rating) return;

      hasExecutedPending.current = true;
      await clearPendingAction();

      router.push({
        pathname: '/rate/[showId]',
        params: { showId, showTitle, initialRating: String(pending.rating) },
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once after auth, ref guards
  }, [isAuthenticated, user, showId]);

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

  const handleAllRatings = useCallback(() => {
    haptics.tap();
    router.push('/(tabs)/watched');
  }, [router]);

  if (!featureFlags.userAccounts) return null;

  if (hasRating) {
    return (
      <RatingCard
        ratings={showReviews}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAddViewing={handleNewViewing}
        onSeeAll={handleAllRatings}
      />
    );
  }

  return (
    <View style={styles.emptyState}>
      <Text style={styles.sectionLabel}>YOUR RATING</Text>
      <StarRating rating={null} onRatingChange={handleRatingChange} size="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
