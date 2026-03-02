/**
 * ShowCard — main list row for show browsing.
 * Layout: [Thumbnail] [Title + Venue + Pills + Meta] [Score + Audience]
 *
 * Supports critics and audience score modes.
 * Tapping navigates to the show detail page.
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge, StatusBadge, FormatPill, AudienceChip } from '@/components/show-cards';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/theme';
import type { ScoreMode } from '@/components/ScoreToggle';

interface ShowCardProps {
  show: Show;
  scoreMode?: ScoreMode;
}

function getRunDuration(openingDate: string | null, closingDate: string | null, status: string): string | null {
  if (!openingDate) return null;
  const open = new Date(openingDate);
  if (isNaN(open.getTime())) return null;

  if (status === 'closed' && closingDate) {
    const close = new Date(closingDate);
    if (!isNaN(close.getTime())) {
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return `${fmt(open)} – ${fmt(close)}`;
    }
  }

  // Open show: "X months on Broadway"
  if (status === 'open') {
    const now = new Date();
    const months = Math.max(1, Math.round((now.getTime() - open.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    if (months >= 12) {
      const years = Math.floor(months / 12);
      const rem = months % 12;
      return rem > 0 ? `${years}y ${rem}mo on Broadway` : `${years}y on Broadway`;
    }
    return `${months} mo on Broadway`;
  }

  return null;
}

export const ShowCard = memo(function ShowCard({ show, scoreMode = 'critics' }: ShowCardProps) {
  const router = useRouter();
  const thumbnailUrl = getImageUrl(show.images.thumbnail);
  const runInfo = useMemo(
    () => getRunDuration(show.openingDate, show.closingDate, show.status),
    [show.openingDate, show.closingDate, show.status]
  );

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
        </View>
        {runInfo && (
          <Text style={styles.metaText} numberOfLines={1}>{runInfo}</Text>
        )}
      </View>

      {/* Score column — critic badge + audience grade below */}
      {scoreMode === 'audience' && show.audienceGrade ? (
        <View style={styles.scoreColumn}>
          <View style={[styles.audienceGradeBadge, { backgroundColor: show.audienceGrade.color }]}>
            <Text style={styles.audienceGradeText}>{show.audienceGrade.grade}</Text>
          </View>
          <Text style={[styles.audienceGradeLabel, { color: show.audienceGrade.color }]} numberOfLines={1}>
            {show.audienceGrade.label}
          </Text>
        </View>
      ) : (
        <View style={styles.scoreColumn}>
          <ScoreBadge score={show.compositeScore} size="medium" showLabel />
          {show.audienceGrade && (
            <AudienceChip
              grade={show.audienceGrade.grade}
              color={show.audienceGrade.color}
            />
          )}
        </View>
      )}
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
  metaText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  scoreColumn: {
    alignItems: 'center',
    gap: 6,
  },
  audienceGradeBadge: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audienceGradeText: {
    color: '#ffffff',
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  audienceGradeLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
});
