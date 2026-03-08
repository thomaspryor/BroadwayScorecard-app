/**
 * Closing Soon — urgency-driven horizontal section for homepage.
 *
 * Shows closing within 30 days with countdown badges.
 * Sorted by soonest closing date. Tapping navigates to show detail.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Show } from '@/lib/types';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge } from '@/components/show-cards';
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
  return weeks === 1 ? '1 week left' : `${weeks} weeks left`;
}

function getUrgencyColor(days: number): string {
  if (days <= 7) return Colors.score.red;
  if (days <= 14) return Colors.score.amber;
  return Colors.text.muted;
}

export function ClosingSoon({ shows }: ClosingSoonProps) {
  const router = useRouter();

  if (shows.length === 0) return null;

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
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() => router.push(`/show/${show.slug}`)}
            >
              {/* Poster */}
              {posterUrl ? (
                <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text style={styles.posterInitial}>{show.title.charAt(0)}</Text>
                </View>
              )}

              {/* Countdown badge overlaid on poster */}
              <View style={[styles.countdownBadge, { backgroundColor: urgencyColor }]}>
                <Text style={styles.countdownText}>{formatCountdown(days)}</Text>
              </View>

              {/* Title + score */}
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={2}>{show.title}</Text>
                <View style={styles.scoreRow}>
                  <ScoreBadge score={show.compositeScore} size="small" />
                  {show.closingDate && (
                    <Text style={[styles.closingDate, { color: urgencyColor }]}>
                      {new Date(show.closingDate + 'T12:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </Text>
                  )}
                </View>
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
  card: {
    width: 140,
  },
  pressed: {
    opacity: 0.7,
  },
  poster: {
    width: 140,
    height: 200,
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
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  countdownText: {
    color: '#ffffff',
    fontSize: 11,
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closingDate: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
