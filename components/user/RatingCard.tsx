/**
 * RatingCard — presentational rating card for show pages.
 *
 * Pure presentational mirror of web `YourRatingCard.tsx`. All viewings
 * shown as equal rows (newest first). Owns no state except inline
 * delete-confirm. Renders nothing when ratings is empty.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import StarRating from './StarRating';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import type { UserReview } from '@/lib/user-types';

export interface RatingCardProps {
  ratings: UserReview[];
  onEdit: (reviewId: string) => void;
  onDelete: (reviewId: string) => void | Promise<void>;
  onAddViewing: () => void;
  onSeeAll?: () => void;
  className?: string;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sortNewestFirst(reviews: UserReview[]): UserReview[] {
  return [...reviews].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export default function RatingCard({
  ratings,
  onEdit,
  onDelete,
  onAddViewing,
  onSeeAll,
}: RatingCardProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerConfirmDelete = useCallback((id: string) => {
    setConfirmDeleteId(id);
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    confirmDeleteTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    };
  }, []);

  if (ratings.length === 0) return null;

  const sorted = sortNewestFirst(ratings);
  const viewCount = sorted.length;
  const isMulti = viewCount > 1;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isMulti ? `YOUR RATINGS · ${viewCount} VIEWINGS` : 'YOUR RATING'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
          onPress={onAddViewing}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add new viewing"
          testID="new-viewing"
        >
          <Text style={styles.newButtonPlus}>+</Text>
          <Text style={styles.newButtonText}>New</Text>
        </Pressable>
      </View>

      {sorted.map((review, idx) => {
        const dateLabel = formatDate(review.date_seen);
        const confirming = confirmDeleteId === review.id;
        return (
          <View
            key={review.id}
            style={[styles.row, idx > 0 && styles.rowDivider]}
            testID={`viewing-${review.id}`}
          >
            <View style={styles.rowMain}>
              <StarRating rating={review.rating} onRatingChange={() => {}} size="sm" readOnly hideLabel />
              {dateLabel ? (
                <Text style={styles.date}>{dateLabel}</Text>
              ) : (
                <Pressable onPress={() => onEdit(review.id)} hitSlop={8}>
                  <Text style={styles.addDate}>+ Date</Text>
                </Pressable>
              )}
              <View style={styles.actions}>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => onEdit(review.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Edit rating"
                  testID={`edit-rating-${review.id}`}
                >
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                    <Path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </Svg>
                </Pressable>
                {confirming ? (
                  <View style={styles.confirmRow}>
                    <Pressable onPress={() => onDelete(review.id)} hitSlop={8}>
                      <Text style={styles.deleteConfirmText}>Delete?</Text>
                    </Pressable>
                    <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={8}>
                      <Text style={styles.deleteCancelText}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.iconButton}
                    onPress={() => triggerConfirmDelete(review.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete rating"
                  >
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                      <Path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </Svg>
                  </Pressable>
                )}
              </View>
            </View>
            {review.review_text && (
              <Text style={styles.text} numberOfLines={3}>
                &ldquo;{review.review_text}&rdquo;
              </Text>
            )}
          </View>
        );
      })}

      {isMulti && onSeeAll && (
        <Pressable
          style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
          onPress={onSeeAll}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="See all your ratings"
        >
          <Text style={styles.footerText}>All Ratings →</Text>
        </Pressable>
      )}
    </View>
  );
}

const DIVIDER = 'rgba(255, 255, 255, 0.05)';

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  pressed: { opacity: 0.6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    flexShrink: 1,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: Spacing.xs,
  },
  newButtonPlus: {
    color: Colors.text.muted,
    fontSize: 16,
    lineHeight: 16,
  },
  newButtonText: {
    color: Colors.text.muted,
    fontSize: 11,
  },
  row: {
    paddingVertical: Spacing.sm,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  date: {
    color: Colors.text.muted,
    fontSize: 11,
  },
  addDate: {
    color: Colors.text.muted,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  iconButton: {
    padding: 6,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  deleteConfirmText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
  },
  deleteCancelText: {
    color: Colors.text.muted,
    fontSize: 11,
  },
  text: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 20,
  },
  footer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
  },
  footerText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
});
