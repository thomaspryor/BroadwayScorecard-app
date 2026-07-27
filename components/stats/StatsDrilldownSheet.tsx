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
  /**
   * Per-show score to render on the row INSTEAD of the show's composite —
   * Aisle Mates / Your Paper of Record (spec §5.1) show one reviewer's own
   * score, not the site's aggregate, so the number matches "their pick: 94".
   */
  scoreOverrides?: Record<string, number>;
  /**
   * Label shown as a divider before the `shows` group, when BOTH `reviews`
   * and `shows` are present in the same payload — e.g. "Their picks you
   * haven't seen" after a critic's shared-show agreement history.
   */
  showsLabel?: string;
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
  | { kind: 'show'; key: string; show: Show }
  | { kind: 'divider'; key: string; label: string };

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
    const shows = payload.shows ?? [];
    // Divider only when both groups are present — a single-group payload
    // (every other drilldown caller) never shows a label.
    if (shows.length > 0 && (payload.reviews?.length ?? 0) > 0 && payload.showsLabel) {
      out.push({ kind: 'divider', key: 'divider', label: payload.showsLabel });
    }
    for (const s of shows) {
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
    if (item.kind === 'divider') {
      return (
        <Text style={styles.sectionLabel} testID="stats-drilldown-divider">
          {item.label}
        </Text>
      );
    }

    const show = item.show;
    const showId = item.kind === 'review' ? item.review.show_id : item.show.id;
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
    // Reviewer-specific score (Aisle Mates / Paper of Record) beats the
    // show's composite when the caller supplies one for this show.
    const score = payload?.scoreOverrides?.[showId] ?? show?.compositeScore;

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
        <ScoreBadge score={score} category={show?.category} size="small" />
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
  sectionLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowStars: { marginTop: 4 },
  pressed: { opacity: 0.7 },
  empty: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
});
