/**
 * Interactive star rating — 5 stars with half-star precision.
 *
 * Supports both tap (full star) and horizontal drag for half-star precision.
 * Dragging across the star row snaps to 0.5 increments based on finger position.
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Defs, ClipPath, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, withSequence, withTiming, useSharedValue } from 'react-native-reanimated';
import { Colors, FontSize } from '@/constants/theme';

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
        <Svg width={starSize} height={starSize} viewBox="0 0 24 24">
          <Defs>
            <ClipPath id={`half-${index}`}>
              <Rect x="0" y="0" width="12" height="24" />
            </ClipPath>
          </Defs>
          <Path d={STAR_PATH} fill="none" stroke={EMPTY} strokeWidth={1.5} strokeLinejoin="round" />
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
  const { star: starSize, gap } = SIZE_MAP[size];
  const rowLayoutRef = useRef({ x: 0, width: 0 });
  const lastHapticRating = useRef<number | null>(null);
  const [dragRating, setDragRating] = useState<number | null>(null);
  const isDragging = useRef(false);

  const displayRating = dragRating ?? rating ?? 0;

  const handleStarPress = useCallback(
    (starIndex: number) => {
      if (readOnly) return;
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      // If tapping same full star that's already selected, toggle to half
      if (rating === starIndex) {
        onRatingChange(starIndex - 0.5);
      } else if (rating === starIndex - 0.5) {
        // If tapping the half-star that's already selected, go back to full
        onRatingChange(starIndex);
      } else {
        onRatingChange(starIndex);
      }
    },
    [readOnly, onRatingChange, rating],
  );

  // Calculate rating from touch X position relative to star row
  const getRatingFromX = useCallback(
    (pageX: number): number => {
      const { x: rowX, width: rowWidth } = rowLayoutRef.current;
      const relX = pageX - rowX;
      const totalStarWidth = starSize * 5 + gap * 4;
      const clampedX = Math.max(0, Math.min(relX, totalStarWidth));

      // Which star are we over? Each star unit = starSize + gap (except last has no trailing gap)
      const unitWidth = starSize + gap;
      const starFloat = clampedX / unitWidth;
      const starIndex = Math.floor(starFloat);
      const withinStar = (clampedX - starIndex * unitWidth) / starSize;

      if (starIndex >= 5) return 5;
      if (withinStar <= 0.5) return starIndex + 0.5;
      return starIndex + 1;
    },
    [starSize, gap],
  );

  const handleRowLayout = useCallback((e: LayoutChangeEvent) => {
    e.target.measureInWindow((x: number) => {
      rowLayoutRef.current = { x, width: e.nativeEvent.layout.width };
    });
  }, []);

  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (readOnly) return;
      isDragging.current = false;
      lastHapticRating.current = null;
    },
    [readOnly],
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (readOnly) return;
      isDragging.current = true;
      const newRating = getRatingFromX(e.nativeEvent.pageX);
      setDragRating(newRating);

      // Haptic on each new half-star increment
      if (lastHapticRating.current !== newRating && Platform.OS === 'ios') {
        Haptics.selectionAsync();
        lastHapticRating.current = newRating;
      }
    },
    [readOnly, getRatingFromX],
  );

  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      if (readOnly) return;
      if (isDragging.current && dragRating !== null) {
        onRatingChange(dragRating);
        if (Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
      setDragRating(null);
      isDragging.current = false;
    },
    [readOnly, dragRating, onRatingChange],
  );

  return (
    <View>
      <View
        style={[styles.starsRow, { gap }]}
        onLayout={handleRowLayout}
        onStartShouldSetResponder={() => !readOnly}
        onMoveShouldSetResponder={() => !readOnly}
        onResponderStart={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
      >
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
        {(rating !== null || dragRating !== null) && !hideLabel && (
          <Text
            style={[
              styles.label,
              size === 'sm' ? styles.labelSm : size === 'lg' ? styles.labelLg : styles.labelMd,
            ]}
          >
            {displayRating.toFixed(1)}
          </Text>
        )}
      </View>
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
});
