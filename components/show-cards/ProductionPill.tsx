/**
 * Production pill — shows REVIVAL (gray) or ORIGINAL (amber).
 * Matches website's ProductionPill style.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, BorderRadius } from '@/constants/theme';

interface ProductionPillProps {
  isRevival: boolean;
}

const STYLES = {
  revival: { color: '#9ca3af', bg: 'rgba(107, 114, 128, 0.2)' },
  original: { color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.2)' },
};

export function ProductionPill({ isRevival }: ProductionPillProps) {
  const s = isRevival ? STYLES.revival : STYLES.original;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.label, { color: s.color }]}>
        {isRevival ? 'REVIVAL' : 'ORIGINAL'}
      </Text>
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
