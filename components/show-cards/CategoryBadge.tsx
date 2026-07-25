/**
 * Category badge — shows OFF-BROADWAY (indigo) or WEST END (teal).
 * Only renders for non-broadway categories.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BorderRadius } from '@/constants/theme';

interface CategoryBadgeProps {
  category: string;
}

const CAT_STYLES: Record<string, { color: string; border: string; bg: string; label: string }> = {
  'off-broadway': { color: '#818cf8', border: 'rgba(99, 102, 241, 0.3)', bg: 'rgba(99, 102, 241, 0.15)', label: 'OFF-BROADWAY' },
  'west-end': { color: '#2dd4bf', border: 'rgba(20, 184, 166, 0.3)', bg: 'rgba(20, 184, 166, 0.15)', label: 'WEST END' },
};

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const s = CAT_STYLES[category];
  if (!s) return null; // Don't render for 'broadway'

  return (
    <View style={[styles.pill, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.label, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
