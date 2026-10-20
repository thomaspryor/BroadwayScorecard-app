/**
 * Diary Calendar view (Round 2, Grid Direction D as a toggle, not the main
 * view) — month calendars where attended nights are posters.
 *
 * Continuous vertical scroll through every month, newest first — no
 * tap-to-jump month chips (beta feedback 2026-08-02). Exported as
 * month-granular pieces so the parent FlatList can virtualize months
 * instead of mounting the whole diary's grids at once.
 *
 * The month walk starts at the NEWEST thing on the calendar — the latest dated
 * review OR the furthest-out booking — and stops at the oldest review; past
 * the newest 36 months only months with an entry are drawn, so nothing is cut
 * off (lib/diary-calendar.ts). Stopping at today would hide the months their
 * Upcoming shelf is already pointing at (beta feedback 2026-08-09, ADd7L27s:
 * "should also show future months up to whenever there are shows on the
 * Upcoming section"). A day with several shows draws the first poster with a
 * "+N" badge and asks which one to open.
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, FontSize, BorderRadius, Spacing } from '@/constants/theme';
import { getImageUrl } from '@/lib/images';
import { showTitleFallback } from '@/lib/show-format';
import * as haptics from '@/lib/haptics';
import type { UserReview } from '@/lib/user-types';
import type { Show } from '@/lib/types';
import {
  buildReviewsByDate,
  buildUpcomingByDate,
  buildDiaryCalendarMonths,
  buildMonthCells,
  type CalendarMonth,
} from '@/lib/diary-calendar';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Pure month/day logic lives in lib/diary-calendar.ts (unit tested); the
// Watched tab imports it from here.
export { buildReviewsByDate, buildUpcomingByDate, buildDiaryCalendarMonths };
export type { CalendarMonth };

interface DiaryCalendarMonthProps {
  year: number;
  month: number;
  reviewsByDate: Record<string, UserReview[]>;
  /** Booked nights not yet seen — drawn dimmed so they don't read as attended. */
  upcomingByDate?: Record<string, { show_id: string }[]>;
  showMap: Record<string, Show>;
}

function openShow(showId: string, show: Show | undefined) {
  router.push(show ? `/show/${show.slug}` : `/diary-show/${showId}` as any);
}

export function DiaryCalendarMonth({ year, month, reviewsByDate, upcomingByDate, showMap }: DiaryCalendarMonthProps) {
  const cells = useMemo(
    () => buildMonthCells(year, month, reviewsByDate, upcomingByDate),
    [year, month, reviewsByDate, upcomingByDate],
  );

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
          if (cell.showIds.length === 0) {
            return (
              <View key={i} style={styles.cell}>
                <Text style={styles.dayNumber}>{cell.day}</Text>
              </View>
            );
          }
          const cellShowId = cell.showIds[0];
          const show = showMap[cellShowId];
          const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
          const titleOf = (id: string) => showMap[id]?.title || showTitleFallback(id);
          const title = titleOf(cellShowId);
          const extra = cell.showIds.length - 1;
          const onPress = () => {
            haptics.tap();
            if (extra === 0) {
              openShow(cellShowId, show);
              return;
            }
            // Two or more shows that day (a matinee + evening double): ask which.
            Alert.alert(
              cell.upcoming ? 'Booked that day' : 'Seen that day',
              undefined,
              [
                ...cell.showIds.map((id) => ({ text: titleOf(id), onPress: () => openShow(id, showMap[id]) })),
                { text: 'Cancel', style: 'cancel' as const },
              ],
            );
          };
          const spoken = extra > 0
            ? cell.showIds.map(titleOf).join(' and ')
            : title;
          return (
            <Pressable
              key={i}
              style={styles.cell}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={`${spoken}, ${cell.dateStr}${cell.upcoming ? ', booked' : ''}`}
            >
              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl }}
                  style={[styles.cellPoster, cell.upcoming && styles.cellPosterUpcoming]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.cellPoster, styles.cellPosterPlaceholder, cell.upcoming && styles.cellPosterUpcoming]}>
                  <Text style={styles.cellPosterPlaceholderText}>{title.charAt(0)}</Text>
                </View>
              )}
              {/* Booked nights get a gold ring on top of the dimmed poster —
                  a future date must not read as "I saw this". */}
              {cell.upcoming && <View style={styles.cellUpcomingRing} pointerEvents="none" />}
              <Text style={styles.dayNumberOverlay}>{cell.day}</Text>
              {extra > 0 && (
                <View style={styles.moreBadge} pointerEvents="none">
                  <Text style={styles.moreBadgeText}>+{extra}</Text>
                </View>
              )}
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
  cellPosterUpcoming: { opacity: 0.45 },
  cellUpcomingRing: {
    position: 'absolute', top: 2, left: 2, right: 2, bottom: 2,
    borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: Colors.brand,
  },
  cellPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cellPosterPlaceholderText: { color: Colors.text.muted, fontSize: 12, fontWeight: '600' },
  moreBadge: {
    position: 'absolute', right: 3, bottom: 3,
    minWidth: 18, paddingHorizontal: 3, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.brand, alignItems: 'center',
  },
  moreBadgeText: { color: Colors.text.inverse, fontSize: 12, fontWeight: '800' },
  dayNumberOverlay: {
    position: 'absolute', top: 2, left: 4,
    color: '#fff', fontSize: 12, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 },
  },
});
