import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MiniStars from '@/components/user/MiniStars';
import { getImageUrl } from '@/lib/images';
import { Colors } from '@/constants/theme';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';
import { Poster } from './Poster';

interface Props {
  review: UserReview;
  show: Show | undefined;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
}

export function WatchedGridPoster({ review, show, width, onPress, onLongPress }: Props) {
  const title = show?.title || review.show_id;
  const posterUrl = show?.images
    ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail)
    : null;

  return (
    <View style={[styles.wrap, { width }]}>
      <Poster
        posterUrl={posterUrl}
        title={title}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        {review.rating > 0 ? (
          <View style={styles.starOverlay} pointerEvents="none">
            <MiniStars rating={review.rating} />
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
  starOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    alignItems: 'center',
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
