/**
 * Diary list layout — visually identical to the Feed timeline's entry cards
 * (owner feedback 2026-08-03: "Weird to have two different layouts on one
 * page … Match the feed layout, without the nudge to add a photo").
 *
 * Row anatomy, styles and month bands are copied from
 * PhotoFeedTimeline.tsx (Round 2 Direction A) — date column (day over
 * month) on the LEFT, 40x56 poster, title/venue/note, stars on the right.
 * The Upcoming variant swaps stars for a countdown. No photo strip, no
 * nudge — that stays the Feed's differentiator.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import MiniStars from '@/components/user/MiniStars';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';

/**
 * Month groups for the list layout, preserving the caller's sort order
 * within each partition.
 *
 * Undated reviews are partitioned OUT before grouping and appended as one
 * trailing NO DATE group: the caller's sort falls back to created_at, so an
 * undated import can sit between two same-month dated rows — consecutive
 * grouping alone would then emit the same month band twice with duplicate
 * React keys (second-opinion blocker, 2026-08-03). The dated subsequence of
 * a date-sorted list is strictly ordered, so its months can't split.
 */
export function groupReviewsByMonth(reviews: UserReview[]): { key: string; label: string; items: UserReview[] }[] {
  const dated: { review: UserReview; d: Date }[] = [];
  const undated: UserReview[] = [];
  for (const review of reviews) {
    const d = review.date_seen ? new Date(review.date_seen + 'T00:00:00') : null;
    if (d && !Number.isNaN(d.getTime())) dated.push({ review, d });
    else undated.push(review);
  }

  const groups: { key: string; label: string; items: UserReview[] }[] = [];
  for (const { review, d } of dated) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(review);
    } else {
      groups.push({
        key,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(),
        items: [review],
      });
    }
  }
  if (undated.length > 0) {
    groups.push({ key: 'none', label: 'NO DATE', items: undated });
  }
  return groups;
}

/** Full-bleed band header — same convention as the Feed's month bands. */
export function MonthBand({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.monthBand}>
      <Text style={styles.monthLabel}>{label}</Text>
      <Text style={styles.monthCount}>{count} {count === 1 ? 'entry' : 'entries'}</Text>
    </View>
  );
}

function DateCol({ date }: { date: string | null }) {
  const d = date ? new Date(date + 'T00:00:00') : null;
  const valid = d && !Number.isNaN(d.getTime());
  return (
    <View style={styles.dateCol}>
      {valid ? (
        <>
          <Text style={styles.dateDay}>{d!.toLocaleDateString('en-US', { day: 'numeric' })}</Text>
          <Text style={styles.dateMonth}>{d!.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</Text>
        </>
      ) : null}
    </View>
  );
}

function PosterThumb({ posterUrl, title }: { posterUrl: string | null; title: string }) {
  return posterUrl ? (
    <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
  ) : (
    <View style={[styles.poster, styles.posterPlaceholder]}>
      <Text style={styles.posterPlaceholderText}>{title.charAt(0)}</Text>
    </View>
  );
}

interface RowProps {
  review: UserReview;
  show: Show | undefined;
  fallbackTitle: string;
  posterUrl: string | null;
  onPress: () => void;
  onLongPress: () => void;
  /** VoiceOver parity with the grid cards — swipe/long-press aren't discoverable. */
  onEditRating: () => void;
  onDelete: () => void;
}

export function DiaryLedgerRow({ review, show, fallbackTitle, posterUrl, onPress, onLongPress, onEditRating, onDelete }: RowProps) {
  const title = show?.title || fallbackTitle;
  const d = review.date_seen ? new Date(review.date_seen + 'T00:00:00') : null;
  const hasDate = d && !Number.isNaN(d.getTime());

  const a11yLabel = `${title}, rated ${review.rating.toFixed(1)} stars${
    hasDate ? `, seen ${d!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''
  }`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Long press for more actions"
      accessibilityActions={[
        { name: 'edit', label: 'Edit rating' },
        { name: 'delete', label: 'Delete rating' },
      ]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'edit') onEditRating();
        if (e.nativeEvent.actionName === 'delete') onDelete();
      }}
    >
      <View style={styles.row}>
        <DateCol date={review.date_seen} />
        <PosterThumb posterUrl={posterUrl} title={title} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!!show?.venue && <Text style={styles.venue} numberOfLines={1}>{show.venue}</Text>}
          {!!review.review_text && (
            <Text style={styles.note} numberOfLines={2}>{review.review_text}</Text>
          )}
        </View>
        {review.rating > 0 && (
          <View style={styles.starsCol}>
            <MiniStars rating={review.rating} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

interface UpcomingRowProps {
  plannedDate: string | null;
  show: Show | undefined;
  fallbackTitle: string;
  posterUrl: string | null;
  /** e.g. "Tomorrow" or "23d" — replaces the stars column. */
  countdownLabel: string | null;
  onPress: () => void;
  onLongPress: () => void;
  onRemove: () => void;
}

export function UpcomingLedgerRow({ plannedDate, show, fallbackTitle, posterUrl, countdownLabel, onPress, onLongPress, onRemove }: UpcomingRowProps) {
  const title = show?.title || fallbackTitle;
  const d = plannedDate ? new Date(plannedDate + 'T00:00:00') : null;
  const hasDate = d && !Number.isNaN(d.getTime());
  const a11yLabel = `${title}${
    hasDate ? `, planned for ${d!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''
  }`;

  return (
    <Pressable
      // cardSpacing here, on the wrapper for swipeable rated rows: both row
      // kinds carry their own bottom margin so mixed sections space evenly.
      style={({ pressed }) => [styles.card, styles.cardSpacing, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Long press for more actions"
      accessibilityActions={[{ name: 'delete', label: 'Remove from watchlist' }]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'delete') onRemove();
      }}
    >
      <View style={styles.row}>
        <DateCol date={plannedDate} />
        <PosterThumb posterUrl={posterUrl} title={title} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!!show?.venue && <Text style={styles.venue} numberOfLines={1}>{show.venue}</Text>}
        </View>
        {!!countdownLabel && <Text style={styles.countdown}>{countdownLabel}</Text>}
      </View>
    </Pressable>
  );
}

// Styles below are copied from PhotoFeedTimeline.tsx so the two views stay
// pixel-identical — if you restyle the Feed cards, restyle these with them.
const styles = StyleSheet.create({
  monthBand: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 8,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface.raised,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border.subtle,
  },
  monthLabel: { color: Colors.text.primary, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
  monthCount: { color: Colors.text.muted, fontSize: 12 },
  card: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  cardSpacing: { marginBottom: Spacing.sm },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dateCol: { width: 30, alignItems: 'center' },
  dateDay: { color: Colors.text.primary, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  dateMonth: { color: Colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  poster: {
    width: 40, height: 56, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterPlaceholderText: { color: Colors.text.muted, fontSize: 16, fontWeight: '600' },
  info: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary },
  venue: { fontSize: FontSize.xs, color: Colors.text.muted },
  note: { fontSize: FontSize.xs, color: Colors.text.secondary, marginTop: 2 },
  starsCol: { alignItems: 'flex-end' },
  countdown: { color: '#fcd34d', fontSize: FontSize.xs, fontWeight: '600' },
});
