/**
 * Audience grade chip — shows letter grade (A+, B-, etc.) with color.
 * "Audience" prefix has reduced opacity matching the website.
 *
 * Sized to fit inside ShowCard's fixed score column. At the old 12pt/15pt with
 * 10pt side padding the chip needed ~100pt in an 80-84pt column, so React
 * Native wrapped the prefix mid-word and the card read "Audienc / e:  A+"
 * (caught in simulator verification, 2026-08-03). Everything here is
 * single-line and shrink-to-fit so that can never come back.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BorderRadius } from '@/constants/theme';

interface AudienceChipProps {
  grade: string;
  color: string;
}

export function AudienceChip({ grade, color }: AudienceChipProps) {
  return (
    <View
      style={[styles.chip, { backgroundColor: color + '20' }]}
      accessibilityLabel={`Audience grade ${grade}`}
    >
      <Text style={[styles.prefix, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        Audience
      </Text>
      <Text style={[styles.grade, { color }]} numberOfLines={1}>{grade}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    alignSelf: 'center',
  },
  prefix: {
    fontSize: 10, // font-floor-exempt: caption inside the fixed 80pt score column; the web renders this label at 9px
    fontWeight: '600',
    opacity: 0.6,
  },
  grade: {
    fontSize: 13,
    fontWeight: '700',
  },
});
