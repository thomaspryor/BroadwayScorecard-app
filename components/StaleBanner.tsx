/**
 * Stale data / offline banner.
 * Shows when cached data is being displayed, fetch failed, or device is offline.
 * Tap to retry.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useShows } from '@/lib/data-context';
import { Colors, Spacing, FontSize } from '@/constants/theme';

export function StaleBanner() {
  const { isStale, isOffline, refresh, error } = useShows();

  if (!isStale && !error && !isOffline) return null;

  const isOfflineState = isOffline || error;
  const message = isOffline
    ? 'You\'re offline — showing cached data'
    : error
      ? 'Unable to load show data — tap to retry'
      : 'Showing cached data — tap to refresh';

  const dotColor = isOfflineState ? Colors.score.red : Colors.score.amber;
  const bgColor = isOfflineState ? Colors.score.red + '20' : Colors.score.amber + '20';
  const textColor = isOfflineState ? Colors.score.red : Colors.score.amber;

  return (
    <Pressable
      style={({ pressed }) => [styles.banner, { backgroundColor: bgColor }, pressed && styles.pressed]}
      onPress={refresh}
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
