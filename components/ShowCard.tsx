/**
 * ShowCard — main list row for show browsing.
 * Layout: [Thumbnail] [Title + Venue + Pills] [ScoreBadge]
 *
 * Tapping navigates to the show detail page.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge, StatusBadge, FormatPill, AudienceChip } from '@/components/show-cards';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/theme';

interface ShowCardProps {
  show: Show;
}

export const ShowCard = memo(function ShowCard({ show }: ShowCardProps) {
  const router = useRouter();
  const thumbnailUrl = getImageUrl(show.images.thumbnail);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => router.push(`/show/${show.slug}`)}
    >
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.thumbnail}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumb]}>
            <Text style={styles.placeholderText}>
              {show.title.charAt(0)}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {show.title}
        </Text>
        <Text style={styles.venue} numberOfLines={1}>
          {show.venue}
        </Text>
        <View style={styles.pills}>
          <StatusBadge status={show.status} />
          <FormatPill type={show.type} />
          {show.audienceGrade && (
            <AudienceChip
              grade={show.audienceGrade.grade}
              color={show.audienceGrade.color}
            />
          )}
        </View>
      </View>

      {/* Score */}
      <View style={styles.scoreContainer}>
        <ScoreBadge score={show.compositeScore} size="medium" />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  pressed: {
    opacity: 0.7,
  },
  thumbnailContainer: {
    marginRight: Spacing.md,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
  },
  placeholderThumb: {
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: FontSize.xl,
    fontWeight: '600',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  venue: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 2,
  },
  scoreContainer: {
    marginLeft: Spacing.md,
  },
});
