/**
 * DIRECTION E — "The Marquee".
 *
 * Every night you logged becomes a full-bleed lobby card: the poster edge to
 * edge, a scrim, your stars against the critics' number, and your note as the
 * pull-quote. The diary as a reel of marquees, not a list.
 * Reference: Letterboxd poster-first identity pushed to full-screen.
 * DESIGN ONLY.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';
import { TABULAR, FILL, parseSeen, seasonStats, MONTHS_SHORT, Poster, StarsRow, toHundred, tierColor } from './shared';

type Props = {
  reviews: UserReview[]; // newest → oldest
  showMap: Record<string, Show>;
  topInset: number;
  /** Rendered inside the real Watched screen (header + segments above). */
  embedded?: boolean;
};

export default function DiaryMarquee({ reviews, showMap, topInset, embedded }: Props) {
  const stats = seasonStats(reviews, showMap);

  // Count viewings per show so rewatches get a ×N lamp.
  const counts: Record<string, number> = {};
  for (const r of reviews) counts[r.show_id] = (counts[r.show_id] || 0) + 1;
  const seen: Record<string, number> = {};

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: Spacing.xxl * 2 }} showsVerticalScrollIndicator={false}>
      {!embedded && (
        <View style={[styles.header, { paddingTop: topInset + Spacing.md }]}>
          <Text style={styles.h1}>Diary</Text>
          <Text style={styles.headerMeta}>
            {stats.viewings} nights · {stats.shows} shows
          </Text>
        </View>
      )}

      {reviews.map(r => {
        const show = showMap[r.show_id];
        const d = parseSeen(r.date_seen);
        const criticRaw = show?.criticScore?.score ?? show?.compositeScore ?? null;
        const critic = criticRaw === null ? null : Math.round(criticRaw);
        seen[r.show_id] = (seen[r.show_id] || 0) + 1;
        const nth = counts[r.show_id] - seen[r.show_id] + 1; // 1 = first viewing chronologically last
        const isRewatch = counts[r.show_id] > 1 && nth > 1;

        return (
          <View key={r.id} style={styles.card}>
            <Poster show={show} style={FILL} radius={0} />
            <LinearGradient
              colors={['rgba(15,15,20,0.55)', 'rgba(15,15,20,0.0)', 'rgba(15,15,20,0.55)', 'rgba(15,15,20,0.97)']}
              locations={[0, 0.28, 0.62, 1]}
              style={FILL}
            />
            {/* Date lamp */}
            <View style={styles.dateLamp}>
              <Text style={styles.dateLampMonth}>{d ? MONTHS_SHORT[d.getMonth()].toUpperCase() : '—'}</Text>
              <Text style={styles.dateLampDay}>{d ? d.getDate() : '—'}</Text>
            </View>
            {isRewatch && (
              <View style={styles.rewatchLamp}>
                <Text style={styles.rewatchText}>×{nth}</Text>
              </View>
            )}
            {/* Bottom bill */}
            <View style={styles.bill}>
              <Text style={styles.billVenue} numberOfLines={1}>
                {(show?.venue || '').toUpperCase()}
              </Text>
              <Text style={styles.billTitle} numberOfLines={2}>
                {show?.title || r.show_id}
              </Text>
              <View style={styles.scoreRow}>
                <View style={styles.youBlock}>
                  <StarsRow rating={r.rating} size={15} />
                  <Text style={styles.youLabel}>YOU · {r.rating.toFixed(1)}</Text>
                </View>
                {critic !== null && (
                  <View style={styles.criticBlock}>
                    <View style={[styles.criticChip, { backgroundColor: tierColor(critic) }]}>
                      <Text style={styles.criticNum}>{critic}</Text>
                    </View>
                    <Text style={styles.criticLabel}>CRITICS</Text>
                  </View>
                )}
                <View style={styles.deltaBlock}>
                  {critic !== null && toHundred(r.rating) !== critic && (
                    <Text style={styles.deltaText}>
                      {toHundred(r.rating) > critic ? '+' : '−'}
                      {Math.abs(toHundred(r.rating) - critic)}
                    </Text>
                  )}
                </View>
              </View>
              {r.review_text && (
                <Text style={styles.note} numberOfLines={2}>
                  “{r.review_text}”
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface.default },
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
  },
  h1: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '700' },
  headerMeta: { color: Colors.text.muted, fontSize: 13, marginRight: 56 },
  card: {
    height: 400, marginBottom: 2, overflow: 'hidden',
    backgroundColor: Colors.surface.raised,
  },
  dateLamp: {
    position: 'absolute', top: Spacing.md, left: Spacing.lg,
    backgroundColor: 'rgba(15,15,20,0.85)', borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border.default,
  },
  dateLampMonth: { color: Colors.brand, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  dateLampDay: { color: Colors.text.primary, fontSize: 24, fontWeight: '700', lineHeight: 27, ...TABULAR },
  rewatchLamp: {
    position: 'absolute', top: Spacing.md, right: Spacing.lg,
    backgroundColor: Colors.brand, borderRadius: BorderRadius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  rewatchText: { color: Colors.text.inverse, fontSize: 13, fontWeight: '700' },
  bill: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
  },
  billVenue: {
    color: Colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 1,
    marginBottom: 4,
  },
  billTitle: {
    color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800', lineHeight: 32,
    marginBottom: Spacing.sm,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  youBlock: { gap: 3 },
  youLabel: { color: Colors.text.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  criticBlock: { alignItems: 'center', gap: 3 },
  criticChip: {
    borderRadius: BorderRadius.sm, paddingHorizontal: 8, paddingVertical: 2,
  },
  criticNum: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: Colors.text.inverse, ...TABULAR },
  criticLabel: { color: Colors.text.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  deltaBlock: { flex: 1, alignItems: 'flex-end' },
  deltaText: { color: Colors.text.muted, fontSize: 13, fontWeight: '600', ...TABULAR },
  note: {
    color: Colors.text.secondary, fontStyle: 'italic',
    fontSize: FontSize.sm, lineHeight: 21, marginTop: Spacing.sm,
  },
});
