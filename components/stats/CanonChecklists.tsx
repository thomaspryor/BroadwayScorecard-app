/**
 * Module 5 — Tony &amp; the Canon (spec §5.2).
 *
 * Best Musical and Best Play winner checklists: progress track, a poster shelf
 * with unseen titles dimmed, and the "saw it before it won" flex (diary
 * date_seen strictly earlier than the ceremony date — computed in the vendored
 * canonProgress, never here).
 *
 * Scope note: canon coverage is computed from the FULL diary (lifetime facts —
 * "winners you've ever seen"); under a dated scope the caption says "All time"
 * so the number can't be misread as scoped.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { getImageUrl } from '@/lib/images';
import * as haptics from '@/lib/haptics';
import { STATS_LAYOUT } from '@/lib/stats-layout';
import type { CanonEntry, CanonList } from '@/lib/stats';
import type { StatsBundle } from '@/hooks/useStatsData';
import type { ScopeOption } from '@/lib/stats-scope';
import { GoldTrack, ModuleHeader, StatsCard, TABULAR } from './StatsPrimitives';

export interface CanonChecklistsProps {
  bundle: StatsBundle;
  scope: ScopeOption;
  onOpenList: (which: 'musical' | 'play', filter: 'seen' | 'unseen' | 'before') => void;
  onOpenEntry: (entry: CanonEntry) => void;
}

function Shelf({ entries, onOpenEntry }: { entries: CanonEntry[]; onOpenEntry: (e: CanonEntry) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {entries.map((e) => {
        const poster = getImageUrl(e.img ?? null);
        return (
          <Pressable
            key={`${e.ceremony}:${e.id}`}
            testID={e.seen ? 'stats-canon-poster-seen' : 'stats-canon-poster-unseen'}
            onPress={() => {
              haptics.tap();
              onOpenEntry(e);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${e.t}, ${e.season}. ${e.seen ? 'Seen' : 'Not seen'}.`}
            style={({ pressed }) => [styles.shelfItem, pressed && styles.pressed]}
          >
            {poster ? (
              <Image
                source={{ uri: poster }}
                style={[styles.shelfPoster, !e.seen && styles.shelfPosterUnseen]}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.shelfPoster, styles.shelfPlaceholder, !e.seen && styles.shelfPosterUnseen]}>
                <Text style={styles.shelfInitial}>{e.t.charAt(0)}</Text>
              </View>
            )}
            <Text style={[styles.shelfYear, TABULAR, !e.seen && styles.shelfYearUnseen]} numberOfLines={1}>
              {e.season}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CanonBlock({
  title,
  list,
  which,
  onOpenList,
  onOpenEntry,
}: {
  title: string;
  list: CanonList;
  which: 'musical' | 'play';
  onOpenList: CanonChecklistsProps['onOpenList'];
  onOpenEntry: (e: CanonEntry) => void;
}) {
  return (
    <View style={styles.block}>
      <Pressable
        testID={`stats-canon-${which}`}
        onPress={() => {
          haptics.tap();
          onOpenList(which, 'seen');
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${list.seen} of ${list.total} seen. Opens the list.`}
        style={({ pressed }) => [styles.blockHeader, pressed && styles.pressed]}
      >
        <Text style={styles.blockTitle}>{title}</Text>
        <Text style={[styles.blockValue, TABULAR]}>
          {list.seen} of {list.total}
        </Text>
      </Pressable>
      <GoldTrack pct={list.completion} />
      <Shelf entries={list.entries.slice(0, 24)} onOpenEntry={onOpenEntry} />
      <View style={styles.blockActions}>
        {list.sawBeforeItWon > 0 && (
          <Pressable
            testID={`stats-canon-${which}-before`}
            onPress={() => {
              haptics.tap();
              onOpenList(which, 'before');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>
              {list.sawBeforeItWon} saw it before it won
            </Text>
          </Pressable>
        )}
        {list.unseen.length > 0 && (
          <Pressable
            testID={`stats-canon-${which}-unseen`}
            onPress={() => {
              haptics.tap();
              onOpenList(which, 'unseen');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={styles.actionText}>{list.unseen.length} to go</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function CanonChecklists({ bundle, scope, onOpenList, onOpenEntry }: CanonChecklistsProps) {
  const { canonStats, canon } = bundle;
  const marquee = STATS_LAYOUT === 'marquee';

  // No canon artifact (offline first launch) — hide rather than render 0 of 0.
  if (!canon.bestMusical.length && !canon.bestPlay.length) return null;

  return (
    <StatsCard flush={marquee}>
      <ModuleHeader
        title="Tony &amp; the canon"
        caption={
          scope.kind === 'all'
            ? `${canonStats.totalSeen} winners seen · ${canonStats.totalSawBeforeItWon} before they won`
            : 'Winners you have ever seen · all time'
        }
      />
      <CanonBlock
        title="Best Musical winners"
        list={canonStats.bestMusical}
        which="musical"
        onOpenList={onOpenList}
        onOpenEntry={onOpenEntry}
      />
      <CanonBlock
        title="Best Play winners"
        list={canonStats.bestPlay}
        which="play"
        onOpenList={onOpenList}
        onOpenEntry={onOpenEntry}
      />
    </StatsCard>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: Spacing.md },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  blockTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700' },
  blockValue: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '700' },
  shelf: { gap: Spacing.sm, paddingVertical: Spacing.md },
  shelfItem: { width: 54 },
  shelfPoster: {
    width: 54,
    height: 76,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  // "Unseen posters dimmed" (spec §5.2) — opacity, not a second colour.
  shelfPosterUnseen: { opacity: 0.28 },
  shelfPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  shelfInitial: { color: Colors.text.muted, fontSize: FontSize.md, fontWeight: '700' },
  shelfYear: { color: Colors.text.secondary, fontSize: FontSize.xs, marginTop: 4, textAlign: 'center' },
  shelfYearUnseen: { color: Colors.text.muted },
  blockActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  action: {
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
