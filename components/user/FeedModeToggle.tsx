/**
 * Timeline / Photo wall sub-toggle within the diary Feed segment.
 * Forked from ScoreToggle.tsx's shape (options array + active-pill styling).
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export type FeedMode = 'timeline' | 'wall';

interface FeedModeToggleProps {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
}

const OPTIONS: { key: FeedMode; label: string; testID: string }[] = [
  { key: 'timeline', label: 'Timeline', testID: 'photo-feed-timeline-toggle' },
  { key: 'wall', label: 'Photo wall', testID: 'photo-feed-wall-toggle' },
];

export function FeedModeToggle({ mode, onChange }: FeedModeToggleProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map(opt => (
        <Pressable
          key={opt.key}
          testID={opt.testID}
          style={[styles.option, mode === opt.key && styles.optionActive]}
          onPress={() => {
            if (opt.key !== mode) {
              if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(opt.key);
            }
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === opt.key }}
          accessibilityLabel={`${opt.label} view`}
        >
          <Text style={[styles.label, mode === opt.key && styles.labelActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.sm,
    padding: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  option: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 6,
  },
  optionActive: {
    backgroundColor: Colors.brand,
  },
  label: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  labelActive: {
    color: Colors.text.inverse,
  },
});
