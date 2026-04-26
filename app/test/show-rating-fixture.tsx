/**
 * Test fixture for RatingCard / ShowPageRating layout — local state only.
 *
 * DEV ONLY — returns null in production builds.
 *
 * Usage (deep link or Expo Go URL bar):
 *   /test/show-rating-fixture?state=empty
 *   /test/show-rating-fixture?state=existing
 *   /test/show-rating-fixture?state=multi
 *
 * Renders the same `RatingCard` used by `ShowPageRating` so visual changes
 * automatically propagate. Empty state mirrors the connected component's
 * empty state (interactive lg StarRating).
 */

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import StarRating from '@/components/user/StarRating';
import RatingCard from '@/components/user/RatingCard';
import WatchlistButton from '@/components/user/WatchlistButton';
import type { UserReview } from '@/lib/user-types';

type FixtureState = 'empty' | 'existing' | 'multi';

const SHOW_ID = 'hamilton-2024';

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
      review_text: 'Even better the third time — Lin-Manuel was on as Hamilton.',
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
      review_text: 'Noticed new details this time around.',
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
      review_text: null,
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

  const [reviews, setReviews] = useState<UserReview[]>(SEED_REVIEWS[fixtureState]);
  const [isWatchlisted, setIsWatchlisted] = useState(fixtureState !== 'empty');
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Reset state when deep link changes (component is reused)
  const [prevFixtureState, setPrevFixtureState] = useState(fixtureState);
  if (fixtureState !== prevFixtureState) {
    setPrevFixtureState(fixtureState);
    setReviews(SEED_REVIEWS[fixtureState]);
    setIsWatchlisted(fixtureState !== 'empty');
    setWatchlistLoading(false);
  }

  const handleEdit = useCallback((reviewId: string) => {
    // Fixture: just log; real component routes to /rate/[showId]
    console.log('[fixture] edit', reviewId);
  }, []);

  const handleDelete = useCallback((reviewId: string) => {
    setReviews(prev => prev.filter(r => r.id !== reviewId));
  }, []);

  const handleAddViewing = useCallback(() => {
    console.log('[fixture] add viewing');
  }, []);

  const handleSeeAll = useCallback(() => {
    console.log('[fixture] see all');
  }, []);

  const handleEmptyRating = useCallback((rating: number) => {
    // Fixture: insert a quick review locally
    const newReview: UserReview = {
      id: `fixture-${Date.now()}`,
      user_id: 'fixture-user',
      show_id: SHOW_ID,
      rating,
      review_text: null,
      date_seen: null,
      visibility: 'private',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setReviews([newReview]);
    setIsWatchlisted(true);
  }, []);

  const handleToggleWatchlist = useCallback(async () => {
    setWatchlistLoading(true);
    await new Promise(r => setTimeout(r, 200));
    setIsWatchlisted(prev => !prev);
    setWatchlistLoading(false);
  }, []);

  // Production guard — after all hooks (React rules)
  if (!__DEV__) return null;

  const hasRating = reviews.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.fixtureLabel}>TEST FIXTURE — state: {fixtureState}</Text>

      <View style={styles.section}>
        {hasRating ? (
          <RatingCard
            ratings={reviews}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddViewing={handleAddViewing}
            onSeeAll={handleSeeAll}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.sectionLabel}>YOUR RATING</Text>
            <StarRating rating={null} onRatingChange={handleEmptyRating} size="lg" />
          </View>
        )}

        <View style={styles.controlsRow}>
          <WatchlistButton
            isWatchlisted={isWatchlisted}
            onToggle={handleToggleWatchlist}
            loading={watchlistLoading}
          />
          <Pressable style={styles.listButton} accessibilityLabel="Add to list">
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </Svg>
            <Text style={styles.listButtonText}>List</Text>
          </Pressable>
        </View>
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
    gap: Spacing.md,
  },
  fixtureLabel: {
    color: '#f59e0b',
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  section: {
    gap: Spacing.md,
  },
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
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
});
