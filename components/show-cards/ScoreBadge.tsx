/**
 * Score badge — colored rounded square showing the critic score.
 * Matches the web project's ScoreBadge component.
 *
 * Gold scores (83+) get a subtle glow effect.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getScoreTier } from '@/lib/score-utils';
import { Colors, BorderRadius, FontSize } from '@/constants/theme';

interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'small' | 'medium' | 'large';
}

const SIZES = {
  small: { box: 36, font: FontSize.sm, radius: BorderRadius.sm },
  medium: { box: 48, font: FontSize.xl, radius: BorderRadius.md },
  large: { box: 64, font: FontSize.xxl, radius: BorderRadius.lg },
} as const;

export function ScoreBadge({ score, size = 'medium' }: ScoreBadgeProps) {
  const tier = getScoreTier(score);
  const dim = SIZES[size];

  if (!tier || score == null) {
    return (
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
        <Text style={[styles.score, { fontSize: dim.font, color: Colors.text.muted }]}>
          —
        </Text>
      </View>
    );
  }

  const bgColor = tier.color + '20'; // 12% opacity
  const borderColor = tier.color + '40'; // 25% opacity

  return (
    <View
      style={[
        styles.badge,
        {
          width: dim.box,
          height: dim.box,
          borderRadius: dim.radius,
          backgroundColor: bgColor,
          borderWidth: 1,
          borderColor: borderColor,
        },
        tier.glow && styles.glow,
      ]}
    >
      <Text style={[styles.score, { fontSize: dim.font, color: tier.color }]}>
        {Math.round(score)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  glow: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});
