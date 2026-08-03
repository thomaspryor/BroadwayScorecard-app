/**
 * Diary Calendar view (Round 2, Grid Direction D as a toggle, not the main
 * view) — month calendars where attended nights are posters.
 *
 * Continuous vertical scroll through every month, newest first — no
 * tap-to-jump month chips (beta feedback 2026-08-02). Exported as
 * month-granular pieces so the parent FlatList can virtualize months
 * instead of mounting the whole diary's grids at once.
 *
 * The month walk starts at the NEWEST dated review (not today) and stops at
 * the oldest — starting at today would let the MAX_MONTHS cap swallow the
 * whole diary for a user whose last entry is years old.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, FontSize, BorderRadius, Spacing } from '@/constants/theme';
import { getImageUrl } from '@/lib/images';
import { showTitleFallback } from '@/lib/show-format';
import * as haptics from '@/lib/haptics';
import type { UserReview } from '@/lib/user-types';
import type { Show } from '@/lib/types';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Bound so a decades-deep import can't schedule hundreds of month grids.
const MAX_MONTHS = 36;

export interface CalendarMonth { year: number; month: number }

/** Reviews keyed by exact date (YYYY-MM-DD) — same-day repeat viewings just
 *  show the first one; a rare edge case, not worth a stacked-poster cell. */
export function buildReviewsByDate(reviews: UserReview[]): Record<string, UserReview> {
  const map: Record<string, UserReview> = {};
  for (const r of reviews) {
    if (r.date_seen && !map[r.date_seen]) map[r.date_seen] = r;
  }
  return map;
}

/** Newest→oldest month span of the dated diary, capped at MAX_MONTHS. */
export function buildDiaryCalendarMonths(reviewsByDate: Record<string, UserReview>): CalendarMonth[] {
  const dates = Object.keys(reviewsByDate).sort();
  const today = new Date();
  const newest = dates.length > 0 ? new Date(`${dates[dates.length - 1]}T00:00:00`) : today;
  const oldest = dates.length > 0 ? new Date(`${dates[0]}T00:00:00`) : today;
  let y = newest.getFullYear();
  let m = newest.getMonth();
  const out: CalendarMonth[] = [];
  while (out.length < MAX_MONTHS) {
    out.push({ year: y, month: m });
    if (y === oldest.getFullYear() && m === oldest.getMonth()) break;
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}

interface DiaryCalendarMonthProps {
  year: number;
  month: number;
  reviewsByDate: Record<string, UserReview>;
  showMap: Record<string, Show>;
  onMissingShow: () => void;
}

export function DiaryCalendarMonth({ year, month, reviewsByDate, showMap, onMissingShow }: DiaryCalendarMonthProps) {
  const cells = useMemo(() => {
    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: ({ day: number; dateStr: string; review: UserReview | null } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      out.push({ day, dateStr, review: reviewsByDate[dateStr] || null });
    }
    return out;
  }, [year, month, reviewsByDate]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.monthBlock}>
      <Text style={styles.monthTitle}>{monthLabel}</Text>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w, i) => (
          <Text key={i} style={styles.weekdayLabel}>{w}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={i} style={styles.cell} />;
          const show = cell.review ? showMap[cell.review.show_id] : null;
          const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
          if (!cell.review) {
            return (
              <View key={i} style={styles.cell}>
                <Text style={styles.dayNumber}>{cell.day}</Text>
              </View>
            );
          }
          return (
            <Pressable
              key={i}
              style={styles.cell}
              onPress={() => {
                haptics.tap();
                if (show) router.push(`/show/${show.slug}`);
                else onMissingShow();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${show?.title || showTitleFallback(cell.review.show_id)}, ${cell.dateStr}`}
            >
              {posterUrl ? (
                <Image source={{ uri: posterUrl }} style={styles.cellPoster} contentFit="cover" />
              ) : (
                <View style={[styles.cellPoster, styles.cellPosterPlaceholder]}>
                  <Text style={styles.cellPosterPlaceholderText}>{(show?.title || '?').charAt(0)}</Text>
                </View>
              )}
              <Text style={styles.dayNumberOverlay}>{cell.day}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CELL_SIZE = `${100 / 7}%`;

const styles = StyleSheet.create({
  monthBlock: { marginBottom: Spacing.lg },
  monthTitle: {
    color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: {
    width: CELL_SIZE, textAlign: 'center', color: Colors.text.muted,
    fontSize: 12, fontWeight: '700', paddingBottom: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL_SIZE, aspectRatio: 1, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dayNumber: { color: Colors.text.muted, fontSize: 12 },
  cellPoster: {
    width: '100%', height: '100%', borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  cellPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cellPosterPlaceholderText: { color: Colors.text.muted, fontSize: 12, fontWeight: '600' },
  dayNumberOverlay: {
    position: 'absolute', top: 2, left: 4,
    color: '#fff', fontSize: 12, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 },
  },
});
