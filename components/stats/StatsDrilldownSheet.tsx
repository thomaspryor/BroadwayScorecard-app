/**
 * StatsDrilldownSheet — "every number is a door, not a plaque" (spec §1).
 *
 * ONE sheet backs every tap-through on the Stats screen: hero tiles, year bars,
 * record pills, house chips, contrarian rows, canon checklists, the histogram.
 * Callers hand it a title, an optional caption, a list of show ids (or explicit
 * rows), and optional facts; it renders the filtered diary list and pushes to
 * the show page on tap.
 *
 * Deliberately not a route: a modal keeps the Stats scroll position, and the
 * drill-down payload can be a 100-id list that would be absurd in a URL param.
 *
 * Presentation matches ShowSearchModal (pageSheet + slide) so it feels like the
 * rest of the app.
 */

import React, { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { getImageUrl } from '@/lib/images';
import { humanizeShowId } from '@/lib/show-format';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { ScoreBadge } from '@/components/show-cards';
import MiniStars from '@/components/user/MiniStars';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';

export interface DrilldownFact {
  label: string;
  value: string;
}

export interface DrilldownPayload {
  title: string;
  caption?: string;
  /** Diary entries to list. */
  reviews?: UserReview[];
  /** Catalog shows to list (unseen lists — Critical Gold, unseen winners). */
  shows?: Show[];
  /** Key/value strip above the list (capacity, opened year, records). */
  facts?: DrilldownFact[];
  /** Copy shown when both lists are empty. */
  emptyText?: string;
}

function formatDate(dateSeen: string | null): string {
  if (!dateSeen) return 'No date';
  return new Date(dateSeen + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type Row =
  | { kind: 'review'; key: string; review: UserReview; show?: Show }
  | { kind: 'show'; key: string; show: Show };

export function StatsDrilldownSheet({
  payload,
  showsById,
  onClose,
}: {
  payload: DrilldownPayload | null;
  showsById: Record<string, Show>;
  onClose: () => void;
}) {
  const router = useRouter();

  const rows = useMemo<Row[]>(() => {
    if (!payload) return [];
    const out: Row[] = [];
    for (const r of payload.reviews ?? []) {
      out.push({ kind: 'review', key: `r:${r.id}`, review: r, show: showsById[r.show_id] });
    }
    for (const s of payload.shows ?? []) {
      out.push({ kind: 'show', key: `s:${s.id}`, show: s });
    }
    return out;
  }, [payload, showsById]);

  const open = (show: Show | undefined) => {
    if (!show) return;
    onClose();
    router.push(`/show/${show.slug}`);
  };

  const renderRow = ({ item }: { item: Row }) => {
    const show = item.kind === 'review' ? item.show : item.show;
    const title =
      show?.title ?? (item.kind === 'review' ? humanizeShowId(item.review.show_id) : 'Unknown show');
    const posterUrl = show?.images
      ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)
      : null;
    const subtitle =
      item.kind === 'review'
        ? [show?.venue, formatDate(item.review.date_seen)].filter(Boolean).join(' · ')
        : [
            show?.venue,
            // Only claim a live status the show actually has — build 61 told
            // users Memphis was "Now playing" at the Shubert (closed 2012).
            show?.status === 'previews' ? 'In previews' : show?.status === 'open' ? 'Now playing' : 'Closed',
          ]
            .filter(Boolean)
            .join(' · ');

    return (
      <Pressable
        testID="stats-drilldown-row"
        onPress={() => open(show)}
        disabled={!show}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle}`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <Text style={styles.posterInitial}>{title.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {item.kind === 'review' && item.review.rating > 0 && (
            <View style={styles.rowStars}>
              <MiniStars rating={item.review.rating} />
            </View>
          )}
        </View>
        {/* Score tier colours appear only here, as a semantic score chip. */}
        <ScoreBadge score={show?.compositeScore} category={show?.category} size="small" />
      </Pressable>
    );
  };

  return (
    <Modal
      visible={!!payload}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container} testID="stats-drilldown-sheet">
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" testID="stats-drilldown-close">
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{payload?.title ?? ''}</Text>
          {!!payload?.caption && <Text style={styles.caption}>{payload.caption}</Text>}
        </View>

        {!!payload?.facts?.length && (
          <View style={styles.facts}>
            {payload.facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={styles.factValue} numberOfLines={1}>
                  {f.value}
                </Text>
                <Text style={styles.factLabel} numberOfLines={2}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>{payload?.emptyText ?? 'Nothing here yet.'}</Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    minHeight: 44,
    alignItems: 'center',
  },
  closeText: { color: Colors.brand, fontSize: FontSize.md, fontWeight: '600' },
  titleBlock: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  title: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700' },
  caption: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 4 },
  facts: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  fact: {
    flex: 1,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  factValue: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  factLabel: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 2 },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  poster: { width: 44, height: 62, borderRadius: BorderRadius.sm, backgroundColor: Colors.surface.overlay },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterInitial: { color: Colors.text.muted, fontSize: FontSize.lg, fontWeight: '700' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  rowSubtitle: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 2 },
  rowStars: { marginTop: 4 },
  pressed: { opacity: 0.7 },
  empty: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
});
