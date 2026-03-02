/**
 * Score badge — filled colored square with white score number.
 * Matches the web project's ScoreBadge: solid tier color background,
 * white text, tier label below. Gold scores get a glow.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getScoreTier } from '@/lib/score-utils';
import { Colors, BorderRadius, FontSize, Spacing } from '@/constants/theme';

interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const SIZES = {
  small: { box: 36, font: FontSize.sm, labelFont: 0, radius: BorderRadius.sm },
  medium: { box: 48, font: FontSize.xl, labelFont: FontSize.xs, radius: BorderRadius.md },
  large: { box: 64, font: FontSize.xxl, labelFont: FontSize.sm, radius: BorderRadius.lg },
} as const;

export function ScoreBadge({ score, size = 'medium', showLabel = false }: ScoreBadgeProps) {
  const tier = getScoreTier(score);
  const dim = SIZES[size];

  if (!tier || score == null) {
    return (
      <View style={styles.wrapper}>
        <View
          style={[
            styles.badge,
            {
              width: dim.box,
              height: dim.box,
              borderRadius: dim.radius,
              backgroundColor: Colors.score.none,
            },
          ]}
        >
          <Text style={[styles.score, { fontSize: dim.font }]}>—</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.badge,
          {
            width: dim.box,
            height: dim.box,
            borderRadius: dim.radius,
            backgroundColor: tier.color,
          },
          tier.glow && styles.glow,
        ]}
      >
        <Text style={[styles.score, { fontSize: dim.font }]}>
          {Math.round(score)}
        </Text>
      </View>
      {showLabel && dim.labelFont > 0 && (
        <Text
          style={[styles.tierLabel, { color: tier.color, fontSize: dim.labelFont }]}
          numberOfLines={1}
        >
          {tier.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    color: '#ffffff',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tierLabel: {
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  glow: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
});
