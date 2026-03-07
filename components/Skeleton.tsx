/**
 * Skeleton loading components — shimmer placeholders.
 *
 * Uses react-native-reanimated for smooth pulse animation.
 * Drop-in replacements for content while loading.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing, FontSize } from '@/constants/theme';

// ── Base skeleton block with pulse animation ──

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 6, style }: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: Colors.surface.overlay,
        },
        style,
        animStyle,
      ]}
    />
  );
}

// ── Show detail page skeleton ──

export function ShowDetailSkeleton() {
  return (
    <View style={styles.container}>
      {/* Header card */}
      <View style={styles.headerCard}>
        {/* Poster + info row */}
        <View style={styles.headerRow}>
          <Skeleton width={100} height={150} borderRadius={BorderRadius.sm} />
          <View style={styles.headerInfo}>
            {/* Pills */}
            <View style={styles.pillRow}>
              <Skeleton width={70} height={22} borderRadius={BorderRadius.pill} />
              <Skeleton width={90} height={22} borderRadius={BorderRadius.pill} />
            </View>
            {/* Title */}
            <Skeleton width="90%" height={24} style={{ marginTop: 6 }} />
            {/* Venue */}
            <Skeleton width="60%" height={14} style={{ marginTop: 8 }} />
            {/* Date */}
            <Skeleton width="75%" height={14} style={{ marginTop: 6 }} />
          </View>
        </View>

        {/* Score row */}
        <View style={styles.scoreRow}>
          <Skeleton width={64} height={64} borderRadius={BorderRadius.md} />
          <View style={styles.scoreMeta}>
            <Skeleton width={120} height={18} />
            <Skeleton width={160} height={12} style={{ marginTop: 6 }} />
          </View>
        </View>

        {/* Breakdown bar */}
        <Skeleton width="100%" height={12} borderRadius={6} style={{ marginTop: 20 }} />
        <View style={styles.breakdownLabels}>
          <Skeleton width={80} height={10} />
          <Skeleton width={60} height={10} />
          <Skeleton width={70} height={10} />
        </View>
      </View>

      {/* Reviews section */}
      <View style={styles.section}>
        <Skeleton width={140} height={18} />
        {[0, 1, 2].map(i => (
          <View key={i} style={styles.reviewRow}>
            <View style={styles.reviewTopRow}>
              <Skeleton width={36} height={36} borderRadius={8} />
              <Skeleton width={20} height={20} borderRadius={4} />
              <Skeleton width={120} height={14} />
            </View>
            <View style={{ marginLeft: 48, marginTop: 6 }}>
              <Skeleton width="95%" height={14} />
              <Skeleton width="70%" height={14} style={{ marginTop: 4 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Show card skeleton (for browse/list pages) ──

export function ShowCardSkeleton() {
  return (
    <View style={styles.showCard}>
      <Skeleton width={48} height={64} borderRadius={BorderRadius.sm} />
      <View style={styles.showCardInfo}>
        <Skeleton width="75%" height={16} />
        <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={40} height={40} borderRadius={BorderRadius.sm} />
    </View>
  );
}

/** Multiple show card skeletons for browse page */
export function ShowListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }, (_, i) => (
        <ShowCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  headerCard: {
    backgroundColor: Colors.surface.raised,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  scoreMeta: {
    flex: 1,
    paddingTop: 4,
  },
  breakdownLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  reviewRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  // Show card skeleton
  showCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  showCardInfo: {
    flex: 1,
  },
  listContainer: {
    paddingTop: Spacing.sm,
  },
});
