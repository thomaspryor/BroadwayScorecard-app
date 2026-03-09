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
      testID="watchlist-button"
    >
      {loading ? (
        <ActivityIndicator size="small" color={isWatchlisted ? '#FFD700' : Colors.text.secondary} />
      ) : (
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path
            d="M5 2h14a1 1 0 0 1 1 1v19.143a.5.5 0 0 1-.766.424L12 18.03l-7.234 4.536A.5.5 0 0 1 4 22.143V3a1 1 0 0 1 1-1z"
            fill={isWatchlisted ? '#FFD700' : 'none'}
            stroke={isWatchlisted ? '#FFD700' : Colors.text.secondary}
            strokeWidth={1.5}
          />
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
