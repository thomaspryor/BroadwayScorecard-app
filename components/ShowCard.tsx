/**
 * ShowCard — main list row for show browsing.
 * Layout: [Image] [Title + Venue + Pills + Meta] [Score + Audience]
 *
 * Matches website's show card layout with:
 * - Square image (80x80)
 * - Pills: FormatPill, ProductionPill, StatusBadge, CategoryBadge
 * - Duration + closing info
 * - Tier label above score badge
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge, StatusBadge, FormatPill, ProductionPill, CategoryBadge, AudienceChip } from '@/components/show-cards';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/theme';
import type { ScoreMode } from '@/components/ScoreToggle';

interface ShowCardProps {
  show: Show;
  scoreMode?: ScoreMode;
  hideStatus?: boolean;
}

const MARKET_LABELS: Record<string, string> = {
  'broadway': 'on Broadway',
  'off-broadway': 'Off-Broadway',
  'west-end': 'in the West End',
};

function getRunDuration(openingDate: string | null, status: string, category: string): string | null {
  if (!openingDate || status !== 'open') return null;
  const open = new Date(openingDate);
  if (isNaN(open.getTime())) return null;

  const suffix = MARKET_LABELS[category] ?? 'on Broadway';
  const now = new Date();
  const totalMonths = Math.max(1, Math.round((now.getTime() - open.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
  if (totalMonths >= 24) {
    const years = Math.floor(totalMonths / 12);
    return `${years} years ${suffix}`;
  }
  if (totalMonths >= 12) {
    const years = Math.floor(totalMonths / 12);
    const rem = totalMonths % 12;
    return rem > 0 ? `${years} year${years > 1 ? 's' : ''}, ${rem} mo ${suffix}` : `${years} year ${suffix}`;
  }
  return `${totalMonths} mo ${suffix}`;
}

function getClosingInfo(closingDate: string | null, status: string): string | null {
  if (!closingDate) return null;
  const close = new Date(closingDate);
  if (isNaN(close.getTime())) return null;
  const fmt = close.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  if (status === 'closed') {
    return `Closed ${fmt}`;
  }
  // Open or previews with a closing date = closing soon
  const now = new Date();
  if (close > now) {
    return `Closes ${fmt}`;
  }
  return null;
}

export const ShowCard = memo(function ShowCard({ show, scoreMode = 'critics', hideStatus = false }: ShowCardProps) {
  const router = useRouter();
  const imageUrl = getImageUrl(show.images.poster ?? show.images.thumbnail);
  const runInfo = useMemo(
    () => getRunDuration(show.openingDate, show.status, show.category),
    [show.openingDate, show.status, show.category]
  );
  const closingInfo = useMemo(
    () => getClosingInfo(show.closingDate, show.status),
    [show.closingDate, show.status]
  );

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => router.push(`/show/${show.slug}`)}
    >
      {/* Square image */}
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.showImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.showImage, styles.placeholderThumb]}>
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
          <FormatPill type={show.type} />
          <ProductionPill isRevival={show.isRevival} />
          {!hideStatus && <StatusBadge status={show.status} />}
          <CategoryBadge category={show.category} />
        </View>
        {runInfo && (
          <Text style={styles.metaText} numberOfLines={1}>{runInfo}</Text>
        )}
        {closingInfo && (
          <Text style={[styles.metaText, closingInfo.startsWith('Closes') && styles.closingText]} numberOfLines={1}>
            {closingInfo}
          </Text>
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
  imageContainer: {
    marginRight: Spacing.md,
  },
  showImage: {
    width: 72,
    height: 96,
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
    fontSize: FontSize.lg,
    fontWeight: '700',
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
  closingText: {
    color: Colors.score.amber,
  },
  scoreColumn: {
    alignItems: 'center',
    gap: 6,
  },
  audienceGradeBadge: {
    width: 56,
    height: 56,
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
