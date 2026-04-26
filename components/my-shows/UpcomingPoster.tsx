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

function formatDay(planned: string | null): { weekday: string; date: string } | null {
  if (!planned) return null;
  const d = new Date(planned + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(),
  };
}

export function UpcomingPoster({ watchlistEntry, show, width, onPress }: Props) {
  const title = show?.title || watchlistEntry.show_id;
  const posterUrl = show?.images
    ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)
    : null;
  const formatted = formatDay(watchlistEntry.planned_date);

  return (
    <View style={[styles.wrap, { width }]}>
      <Poster posterUrl={posterUrl} title={title} onPress={onPress}>
        {formatted ? (
          <View style={styles.pillWrap} pointerEvents="none">
            <Text style={styles.weekday}>{formatted.weekday}</Text>
            <Text style={styles.date}>{formatted.date}</Text>
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
  pillWrap: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 20, 0.85)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  weekday: {
    color: Colors.brand,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 11,
  },
  date: {
    color: Colors.text.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 13,
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
