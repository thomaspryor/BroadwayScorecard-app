/**
 * BookmarkOverlay — poster-corner slot for top-right of poster cards.
 * Three states (web parity, ShowPageBookmark "4B"):
 *   rated       → gold ★ rating chip (display-only, replaces the bookmark)
 *   watchlisted → filled gold bookmark
 *   default     → outline bookmark
 */

import React, { memo } from 'react';
import { Pressable, StyleSheet, Platform, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

interface BookmarkOverlayProps {
  isWatchlisted: boolean;
  onToggle: () => void;
  /** Signed-in user's own star rating for this show; replaces the bookmark when set */
  myRating?: number | null;
}

export const BookmarkOverlay = memo(function BookmarkOverlay({ isWatchlisted, onToggle, myRating }: BookmarkOverlayProps) {
  const handlePress = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggle();
  };

  if (myRating !== null && myRating !== undefined) {
    return (
      <View style={[styles.container, styles.ratingChip]} testID="my-rating-chip" accessibilityLabel={`Your rating: ${myRating.toFixed(1)} stars`}>
        <Text style={styles.ratingStar}>★</Text>
        <Text style={styles.ratingText}>{myRating.toFixed(1)}</Text>
      </View>
    );
  }

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
    top: 1,
    right: 1,
    zIndex: 10,
    padding: 3,
    // Drop shadow for visibility on any poster
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6,
    shadowRadius: 2,
    elevation: 4,
  },
  ratingChip: {
    top: 4,
    right: 4,
    padding: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  ratingStar: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  ratingText: { color: '#FFD700', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
