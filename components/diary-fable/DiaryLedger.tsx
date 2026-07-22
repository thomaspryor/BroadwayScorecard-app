/**
 * DIRECTION F — "The Ledger".
 *
 * The diary as a stagehand's logbook: a dense, scannable table with a
 * monospace date rail, micro posters, rewatch marks, and per-month totals.
 * Reference: Letterboxd's diary page (their ledger table), translated to
 * native rows instead of a web table.
 * DESIGN ONLY.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';
import { SERIF, MONO, parseSeen, seasonStats, MONTHS_LONG, Poster, StarsRow } from './shared';

type Props = {
  reviews: UserReview[]; // newest → oldest
  showMap: Record<string, Show>;
  topInset: number;
};

export default function DiaryLedger({ reviews, showMap, topInset }: Props) {
  const stats = seasonStats(reviews, showMap);

  // Group into month sections, newest first.
  const groups: { key: string; year: number; month: number; items: UserReview[] }[] = [];
  let lastKey = '';
  for (const r of reviews) {
    const d = parseSeen(r.date_seen);
    if (!d) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== lastKey) {
      lastKey = key;
      groups.push({ key, year: d.getFullYear(), month: d.getMonth(), items: [] });
    }
    groups[groups.length - 1].items.push(r);
  }

  // Rewatch detection: any earlier viewing of the same show (list is newest-first).
  const isRewatch = (r: UserReview, idx: number) =>
    reviews.slice(idx + 1).some(o => o.show_id === r.show_id);
  const flatIndex: Record<string, number> = {};
  reviews.forEach((r, i) => { flatIndex[r.id] = i; });

  const years = [...new Set(groups.map(g => g.year))];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: Spacing.xxl * 2 }} showsVerticalScrollIndicator={false}>
      {/* Masthead */}
      <View style={[styles.header, { paddingTop: topInset + Spacing.md }]}>
        <View style={styles.headerTop}>
          <Text style={styles.h1}>Diary</Text>
          <View style={styles.yearTabs}>
            {years.map((y, i) => (
              <View key={y} style={[styles.yearTab, i === 0 && styles.yearTabActive]}>
                <Text style={[styles.yearTabText, i === 0 && styles.yearTabTextActive]}>{y}</Text>
              </View>
            ))}
          </View>
        </View>
        <Text style={styles.ledgerLine}>
          NO. OF ENTRIES {String(stats.viewings).padStart(3, '0')} · SHOWS {String(stats.shows).padStart(2, '0')} · AVG ★{stats.avg.toFixed(1)}
        </Text>
      </View>

      {groups.map(g => {
        const avg = g.items.reduce((s, r) => s + r.rating, 0) / g.items.length;
        return (
          <View key={g.key} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionMonth}>{MONTHS_LONG[g.month].toUpperCase()} {g.year}</Text>
              <Text style={styles.sectionMeta}>
                {g.items.length} {g.items.length === 1 ? 'entry' : 'entries'} · ★{avg.toFixed(1)}
              </Text>
            </View>
            {g.items.map(r => {
              const show = showMap[r.show_id];
              const d = parseSeen(r.date_seen);
              const rewatch = isRewatch(r, flatIndex[r.id]);
              return (
                <View key={r.id} style={styles.row}>
                  <View style={styles.dayCol}>
                    <Text style={styles.dayNum}>{d ? String(d.getDate()).padStart(2, '0') : '——'}</Text>
                    <Text style={styles.dayDow}>
                      {d ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()] : ''}
                    </Text>
                  </View>
                  <Poster show={show} style={styles.rowPoster} radius={5} />
                  <View style={styles.rowInfo}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{show?.title || r.show_id}</Text>
                      {rewatch && (
                        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={Colors.brand} strokeWidth={2.4}>
                          <Path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M20 9a8 8 0 0 0-14.5-3M4 15a8 8 0 0 0 14.5 3" />
                        </Svg>
                      )}
                    </View>
                    <Text style={styles.rowVenue} numberOfLines={1}>{show?.venue || ''}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <StarsRow rating={r.rating} size={12} />
                    {r.review_text ? (
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
                        <Path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12a9 9 0 1 1-4-7.5L21 3z" />
                      </Svg>
                    ) : (
                      <View style={{ width: 12, height: 12 }} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      {/* Season closing line */}
      <View style={styles.footer}>
        <View style={styles.footerRule} />
        <Text style={styles.footerText}>
          SEASON TOTAL — {stats.viewings} viewings · {stats.shows} shows · {stats.venues} theatres
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface.default },
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border.default,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  h1: { color: Colors.text.primary, fontFamily: SERIF, fontSize: 34 },
  yearTabs: { flexDirection: 'row', gap: 6 },
  yearTab: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surface.raised,
  },
  yearTabActive: { backgroundColor: Colors.brand },
  yearTabText: { color: Colors.text.secondary, fontFamily: MONO, fontSize: 13 },
  yearTabTextActive: { color: Colors.text.inverse, fontWeight: '700' },
  ledgerLine: { color: Colors.text.muted, fontFamily: MONO, fontSize: 12, letterSpacing: 0.5 },
  section: { marginBottom: Spacing.md },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface.raised,
  },
  sectionMonth: { color: Colors.brand, fontFamily: MONO, fontSize: 12, letterSpacing: 1.5, fontWeight: '700' },
  sectionMeta: { color: Colors.text.muted, fontFamily: MONO, fontSize: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  dayCol: { width: 32, alignItems: 'center' },
  dayNum: { color: Colors.text.primary, fontFamily: MONO, fontSize: 16, fontWeight: '700' },
  dayDow: { color: Colors.text.muted, fontFamily: MONO, fontSize: 12, transform: [{ scale: 0.85 }] },
  rowPoster: { width: 30, height: 42 },
  rowInfo: { flex: 1, gap: 1 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { color: Colors.text.primary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  rowVenue: { color: Colors.text.muted, fontSize: 12 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  footerRule: { height: 1, backgroundColor: Colors.border.default, marginBottom: Spacing.sm },
  footerText: { color: Colors.text.muted, fontFamily: MONO, fontSize: 12, letterSpacing: 0.5 },
});
