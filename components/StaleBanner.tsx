/**
 * Stale data / offline banner.
 * Shows when cached data is being displayed and a fresh fetch failed.
 * Tap to retry.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useShows } from '@/lib/data-context';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export function StaleBanner() {
  const { isStale, refresh, error } = useShows();

  if (!isStale && !error) return null;

  const message = error
    ? 'Unable to load show data'
    : 'Showing cached data — tap to refresh';

  return (
    <Pressable
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      onPress={refresh}
    >
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.score.amber + '20',
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
    backgroundColor: Colors.score.amber,
  },
  text: {
    color: Colors.score.amber,
    fontSize: FontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
});
