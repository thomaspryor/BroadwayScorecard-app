/**
 * Animated wrapper for list items — fades in + slides up on mount.
 * Staggered by index for a cascade effect in FlatLists.
 */

import React, { useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated';

interface AnimatedListItemProps {
  index: number;
  children: React.ReactNode;
}

const STAGGER_MS = 50;
const DURATION_MS = 350;

export function AnimatedListItem({ index, children }: AnimatedListItemProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    const delay = Math.min(index * STAGGER_MS, 500); // cap at 500ms total delay
    opacity.value = withDelay(delay, withTiming(1, { duration: DURATION_MS, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration: DURATION_MS, easing: Easing.out(Easing.cubic) }));
  }, [index, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      {children}
    </Animated.View>
  );
}
