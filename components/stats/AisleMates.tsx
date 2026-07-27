/**
 * Aisle Mates + Your Paper of Record (spec §5.1 "Aisle Mates" subsection,
 * v1.1). Nested under "You vs. the Critics" — the individual-critic and
 * per-outlet alignment ranking, computed by the vendored `alignCritics`
 * (lib/stats/align-critics.ts) over stats-reviews.json.
 *
 * Design rule (spec §9): single-hue brand gold, existing surfaces, ScoreBadge
 * is the only place score-tier colour appears. No per-critic avatar colours —
 * the mockup's colourful gradient circles are direction-only, not the design.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import { RISING_MIN_SHARED, type Alignment, type OutletAlignment } from '@/lib/stats';
import type { Reviewer } from '@/lib/stats-aisle-mates';
import type { StatsBundle } from '@/hooks/useStatsData';
import { ModuleHeader, ModuleLocked, StatsCard, TABULAR } from './StatsPrimitives';

export interface AisleMatesProps {
  bundle: StatsBundle;
  onOpenReviewer: (who: Reviewer, label: string) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** User-facing bands, calibrated to the real corpus (spec §5.1 calibration
 *  note) — NOT the critic-critic bands, which run higher. */
function biasLabel(bias: number): string {
  const rounded = Math.round(Math.abs(bias));
  if (Math.round(bias) === 0) return 'dead level with you';
  return bias > 0 ? `runs ${rounded} pts warmer than you` : `runs ${rounded} pts colder than you`;
}

function MateRow({
  name,
  shared,
  alignment,
  bias,
  muted,
  onPress,
  testID,
}: {
  name: string;
  shared: number;
  alignment: number;
  bias: number;
  /** Nemesis styling: no brand-gold percentage. */
  muted?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const pct = Math.round(alignment * 100);
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${pct} percent aligned across ${shared} shows together. Opens the full history.`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(name)}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={2}>
          {shared} shows together · {biasLabel(bias)}
        </Text>
      </View>
      <Text style={[styles.rowPct, TABULAR, muted && styles.rowPctMuted]}>{pct}%</Text>
    </Pressable>
  );
}

export function AisleMates({ bundle, onOpenReviewer }: AisleMatesProps) {
  const { aisleMates, statsReviewsLoading } = bundle;

  if (!aisleMates) {
    if (!statsReviewsLoading) return null; // resolved with nothing to show (offline, no cache)
    return (
      <StatsCard>
        <ModuleHeader title="Aisle Mates" caption="Loading your critic matches…" />
      </StatsCard>
    );
  }

  const { topMates, rising, nemesis, highVolumeNemesis, topOutlets, nemesisOutlet, sharedShowCount } =
    aisleMates;

  if (topMates.length === 0 && rising.length === 0) {
    return (
      <ModuleLocked
        title="Aisle Mates"
        need={`Rate ${RISING_MIN_SHARED} or more shows that also have critic reviews to find the critics who see theater the way you do.`}
      />
    );
  }

  const openCritic = (c: Alignment) => onOpenReviewer({ kind: 'critic', index: c.index }, c.name);
  const openOutlet = (o: OutletAlignment) => onOpenReviewer({ kind: 'outlet', name: o.name }, o.name);

  return (
    <StatsCard>
      <ModuleHeader
        title="Aisle Mates"
        caption={`Critics who see theater the way you do · across ${sharedShowCount} shared shows`}
      />

      {topMates.map((c) => (
        <MateRow
          key={c.name}
          testID="stats-aisle-mate-row"
          name={c.name}
          shared={c.shared}
          alignment={c.alignment}
          bias={c.bias}
          onPress={() => openCritic(c)}
        />
      ))}

      {rising.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>RISING MATCHES</Text>
          {rising.map((c) => (
            <MateRow
              key={c.name}
              name={c.name}
              shared={c.shared}
              alignment={c.alignment}
              bias={c.bias}
              onPress={() => openCritic(c)}
            />
          ))}
        </View>
      )}

      {nemesis && (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>CRITIC NEMESIS</Text>
          <MateRow
            testID="stats-critic-nemesis-row"
            name={nemesis.name}
            shared={nemesis.shared}
            alignment={nemesis.alignment}
            bias={nemesis.bias}
            muted
            onPress={() => openCritic(nemesis)}
          />
          {highVolumeNemesis && highVolumeNemesis.name !== nemesis.name && (
            <Text style={styles.footnote}>
              Your highest-volume low-aligner: {highVolumeNemesis.name} —{' '}
              {Math.round(highVolumeNemesis.alignment * 100)}% across {highVolumeNemesis.shared} shows.
            </Text>
          )}
        </View>
      )}

      {topOutlets.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>YOUR PAPER OF RECORD</Text>
          <MateRow
            testID="stats-paper-of-record-row"
            name={topOutlets[0].name}
            shared={topOutlets[0].shared}
            alignment={topOutlets[0].alignment}
            bias={topOutlets[0].bias}
            onPress={() => openOutlet(topOutlets[0])}
          />
          {nemesisOutlet && nemesisOutlet.name !== topOutlets[0].name && (
            <Pressable
              testID="stats-nemesis-outlet-row"
              onPress={() => {
                haptics.tap();
                openOutlet(nemesisOutlet);
              }}
              accessibilityRole="button"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.footnote}>
                Least aligned: {nemesisOutlet.name} ({Math.round(nemesisOutlet.alignment * 100)}%)
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </StatsCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700' },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  rowSub: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 2 },
  rowPct: { color: Colors.brand, fontSize: FontSize.md, fontWeight: '800' },
  rowPctMuted: { color: Colors.text.muted },
  group: { marginTop: Spacing.lg },
  groupLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  footnote: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.xs },
  pressed: { opacity: 0.7 },
});
