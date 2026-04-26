import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';

export interface StatItem {
  label: string;
  value: string;
  sublabel?: string;
  accent?: boolean;
}

interface StatHeroProps {
  items: StatItem[];
}

export function StatHero({ items }: StatHeroProps) {
  return (
    <View style={styles.row}>
      {items.map((it, i) => (
        <View
          key={i}
          style={[styles.cell, i < items.length - 1 && styles.divider]}
        >
          <Text
            style={[styles.value, it.accent && styles.accentValue]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {it.value}
          </Text>
          <Text style={styles.label} numberOfLines={1}>
            {it.label}
          </Text>
          {it.sublabel ? (
            <Text style={styles.sublabel} numberOfLines={1}>
              {it.sublabel}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  divider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border.subtle,
  },
  value: {
    color: Colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  accentValue: {
    color: Colors.brand,
  },
  label: {
    color: Colors.text.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  sublabel: {
    color: Colors.text.muted,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
});
