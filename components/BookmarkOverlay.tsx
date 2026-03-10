/**
 * BookmarkOverlay — subtle bookmark icon for top-right of poster cards.
 * Gold (#FFD700) when watchlisted, semi-transparent when not.
 * Shows filled bookmark if watchlisted, outline if not.
 */

import React, { memo } from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

interface BookmarkOverlayProps {
  isWatchlisted: boolean;
  onToggle: () => void;
}

export const BookmarkOverlay = memo(function BookmarkOverlay({ isWatchlisted, onToggle }: BookmarkOverlayProps) {
  const handlePress = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggle();
  };

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      hitSlop={8}
      testID="bookmark-overlay"
      accessibilityLabel={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d="M5 2h14a1 1 0 0 1 1 1v19.143a.5.5 0 0 1-.766.424L12 18.03l-7.234 4.536A.5.5 0 0 1 4 22.143V3a1 1 0 0 1 1-1z"
          fill={isWatchlisted ? '#FFD700' : 'rgba(0,0,0,0.35)'}
          stroke={isWatchlisted ? '#FFD700' : 'rgba(255,255,255,0.85)'}
          strokeWidth={1.5}
        />
      </Svg>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 10,
    padding: 6,
    // Drop shadow for visibility on any poster
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 2,
    elevation: 4,
  },
});
