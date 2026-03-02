/**
 * Format pill — shows MUSICAL (purple) or PLAY (blue).
 * Outline/border style to match the website.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getFormatInfo } from '@/lib/score-utils';
import { FontSize, BorderRadius, Spacing } from '@/constants/theme';

interface FormatPillProps {
  type: string;
}

export function FormatPill({ type }: FormatPillProps) {
  const info = getFormatInfo(type);

  return (
    <View style={[styles.pill, { borderColor: info.color + '80' }]}>
      <Text style={[styles.label, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
