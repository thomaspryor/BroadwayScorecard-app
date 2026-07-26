/**
 * Module 4 — You vs. the Critics (spec §5.1, V1 subset).
 *
 * Taste-alignment gauge + contrarian picks + Critical Gold coverage.
 * Aisle Mates / Paper of Record are v1.1 — they need stats-reviews.json, which
 * is deliberately not wired in this sprint.
 *
 * The gauge is a single gold arc on a surface track (spec §9: single-hue marks).
 * Score-tier colour appears ONLY in the ScoreBadge on each contrarian row —
 * that is the semantic score chip the design system reserves it for.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { getImageUrl } from '@/lib/images';
import * as haptics from '@/lib/haptics';
import { ScoreBadge } from '@/components/show-cards';
import MiniStars from '@/components/user/MiniStars';
import { STATS_LAYOUT } from '@/lib/stats-layout';
import { MIN_RATED_WITH_SCORE, type ContrarianPick } from '@/lib/stats-you-vs-critics';
import type { StatsBundle } from '@/hooks/useStatsData';
import { GoldTrack, ModuleHeader, ModuleLocked, StatsCard, TABULAR } from './StatsPrimitives';

export interface YouVsCriticsProps {
  bundle: StatsBundle;
  onOpenAligned: () => void;
  onOpenPick: (showId: string) => void;
  onOpenGold: (which: 'seen' | 'unseen') => void;
}

function PickRow({ pick, onPress }: { pick: ContrarianPick; onPress: () => void }) {
  const poster = getImageUrl(pick.poster ?? null);
  const delta = Math.round(pick.delta);
  return (
    <Pressable
      testID="stats-contrarian-row"
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${pick.title}. You rated it ${pick.rating} stars, critics ${Math.round(pick.criticScore)}.`}
      style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
    >
      {poster ? (
        <Image source={{ uri: poster }} style={styles.pickPoster} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.pickPoster, styles.pickPosterPlaceholder]}>
          <Text style={styles.pickInitial}>{pick.title.charAt(0)}</Text>
        </View>
      )}
      <View style={styles.pickText}>
        <Text style={styles.pickTitle} numberOfLines={2}>
          {pick.title}
        </Text>
        <View style={styles.pickStars}>
          <MiniStars rating={pick.rating} />
          <Text style={[styles.pickDelta, TABULAR]}>
            {delta > 0 ? '+' : ''}
            {delta} pts
          </Text>
        </View>
      </View>
      <ScoreBadge score={pick.criticScore} category={pick.category ?? undefined} size="small" />
    </Pressable>
  );
}

export function YouVsCritics({ bundle, onOpenAligned, onOpenPick, onOpenGold }: YouVsCriticsProps) {
  const { critics, gold } = bundle;
  const marquee = STATS_LAYOUT === 'marquee';

  const goldBlock =
    gold.total > 0 ? (
      <>
        <View style={styles.goldBlock}>
          <View style={styles.goldHeader}>
            <Text style={styles.goldTitle}>Critical Gold, open now</Text>
            <Text style={[styles.goldValue, TABULAR]}>
              {gold.seen} of {gold.total}
            </Text>
          </View>
          <GoldTrack pct={gold.total ? gold.seen / gold.total : 0} />
          <View style={styles.goldActions}>
            <Pressable
              testID="stats-gold-seen"
              onPress={() => {
                haptics.tap();
                onOpenGold('seen');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.goldAction, pressed && styles.pressed]}
            >
              <Text style={styles.goldActionText}>Seen</Text>
            </Pressable>
            <Pressable
              testID="stats-gold-unseen"
              onPress={() => {
                haptics.tap();
                onOpenGold('unseen');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.goldAction, pressed && styles.pressed]}
            >
              <Text style={styles.goldActionText}>{gold.total - gold.seen} to see</Text>
            </Pressable>
          </View>
        </View>
      </>
    ) : null;

  // Critical Gold is all-time by design, so it must survive the scoped lock:
  // build 61 hid the (lifetime) gold block whenever a thin scope locked the
  // alignment gauge (sim QA #14).
  if (critics.comparable < MIN_RATED_WITH_SCORE) {
    return (
      <>
        <ModuleLocked
          title="You vs. the critics"
          need={`Rate ${MIN_RATED_WITH_SCORE - critics.comparable} more scored show${
            MIN_RATED_WITH_SCORE - critics.comparable === 1 ? '' : 's'
          } with critic scores to unlock your taste profile.`}
        />
        {goldBlock && <StatsCard>{goldBlock}</StatsCard>}
      </>
    );
  }

  const pct = Math.round(critics.alignment * 100);
  const bias = Math.round(critics.bias);

  return (
    <StatsCard flush={marquee}>
      <ModuleHeader title="You vs. the critics" caption={`Across ${critics.comparable} scored shows you've rated`} />

      <Pressable
        testID="stats-alignment-gauge"
        onPress={() => {
          haptics.tap();
          onOpenAligned();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${critics.label}, ${pct} percent. Opens the list of shows you agreed on.`}
        style={({ pressed }) => [styles.gauge, pressed && styles.pressed]}
      >
        <View style={styles.gaugeTop}>
          <Text style={styles.gaugeLabel}>{critics.label}</Text>
          <Text style={[styles.gaugeValue, TABULAR]}>{pct}%</Text>
        </View>
        <GoldTrack pct={critics.alignment} height={10} />
        <Text style={styles.gaugeFoot}>
          {critics.aligned} of {critics.comparable} within 10 points ·{' '}
          {bias === 0
            ? 'dead level with the critics'
            : bias < 0
              ? `critics run ${Math.abs(bias)} pts colder than you`
              : `critics run ${bias} pts warmer than you`}
        </Text>
      </Pressable>

      {critics.youLovedIt.length > 0 && (
        <View style={styles.pickGroup}>
          <Text style={styles.pickGroupLabel}>YOU LOVED IT, CRITICS DIDN&apos;T</Text>
          {critics.youLovedIt.map((p) => (
            <PickRow key={p.showId} pick={p} onPress={() => onOpenPick(p.showId)} />
          ))}
        </View>
      )}

      {critics.criticsRaved.length > 0 && (
        <View style={styles.pickGroup}>
          <Text style={styles.pickGroupLabel}>CRITICS RAVED, YOU SHRUGGED</Text>
          {critics.criticsRaved.map((p) => (
            <PickRow key={p.showId} pick={p} onPress={() => onOpenPick(p.showId)} />
          ))}
        </View>
      )}

      {goldBlock}
    </StatsCard>
  );
}

const styles = StyleSheet.create({
  gauge: { paddingVertical: Spacing.sm, minHeight: 44 },
  gaugeTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  gaugeLabel: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  gaugeValue: { color: Colors.brand, fontSize: FontSize.xxl, fontWeight: '800' },
  gaugeFoot: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: Spacing.sm },
  pickGroup: { marginTop: Spacing.lg },
  pickGroupLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  pickPoster: { width: 40, height: 56, borderRadius: BorderRadius.sm, backgroundColor: Colors.surface.overlay },
  pickPosterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  pickInitial: { color: Colors.text.muted, fontSize: FontSize.md, fontWeight: '700' },
  pickText: { flex: 1, minWidth: 0 },
  pickTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  pickStars: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  pickDelta: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '600' },
  goldBlock: { marginTop: Spacing.xl },
  goldHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  goldTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700' },
  goldValue: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '700' },
  goldActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  goldAction: {
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  goldActionText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
