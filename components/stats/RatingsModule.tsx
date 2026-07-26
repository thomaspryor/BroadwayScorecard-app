/**
 * Module 6 — Ratings (spec §3.4).
 *
 * Half-star histogram 0.5–5.0 with a your-average marker in neutral ink (spec
 * is explicit: no second accent hue for the marker), and a
 * "186 of 195 shows rated" footer that taps to the unrated list.
 *
 * The community ghost overlay is v2 — it needs app-wide rating volume (k≥5),
 * which doesn't exist yet. Until then the module is yours-only, by design.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import { STATS_LAYOUT } from '@/lib/stats-layout';
import { MIN_RATED_FOR_HISTOGRAM } from '@/hooks/useStatsData';
import type { StatsBundle } from '@/hooks/useStatsData';
import { GoldBar, ModuleHeader, ModuleLocked, StatsCard, TABULAR } from './StatsPrimitives';

export interface RatingsModuleProps {
  bundle: StatsBundle;
  onOpenBucket: (value: number) => void;
  onOpenUnrated: () => void;
}

export function RatingsModule({ bundle, onOpenBucket, onOpenUnrated }: RatingsModuleProps) {
  const { histogram } = bundle;
  const marquee = STATS_LAYOUT === 'marquee';

  if (histogram.rated < MIN_RATED_FOR_HISTOGRAM) {
    return (
      <ModuleLocked
        title="Your ratings"
        need={`Rate ${MIN_RATED_FOR_HISTOGRAM - histogram.rated} more show${
          MIN_RATED_FOR_HISTOGRAM - histogram.rated === 1 ? '' : 's'
        } to see your distribution.`}
      />
    );
  }

  const max = histogram.buckets.reduce((m, b) => Math.max(m, b.count), 0);
  const avg = histogram.average ?? 0;
  // The marker sits proportionally along the ten buckets: 0.5★ is the centre of
  // slot 0, 5.0★ the centre of slot 9.
  const markerPct = ((avg - 0.5) / 4.5) * 100;

  return (
    <StatsCard flush={marquee}>
      <ModuleHeader
        title="Your ratings"
        caption={`Average ${avg.toFixed(2)}★ · median ${histogram.median?.toFixed(1) ?? '—'}★`}
      />

      <View style={styles.chartWrap}>
        <View style={styles.chart}>
          {histogram.buckets.map((b) => (
            <Pressable
              key={b.value}
              testID={`stats-histogram-${b.value}`}
              onPress={
                b.count > 0
                  ? () => {
                      haptics.tap();
                      onOpenBucket(b.value);
                    }
                  : undefined
              }
              disabled={b.count === 0}
              accessibilityRole="button"
              accessibilityLabel={`${b.value} stars: ${b.count} ${b.count === 1 ? 'show' : 'shows'}`}
              style={({ pressed }) => [styles.barSlot, pressed && styles.pressed]}
            >
              <View style={styles.barTrack}>
                <GoldBar heightPct={max > 0 ? b.count / max : 0} selected={b.value === histogram.mode} />
              </View>
              <Text style={[styles.barLabel, TABULAR]}>{b.value % 1 === 0 ? b.value : ''}</Text>
            </Pressable>
          ))}
        </View>

        {/* Your-average marker — neutral ink, deliberately not gold. */}
        <View style={styles.markerLayer} pointerEvents="none">
          <View style={[styles.marker, { left: `${Math.min(Math.max(markerPct, 0), 100)}%` }]}>
            <View style={styles.markerLine} />
            <Text style={[styles.markerText, TABULAR]}>{avg.toFixed(1)}★</Text>
          </View>
        </View>
      </View>

      <Pressable
        testID="stats-ratings-footer"
        onPress={
          histogram.unrated > 0
            ? () => {
                haptics.tap();
                onOpenUnrated();
              }
            : undefined
        }
        disabled={histogram.unrated === 0}
        accessibilityRole="button"
        style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
      >
        <Text style={styles.footerText}>
          {histogram.rated} of {histogram.total} shows rated
          {histogram.unrated > 0 ? ` · ${histogram.unrated} to rate` : ''}
        </Text>
      </Pressable>
    </StatsCard>
  );
}

const styles = StyleSheet.create({
  chartWrap: { position: 'relative' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 132 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barTrack: { width: '80%', flex: 1, justifyContent: 'flex-end' },
  barLabel: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.xs, minHeight: 16 },
  markerLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  marker: { position: 'absolute', top: 0, bottom: 20, alignItems: 'center', marginLeft: -18, width: 36 },
  markerLine: { flex: 1, width: 2, backgroundColor: Colors.text.secondary, borderRadius: 1 },
  markerText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700', marginTop: 2 },
  footer: { minHeight: 44, justifyContent: 'center', marginTop: Spacing.sm },
  footerText: { color: Colors.text.muted, fontSize: FontSize.xs },
  pressed: { opacity: 0.7 },
});
