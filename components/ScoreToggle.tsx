/**
 * Critics / Audience score mode toggle.
 * Matches the website's ScoreToggle component.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export type ScoreMode = 'critics' | 'audience';

interface ScoreToggleProps {
  mode: ScoreMode;
  onChange: (mode: ScoreMode) => void;
}

const OPTIONS: { key: ScoreMode; label: string }[] = [
  { key: 'critics', label: 'Critics' },
  { key: 'audience', label: 'Audience' },
];

export function ScoreToggle({ mode, onChange }: ScoreToggleProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map(opt => (
        <Pressable
          key={opt.key}
          style={[styles.option, mode === opt.key && styles.optionActive]}
          onPress={() => onChange(opt.key)}
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
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.pill,
    padding: 3,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  option: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  optionActive: {
    backgroundColor: Colors.brand,
  },
  label: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  labelActive: {
    color: Colors.text.inverse,
  },
});
