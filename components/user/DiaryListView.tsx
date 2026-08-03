/**
 * Diary list layout — the "Ledger" direction the owner picked from the
 * 2026-07 diary design round (task #300, Direction F) and re-requested with
 * a mockup on 2026-08-03: a dense, scannable list with a date rail, micro
 * posters, star ratings and month dividers, grouped under the existing
 * year bands.
 *
 * The heart glyph from the mockup is intentionally absent: UserReview has
 * no favorite field, and we never render data we don't have. The comment
 * glyph appears only when the entry carries review text.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import MiniStars from '@/components/user/MiniStars';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';

/** Consecutive-month groups, preserving the caller's sort order. */
export function groupReviewsByMonth(reviews: UserReview[]): { key: string; label: string | null; items: UserReview[] }[] {
  const groups: { key: string; label: string | null; items: UserReview[] }[] = [];
  for (const review of reviews) {
    const d = review.date_seen ? new Date(review.date_seen + 'T00:00:00') : null;
    const valid = d && !Number.isNaN(d.getTime());
    const key = valid ? `${d!.getFullYear()}-${d!.getMonth()}` : 'none';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(review);
    } else {
      groups.push({
        key,
        label: valid
          ? d!.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
          : null,
        items: [review],
      });
    }
  }
  return groups;
}

export function MonthDivider({ label }: { label: string }) {
  return (
    <View style={styles.monthDivider}>
      <Text style={styles.monthDividerText}>{label}</Text>
    </View>
  );
}

interface RowProps {
  review: UserReview;
  show: Show | undefined;
  fallbackTitle: string;
  posterUrl: string | null;
  /** Rating sort has no month dividers, so the date box carries the month. */
  monthInBox?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

export function DiaryLedgerRow({ review, show, fallbackTitle, posterUrl, monthInBox, onPress, onLongPress }: RowProps) {
  const title = show?.title || fallbackTitle;
  const d = review.date_seen ? new Date(review.date_seen + 'T00:00:00') : null;
  const hasDate = d && !Number.isNaN(d.getTime());
  const day = hasDate ? String(d!.getDate()).padStart(2, '0') : '–';
  const month = hasDate ? d!.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : null;
  const year = show?.openingDate ? show.openingDate.slice(0, 4) : null;

  const a11yLabel = `${title}, rated ${review.rating.toFixed(1)} stars${
    hasDate ? `, seen ${d!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''
  }`;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Long press for more actions"
    >
      <View style={styles.dayBox}>
        {monthInBox && month && <Text style={styles.dayBoxMonth}>{month}</Text>}
        <Text style={styles.dayBoxNum}>{day}</Text>
      </View>

      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={styles.thumb} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text style={styles.thumbPlaceholderText}>{title.charAt(0)}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
          {year ? <Text style={styles.year}>  {year}</Text> : null}
        </Text>
        <View style={styles.metaRow}>
          <MiniStars rating={review.rating} />
          {!!review.review_text && (
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </Svg>
          )}
        </View>
      </View>

      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
        <Path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  monthDivider: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  monthDividerText: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.subtle,
    backgroundColor: Colors.surface.default,
  },
  pressed: { opacity: 0.7 },
  dayBox: {
    width: 40,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBoxMonth: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 13,
  },
  dayBoxNum: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  thumb: {
    width: 38,
    height: 52,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { color: Colors.text.muted, fontSize: 16, fontWeight: '600' },
  body: { flex: 1, gap: 3 },
  title: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  year: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '400' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
});
