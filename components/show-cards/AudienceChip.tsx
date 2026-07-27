/**
 * Audience grade chip — shows letter grade (A+, B-, etc.) with color.
 * "Audience:" prefix has reduced opacity matching the website.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, BorderRadius } from '@/constants/theme';

interface AudienceChipProps {
  grade: string;
  color: string;
}

export function AudienceChip({ grade, color }: AudienceChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: color + '20' }]}>
      <Text style={[styles.prefix, { color }]}>Audience: </Text>
      <Text style={[styles.grade, { color }]}>{grade}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
  },
  prefix: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    opacity: 0.6,
  },
  grade: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
