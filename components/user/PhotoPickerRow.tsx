/**
 * "Add photos" row for the rating/review editor (app/rate/[showId].tsx).
 * Up to MAX_PHOTOS_PER_REVIEW thumbnails + add button + "From that night"
 * on-device suggestion + Limited Library banner.
 *
 * Photos attach to a saved review (user_review_photos.review_id is a FK),
 * so this renders a "Save first" hint until reviewId exists.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import { useReviewPhotos } from '@/hooks/useReviewPhotos';
import { PhotoUploadBadge } from '@/components/user/PhotoUploadBadge';
import { MAX_PHOTOS_PER_REVIEW } from '@/lib/photo-types';
import { getLibraryAccess, requestLibraryAccess, processPhotoAsset } from '@/lib/photo-image-pipeline';
import { findPhotosFromThatNight, requestMediaLibraryAccess } from '@/lib/photo-from-that-night';

interface PhotoPickerRowProps {
  reviewId: string | null;
  userId: string | null;
  dateSeen: string | null;
}

export function PhotoPickerRow({ reviewId, userId, dateSeen }: PhotoPickerRowProps) {
  const {
    photos, pending, signedUrls, remainingSlots,
    addPhotos, addProcessedPhotos, retry, removePhoto,
  } = useReviewPhotos(reviewId, userId);

  const [limitedLibrary, setLimitedLibrary] = useState(false);
  const [nightSuggestionCount, setNightSuggestionCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLibraryAccess().then(access => { if (!cancelled) setLimitedLibrary(access === 'limited'); });
    return () => { cancelled = true; };
  }, [photos.length, pending.length]);

  useEffect(() => {
    let cancelled = false;
    if (dateSeen) {
      findPhotosFromThatNight(dateSeen, 1).then(candidates => {
        if (!cancelled) setNightSuggestionCount(candidates.length > 0 ? 1 : 0);
      });
    }
    return () => { cancelled = true; };
  }, [dateSeen]);

  const handleAddPhotos = useCallback(async () => {
    haptics.tap();
    const access = await getLibraryAccess();
    if (access === 'undetermined') {
      const granted = await requestLibraryAccess();
      if (granted === 'none') {
        Alert.alert('Photo access needed', 'Allow photo library access in Settings to add photos to your diary.');
        return;
      }
    } else if (access === 'none') {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to add photos to your diary.');
      return;
    }
    await addPhotos();
  }, [addPhotos]);

  const handleFromThatNight = useCallback(async () => {
    if (!dateSeen) return;
    haptics.tap();
    const hasAccess = await requestMediaLibraryAccess();
    if (!hasAccess) {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to find photos from that night.');
      return;
    }
    const candidates = await findPhotosFromThatNight(dateSeen, remainingSlots || 1);
    if (candidates.length === 0) return;

    const processed = [];
    for (const c of candidates) {
      const result = await processPhotoAsset(c.uri, c.width, c.height).catch(() => null);
      if (result) processed.push(result);
    }
    await addProcessedPhotos(processed);
  }, [dateSeen, remainingSlots, addProcessedPhotos]);

  if (!reviewId) {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Photos</Text>
        <Text style={styles.saveFirstHint}>Save this entry to start adding photos.</Text>
      </View>
    );
  }

  const doneCount = photos.length;
  const total = doneCount + pending.length;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        Photos <Text style={styles.optional}>({total}/{MAX_PHOTOS_PER_REVIEW})</Text>
      </Text>

      {limitedLibrary && (
        <Pressable onPress={handleAddPhotos} style={styles.limitedBanner}>
          <Text style={styles.limitedBannerText}>Limited photo access · Tap &quot;Add photos&quot; to select more</Text>
        </Pressable>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        {photos.map(photo => (
          <View key={photo.id} style={styles.thumbWrap}>
            {signedUrls[photo.storage_path] && (
              <Image source={{ uri: signedUrls[photo.storage_path] }} style={styles.thumb} contentFit="cover" />
            )}
            <Pressable
              style={styles.removeBtn}
              onPress={() => {
                haptics.action();
                Alert.alert('Remove photo?', undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removePhoto(photo.id) },
                ]);
              }}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <Text style={styles.removeBtnText}>×</Text>
            </Pressable>
          </View>
        ))}
        {pending.map(item => (
          <View key={item.id} style={styles.thumbWrap}>
            <Image source={{ uri: item.localUri }} style={styles.thumb} contentFit="cover" />
            <PhotoUploadBadge status={item.status} onRetry={() => retry(item.id)} />
          </View>
        ))}
        {total < MAX_PHOTOS_PER_REVIEW && (
          <Pressable
            style={styles.addTile}
            onPress={handleAddPhotos}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
          >
            <Text style={styles.addTileText}>+</Text>
          </Pressable>
        )}
      </ScrollView>

      {nightSuggestionCount > 0 && total < MAX_PHOTOS_PER_REVIEW && (
        <Pressable onPress={handleFromThatNight} style={styles.nightSuggestion}>
          <Text style={styles.nightSuggestionText}>📸 Add photos from that night</Text>
        </Pressable>
      )}
    </View>
  );
}

const THUMB_SIZE = 64;

const styles = StyleSheet.create({
  field: { marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.primary, marginBottom: Spacing.sm },
  optional: { fontWeight: '400', color: Colors.text.muted },
  saveFirstHint: { fontSize: FontSize.xs, color: Colors.text.muted },
  row: { flexDirection: 'row' },
  thumbWrap: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm, overflow: 'hidden', backgroundColor: Colors.surface.overlay,
  },
  thumb: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: Colors.text.primary, fontSize: 14, lineHeight: 16, fontWeight: '700' },
  addTile: {
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.border.default, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface.overlay,
  },
  addTileText: { color: Colors.text.secondary, fontSize: 28, fontWeight: '300' },
  limitedBanner: {
    backgroundColor: Colors.surface.overlay, borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm,
  },
  limitedBannerText: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: '600' },
  nightSuggestion: { marginTop: Spacing.sm },
  nightSuggestionText: { fontSize: FontSize.xs, color: Colors.brand, fontWeight: '600' },
});
