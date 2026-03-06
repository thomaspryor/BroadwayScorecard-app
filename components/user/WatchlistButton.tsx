/**
 * Watchlist toggle button — pill-shaped.
 *
 * Unchecked: gray outline + "+" icon
 * Checked: gold tint + checkmark icon
 */

import React from 'react';
import { Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface WatchlistButtonProps {
  isWatchlisted: boolean;
  onToggle: () => void;
  loading?: boolean;
}

export default function WatchlistButton({ isWatchlisted, onToggle, loading = false }: WatchlistButtonProps) {
  const handlePress = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onToggle();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={({ pressed }) => [
        styles.button,
        isWatchlisted ? styles.buttonActive : styles.buttonInactive,
        loading && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isWatchlisted ? '#FFD700' : Colors.text.secondary} />
      ) : isWatchlisted ? (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="#FFD700">
          <Path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </Svg>
      ) : (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2.5}>
          <Path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </Svg>
      )}
      <Text style={[styles.label, isWatchlisted ? styles.labelActive : styles.labelInactive]}>
        {isWatchlisted ? 'Watchlisted' : 'Watchlist'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  buttonActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  buttonInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  labelActive: {
    color: '#FFD700',
  },
  labelInactive: {
    color: Colors.text.secondary,
  },
});
