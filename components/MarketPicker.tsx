/**
 * Market picker — NYC / London toggle, matching the website's market switcher.
 * NYC = broadway + off-broadway, London = west-end.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export type Market = 'nyc' | 'london';

interface MarketPickerProps {
  market: Market;
  onChange: (market: Market) => void;
}

const OPTIONS: { key: Market; label: string }[] = [
  { key: 'nyc', label: 'NYC' },
  { key: 'london', label: 'London' },
];

export function MarketPicker({ market, onChange }: MarketPickerProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map(opt => (
        <Pressable
          key={opt.key}
          style={[styles.option, market === opt.key && styles.optionActive]}
          onPress={() => onChange(opt.key)}
        >
          <Text style={[styles.label, market === opt.key && styles.labelActive]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Filter shows by market selection (includes off-broadway for NYC) */
export function filterByMarket(category: string, market: Market): boolean {
  if (market === 'nyc') {
    return category === 'broadway' || category === 'off-broadway';
  }
  return category === 'west-end';
}

/** Filter by market with off-broadway control. Home uses includeOB=false. Browse can toggle. */
export function filterByMarketCategory(category: string, market: Market, includeOB: boolean): boolean {
  if (market === 'nyc') {
    return category === 'broadway' || (includeOB && category === 'off-broadway');
  }
  return category === 'west-end';
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.pill,
    padding: 3,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  option: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
  },
  optionActive: {
    backgroundColor: Colors.brand,
  },
  label: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  labelActive: {
    color: Colors.text.inverse,
  },
});
