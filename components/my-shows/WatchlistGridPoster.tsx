import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getImageUrl } from '@/lib/images';
import { Colors } from '@/constants/theme';
import {
  daysUntilClosing,
  formatClosingShort,
  getClosingUrgencyColor,
} from '@/lib/show-utils';
import type { Show } from '@/lib/types';
import type { WatchlistEntry } from '@/lib/user-types';
import { Poster } from './Poster';

interface Props {
  watchlistEntry: WatchlistEntry;
  show: Show | undefined;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
}

export function WatchlistGridPoster({
  watchlistEntry,
  show,
  width,
  onPress,
  onLongPress,
}: Props) {
  const title = show?.title || watchlistEntry.show_id;
  const posterUrl = show?.images
    ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)
    : null;

  const days = daysUntilClosing(show);
  const showClosingBadge = days !== null && days > 0 && days < 30;
  const badgeColor = days !== null ? getClosingUrgencyColor(days) : Colors.score.red;
  const closingLabel = formatClosingShort(show);

  return (
    <View style={[styles.wrap, { width }]}>
      <Poster
        posterUrl={posterUrl}
        title={title}
        onPress={onPress}
        onLongPress={onLongPress}
        showGradient={false}
      >
        {showClosingBadge && closingLabel ? (
          <View
            style={[styles.badge, { backgroundColor: badgeColor }]}
            pointerEvents="none"
          >
            <Text style={styles.badgeText}>CLOSES {closingLabel.toUpperCase()}</Text>
          </View>
        ) : null}
      </Poster>
      <Text style={styles.caption} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  caption: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 6,
    width: '100%',
  },
});
