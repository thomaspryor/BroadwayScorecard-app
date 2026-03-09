/**
 * Featured carousel — horizontal scrolling poster cards.
 * Responsive sizing via useWindowDimensions.
 */

import React, { memo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge } from '@/components/show-cards';
import { BookmarkOverlay } from '@/components/BookmarkOverlay';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface FeaturedCarouselProps {
  shows: Show[];
  watchlistSet?: Set<string>;
  onToggleWatchlist?: (showId: string) => void;
}

const FeaturedCard = memo(function FeaturedCard({ show, cardWidth, isWatchlisted, onToggle }: { show: Show; cardWidth: number; isWatchlisted?: boolean; onToggle?: () => void }) {
  const router = useRouter();
  const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
  const cardHeight = cardWidth * 1.5;

  return (
    <Pressable
      style={({ pressed }) => [
        { width: cardWidth },
        styles.cardWrapper,
        pressed && styles.cardPressed,
      ]}
      onPress={() => router.push(`/show/${show.slug}`)}
    >
      {/* Image container with bookmark top-right + score badge bottom-right */}
      <View style={[styles.imageContainer, { height: cardHeight }]}>
        {isWatchlisted !== undefined && onToggle && (
          <BookmarkOverlay isWatchlisted={isWatchlisted} onToggle={onToggle} />
        )}
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            style={styles.poster}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.poster, styles.placeholderPoster]}>
            <Text style={styles.placeholderText}>{show.title.charAt(0)}</Text>
          </View>
        )}

        {/* Score badge — bottom-right, overlapping the image edge */}
        <View style={styles.scoreOverlay}>
          <ScoreBadge score={show.compositeScore} size="small" />
        </View>
      </View>

      {/* Title below image */}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {show.title}
      </Text>
    </Pressable>
  );
});

export function FeaturedCarousel({ shows, watchlistSet, onToggleWatchlist }: FeaturedCarouselProps) {
  const { width } = useWindowDimensions();
  if (shows.length === 0) return null;

  // Responsive: show more cards on wider screens (website uses ~112px on mobile)
  const cardWidth = width >= 768 ? width * 0.2 : width * 0.3;

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={shows}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <FeaturedCard
            show={item}
            cardWidth={cardWidth}
            isWatchlisted={watchlistSet?.has(item.id)}
            onToggle={onToggleWatchlist ? () => onToggleWatchlist(item.id) : undefined}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={cardWidth + Spacing.md}
        decelerationRate="fast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  cardWrapper: {
    marginRight: Spacing.md,
  },
  cardPressed: {
    opacity: 0.85,
  },
  imageContainer: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface.raised,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  placeholderPoster: {
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: FontSize.title,
    fontWeight: '600',
  },
  scoreOverlay: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
});
