/**
 * Timeline view of the private photo Feed — month headers, entry cards
 * with photo strips, dismissible "add a photo" nudge on photoless entries.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import type { FeedMonthGroup } from '@/hooks/usePhotoFeed';

interface PhotoFeedTimelineProps {
  monthGroups: FeedMonthGroup[];
  signedUrls: Record<string, string>;
  showMap: Record<string, { title: string }>;
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
          <Text style={styles.monthHeader}>{group.monthLabel.toUpperCase()}</Text>
          {group.entries.map(entry => {
            const show = showMap[entry.review.show_id];
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
                <View style={styles.head}>
                  <View style={styles.headText}>
                    <Text style={styles.title} numberOfLines={1}>{show?.title || entry.review.show_id}</Text>
                    <Text style={styles.meta}>
                      {formatShortDate(entry.review.date_seen)}
                      {entry.review.rating ? ` · ${starString(entry.review.rating)}` : ''}
                    </Text>
                  </View>
                </View>

                {entry.review.review_text && (
                  <Text style={styles.note} numberOfLines={2}>{entry.review.review_text}</Text>
                )}

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

function formatShortDate(dateSeen: string | null): string {
  if (!dateSeen) return '';
  const d = new Date(`${dateSeen}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function starString(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '');
}

const styles = StyleSheet.create({
  monthHeader: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.8,
    color: Colors.text.muted, paddingTop: Spacing.lg, paddingBottom: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary },
  meta: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },
  note: { fontSize: FontSize.xs, color: Colors.text.secondary, marginTop: Spacing.sm },
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
