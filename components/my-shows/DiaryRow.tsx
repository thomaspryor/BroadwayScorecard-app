import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import StarRating from '@/components/user/StarRating';
import { getImageUrl } from '@/lib/images';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';

interface Props {
  review: UserReview;
  show: Show | undefined;
  onPress: () => void;
  onLongPress?: () => void;
}

function dayParts(review: UserReview): { day: string; weekday: string } {
  const dateStr = review.date_seen || review.created_at;
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  if (Number.isNaN(d.getTime())) return { day: '–', weekday: '' };
  return {
    day: String(d.getDate()),
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

export function DiaryRow({ review, show, onPress, onLongPress }: Props) {
  const title = show?.title || review.show_id;
  const posterUrl = show?.images
    ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)
    : null;
  const { day, weekday } = dayParts(review);
  const venue = show?.venue;
  const note = review.review_text;

  const a11yLabel = `${title}, rated ${review.rating.toFixed(1)} stars${venue ? `, at ${venue}` : ''}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.dayCol}>
        <Text style={styles.dayNum}>{day}</Text>
        <Text style={styles.dayWeek}>{weekday}</Text>
      </View>

      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={styles.thumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text style={styles.thumbPlaceholderText}>{title.charAt(0)}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.metaRow}>
          <StarRating rating={review.rating} onRatingChange={() => {}} size="sm" readOnly hideLabel />
          {venue ? <Text style={styles.venue} numberOfLines={1}>{venue}</Text> : null}
        </View>
        {note ? <Text style={styles.note} numberOfLines={1}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    backgroundColor: Colors.surface.default,
  },
  pressed: {
    opacity: 0.75,
  },
  dayCol: {
    width: 40,
    alignItems: 'center',
  },
  dayNum: {
    color: Colors.text.primary,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  dayWeek: {
    color: Colors.text.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  thumb: {
    width: 44,
    height: 64,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    color: Colors.text.muted,
    fontSize: 18,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  venue: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    flexShrink: 1,
  },
  note: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
});
