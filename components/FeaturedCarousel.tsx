/**
 * Featured carousel — horizontal scrolling poster cards.
 * Shows top 10 currently-open shows by compositeScore.
 */

import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const CARD_WIDTH = Dimensions.get('window').width * 0.42;
const CARD_HEIGHT = CARD_WIDTH * 1.35;

interface FeaturedCarouselProps {
  shows: Show[];
}

function FeaturedCard({ show }: { show: Show }) {
  const router = useRouter();
  const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
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
  if (shows.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Top Shows</Text>
      <FlatList
        horizontal
        data={shows}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <FeaturedCard show={item} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={CARD_WIDTH + Spacing.md}
        decelerationRate="fast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
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
