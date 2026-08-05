/**
 * Module 2 — Shows per year (owner priority 4, spec §3.2).
 *
 * Bars are plain Views in single-hue brand gold (spec §9: no chart library, no
 * chart-specific colour). Tapping a bar scopes the WHOLE screen to that year —
 * which is what makes the months breakdown appear, because a year-scoped diary
 * has one bar per month instead of per year.
 *
 * Records strip beneath: busiest month, current streak. Each pill taps to the
 * shows behind it (spec §3.2, absorbing the cut Habits module). Longest drought
 * was cut — "Not helpful" (beta feedback 2026-08-04, AEC0VX9).
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import type { ScopeOption } from '@/lib/stats-scope';
import { MIN_DATED_FOR_YEAR_CHART, type StatsBundle } from '@/hooks/useStatsData';
import { STATS_LAYOUT } from '@/lib/stats-layout';
import { GoldBar, ModuleHeader, ModuleLocked, RecordPill, StatsCard, TABULAR } from './StatsPrimitives';

const MONTH_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** "2025-10" → "October 2025" */
export function formatMonth(key: string): string {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "2025-10" → "Oct" */
function shortMonth(key: string): string {
  const m = parseInt(key.slice(5, 7), 10);
  return MONTH_ABBR[m - 1] ?? '?';
}

export interface ShowsPerYearProps {
  bundle: StatsBundle;
  scope: ScopeOption;
  /** Scope the screen to a calendar year (bar tap). */
  onSelectYear: (year: number) => void;
  onOpenMonth: (monthKey: string) => void;
  onOpenRecord: (kind: 'busiest' | 'streak') => void;
}

export function ShowsPerYear({ bundle, scope, onSelectYear, onOpenMonth, onOpenRecord }: ShowsPerYearProps) {
  const { diary } = bundle;
  const marquee = STATS_LAYOUT === 'marquee';

  // Under a dated scope the diary spans months, not years — so the chart
  // becomes the months breakdown the spec asks for after a bar tap.
  const byMonths = scope.kind !== 'all';
  const bars = useMemo(() => {
    if (byMonths) {
      // Pad to the scope's full month range (capped at the current month for
      // in-progress scopes) — byMonth only spans logged months, so a 2024
      // scope opened at "J J A S O N D" with Jan–May silently missing.
      const counts = new Map(diary.byMonth.map((b) => [b.month, b.count]));
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const firstKey = scope.start?.slice(0, 7) ?? diary.byMonth[0]?.month;
      let lastKey = scope.end?.slice(0, 7) ?? diary.byMonth[diary.byMonth.length - 1]?.month;
      if (scope.inProgress && lastKey && lastKey > thisMonth) lastKey = thisMonth;
      const months: { month: string; count: number }[] = [];
      if (firstKey && lastKey && firstKey <= lastKey) {
        let [y, m] = firstKey.split('-').map(Number);
        for (let i = 0; i < 15 && `${y}-${String(m).padStart(2, '0')}` <= lastKey; i++) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          months.push({ month: key, count: counts.get(key) ?? 0 });
          m += 1;
          if (m > 12) { m = 1; y += 1; }
        }
      }
      const src = months.length > 0 ? months : diary.byMonth;
      return src.map((b) => ({
        key: b.month,
        count: b.count,
        label: shortMonth(b.month),
        onPress: b.count > 0 ? () => onOpenMonth(b.month) : undefined,
        a11y: `${formatMonth(b.month)}: ${b.count} ${b.count === 1 ? 'show' : 'shows'}`,
      }));
    }
    return diary.byYear.map((b) => ({
      key: String(b.year),
      count: b.count,
      label: `’${String(b.year).slice(2)}`,
      // byYear is gap-filled: a zero year has nothing to scope to, so it must
      // not present as a button (and must not announce "Scopes to ...").
      onPress: b.count > 0 ? () => onSelectYear(b.year) : undefined,
      a11y:
        b.count > 0
          ? `${b.year}: ${b.count} ${b.count === 1 ? 'show' : 'shows'}. Scopes to ${b.year}.`
          : `${b.year}: no shows logged.`,
    }));
  }, [byMonths, diary.byMonth, diary.byYear, onOpenMonth, onSelectYear, scope]);

  const max = bars.reduce((m, b) => Math.max(m, b.count), 0);
  const peak = bars.find((b) => b.count === max && max > 0);

  // Open scrolled to the newest years — the owner reads right-to-left recency,
  // and a left-anchored 19-year diary hides everything after the 11th year.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  // Spec §7 per-module threshold. Undated rows can't be placed on a timeline,
  // so the gate counts DATED entries — a chart drawn from one or two of them is
  // a shape, not a trend.
  if (diary.dated < MIN_DATED_FOR_YEAR_CHART) {
    const need = MIN_DATED_FOR_YEAR_CHART - diary.dated;
    return (
      <ModuleLocked
        title={byMonths ? 'Month by month' : 'Shows per year'}
        need={`Log ${need} more dated ${need === 1 ? 'entry' : 'entries'} to see this chart.`}
      />
    );
  }

  if (!bars.length) return null;

  // Wide diaries scroll horizontally rather than shrinking bars to slivers.
  const scrolls = bars.length > 14;

  const chart = (
    <View style={[styles.chart, scrolls && { minWidth: bars.length * 34 }]}>
      {bars.map((b) => (
        <Pressable
          key={b.key}
          testID={`stats-bar-${b.key}`}
          onPress={
            b.onPress
              ? () => {
                  haptics.tap();
                  b.onPress?.();
                }
              : undefined
          }
          disabled={!b.onPress}
          accessibilityRole="button"
          accessibilityLabel={b.a11y}
          style={({ pressed }) => [styles.barSlot, scrolls && styles.barSlotFixed, pressed && styles.pressed]}
        >
          {/* Selective labelling: only the peak bar carries its count, so the
              axis stays readable (spec §3.2). */}
          <Text style={[styles.barCount, TABULAR, b.key !== peak?.key && styles.barCountHidden]}>{b.count}</Text>
          {/* Fixed-height track with px bar heights: the %-height chain
              (slot 100% → track flex → bar %) resolves against an undefined
              parent inside the horizontal ScrollView and collapsed every bar
              to its 4px minHeight (build-61 owner report). */}
          <View style={styles.barTrack}>
            <GoldBar
              heightPct={max > 0 ? b.count / max : 0}
              heightPx={max > 0 ? (b.count / max) * TRACK_HEIGHT : 0}
              selected={b.key === peak?.key}
            />
          </View>
          <Text style={styles.barLabel} numberOfLines={1}>
            {b.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <StatsCard flush={marquee}>
      <ModuleHeader
        title={byMonths ? 'Month by month' : 'Shows per year'}
        caption={byMonths ? scope.label : 'Tap a year to scope everything below'}
      />
      {scrolls ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator
          onContentSizeChange={scrollToEnd}
        >
          {chart}
        </ScrollView>
      ) : (
        chart
      )}

      <View style={styles.records}>
        {diary.busiestMonth && (
          <RecordPill
            testID="stats-record-busiest"
            label="Busiest month"
            value={`${formatMonth(diary.busiestMonth.month)} · ${diary.busiestMonth.count}`}
            onPress={() => onOpenRecord('busiest')}
          />
        )}
        {diary.currentStreak > 0 && (
          <RecordPill
            testID="stats-record-streak"
            label="Current streak"
            value={`${diary.currentStreak} ${diary.currentStreak === 1 ? 'month' : 'months'}`}
            onPress={() => onOpenRecord('streak')}
          />
        )}
      </View>
    </StatsCard>
  );
}

/** px height of the bar track — bars are sized in px against this. */
const TRACK_HEIGHT = 110;

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 148,
  },
  barSlot: { flex: 1, minWidth: 0, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barSlotFixed: { flex: 0, width: 30 },
  barTrack: { width: '78%', height: TRACK_HEIGHT, justifyContent: 'flex-end' },
  barCount: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700', marginBottom: 2 },
  barCountHidden: { opacity: 0 },
  barLabel: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.xs },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.lg },
  pressed: { opacity: 0.7 },
});
