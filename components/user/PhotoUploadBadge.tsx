/**
 * Small status pill overlaid on a photo thumbnail while queued/uploading,
 * or a tap-to-retry pill when the upload failed. Combines StatusBadge's
 * pill shape with StaleBanner's whole-element-tappable retry pattern.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';
import type { PhotoUploadStatus } from '@/lib/photo-types';

interface PhotoUploadBadgeProps {
  status: PhotoUploadStatus;
  onRetry?: () => void;
}

export function PhotoUploadBadge({ status, onRetry }: PhotoUploadBadgeProps) {
  if (status === 'done') return null;

  if (status === 'failed') {
    return (
      <Pressable
        style={styles.pill}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Upload failed, tap to retry"
      >
        <Text style={styles.failedText}>Failed · Retry</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.pill, styles.pillNeutral]}>
      <ActivityIndicator size="small" color={Colors.text.secondary} />
      <Text style={styles.uploadingText}>{status === 'queued' ? 'Queued' : 'Uploading'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.score.red + 'cc',
  },
  pillNeutral: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  failedText: {
    color: Colors.text.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  uploadingText: {
    color: Colors.text.primary,
    fontSize: 10,
    fontWeight: '600',
  },
});
