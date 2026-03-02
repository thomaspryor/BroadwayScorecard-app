/**
 * Audience grade chip — shows letter grade (A+, B-, etc.) with color.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, BorderRadius, Spacing } from '@/constants/theme';

interface AudienceChipProps {
  grade: string;
  color: string;
}

export function AudienceChip({ grade, color }: AudienceChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: color + '20' }]}>
      <Text style={[styles.label, { color }]}>Audience: {grade}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
