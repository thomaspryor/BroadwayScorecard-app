import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getImageUrl } from '@/lib/images';
import { Colors } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { WatchlistEntry } from '@/lib/user-types';
import { Poster } from './Poster';

interface Props {
  watchlistEntry: WatchlistEntry;
  show: Show | undefined;
  width: number;
  onPress: () => void;
}

function formatDateChip(planned: string | null): string {
  if (!planned) return 'RATE';
  const d = new Date(planned + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 'RATE';
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

export function ToBeRatedPoster({ watchlistEntry, show, width, onPress }: Props) {
  const title = show?.title || watchlistEntry.show_id;
  const posterUrl = show?.images
    ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)
    : null;

  return (
    <View style={[styles.wrap, { width }]}>
      <Poster posterUrl={posterUrl} title={title} onPress={onPress}>
        <View style={styles.chipWrap} pointerEvents="none">
          <Text style={styles.chipText}>{formatDateChip(watchlistEntry.planned_date)}</Text>
        </View>
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
  chipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: 'center',
  },
  chipText: {
    color: '#0f0f14',
    backgroundColor: '#fbbf24',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    overflow: 'hidden',
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
