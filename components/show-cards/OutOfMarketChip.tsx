/**
 * Out-of-market city chip (owner request 2026-08-02).
 *
 * Only rendered when the show sits outside the user's selected market: a NYC
 * user sees "London" on West End / Off-West-End shows and nothing on Broadway
 * / Off-Broadway, and the inverse for London users. Quiet chip that lives
 * under the card title — deliberately NOT another poster overlay.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useMarket } from '@/lib/market-context';
import { outOfMarketCity } from '@/components/MarketPicker';
import type { Market } from '@/components/MarketPicker';
import type { Show } from '@/lib/types';
import { Colors } from '@/constants/theme';

interface OutOfMarketChipProps {
  show?: Show;
  /** Override the viewer's market. Fixture/preview screens only. */
  market?: Market;
}

export function OutOfMarketChip({ show, market }: OutOfMarketChipProps) {
  const ctx = useMarket();
  const city = outOfMarketCity(show?.category, market ?? ctx.market);
  if (!city) return null;
  return (
    <View style={styles.chip}>
      <Text style={styles.label} numberOfLines={1}>{city}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: Colors.surface.overlay,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: Colors.text.muted,
  },
});
