/**
 * Featured carousel — horizontal scrolling poster cards.
 * Responsive sizing via useWindowDimensions.
 */

import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface FeaturedCarouselProps {
  shows: Show[];
}

function FeaturedCard({ show, cardWidth }: { show: Show; cardWidth: number }) {
  const router = useRouter();
  const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
  const cardHeight = cardWidth * 1.35;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { width: cardWidth, height: cardHeight },
        pressed && styles.cardPressed,
      ]}
      onPress={() => router.push(`/show/${show.slug}`)}
    >
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

      {/* Score overlay */}
      <View style={styles.scoreOverlay}>
        <ScoreBadge score={show.compositeScore} size="small" />
      </View>

      {/* Title overlay */}
      <View style={styles.titleOverlay}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {show.title}
        </Text>
      </View>
    </Pressable>
  );
}

export function FeaturedCarousel({ shows }: FeaturedCarouselProps) {
  const { width } = useWindowDimensions();
  if (shows.length === 0) return null;

  // Responsive: show more cards on wider screens
  const cardWidth = width >= 768 ? width * 0.25 : width * 0.42;

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={shows}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <FeaturedCard show={item} cardWidth={cardWidth} />}
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
  card: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginRight: Spacing.md,
    backgroundColor: Colors.surface.raised,
  },
  cardPressed: {
    opacity: 0.85,
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
    top: Spacing.sm,
    right: Spacing.sm,
  },
  titleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
