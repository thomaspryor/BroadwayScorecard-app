/**
 * Status badge — small pill showing the show's current status.
 * NOW PLAYING (green), CLOSED (gray), IN PREVIEWS (purple), UPCOMING (blue).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getStatusInfo } from '@/lib/score-utils';
import { FontSize, BorderRadius } from '@/constants/theme';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const info = getStatusInfo(status);

  return (
    <View style={[styles.pill, { backgroundColor: info.color + '20' }]}>
      <Text style={[styles.label, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
