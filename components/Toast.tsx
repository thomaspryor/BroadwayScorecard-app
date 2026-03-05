/**
 * Toast notification UI — animated banner that slides from top.
 *
 * Renders at the app level, reads from ToastContext.
 * Tappable when linkRoute is provided (navigates via expo-router).
 */

import React, { useEffect } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useToastSafe, type ToastType } from '@/lib/toast-context';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const TYPE_COLORS: Record<ToastType, string> = {
  success: Colors.score.gold,
  error: Colors.score.red,
  info: Colors.text.secondary,
};

export default function Toast() {
  const { toast, dismissToast } = useToastSafe();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (toast) {
      translateY.value = withTiming(0, { duration: 250 });
      opacity.value = withTiming(1, { duration: 250 });

      // Auto-dismiss animation
      translateY.value = withDelay(
        2700,
        withTiming(-100, { duration: 300 }, finished => {
          if (finished) runOnJS(dismissToast)();
        }),
      );
      opacity.value = withDelay(2700, withTiming(0, { duration: 300 }));
    } else {
      translateY.value = -100;
      opacity.value = 0;
    }
  }, [toast?.id]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!toast) return null;

  const borderColor = TYPE_COLORS[toast.type];

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.xs },
        { borderLeftColor: borderColor },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.inner}
        onPress={() => {
          if (toast.linkRoute) {
            router.push(toast.linkRoute as never);
          }
          dismissToast();
        }}
      >
        <Text style={styles.text} numberOfLines={2}>
          {toast.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
    borderLeftWidth: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.raised,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  inner: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  text: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
});
