/**
 * Timeline view of the private photo Feed — Round 2 Direction A ("grouped
 * diary"): full-width month band headers (shipped convention, matching the
 * Grid segment's year headers), a date column + show poster per row, then
 * title/venue/stars/note, with the existing optional photo strip/nudge
 * still hanging below as this Feed's differentiator from a plain diary.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { getImageUrl } from '@/lib/images';
import * as haptics from '@/lib/haptics';
import MiniStars from '@/components/user/MiniStars';
import type { FeedMonthGroup } from '@/hooks/usePhotoFeed';
import type { Show } from '@/lib/types';

interface PhotoFeedTimelineProps {
  monthGroups: FeedMonthGroup[];
  signedUrls: Record<string, string>;
  showMap: Record<string, Show>;
  onDismissNudge: (reviewId: string) => void;
}

export function PhotoFeedTimeline({ monthGroups, signedUrls, showMap, onDismissNudge }: PhotoFeedTimelineProps) {
  if (monthGroups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No dated entries yet. Rate a show with a date seen to start your Feed.</Text>
      </View>
    );
  }

  return (
    <View>
      {monthGroups.map(group => (
        <View key={group.monthLabel}>
          <View style={styles.monthBand}>
            <Text style={styles.monthLabel}>{group.monthLabel.toUpperCase()}</Text>
            <Text style={styles.monthCount}>
              {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          {group.entries.map(entry => {
            const show = showMap[entry.review.show_id];
            const title = show?.title || entry.review.show_id;
            const posterUrl = show?.images ? (getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)) : null;
            const dateParts = formatDateParts(entry.review.date_seen);
            const visiblePhotos = entry.photos.slice(0, 3);
            const extraCount = entry.photos.length - visiblePhotos.length;

            return (
              <Pressable
                key={entry.review.id}
                style={styles.card}
                onPress={() => {
                  haptics.tap();
                  router.push({
                    pathname: '/rate/[showId]',
                    params: { showId: entry.review.show_id, reviewId: entry.review.id },
                  });
                }}
              >
                <View style={styles.row}>
                  <View style={styles.dateCol}>
                    {dateParts ? (
                      <>
                        <Text style={styles.dateDay}>{dateParts.day}</Text>
                        <Text style={styles.dateMonth}>{dateParts.month}</Text>
                      </>
                    ) : null}
                  </View>
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.poster, styles.posterPlaceholder]}>
                      <Text style={styles.posterPlaceholderText}>{title.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={styles.info}>
                    <Text style={styles.title} numberOfLines={1}>{title}</Text>
                    {!!show?.venue && <Text style={styles.venue} numberOfLines={1}>{show.venue}</Text>}
                    {!!entry.review.review_text && (
                      <Text style={styles.note} numberOfLines={2}>{entry.review.review_text}</Text>
                    )}
                  </View>
                  {entry.review.rating > 0 && (
                    <View style={styles.starsCol}>
                      <MiniStars rating={entry.review.rating} />
                    </View>
                  )}
                </View>

                {entry.photos.length > 0 ? (
                  <View style={styles.photoStrip}>
                    {visiblePhotos.map(photo => (
                      <View key={photo.id} style={styles.photoTile}>
                        {signedUrls[photo.storage_path] && (
                          <Image source={{ uri: signedUrls[photo.storage_path] }} style={styles.photoImg} contentFit="cover" />
                        )}
                      </View>
                    ))}
                    {extraCount > 0 && (
                      <View style={[styles.photoTile, styles.morePhotoTile]}>
                        <Text style={styles.morePhotoText}>+{extraCount}</Text>
                      </View>
                    )}
                  </View>
                ) : !entry.nudgeDismissed ? (
                  <View style={styles.nudgeRow}>
                    <Text style={styles.nudgeText}>No photos yet · Add one from that night</Text>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); onDismissNudge(entry.review.id); }}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss photo suggestion"
                      hitSlop={8}
                    >
                      <Text style={styles.nudgeDismiss}>×</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function formatDateParts(dateSeen: string | null): { day: string; month: string } | null {
  if (!dateSeen) return null;
  const d = new Date(`${dateSeen}T00:00:00`);
  return {
    day: d.toLocaleDateString('en-US', { day: 'numeric' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

const styles = StyleSheet.create({
  // Full-width band headers — same convention as the Grid segment's year
  // headers (shipped, not restyled): full-bleed, raised bg, top/bottom border.
  monthBand: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: 8,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface.raised,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border.subtle,
  },
  monthLabel: { color: Colors.text.primary, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
  monthCount: { color: Colors.text.muted, fontSize: 12 },
  card: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dateCol: { width: 30, alignItems: 'center' },
  dateDay: { color: Colors.text.primary, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  dateMonth: { color: Colors.text.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  poster: {
    width: 40, height: 56, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterPlaceholderText: { color: Colors.text.muted, fontSize: 16, fontWeight: '600' },
  info: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary },
  venue: { fontSize: FontSize.xs, color: Colors.text.muted },
  note: { fontSize: FontSize.xs, color: Colors.text.secondary, marginTop: 2 },
  starsCol: { alignItems: 'flex-end' },
  photoStrip: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
  photoTile: { flex: 1, aspectRatio: 1, borderRadius: BorderRadius.sm, overflow: 'hidden', backgroundColor: Colors.surface.overlay },
  photoImg: { width: '100%', height: '100%' },
  morePhotoTile: { alignItems: 'center', justifyContent: 'center' },
  morePhotoText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700' },
  nudgeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border.subtle,
  },
  nudgeText: { fontSize: FontSize.xs, color: Colors.text.muted },
  nudgeDismiss: { fontSize: 16, color: Colors.text.muted, paddingHorizontal: Spacing.xs },
  empty: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.text.muted, textAlign: 'center' },
});
