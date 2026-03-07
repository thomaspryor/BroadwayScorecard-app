/**
 * Stale data / offline banner.
 * Shows when cached data is being displayed, fetch failed, device is offline,
 * or there are pending offline writes waiting to sync.
 * Tap to retry.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useShows } from '@/lib/data-context';
import { getPendingCount, flushQueue } from '@/lib/offline-queue';
import { Colors, Spacing, FontSize } from '@/constants/theme';

export function StaleBanner() {
  const { isStale, isOffline, refresh, error } = useShows();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPendingCount().then(setPendingCount).catch(() => {});
  }, [isOffline]);

  const hasPending = pendingCount > 0;
  if (!isStale && !error && !isOffline && !hasPending) return null;

  const isOfflineState = isOffline || error;

  let message: string;
  if (isOffline && hasPending) {
    message = `You're offline — ${pendingCount} change${pendingCount > 1 ? 's' : ''} will sync when back online`;
  } else if (hasPending && !isOffline) {
    message = 'Syncing changes...';
  } else if (isOffline) {
    message = "You're offline — showing cached data";
  } else if (error) {
    message = 'Unable to load show data — tap to retry';
  } else {
    message = 'Showing cached data — tap to refresh';
  }

  const dotColor = isOfflineState ? Colors.score.red : Colors.score.amber;
  const bgColor = isOfflineState ? Colors.score.red + '20' : Colors.score.amber + '20';
  const textColor = isOfflineState ? Colors.score.red : Colors.score.amber;

  const handlePress = async () => {
    if (hasPending && !isOffline) {
      const flushed = await flushQueue().catch(() => 0);
      setPendingCount(prev => Math.max(0, prev - (flushed || 0)));
    }
    refresh();
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.banner, { backgroundColor: bgColor }, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
});
