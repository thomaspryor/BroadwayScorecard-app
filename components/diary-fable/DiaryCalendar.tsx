/**
 * DIRECTION D — "The Season Calendar".
 *
 * The diary as a theatre calendar: a year heatmap ribbon, then real month
 * grids where the nights you saw something are the posters themselves.
 * Reference: Mezzanine profile stats/heatmap, made full-screen and poster-first.
 * DESIGN ONLY.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';
import { SERIF, MONO, parseSeen, seasonStats, MONTHS_LONG, MONTHS_SHORT, Poster, StarsRow } from './shared';

type Props = {
  reviews: UserReview[]; // newest → oldest
  showMap: Record<string, Show>;
  topInset: number;
};

type MonthCell = { key: string; year: number; month: number; items: UserReview[] };

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function DiaryCalendar({ reviews, showMap, topInset }: Props) {
  const stats = seasonStats(reviews, showMap);

  // Build month buckets, newest first, from the reviews themselves.
  const monthMap: Record<string, MonthCell> = {};
  const monthOrder: string[] = [];
  for (const r of reviews) {
    const d = parseSeen(r.date_seen);
    if (!d) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthMap[key]) {
      monthMap[key] = { key, year: d.getFullYear(), month: d.getMonth(), items: [] };
      monthOrder.push(key);
    }
    monthMap[key].items.push(r);
  }
  const months = monthOrder.map(k => monthMap[k]);

  // Heatmap ribbon runs oldest → newest so the season reads left to right.
  const ribbon = [...months].reverse();
  const maxCount = Math.max(...months.map(m => m.items.length), 1);
  const busiest = months.reduce((a, b) => (b.items.length > a.items.length ? b : a), months[0]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: Spacing.xxl * 2 }} showsVerticalScrollIndicator={false}>
      {/* Season header */}
      <View style={[styles.header, { paddingTop: topInset + Spacing.md }]}>
        <Text style={styles.eyebrow}>2025–26 SEASON</Text>
        <Text style={styles.h1}>Your year{'\n'}at the theatre</Text>
        <Text style={styles.statLine}>
          <Text style={styles.statNum}>{stats.viewings}</Text> nights · <Text style={styles.statNum}>{stats.shows}</Text> shows · <Text style={styles.statNum}>{stats.venues}</Text> theatres · avg <Text style={styles.statNum}>★{stats.avg.toFixed(1)}</Text>
        </Text>
      </View>

      {/* Heatmap ribbon — the season at a glance */}
      <View style={styles.ribbonWrap}>
        <View style={styles.ribbon}>
          {ribbon.map(m => {
            const t = m.items.length / maxCount;
            return (
              <View key={m.key} style={styles.ribbonCol}>
                <View
                  style={[
                    styles.ribbonBlock,
                    {
                      backgroundColor: m.items.length
                        ? `rgba(212, 165, 116, ${0.25 + t * 0.75})`
                        : Colors.surface.raised,
                    },
                  ]}
                >
                  <Text style={[styles.ribbonCount, m.items.length / maxCount > 0.6 && { color: Colors.text.inverse }]}>
                    {m.items.length}
                  </Text>
                </View>
                <Text style={styles.ribbonLabel}>{MONTHS_SHORT[m.month][0]}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.ribbonCaption}>
          Busiest month — {MONTHS_LONG[busiest.month]} ({busiest.items.length} shows)
        </Text>
      </View>

      {/* Month calendars */}
      {months.map(m => {
        const first = new Date(m.year, m.month, 1);
        const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
        const lead = first.getDay();
        const byDay: Record<number, UserReview> = {};
        for (const r of m.items) {
          const d = parseSeen(r.date_seen);
          if (d) byDay[d.getDate()] = r;
        }
        const cells: (number | null)[] = [
          ...Array.from({ length: lead }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <View key={m.key} style={styles.monthBlock}>
            <View style={styles.monthHeader}>
              <Text style={styles.monthName}>{MONTHS_LONG[m.month]}</Text>
              <Text style={styles.monthYear}>{m.year}</Text>
            </View>
            <View style={styles.dowRow}>
              {DOW.map((d, i) => (
                <Text key={i} style={styles.dow}>{d}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={i} style={styles.cell} />;
                const r = byDay[day];
                if (!r) {
                  return (
                    <View key={i} style={[styles.cell, styles.cellEmpty]}>
                      <Text style={styles.cellDay}>{day}</Text>
                    </View>
                  );
                }
                const show = showMap[r.show_id];
                return (
                  <View key={i} style={[styles.cell, styles.cellSeen]}>
                    <Poster show={show} style={styles.cellPoster} radius={7} />
                    <View style={styles.cellDayChip}>
                      <Text style={styles.cellDayChipText}>{day}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            {/* Playbill line for the month */}
            <View style={styles.monthList}>
              {m.items.map(r => {
                const d = parseSeen(r.date_seen);
                return (
                  <View key={r.id} style={styles.monthListRow}>
                    <Text style={styles.monthListDay}>{d ? String(d.getDate()).padStart(2, '0') : '—'}</Text>
                    <Text style={styles.monthListTitle} numberOfLines={1}>
                      {showMap[r.show_id]?.title || r.show_id}
                    </Text>
                    <StarsRow rating={r.rating} size={11} />
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface.default },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  eyebrow: {
    color: Colors.brand, fontFamily: MONO, fontSize: 12, letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  h1: {
    color: Colors.text.primary, fontFamily: SERIF, fontSize: 36, lineHeight: 40,
    marginBottom: Spacing.sm,
  },
  statLine: { color: Colors.text.muted, fontSize: 15 },
  statNum: { color: Colors.text.primary, fontWeight: '700' },
  // Ribbon
  ribbonWrap: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  ribbon: { flexDirection: 'row', gap: 5 },
  ribbonCol: { flex: 1, alignItems: 'center', gap: 4 },
  ribbonBlock: {
    alignSelf: 'stretch', height: 40, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  ribbonCount: { color: Colors.text.secondary, fontFamily: MONO, fontSize: 12, fontWeight: '700' },
  ribbonLabel: { color: Colors.text.muted, fontFamily: MONO, fontSize: 12 },
  ribbonCaption: { color: Colors.text.muted, fontSize: 12, marginTop: Spacing.sm },
  // Month calendar
  monthBlock: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  monthHeader: {
    flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  monthName: { color: Colors.text.primary, fontFamily: SERIF, fontSize: 24 },
  monthYear: { color: Colors.text.muted, fontFamily: MONO, fontSize: 13 },
  dowRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  dow: { flex: 1, textAlign: 'center', color: Colors.text.muted, fontSize: 12, fontFamily: MONO },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: `${100 / 7.32}%`, aspectRatio: 0.86 },
  cellEmpty: {
    borderRadius: 7, backgroundColor: Colors.surface.raised,
    alignItems: 'center', justifyContent: 'center',
  },
  cellDay: { color: Colors.text.muted, fontSize: 12, fontFamily: MONO },
  cellSeen: {
    borderRadius: 8, borderWidth: 1.5, borderColor: Colors.brand,
    overflow: 'hidden',
  },
  cellPoster: { width: '100%', height: '100%' },
  cellDayChip: {
    position: 'absolute', top: 2, left: 2,
    backgroundColor: 'rgba(15, 15, 20, 0.82)', borderRadius: 5,
    paddingHorizontal: 3, paddingVertical: 1,
  },
  cellDayChipText: { color: Colors.brand, fontSize: 12, fontFamily: MONO, fontWeight: '700' },
  // Month playbill list
  monthList: { marginTop: Spacing.sm, gap: 6 },
  monthListRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  monthListDay: { color: Colors.text.muted, fontFamily: MONO, fontSize: 12, width: 22 },
  monthListTitle: { color: Colors.text.secondary, fontSize: 14, flex: 1 },
});
