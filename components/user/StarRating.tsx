/**
 * Interactive star rating — 5 stars with half-star precision.
 *
 * Full rewrite for React Native (web version uses DOM events/CSS).
 * Reuses same SVG star path geometry from web.
 *
 * Mobile: tap = full star, "Make it X.5" button for half-stars.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Defs, ClipPath, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, withSequence, withTiming, useSharedValue } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface StarRatingProps {
  rating: number | null;
  onRatingChange: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readOnly?: boolean;
  hideLabel?: boolean;
}

const SIZE_MAP = {
  sm: { star: 20, gap: 2 },
  md: { star: 28, gap: 3 },
  lg: { star: 40, gap: 4 },
};

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
const GOLD = '#FFD700';
const EMPTY = '#6B7280';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Star({
  index,
  displayRating,
  starSize,
  readOnly,
  onPress,
}: {
  index: number;
  displayRating: number;
  starSize: number;
  readOnly: boolean;
  onPress: (index: number) => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (readOnly) return;
    scale.value = withSequence(
      withTiming(1.2, { duration: 80 }),
      withTiming(1, { duration: 120 }),
    );
    onPress(index);
  };

  const fillType = displayRating >= index ? 'full' : displayRating >= index - 0.5 ? 'half' : 'empty';

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={readOnly}
      style={[{ width: starSize, height: starSize }, animatedStyle]}
      accessibilityRole="button"
      accessibilityLabel={`${index} star${index !== 1 ? 's' : ''}`}
      testID={`star-${index}`}
    >
      {fillType === 'full' ? (
        <Svg width={starSize} height={starSize} viewBox="0 0 24 24">
          <Path d={STAR_PATH} fill={GOLD} />
        </Svg>
      ) : fillType === 'empty' ? (
        <Svg width={starSize} height={starSize} viewBox="0 0 24 24">
          <Path d={STAR_PATH} fill="none" stroke={EMPTY} strokeWidth={1.5} strokeLinejoin="round" />
        </Svg>
      ) : (
        // Half-filled: outline + gold left half using clipPath
        <Svg width={starSize} height={starSize} viewBox="0 0 24 24">
          <Defs>
            <ClipPath id={`half-${index}`}>
              <Rect x="0" y="0" width="12" height="24" />
            </ClipPath>
          </Defs>
          {/* Outline background */}
          <Path d={STAR_PATH} fill="none" stroke={EMPTY} strokeWidth={1.5} strokeLinejoin="round" />
          {/* Gold left half */}
          <Path d={STAR_PATH} fill={GOLD} clipPath={`url(#half-${index})`} />
        </Svg>
      )}
    </AnimatedPressable>
  );
}

export default function StarRating({
  rating,
  onRatingChange,
  size = 'md',
  readOnly = false,
  hideLabel = false,
}: StarRatingProps) {
  const [showHalfButton, setShowHalfButton] = useState(false);
  const [lastTappedStar, setLastTappedStar] = useState<number | null>(null);
  const { star: starSize, gap } = SIZE_MAP[size];

  const displayRating = rating ?? 0;

  const handleStarPress = useCallback(
    (starIndex: number) => {
      if (readOnly) return;
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onRatingChange(starIndex);
      setLastTappedStar(starIndex);
      setShowHalfButton(true);
    },
    [readOnly, onRatingChange],
  );

  const handleHalfStarPress = useCallback(() => {
    if (lastTappedStar !== null) {
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onRatingChange(lastTappedStar - 0.5);
      setShowHalfButton(false);
    }
  }, [lastTappedStar, onRatingChange]);

  return (
    <View>
      <View style={[styles.starsRow, { gap }]}>
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            index={i}
            displayRating={displayRating}
            starSize={starSize}
            readOnly={readOnly}
            onPress={handleStarPress}
          />
        ))}

        {/* Rating label */}
        {rating !== null && !hideLabel && (
          <Text
            style={[
              styles.label,
              size === 'sm' ? styles.labelSm : size === 'lg' ? styles.labelLg : styles.labelMd,
            ]}
          >
            {rating.toFixed(1)}
          </Text>
        )}
      </View>

      {/* Mobile half-star button */}
      {showHalfButton && !readOnly && lastTappedStar !== null && (
        <Pressable style={styles.halfButton} onPress={handleHalfStarPress}>
          <Text style={styles.halfButtonText}>
            Make it {(lastTappedStar - 0.5).toFixed(1)} ½
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    color: Colors.text.primary,
    fontWeight: '700',
    marginLeft: 4,
  },
  labelSm: { fontSize: FontSize.xs },
  labelMd: { fontSize: FontSize.sm },
  labelLg: { fontSize: FontSize.md },
  halfButton: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
  },
  halfButtonText: {
    color: '#fcd34d',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
