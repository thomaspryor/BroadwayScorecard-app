/**
 * Module 1 — Marquee numbers (spec §3.1).
 *
 * Shows · Hours in a seat · Theaters · <scope-aware period tile>.
 *
 * Two behaviours the spec calls out explicitly, both implemented here:
 *  - The Hours tile always renders (owner decision, build-61 beta feedback);
 *    when more than 25% of entries fall back to the 2h30m/2h type default it
 *    is marked "estimated" and the footnote explains the fallback share.
 *  - The fourth tile's label is literal and never mixes frames: "This season so
 *    far" under a season scope, "2026 YTD" under a year scope.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { periodTileLabel, type ScopeOption } from '@/lib/stats-scope';
import { STATS_LAYOUT } from '@/lib/stats-layout';
import type { StatsBundle } from '@/hooks/useStatsData';
import { ModuleHeader, StatTile, StatsCard, TABULAR } from './StatsPrimitives';

export interface HeroTilesProps {
  bundle: StatsBundle;
  scope: ScopeOption;
  onOpen: (which: 'shows' | 'hours' | 'theaters' | 'period') => void;
}

/** "122h 45m" — never a bare decimal, which reads as a rating. */
export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function HeroTiles({ bundle, scope, onOpen }: HeroTilesProps) {
  const { diary, demoteHours } = bundle;
  const marquee = STATS_LAYOUT === 'marquee';

  const tiles = [
    <StatTile
      key="shows"
      testID="stats-tile-shows"
      value={String(diary.total)}
      label={diary.total === 1 ? 'Show' : 'Shows'}
      onPress={() => onOpen('shows')}
    />,
    // The spec's self-demotion (>25% runtime fallback -> footnote) shipped in
    // build 61 and the owner overruled it: "Hours in seat is supposed to have
    // its own box." The tile always renders; high-fallback diaries get an
    // "estimated" sublabel and keep the explanatory footnote.
    <StatTile
      key="hours"
      testID="stats-tile-hours"
      value={formatHours(diary.minutesInSeat)}
      label="Hours in a seat"
      sublabel={demoteHours ? 'estimated' : undefined}
      onPress={() => onOpen('hours')}
    />,
    <StatTile
      key="theaters"
      testID="stats-tile-theaters"
      value={String(diary.distinctTheaters)}
      label={diary.distinctTheaters === 1 ? 'Theater' : 'Theaters'}
      sublabel={`${diary.distinctBroadwayHouses} Broadway`}
      onPress={() => onOpen('theaters')}
    />,
    // Under a dated scope this tile printed the same number as the Shows tile
    // (both were the scoped total) — so it only renders for All time, where it
    // counts years actually attended, not the gap-filled span (a 2015 + 2026
    // diary is 2 years logged, not 12).
    ...(scope.kind === 'all'
      ? [
          <StatTile
            key="period"
            testID="stats-tile-period"
            value={String(diary.byYear.filter((b) => b.count > 0).length)}
            label={periodTileLabel(scope)}
            onPress={() => onOpen('period')}
          />,
        ]
      : []),
  ];

  return (
    <StatsCard flush={marquee} style={marquee ? styles.marqueeCard : undefined}>
      {marquee ? (
        <>
          {/* Bolder LAYOUT: one headline number, then a secondary strip. Same
              tokens, same font, same gold — only the arrangement changes.
              Pressable like every other stat: "every number is a door"
              (spec §1) has to hold in this variant too, and it carries the
              testID the faithful variant puts on the Shows tile. */}
          <Pressable
            testID="stats-tile-shows"
            onPress={() => onOpen('shows')}
            accessibilityRole="button"
            accessibilityLabel={`${diary.total} shows in your diary. Opens the list.`}
            style={({ pressed }) => [styles.headline, pressed && styles.pressed]}
          >
            <Text style={[styles.headlineValue, TABULAR]} numberOfLines={1} adjustsFontSizeToFit>
              {diary.total}
            </Text>
            <Text style={styles.headlineLabel}>
              {diary.total === 1 ? 'show in your diary' : 'shows in your diary'}
            </Text>
          </Pressable>
          <View style={styles.row}>{tiles.slice(1)}</View>
        </>
      ) : (
        <>
          <ModuleHeader title="Your Scorecard" caption={scope.label} />
          <View style={styles.grid}>
            <View style={styles.row}>{tiles.slice(0, 2)}</View>
            <View style={styles.row}>{tiles.slice(2)}</View>
          </View>
        </>
      )}

      {demoteHours && (
        <Text style={styles.footnote}>
          {formatHours(diary.minutesInSeat)} in a seat — estimated, {Math.round(diary.runtimeFallbackShare * 100)}% of
          your shows have no runtime on file yet.
        </Text>
      )}
    </StatsCard>
  );
}

const styles = StyleSheet.create({
  marqueeCard: { borderTopWidth: 0, paddingTop: Spacing.sm },
  grid: { gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  headline: { paddingBottom: Spacing.lg },
  headlineValue: {
    // FontSize.title is the largest token there is; the previous hardcoded 72
    // was outside the type scale entirely (spec §9: identical tokens to the
    // rest of the app — bold is layout, never a bespoke size).
    color: Colors.text.primary,
    fontSize: FontSize.title,
    lineHeight: Math.round(FontSize.title * 1.1),
    fontWeight: '800',
  },
  headlineLabel: { color: Colors.text.secondary, fontSize: FontSize.md, marginTop: -4 },
  pressed: { opacity: 0.7 },
  footnote: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
  },
});
