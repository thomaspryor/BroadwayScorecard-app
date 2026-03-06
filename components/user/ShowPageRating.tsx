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
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
  onPanelChange?: (isOpen: boolean) => void;
}

export default function ShowPageRating({
  showId,
  showTitle,
  previewDate,
  closingDate,
  onPanelChange,
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

  const hasExecutedPending = useRef(false);
  const lastSavedId = useRef<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editingReview, setEditingReview] = useState<UserReview | null>(null);
  const [saving, setSaving] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [autoEditLatest, setAutoEditLatest] = useState(false);
  const [showWatchlistDatePicker, setShowWatchlistDatePicker] = useState(false);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      getReviewsForShow(showId);
      getWatchlist();
    }
  }, [isAuthenticated, user, showId, getReviewsForShow, getWatchlist]);

  // Reset lastSavedId when navigating to different show
  useEffect(() => {
    lastSavedId.current = null;
  }, [showId]);

  // Derive state
  const showReviews = reviews.filter(r => r.show_id === showId);
  const latestReview =
    showReviews.length > 0
      ? showReviews.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a))
      : null;
  const viewCount = showReviews.length;
  const watchlistEntry = watchlist.find(w => w.show_id === showId);

  // Notify parent when panel opens/closes (for hiding sticky Buy Tickets)
  useEffect(() => {
    onPanelChange?.(showPanel);
  }, [showPanel, onPanelChange]);

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
          await invalidateCache();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once after auth, refs guard re-execution
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

        await invalidateCache();
        await getReviewsForShow(showId);
        setShowPanel(false);
        setEditingReview(null);
        setCurrentRating(null);
        lastSavedId.current = null;
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Unknown error';
        showToast(`Save failed: ${detail}`, 'error');
      } finally {
        setSaving(false);
      }
    },
    [user, editingReview, showId, getReviewsForShow, invalidateCache, showToast],
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

  const handleDelete = useCallback(
    async (reviewId: string) => {
      try {
        await deleteReview(reviewId);
        await invalidateCache();
        showToast('Rating deleted.', 'info');
        setConfirmDeleteId(null);
        // If we deleted the review being edited, close panel
        if (editingReview?.id === reviewId) {
          setShowPanel(false);
          setEditingReview(null);
          setCurrentRating(null);
        }
        await getReviewsForShow(showId);
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Unknown error';
        showToast(`Delete failed: ${detail}`, 'error');
      }
    },
    [deleteReview, invalidateCache, showToast, editingReview, showId, getReviewsForShow],
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
        showToast('Added to Watchlist', 'success', '/(tabs)/my-shows');
      }
    } catch {
      showToast('Failed to update watchlist.', 'error');
    } finally {
      setWatchlistLoading(false);
    }
  }, [isAuthenticated, showId, pathname, showSignIn, isWatchlisted, addToWatchlist, removeFromWatchlist, showToast]);

  const handleWatchlistDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS !== 'ios') setShowWatchlistDatePicker(false);
      if (selectedDate) {
        const iso = selectedDate.toISOString().split('T')[0];
        updatePlannedDate(showId, iso).catch(() => {
          showToast('Failed to save date.', 'error');
        });
      }
    },
    [showId, updatePlannedDate, showToast],
  );

  // ─── Render ──────────────────────────────────────────────

  // Feature flag check — in render, after all hooks (React rules)
  if (!featureFlags.userAccounts) return null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          {/* Section label */}
          <View style={styles.labelRow}>
            <Text style={styles.sectionLabel}>{viewCount > 1 ? 'LATEST RATING' : 'YOUR RATING'}</Text>
            {viewCount > 1 && (
              <View style={styles.seenBadge} accessibilityLabel={`Seen ${viewCount} times`}>
                <Text style={styles.seenText}>Seen {viewCount} times</Text>
              </View>
            )}
          </View>

          {/* Stars */}
          {latestReview && !showPanel ? (
            <View>
              <StarRating rating={latestReview.rating} onRatingChange={handleRatingChange} size="lg" readOnly hideLabel />
              <View style={styles.editActions}>
                <Pressable style={styles.editButton} onPress={() => handleEdit(latestReview)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit rating">
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                    <Path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </Svg>
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
                {confirmDeleteId === latestReview.id ? (
                  <View style={styles.confirmRow}>
                    <Pressable onPress={() => handleDelete(latestReview.id)} hitSlop={8}>
                      <Text style={styles.deleteConfirmText}>Delete?</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={8}>
                      <Text style={styles.deleteCancelText}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.editButton} onPress={() => setConfirmDeleteId(latestReview.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete rating">
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                      <Path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </Svg>
                  </Pressable>
                )}
                <Pressable
                  style={styles.editButton}
                  onPress={() => {
                    setEditingReview(null);
                    setCurrentRating(null);
                    lastSavedId.current = null;
                    setShowPanel(false);
                    // Small delay so state clears before opening panel
                    setTimeout(() => handleRatingChange(latestReview.rating), 50);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="New viewing"
                >
                  <Text style={styles.newViewingText}>+ New Viewing</Text>
                </Pressable>
              </View>
              {/* Show saved date and review text */}
              {(latestReview.date_seen || latestReview.review_text) && (
                <View style={styles.savedInfo}>
                  {latestReview.date_seen && (
                    <Text style={styles.savedDate}>
                      Saw {new Date(latestReview.date_seen + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                  )}
                  {latestReview.review_text && (
                    <Text style={styles.savedReviewText} numberOfLines={2}>
                      {latestReview.review_text}
                    </Text>
                  )}
                </View>
              )}
            </View>
          ) : (
            <StarRating rating={currentRating} onRatingChange={handleRatingChange} size="lg" />
          )}

          {/* Previous viewings */}
          {viewCount > 1 && !showPanel && (
            <View style={styles.previousViewings}>
              {showReviews.slice(0, 3).map(review => (
                <View key={review.id} style={styles.viewingRow}>
                  <Pressable style={styles.viewingRowContent} onPress={() => handleEdit(review)} accessibilityRole="button" accessibilityLabel="Edit this viewing">
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
                  {confirmDeleteId === review.id ? (
                    <View style={styles.confirmRow}>
                      <Pressable onPress={() => handleDelete(review.id)} hitSlop={8}>
                        <Text style={styles.deleteConfirmText}>Delete?</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={8}>
                        <Text style={styles.deleteCancelText}>No</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => setConfirmDeleteId(review.id)} hitSlop={8} style={styles.viewingDeleteButton} accessibilityRole="button" accessibilityLabel="Delete this viewing">
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                        <Path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </Svg>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Watchlist button + planned date */}
        <View style={styles.rightCol}>
          <WatchlistButton
            isWatchlisted={isWatchlisted(showId)}
            onToggle={handleToggleWatchlist}
            loading={watchlistLoading}
          />
          {isWatchlisted(showId) && (
            <View style={styles.watchlistDateCol}>
              <Pressable
                style={styles.watchlistDateButton}
                onPress={() => setShowWatchlistDatePicker(true)}
                hitSlop={8}
              >
                <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                  <Path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </Svg>
                <Text style={styles.watchlistDateText}>
                  {watchlistEntry?.planned_date
                    ? new Date(watchlistEntry.planned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'Add date'}
                </Text>
              </Pressable>
              {watchlistEntry?.planned_date && (
                <Pressable
                  onPress={() => updatePlannedDate(showId, null).catch(() => showToast('Failed to clear date.', 'error'))}
                  hitSlop={8}
                >
                  <Text style={styles.watchlistClearDate}>Clear</Text>
                </Pressable>
              )}
            </View>
          )}
          {showWatchlistDatePicker && (
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>When are you going?</Text>
                <Pressable onPress={() => setShowWatchlistDatePicker(false)} hitSlop={8}>
                  <Text style={styles.datePickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={watchlistEntry?.planned_date ? new Date(watchlistEntry.planned_date + 'T00:00:00') : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleWatchlistDateChange}
                minimumDate={new Date()}
                themeVariant="dark"
                style={{ alignSelf: 'center' }}
              />
            </View>
          )}
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
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: Spacing.xs,
  },
  editButtonText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  newViewingText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deleteConfirmText: {
    color: '#ef4444',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  deleteCancelText: {
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
  viewingRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  viewingDeleteButton: {
    padding: Spacing.sm,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewingDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  watchlistDateCol: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  watchlistDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
  },
  watchlistDateText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  watchlistClearDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    minHeight: 44,
    textAlignVertical: 'center',
    paddingVertical: Spacing.sm,
  },
  savedInfo: {
    marginTop: Spacing.md,
    gap: 4,
  },
  savedDate: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  savedReviewText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  datePickerContainer: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    paddingTop: Spacing.md,
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
