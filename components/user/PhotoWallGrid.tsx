/**
 * Photo wall — edge-to-edge grid of every diary photo, tapping back to
 * its entry. Flat dataset shared with the Timeline view (usePhotoFeed).
 */

import React from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import type { WallPhoto } from '@/hooks/usePhotoFeed';

interface PhotoWallGridProps {
  photos: WallPhoto[];
  signedUrls: Record<string, string>;
}

const COLUMNS = 3;

export function PhotoWallGrid({ photos, signedUrls }: PhotoWallGridProps) {
  if (photos.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Photos you add to diary entries will show up here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {photos.map(photo => (
        <Pressable
          key={photo.id}
          style={styles.tile}
          onPress={() => {
            if (!photo.show_id) return;
            haptics.tap();
            router.push({
              pathname: '/rate/[showId]',
              params: { showId: photo.show_id, reviewId: photo.review_id },
            });
          }}
        >
          {signedUrls[photo.storage_path] && (
            <Image source={{ uri: signedUrls[photo.storage_path] }} style={styles.img} contentFit="cover" />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    width: `${100 / COLUMNS}%`,
    aspectRatio: 1,
    backgroundColor: Colors.surface.overlay,
    borderWidth: 0.5,
    borderColor: Colors.surface.default,
  },
  img: { width: '100%', height: '100%' },
  empty: { padding: Spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: FontSize.sm, color: Colors.text.muted, textAlign: 'center' },
});
