/**
 * Format pill — shows MUSICAL (purple) or PLAY (blue).
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
    <View style={[styles.pill, { backgroundColor: info.color + '15' }]}>
      <Text style={[styles.label, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
