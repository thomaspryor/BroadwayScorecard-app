/**
 * ShowPageRating — combined connected + presentational rating section.
 *
 * Combines web's ShowPageRating.tsx + ShowPageRatingConnected.tsx
 * (no RSC boundary in React Native).
 *
 * Wires: useAuth(), useUserReviews(), useWatchlist(), deferred auth,
 * supabase-rest for reliable saves, toast for feedback.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useToastSafe } from '@/lib/toast-context';
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/deferred-auth';
import { supabaseRestInsert, supabaseRestUpdate } from '@/lib/supabase-rest';
import { featureFlags } from '@/lib/feature-flags';
import StarRating from './StarRating';
import ReviewPanel from './ReviewPanel';
import WatchlistButton from './WatchlistButton';
import type { UserReview } from '@/lib/user-types';
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
  previewDate,
  closingDate,
}: ShowPageRatingProps) {
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { reviews, getReviewsForShow } = useUserReviews(user?.id || null);
  const {
    isWatchlisted,
    addToWatchlist,
    removeFromWatchlist,
    getWatchlist,
    updatePlannedDate,
    watchlist,
  } = useWatchlist(user?.id || null);
  const { showToast } = useToastSafe();
  const router = useRouter();
  const pathname = usePathname();

  const hasExecutedPending = useRef(false);
  const lastSavedId = useRef<string | null>(null);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editingReview, setEditingReview] = useState<UserReview | null>(null);
  const [saving, setSaving] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [autoEditLatest, setAutoEditLatest] = useState(false);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      getReviewsForShow(showId);
      getWatchlist();
    }
  }, [isAuthenticated, user, showId, getReviewsForShow, getWatchlist]);

  // Derive state
  const showReviews = reviews.filter(r => r.show_id === showId);
  const latestReview =
    showReviews.length > 0
      ? showReviews.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a))
      : null;
  const displayRating = editingReview?.rating ?? latestReview?.rating ?? currentRating;
  const viewCount = showReviews.length;
  const watchlistEntry = watchlist.find(w => w.show_id === showId);

  // Auto-open panel after deferred auth saves
  useEffect(() => {
    if (autoEditLatest && latestReview && !showPanel) {
      setEditingReview(latestReview);
      setCurrentRating(latestReview.rating);
      setShowPanel(true);
    }
  }, [autoEditLatest, latestReview, showPanel]);

  // ─── Execute pending action after auth ───────────────────
  useEffect(() => {
    if (!isAuthenticated || !user || hasExecutedPending.current) return;

    (async () => {
      const pending = await getPendingAction();
      if (!pending || pending.showId !== showId) return;

      hasExecutedPending.current = true;
      await clearPendingAction();

      if (pending.type === 'rating' && pending.rating) {
        try {
          const { error: insertErr } = await supabaseRestInsert('reviews', {
            user_id: user.id,
            show_id: showId,
            rating: pending.rating,
            review_text: null,
            date_seen: null,
          });
          if (insertErr) throw new Error(insertErr.message);

          showToast('Added to Reviews — add date & notes below', 'success', '/(tabs)/my-shows');
          await getReviewsForShow(showId);
          setAutoEditLatest(true);
        } catch (e) {
          const detail = e instanceof Error ? e.message : 'Unknown error';
          showToast(`Save failed: ${detail}`, 'error');
        }
      } else if (pending.type === 'watchlist') {
        try {
          await addToWatchlist(showId);
          await getWatchlist();
          showToast('Added to Watchlist', 'success', '/(tabs)/my-shows');
        } catch {
          showToast('Failed to add to watchlist.', 'error');
        }
      } else {
        showToast('Signed in successfully!', 'success');
      }
    })();
  }, [isAuthenticated, user, showId]);

  // ─── Handlers ────────────────────────────────────────────

  const handleRatingChange = useCallback(
    (rating: number) => {
      if (!isAuthenticated) {
        setCurrentRating(rating);
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
      setCurrentRating(rating);
      setShowPanel(true);
      setEditingReview(null);
    },
    [isAuthenticated, showId, pathname, showSignIn],
  );

  const handleSave = useCallback(
    async (data: { rating: number; reviewText: string | null; dateSeen: string | null }) => {
      if (!user) {
        showToast('Please sign in to save ratings.', 'error');
        return;
      }
      const isFirstSave = !editingReview && !latestReview && !lastSavedId.current;
      setSaving(true);
      try {
        const idToPass = editingReview?.id || lastSavedId.current || undefined;

        if (idToPass) {
          const filters = `id=eq.${idToPass}&user_id=eq.${user.id}`;
          const { data: updated, error } = await supabaseRestUpdate<{ id: string }>('reviews', filters, {
            rating: data.rating,
            review_text: data.reviewText || null,
            date_seen: data.dateSeen || null,
            updated_at: new Date().toISOString(),
          });
          if (error) throw new Error(error.message);
          if (updated?.id) lastSavedId.current = updated.id;
          showToast('Updated in Reviews', 'success', '/(tabs)/my-shows');
        } else {
          const { data: inserted, error } = await supabaseRestInsert<{ id: string }>('reviews', {
            user_id: user.id,
            show_id: showId,
            rating: data.rating,
            review_text: data.reviewText || null,
            date_seen: data.dateSeen || null,
          });
          if (error) throw new Error(error.message);
          if (inserted?.id) lastSavedId.current = inserted.id;
          showToast('Added to Reviews', 'success', '/(tabs)/my-shows');
        }

        await getReviewsForShow(showId);
        const userFilledDetails = !!(data.reviewText || data.dateSeen);
        if (isFirstSave && !userFilledDetails) {
          // Keep panel open for adding notes/date
        } else {
          setShowPanel(false);
          setEditingReview(null);
          setCurrentRating(null);
          lastSavedId.current = null;
        }
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Unknown error';
        showToast(`Save failed: ${detail}`, 'error');
      } finally {
        setSaving(false);
      }
    },
    [user, editingReview, latestReview, showId, getReviewsForShow, showToast],
  );

  const handleCancel = useCallback(() => {
    setShowPanel(false);
    setEditingReview(null);
    if (!latestReview) setCurrentRating(null);
  }, [latestReview]);

  const handleEdit = useCallback((review: UserReview) => {
    setEditingReview(review);
    setCurrentRating(review.rating);
    setShowPanel(true);
  }, []);

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
        showToast('Added to Watchlist', 'success', '/(tabs)/my-shows');
      }
    } catch {
      showToast('Failed to update watchlist.', 'error');
    } finally {
      setWatchlistLoading(false);
    }
  }, [isAuthenticated, showId, pathname, showSignIn, isWatchlisted, addToWatchlist, removeFromWatchlist, showToast]);

  // ─── Render ──────────────────────────────────────────────

  // Feature flag check — in render, after all hooks (React rules)
  if (!featureFlags.userAccounts) return null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          {/* Section label */}
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>YOUR RATING</Text>
            {viewCount > 1 && (
              <View style={styles.seenBadge} accessibilityLabel={`Seen ${viewCount} times`}>
                <Text style={styles.seenText}>Seen {viewCount} times</Text>
              </View>
            )}
          </View>

          {/* Stars */}
          {latestReview && !showPanel ? (
            <View style={styles.existingRow}>
              <StarRating rating={latestReview.rating} onRatingChange={handleRatingChange} size="lg" readOnly />
              <Pressable onPress={() => handleEdit(latestReview)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit rating">
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                  <Path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </Svg>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditingReview(null);
                  setCurrentRating(null);
                  lastSavedId.current = null;
                  setShowPanel(false);
                  handleRatingChange(latestReview.rating);
                }}
                accessibilityRole="button"
                accessibilityLabel="New viewing"
              >
                <Text style={styles.newViewingText}>+ New Viewing</Text>
              </Pressable>
            </View>
          ) : (
            <StarRating rating={currentRating} onRatingChange={handleRatingChange} size="lg" />
          )}

          {/* Previous viewings */}
          {viewCount > 1 && !showPanel && (
            <View style={styles.previousViewings}>
              {showReviews.slice(0, 3).map(review => (
                <Pressable key={review.id} style={styles.viewingRow} onPress={() => handleEdit(review)} accessibilityRole="button" accessibilityLabel="Edit this viewing">
                  <StarRating rating={review.rating} onRatingChange={() => {}} size="sm" readOnly hideLabel />
                  {review.date_seen && (
                    <Text style={styles.viewingDate}>
                      {new Date(review.date_seen + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Watchlist button */}
        <View style={styles.rightCol}>
          <WatchlistButton
            isWatchlisted={isWatchlisted(showId)}
            onToggle={handleToggleWatchlist}
            loading={watchlistLoading}
          />
        </View>
      </View>

      {/* Expandable review panel */}
      {showPanel && currentRating !== null && (
        <ReviewPanel
          rating={currentRating}
          existingReviewText={editingReview?.review_text}
          existingDateSeen={editingReview?.date_seen}
          showTitle={showTitle}
          latestDate={closingDate}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  leftCol: {
    flex: 1,
  },
  rightCol: {
    paddingTop: Spacing.xl,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  seenBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  seenText: {
    color: Colors.text.muted,
    fontSize: 10,
    fontWeight: '500',
  },
  existingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  newViewingText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  previousViewings: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  viewingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  viewingDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
});
