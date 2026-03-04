/**
 * Critics / Audience score mode toggle.
 * Matches the website's ScoreToggle: uppercase, rounded-lg, shadow on active.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export type ScoreMode = 'critics' | 'audience';

interface ScoreToggleProps {
  mode: ScoreMode;
  onChange: (mode: ScoreMode) => void;
}

const OPTIONS: { key: ScoreMode; label: string }[] = [
  { key: 'critics', label: 'CRITICS' },
  { key: 'audience', label: 'AUDIENCE' },
];

export function ScoreToggle({ mode, onChange }: ScoreToggleProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map(opt => (
        <Pressable
          key={opt.key}
          style={[styles.option, mode === opt.key && styles.optionActive]}
          onPress={() => {
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(opt.key);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === opt.key }}
          accessibilityLabel={`${opt.label} scores`}
        >
          <Text style={[styles.label, mode === opt.key && styles.labelActive]}>
            {opt.label}
          </Text>
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  option: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 6,
  },
  optionActive: {
    backgroundColor: Colors.brand,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  label: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  labelActive: {
    color: Colors.text.inverse,
  },
});
