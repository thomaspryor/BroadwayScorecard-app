/**
 * Diary Calendar view (Round 2, Grid Direction D as a toggle, not the main
 * view) — month calendars where attended nights are posters.
 *
 * Continuous vertical scroll through every month, newest first — no
 * tap-to-jump month chips (beta feedback 2026-08-02). Exported as
 * month-granular pieces so the parent FlatList can virtualize months
 * instead of mounting the whole diary's grids at once.
 *
 * The month walk starts at the NEWEST dated entry (not today) and stops at
 * the oldest — starting at today would let the MAX_MONTHS cap swallow the
 * whole diary for a user whose last entry is years old.
 *
 * "Entry" means a rated night OR a booked future night: the calendar used to
 * render only past reviews, so a diary whose Upcoming section ran to November
 * still stopped at the current month (beta feedback 2026-08-09, ADd7L27sWf:
 * "should also show future months up to whenever there are shows on the
 * Upcoming section"). Future months are granted on top of the MAX_MONTHS
 * budget rather than out of it, so adding a plan never truncates history.
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

/** One night on the calendar: a show you rated, or one you have booked. */
export interface CalendarEntry {
  showId: string;
  /** 'planned' cells are dimmed and ringed — nothing has been rated yet. */
  kind: 'seen' | 'planned';
}

/** Nights keyed by exact date (YYYY-MM-DD) — same-day repeat viewings just
 *  show the first one; a rare edge case, not worth a stacked-poster cell.
 *  Reviews win a contested date: a rated night is a fact, a plan is not. */
export function buildEntriesByDate(
  reviews: UserReview[],
  upcoming: { show_id: string; planned_date?: string | null }[] = [],
): Record<string, CalendarEntry> {
  const map: Record<string, CalendarEntry> = {};
  for (const r of reviews) {
    if (r.date_seen && !map[r.date_seen]) map[r.date_seen] = { showId: r.show_id, kind: 'seen' };
  }
  for (const w of upcoming) {
    if (w.planned_date && !map[w.planned_date]) map[w.planned_date] = { showId: w.show_id, kind: 'planned' };
  }
  return map;
}

const monthOrdinal = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** Newest→oldest month span of the dated diary. Past months are capped at
 *  MAX_MONTHS; months ahead of today are extra on top of that budget. */
export function buildDiaryCalendarMonths(entriesByDate: Record<string, CalendarEntry>): CalendarMonth[] {
  const dates = Object.keys(entriesByDate).sort();
  const today = new Date();
  const newest = dates.length > 0 ? new Date(`${dates[dates.length - 1]}T00:00:00`) : today;
  const oldest = dates.length > 0 ? new Date(`${dates[0]}T00:00:00`) : today;
  const monthsAhead = Math.max(0, monthOrdinal(newest) - monthOrdinal(today));
  const limit = MAX_MONTHS + monthsAhead;
  let y = newest.getFullYear();
  let m = newest.getMonth();
  const out: CalendarMonth[] = [];
  while (out.length < limit) {
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
  entriesByDate: Record<string, CalendarEntry>;
  showMap: Record<string, Show>;
}

export function DiaryCalendarMonth({ year, month, entriesByDate, showMap }: DiaryCalendarMonthProps) {
  const cells = useMemo(() => {
    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: ({ day: number; dateStr: string; entry: CalendarEntry | null } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      out.push({ day, dateStr, entry: entriesByDate[dateStr] || null });
    }
    return out;
  }, [year, month, entriesByDate]);

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
          const show = cell.entry ? showMap[cell.entry.showId] : null;
          const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
          if (!cell.entry) {
            return (
              <View key={i} style={styles.cell}>
                <Text style={styles.dayNumber}>{cell.day}</Text>
              </View>
            );
          }
          const { showId: cellShowId, kind } = cell.entry;
          const planned = kind === 'planned';
          const title = show?.title || showTitleFallback(cellShowId);
          return (
            <Pressable
              key={i}
              style={styles.cell}
              onPress={() => {
                haptics.tap();
                router.push(show ? `/show/${show.slug}` : `/diary-show/${cellShowId}` as any);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${cell.dateStr}${planned ? ', upcoming' : ''}`}
            >
              {/* A booked night reads as a plan, not a memory: dimmed poster
                  behind a brand-gold ring. */}
              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl }}
                  style={[styles.cellPoster, planned && styles.cellPosterPlanned]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.cellPoster, styles.cellPosterPlaceholder, planned && styles.cellPosterPlanned]}>
                  <Text style={styles.cellPosterPlaceholderText}>{title.charAt(0)}</Text>
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
  cellPosterPlanned: {
    opacity: 0.55,
    borderWidth: 1.5, borderColor: Colors.brand,
  },
  cellPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cellPosterPlaceholderText: { color: Colors.text.muted, fontSize: 12, fontWeight: '600' },
  dayNumberOverlay: {
    position: 'absolute', top: 2, left: 4,
    color: '#fff', fontSize: 12, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 },
  },
});
