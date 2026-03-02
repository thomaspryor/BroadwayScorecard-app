/**
 * Score badge — tier-colored square with score number.
 * Gold tier: metallic gradient, dark text, glow, shimmer animation, crown.
 * All tiers: subtle tier-colored shadows. Label above badge.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { getScoreTier } from '@/lib/score-utils';
import { Colors, BorderRadius, FontSize } from '@/constants/theme';

interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  animated?: boolean;
}

const SIZES = {
  small: { box: 36, font: FontSize.sm, labelFont: 0, radius: BorderRadius.sm },
  medium: { box: 48, font: FontSize.xl, labelFont: FontSize.xs, radius: BorderRadius.md },
  large: { box: 64, font: FontSize.xxl, labelFont: FontSize.sm, radius: BorderRadius.lg },
} as const;

const GOLD_GRADIENT: [string, string, string, string, string] = [
  '#DAA520', '#FFD700', '#FFF0A0', '#FFD700', '#DAA520',
];

function GoldShimmer({ size }: { size: number }) {
  const translateX = useSharedValue(-size);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(size * 2, { duration: 2500, easing: Easing.linear }),
      -1,
      false,
    );
  }, [size, translateX]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.3)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: size * 0.6, height: '100%' }}
      />
    </Animated.View>
  );
}

function Crown() {
  // Thin 3-point crown matching the website — very subtle, sits just above the badge
  return (
    <View style={{ alignItems: 'center', marginBottom: -1 }}>
      <Svg width={14} height={6} viewBox="0 0 14 6">
        <Path
          d="M0,6 L1,2 L3.5,4 L7,0 L10.5,4 L13,2 L14,6 Z"
          fill="#C8960E"
        />
      </Svg>
    </View>
  );
}

export function ScoreBadge({ score, size = 'medium', showLabel = false, animated = false }: ScoreBadgeProps) {
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

  const isGold = tier.glow;
  const rounded = Math.round(score);
  const showCrown = isGold && rounded >= 83 && size !== 'small';

  // Per-tier shadow
  const shadowStyle = Platform.OS === 'ios' ? {
    shadowColor: tier.shadowColor,
    shadowOffset: { width: 0, height: 0 } as const,
    shadowOpacity: isGold ? 0.55 : 0.3,
    shadowRadius: isGold ? 12 : 4,
  } : {
    elevation: isGold ? 8 : 3,
  };

  return (
    <View style={styles.wrapper}>
      {/* Tier label ABOVE badge */}
      {showLabel && dim.labelFont > 0 && (
        <Text
          style={[styles.tierLabel, { color: tier.color, fontSize: dim.labelFont }]}
          numberOfLines={1}
        >
          {tier.label}
        </Text>
      )}

      {/* Crown for gold 83+ */}
      {showCrown && <Crown />}

      {/* Badge */}
      {isGold ? (
        <View style={[styles.goldWrapper, { borderRadius: dim.radius + 2 }, shadowStyle]}>
          <LinearGradient
            colors={GOLD_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.badge,
              {
                width: dim.box,
                height: dim.box,
                borderRadius: dim.radius,
              },
            ]}
          >
            <Text style={[styles.score, { fontSize: dim.font, color: tier.textColor }]}>
              {rounded}
            </Text>
            {animated && <GoldShimmer size={dim.box} />}
          </LinearGradient>
        </View>
      ) : (
        <View
          style={[
            styles.badge,
            {
              width: dim.box,
              height: dim.box,
              borderRadius: dim.radius,
              backgroundColor: tier.color,
            },
            shadowStyle,
          ]}
        >
          <Text style={[styles.score, { fontSize: dim.font, color: tier.textColor }]}>
            {rounded}
          </Text>
        </View>
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
    overflow: 'hidden',
  },
  goldWrapper: {
    borderWidth: 2,
    borderColor: '#C8960E',
    overflow: 'hidden',
  },
  score: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tierLabel: {
    fontWeight: '600',
    marginBottom: 3,
    textAlign: 'center',
  },
});
