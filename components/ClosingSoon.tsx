/**
 * Closing Soon — urgency-driven horizontal section for homepage.
 *
 * Shows closing within 30 days with countdown badges.
 * Sorted by soonest closing date. Tapping navigates to show detail.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge } from '@/components/show-cards';
import { getQualifiedScore } from '@/lib/score-utils';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface ClosingSoonProps {
  shows: Show[];
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCountdown(days: number): string {
  if (days <= 0) return 'Final show';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days} days left`;
  const weeks = Math.floor(days / 7);
  // "wks" not "weeks": at 4-up card width the long form overflows the poster.
  return weeks === 1 ? '1 wk left' : `${weeks} wks left`;
}

function getUrgencyColor(days: number): string {
  if (days <= 7) return Colors.score.red;
  if (days <= 14) return Colors.score.amber;
  return Colors.text.muted;
}

export function ClosingSoon({ shows }: ClosingSoonProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  if (shows.length === 0) return null;

  // Same 4-up sizing as FeaturedCarousel — the fixed 140pt cards rendered this
  // shelf visibly larger than every other row (beta feedback 2026-08-04,
  // AFbmPX2: "Closing Soon's should be normal sized (four show per row)").
  const cardWidth = width >= 768 ? width * 0.2 : width * 0.225;
  const cardHeight = cardWidth * 1.5;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Closing Soon</Text>
        <View style={styles.urgencyDot} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {shows.map(show => {
          const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
          const days = show.closingDate ? daysUntil(show.closingDate) : 99;
          const urgencyColor = getUrgencyColor(days);

          return (
            <Pressable
              key={show.id}
              style={({ pressed }) => [{ width: cardWidth }, pressed && styles.pressed]}
              onPress={() => router.push(`/show/${show.slug}`)}
            >
              {/* Poster + overlays (wrapper so absolute overlays anchor to the
                  image, not the whole card) */}
              <View style={{ width: cardWidth }}>
                {posterUrl ? (
                  <Image source={{ uri: posterUrl }} style={[styles.poster, { height: cardHeight }]} contentFit="cover" transition={200} />
                ) : (
                  <View style={[styles.poster, { height: cardHeight }, styles.posterPlaceholder]}>
                    <Text style={styles.posterInitial}>{show.title.charAt(0)}</Text>
                  </View>
                )}

                {/* Countdown badge overlaid on poster */}
                <View style={[styles.countdownBadge, { backgroundColor: urgencyColor }]}>
                  <Text style={styles.countdownText}>{formatCountdown(days)}</Text>
                </View>

                {/* Score badge overlaid on the poster like every other shelf
                    (beta feedback 2026-07-25: it sat below the image here) */}
                <View style={styles.scoreOverlay}>
                  <ScoreBadge score={getQualifiedScore(show)} category={show.category} size="poster" />
                </View>
              </View>

              {/* Title + closing date */}
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={2}>{show.title}</Text>
                {show.closingDate && (
                  <Text style={styles.closingDate}>
                    Closes {new Date(show.closingDate + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  urgencyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.score.red,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  poster: {
    width: '100%',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterInitial: {
    color: Colors.text.muted,
    fontSize: 32,
    fontWeight: '600',
  },
  countdownBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    // Tight padding: at 4-up width "7 days left" barely clears the poster.
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  countdownText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardInfo: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    lineHeight: 18,
  },
  scoreOverlay: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
  },
  closingDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
