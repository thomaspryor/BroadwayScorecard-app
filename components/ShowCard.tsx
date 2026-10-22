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
import { getContrastTextColor, getFormatInfo, getQualifiedScore, isScoreTBD } from '@/lib/score-utils';
import { getClosingInfo, getRunDuration } from '@/lib/run-info';
import { BookmarkOverlay } from '@/components/BookmarkOverlay';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/theme';
import type { ScoreMode } from '@/components/ScoreToggle';

interface ShowCardProps {
  show: Show;
  scoreMode?: ScoreMode;
  hideStatus?: boolean;
  isWatchlisted?: boolean;
  onToggleWatchlist?: () => void;
  /** Signed-in user's own rating; shows a ★ chip instead of the bookmark */
  myRating?: number | null;
  /** E2E hook only — no visual effect. Lets a flow tap a specific row (e.g. the first result) without matching on title text. */
  testID?: string;
}

export const ShowCard = memo(function ShowCard({ show, scoreMode = 'critics', hideStatus = false, isWatchlisted, onToggleWatchlist, myRating, testID }: ShowCardProps) {
  const router = useRouter();
  const imageUrl = getImageUrl(show.images.poster ?? show.images.thumbnail);
  // Web ScoreBadge: previews/upcoming and below-the-gate shows read TBD.
  const displayScore = isScoreTBD(show) ? null : getQualifiedScore(show);
  const scoreText = displayScore != null ? `Score ${Math.round(displayScore)}` : 'Score to be determined';
  const formatWord = getFormatInfo(show.type).label.toLowerCase();
  const accessLabel = `${show.title}, ${show.venue || 'Unknown venue'}, ${formatWord}, ${scoreText}`;
  // Run length and closing month: shared rules in lib/run-info.ts (market
  // suffix from the web's getDurationSuffix; dates parsed at local noon).
  const runInfo = useMemo(
    () => getRunDuration(show.openingDate, show.status, show.category, show.venue),
    [show.openingDate, show.status, show.category, show.venue]
  );
  const closingInfo = useMemo(
    () => getClosingInfo(show.closingDate, show.status),
    [show.closingDate, show.status]
  );

  return (
    <Pressable
      testID={testID}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => router.push(`/show/${show.slug}`)}
      accessibilityLabel={accessLabel}
      accessibilityRole="button"
    >
      {/* Square image with bookmark overlay */}
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.showImage}
            contentFit="cover"
            transition={200}
            accessibilityLabel={`${show.title} poster`}
          />
        ) : (
          <View style={[styles.showImage, styles.placeholderThumb]}>
            <Text style={styles.placeholderText}>🎭</Text>
          </View>
        )}
        {/* Bookmark — rendered AFTER image so it's on top (z-order) */}
        {isWatchlisted !== undefined && onToggleWatchlist && (
          <BookmarkOverlay isWatchlisted={isWatchlisted} onToggle={onToggleWatchlist} myRating={myRating} />
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
            <Text style={[styles.audienceGradeText, { color: getContrastTextColor(show.audienceGrade.color) }]}>{show.audienceGrade.grade}</Text>
          </View>
          <Text style={[styles.audienceGradeLabel, { color: show.audienceGrade.color }]} numberOfLines={1}>
            {show.audienceGrade.label}
          </Text>
        </View>
      ) : (
        <View style={styles.scoreColumn}>
          <ScoreBadge score={displayScore} category={show.category} size="medium" showLabel />
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
    // Fixed width so badges line up down the list — a wide tier label
    // ("CRITICAL MISS") must not widen the column and shift its badge
    // relative to neighboring cards (beta feedback 2026-08-02).
    // 80 = the 56pt badge + 12pt each side, and just wide enough for the
    // audience chip at its compact size. 84 left visible dead space beside the
    // badge; 72 was too tight for the chip (sim check 2026-08-03).
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  audienceGradeLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
});
