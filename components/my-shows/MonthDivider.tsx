import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';

interface Props {
  label: string;
}

export function MonthDivider({ label }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface.default,
    gap: Spacing.sm,
  },
  text: {
    color: Colors.brand,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(212, 165, 116, 0.25)',
  },
});
