/**
 * Diary Calendar view (Round 2, Grid Direction D as a toggle, not the main
 * view) — month calendars where attended nights are posters, with a
 * trailing-12-months strip as tap-to-jump navigation. Owner picked this as
 * a secondary recap view inside Grid, not the daily driver (that's still
 * the poster grid).
 */

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { getImageUrl } from '@/lib/images';
import { humanizeShowId } from '@/lib/show-format';
import * as haptics from '@/lib/haptics';
import type { UserReview } from '@/lib/user-types';
import type { Show } from '@/lib/types';

interface DiaryCalendarViewProps {
  reviews: UserReview[];
  showMap: Record<string, Show>;
  onMissingShow: () => void;
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_BACK = 12;

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function DiaryCalendarView({ reviews, showMap, onMissingShow }: DiaryCalendarViewProps) {
  // Reviews keyed by exact date (YYYY-MM-DD) — same-day repeat viewings just
  // show the first one; a rare edge case, not worth a stacked-poster cell.
  const reviewsByDate = useMemo(() => {
    const map: Record<string, UserReview> = {};
    for (const r of reviews) {
      if (r.date_seen && !map[r.date_seen]) map[r.date_seen] = r;
    }
    return map;
  }, [reviews]);

  const today = useMemo(() => new Date(), []);
  const mostRecentMonth = useMemo(() => {
    const dated = reviews.filter(r => r.date_seen).sort((a, b) => (b.date_seen! < a.date_seen! ? -1 : 1));
    if (dated.length === 0) return { year: today.getFullYear(), month: today.getMonth() };
    const d = new Date(`${dated[0].date_seen}T00:00:00`);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [reviews, today]);

  const [selected, setSelected] = useState(mostRecentMonth);

  const trailingMonths = useMemo(() => {
    const out: { year: number; month: number }[] = [];
    let y = today.getFullYear();
    let m = today.getMonth();
    for (let i = 0; i < MONTHS_BACK; i++) {
      out.unshift({ year: y, month: m });
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    return out;
  }, [today]);

  const cells = useMemo(() => {
    const { year, month } = selected;
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: ({ day: number; dateStr: string; review: UserReview | null } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      out.push({ day, dateStr, review: reviewsByDate[dateStr] || null });
    }
    return out;
  }, [selected, reviewsByDate]);

  const monthLabel = new Date(selected.year, selected.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.stripScroll}
        contentContainerStyle={styles.stripContent}
      >
        {trailingMonths.map(m => {
          const isActive = m.year === selected.year && m.month === selected.month;
          const label = new Date(m.year, m.month, 1).toLocaleDateString('en-US', { month: 'short' });
          return (
            <Pressable
              key={monthKey(m.year, m.month)}
              style={[styles.stripChip, isActive && styles.stripChipActive]}
              onPress={() => { haptics.tap(); setSelected(m); }}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${label} ${m.year}`}
            >
              <Text style={[styles.stripChipText, isActive && styles.stripChipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
              accessibilityLabel={`${show?.title || humanizeShowId(cell.review.show_id)}, ${cell.dateStr}`}
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
  stripScroll: { marginHorizontal: -Spacing.lg },
  stripContent: { paddingHorizontal: Spacing.lg, gap: Spacing.xs },
  stripChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  stripChipActive: { backgroundColor: Colors.brand },
  stripChipText: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '600' },
  stripChipTextActive: { color: Colors.text.inverse },
  monthTitle: {
    color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700',
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
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
