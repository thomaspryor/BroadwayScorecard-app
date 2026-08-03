/**
 * Audience grade chip — shows letter grade (A+, B-, etc.) with color.
 * "Audience" prefix has reduced opacity matching the website.
 *
 * Sized to fit inside ShowCard's fixed score column. At the old 12pt/15pt with
 * 10pt side padding the chip needed ~100pt in an 80-84pt column, so React
 * Native wrapped the prefix mid-word and the card read "Audienc / e:  A+"
 * (caught in simulator verification, 2026-08-03).
 *
 * ONE Text, not two: shrink-to-fit only governs the element it is set on, so a
 * layout where the label shrinks and the grade does not still overflows once
 * Dynamic Type scales the grade (ship-check, 2026-08-03). Nesting the grade
 * inside the same Text — styling only weight/opacity, never fontSize — means
 * the whole string is measured and scaled as one unit. maxFontSizeMultiplier
 * bounds how far accessibility sizes can push it before that scaling has to
 * fight a fixed-width column.
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
      // `accessible` is required — without it a View is not an accessibility
      // element and VoiceOver ignores accessibilityLabel, reading the raw text
      // instead ("Audience B-" with the hyphen swallowed rather than "minus").
      accessible
      accessibilityRole="text"
      style={[styles.chip, { backgroundColor: color + '20' }]}
      accessibilityLabel={`Audience grade ${grade}`}
    >
      <Text
        style={[styles.text, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={1.3}
      >
        <Text style={styles.prefix}>Audience </Text>
        <Text style={styles.grade}>{grade}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    alignSelf: 'center',
  },
  // The only fontSize in the chip — children must not set one or they opt out
  // of the parent's shrink-to-fit.
  text: {
    fontSize: 10, // font-floor-exempt: caption inside the fixed 80pt score column; the web renders this label at 9px
    textAlign: 'center',
  },
  prefix: {
    fontWeight: '600',
    opacity: 0.6,
  },
  grade: {
    fontWeight: '700',
  },
});
