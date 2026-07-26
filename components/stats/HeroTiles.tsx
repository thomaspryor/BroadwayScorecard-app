/**
 * Module 1 — Marquee numbers (spec §3.1).
 *
 * Shows · Hours in a seat · Theaters · <scope-aware period tile>.
 *
 * Two behaviours the spec calls out explicitly, both implemented here:
 *  - The Hours tile SELF-DEMOTES out of the hero when more than 25% of entries
 *    fall back to the 2h30m/2h type default. A big confident "122 hours" built
 *    mostly from guesses is worse than no tile; it moves to a footnote line.
 *  - The fourth tile's label is literal and never mixes frames: "This season so
 *    far" under a season scope, "2026 YTD" under a year scope.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
    ...(demoteHours
      ? []
      : [
          <StatTile
            key="hours"
            testID="stats-tile-hours"
            value={formatHours(diary.minutesInSeat)}
            label="Hours in a seat"
            onPress={() => onOpen('hours')}
          />,
        ]),
    <StatTile
      key="theaters"
      testID="stats-tile-theaters"
      value={String(diary.distinctTheaters)}
      label={diary.distinctTheaters === 1 ? 'Theater' : 'Theaters'}
      sublabel={`${diary.distinctBroadwayHouses} Broadway`}
      onPress={() => onOpen('theaters')}
    />,
    <StatTile
      key="period"
      testID="stats-tile-period"
      value={String(scope.kind === 'all' ? diary.byYear.length : diary.total)}
      label={periodTileLabel(scope)}
      onPress={() => onOpen('period')}
    />,
  ];

  return (
    <StatsCard flush={marquee} style={marquee ? styles.marqueeCard : undefined}>
      {marquee ? (
        <>
          {/* Bolder LAYOUT: one headline number, then a secondary strip. Same
              tokens, same font, same gold — only the arrangement changes. */}
          <View style={styles.headline}>
            <Text style={[styles.headlineValue, TABULAR]} numberOfLines={1} adjustsFontSizeToFit>
              {diary.total}
            </Text>
            <Text style={styles.headlineLabel}>
              {diary.total === 1 ? 'show in your diary' : 'shows in your diary'}
            </Text>
          </View>
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
    color: Colors.text.primary,
    fontSize: 72,
    lineHeight: 78,
    fontWeight: '800',
  },
  headlineLabel: { color: Colors.text.secondary, fontSize: FontSize.md, marginTop: -4 },
  footnote: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
  },
});
