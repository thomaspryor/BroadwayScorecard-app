/**
 * Test fixture for ShowPageRating — renders with local state (no auth, no Supabase).
 *
 * DEV ONLY — returns null in production builds.
 *
 * Usage (deep link or Expo Go URL bar):
 *   /test/show-rating-fixture?state=empty
 *   /test/show-rating-fixture?state=existing
 *   /test/show-rating-fixture?state=multi
 *
 * Mirrors the web project's /test/show-rating-fixture?state=... pattern.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, FontSize } from '@/constants/theme';
import StarRating from '@/components/user/StarRating';
import ReviewPanel from '@/components/user/ReviewPanel';
import WatchlistButton from '@/components/user/WatchlistButton';
import type { UserReview } from '@/lib/user-types';

type FixtureState = 'empty' | 'existing' | 'multi';

// ─── Seed data ──────────────────────────────────────────
const SHOW_ID = 'hamilton-2024';
const SHOW_TITLE = 'Hamilton';

const SEED_REVIEWS: Record<FixtureState, UserReview[]> = {
  empty: [],
  existing: [
    {
      id: 'fixture-review-1',
      user_id: 'fixture-user',
      show_id: SHOW_ID,
      rating: 4,
      review_text: 'Great show, incredible performances',
      date_seen: '2025-01-15',
      visibility: 'private',
      created_at: '2025-01-15T20:00:00Z',
      updated_at: '2025-01-15T20:00:00Z',
    },
  ],
  multi: [
    {
      id: 'fixture-review-3',
      user_id: 'fixture-user',
      show_id: SHOW_ID,
      rating: 5,
      review_text: 'Even better the third time',
      date_seen: '2025-06-10',
      visibility: 'private',
      created_at: '2025-06-10T20:00:00Z',
      updated_at: '2025-06-10T20:00:00Z',
    },
    {
      id: 'fixture-review-2',
      user_id: 'fixture-user',
      show_id: SHOW_ID,
      rating: 4.5,
      review_text: 'Noticed new details this time',
      date_seen: '2025-03-20',
      visibility: 'private',
      created_at: '2025-03-20T20:00:00Z',
      updated_at: '2025-03-20T20:00:00Z',
    },
    {
      id: 'fixture-review-1',
      user_id: 'fixture-user',
      show_id: SHOW_ID,
      rating: 4,
      review_text: 'Great show',
      date_seen: '2025-01-15',
      visibility: 'private',
      created_at: '2025-01-15T20:00:00Z',
      updated_at: '2025-01-15T20:00:00Z',
    },
  ],
};

export default function ShowRatingFixtureScreen() {
  const { state: stateParam } = useLocalSearchParams<{ state?: string }>();
  const fixtureState: FixtureState =
    stateParam === 'existing' || stateParam === 'multi' ? stateParam : 'empty';

  // ─── Local state (replaces Supabase) ────────────────
  const [reviews, setReviews] = useState<UserReview[]>(SEED_REVIEWS[fixtureState]);
  const [isWatchlisted, setIsWatchlisted] = useState(fixtureState !== 'empty');
  const [showPanel, setShowPanel] = useState(false);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [editingReview, setEditingReview] = useState<UserReview | null>(null);
  const [saving, setSaving] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Reset state when deep link changes fixture state (component is reused)
  const [prevFixtureState, setPrevFixtureState] = useState(fixtureState);
  if (fixtureState !== prevFixtureState) {
    setPrevFixtureState(fixtureState);
    setReviews(SEED_REVIEWS[fixtureState]);
    setIsWatchlisted(fixtureState !== 'empty');
    setShowPanel(false);
    setCurrentRating(null);
    setEditingReview(null);
    setSaving(false);
    setWatchlistLoading(false);
  }

  const latestReview =
    reviews.length > 0
      ? reviews.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a))
      : null;
  const viewCount = reviews.length;

  // ─── Handlers (local state, no network) ─────────────
  const handleRatingChange = useCallback((rating: number) => {
    setCurrentRating(rating);
    setShowPanel(true);
    setEditingReview(null);
  }, []);

  const handleSave = useCallback(
    async (data: { rating: number; reviewText: string | null; dateSeen: string | null }) => {
      setSaving(true);
      // Simulate network delay
      await new Promise(r => setTimeout(r, 300));

      if (editingReview) {
        // Update existing
        setReviews(prev =>
          prev.map(r =>
            r.id === editingReview.id
              ? { ...r, rating: data.rating, review_text: data.reviewText, date_seen: data.dateSeen, updated_at: new Date().toISOString() }
              : r,
          ),
        );
      } else {
        // Insert new
        const newReview: UserReview = {
          id: `fixture-review-${Date.now()}`,
          user_id: 'fixture-user',
          show_id: SHOW_ID,
          rating: data.rating,
          review_text: data.reviewText,
          date_seen: data.dateSeen,
          visibility: 'private',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setReviews(prev => [newReview, ...prev]);
      }

      setShowPanel(false);
      setEditingReview(null);
      setCurrentRating(null);
      setSaving(false);
    },
    [editingReview],
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

  const handleDelete = useCallback((reviewId: string) => {
    setReviews(prev => prev.filter(r => r.id !== reviewId));
    setShowPanel(false);
    setEditingReview(null);
    setCurrentRating(null);
  }, []);

  const handleToggleWatchlist = useCallback(async () => {
    setWatchlistLoading(true);
    await new Promise(r => setTimeout(r, 200));
    setIsWatchlisted(prev => !prev);
    setWatchlistLoading(false);
  }, []);

  // ─── Render ─────────────────────────────────────────
  // Production guard — after all hooks (React rules)
  if (!__DEV__) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.fixtureLabel}>TEST FIXTURE — state: {fixtureState}</Text>

      <View style={styles.ratingSection}>
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

            {/* Stars + action buttons */}
            {latestReview && !showPanel ? (
              <View style={styles.existingRow}>
                <StarRating rating={latestReview.rating} onRatingChange={handleRatingChange} size="lg" readOnly />
                <Pressable onPress={() => handleEdit(latestReview)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit rating">
                  <Text style={styles.actionIcon}>✏️</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(latestReview.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete rating">
                  <Text style={styles.actionIcon}>🗑️</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditingReview(null);
                    setCurrentRating(null);
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
                {reviews
                  .filter(r => r.id !== latestReview?.id)
                  .slice(0, 3)
                  .map(review => (
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
                      <Pressable onPress={() => handleDelete(review.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete this viewing">
                        <Text style={styles.actionIcon}>🗑️</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}
          </View>

          {/* Watchlist button */}
          <View style={styles.rightCol}>
            <WatchlistButton
              isWatchlisted={isWatchlisted}
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
            showTitle={SHOW_TITLE}
            latestDate={null}
            onSave={handleSave}
            onCancel={handleCancel}
            saving={saving}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.xxl,
  },
  fixtureLabel: {
    color: '#f59e0b',
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  ratingSection: {
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
    borderRadius: 4,
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
    flexWrap: 'wrap',
  },
  actionIcon: {
    fontSize: 14,
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
  viewingRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  viewingDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
});
