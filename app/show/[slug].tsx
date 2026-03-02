/**
 * Show detail page — full info for a single show.
 * Navigated to from ShowCard via push.
 *
 * Sprint 2 will add: poster header, creative team, ticket links, synopsis.
 * This is the MVP version with key info.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useShows } from '@/lib/data-context';
import { getImageUrl } from '@/lib/images';
import { getScoreTier } from '@/lib/score-utils';
import { ScoreBadge, StatusBadge, FormatPill, AudienceChip } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function ShowDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { shows } = useShows();

  const show = useMemo(() => shows.find(s => s.slug === slug), [shows, slug]);

  if (!show) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>Show not found</Text>
      </View>
    );
  }

  const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
  const tier = getScoreTier(show.compositeScore);

  return (
    <>
      <Stack.Screen options={{ title: show.title }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Poster */}
        {posterUrl && (
          <Image
            source={{ uri: posterUrl }}
            style={styles.poster}
            contentFit="cover"
            transition={300}
          />
        )}

        {/* Title + Score section */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <View style={styles.titleInfo}>
              <Text style={styles.title}>{show.title}</Text>
              <Text style={styles.venue}>{show.venue}</Text>
              <View style={styles.pills}>
                <StatusBadge status={show.status} />
                <FormatPill type={show.type} />
                {show.isRevival && (
                  <View style={styles.revivalPill}>
                    <Text style={styles.revivalText}>REVIVAL</Text>
                  </View>
                )}
              </View>
            </View>
            <ScoreBadge score={show.compositeScore} size="large" />
          </View>

          {/* Score details */}
          {show.criticScore && (
            <View style={styles.scoreDetails}>
              <Text style={[styles.tierLabel, { color: tier?.color ?? Colors.text.muted }]}>
                {show.criticScore.label}
              </Text>
              <Text style={styles.reviewCount}>
                Based on {show.criticScore.reviewCount} critic reviews
                {show.criticScore.tier1Count > 0 && ` (${show.criticScore.tier1Count} top-tier)`}
              </Text>
            </View>
          )}

          {/* Audience grade */}
          {show.audienceGrade && (
            <View style={styles.audienceSection}>
              <AudienceChip
                grade={show.audienceGrade.grade}
                color={show.audienceGrade.color}
              />
              <Text style={styles.audienceLabel}>{show.audienceGrade.label}</Text>
            </View>
          )}
        </View>

        {/* Show info */}
        <View style={styles.infoSection}>
          {show.openingDate && (
            <InfoRow label="Opening" value={formatDate(show.openingDate)} />
          )}
          {show.closingDate && (
            <InfoRow label="Closing" value={formatDate(show.closingDate)} />
          )}
          {show.runtime && <InfoRow label="Runtime" value={show.runtime} />}
          {show.ageRecommendation && (
            <InfoRow label="Ages" value={show.ageRecommendation} />
          )}
          {show.category !== 'broadway' && (
            <InfoRow label="Category" value={show.category.replace('-', ' ').toUpperCase()} />
          )}
        </View>

        {/* Synopsis */}
        {show.synopsis && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.synopsis}>{show.synopsis}</Text>
          </View>
        )}

        {/* Creative Team */}
        {show.creativeTeam.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Creative Team</Text>
            {show.creativeTeam.map((member, i) => (
              <View key={i} style={styles.creditRow}>
                <Text style={styles.creditRole}>{member.role}</Text>
                <Text style={styles.creditName}>{member.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Ticket Links */}
        {show.ticketLinks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tickets</Text>
            {show.ticketLinks.map((link, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.ticketButton, pressed && styles.pressed]}
                onPress={() => WebBrowser.openBrowserAsync(link.url)}
              >
                <Text style={styles.ticketText}>Buy on {link.platform}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Footer link */}
        <Pressable
          style={({ pressed }) => [styles.webLink, pressed && styles.pressed]}
          onPress={() =>
            WebBrowser.openBrowserAsync(
              `https://broadwayscorecard.com/show/${show.slug}`
            )
          }
        >
          <Text style={styles.webLinkText}>View on broadwayscorecard.com</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  content: {
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: Colors.text.muted,
    fontSize: FontSize.lg,
  },
  poster: {
    width: '100%',
    height: 280,
  },
  titleSection: {
    padding: Spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  venue: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    marginTop: 4,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  revivalPill: {
    backgroundColor: Colors.score.amber + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  revivalText: {
    color: Colors.score.amber,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  scoreDetails: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  tierLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  reviewCount: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 4,
  },
  audienceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  audienceLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
  },
  infoSection: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  infoLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
  },
  infoValue: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  synopsis: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    lineHeight: 24,
  },
  creditRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  creditRole: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    width: 120,
  },
  creditName: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    flex: 1,
  },
  ticketButton: {
    backgroundColor: Colors.brand,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  ticketText: {
    color: Colors.text.inverse,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  webLink: {
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: BorderRadius.md,
  },
  webLinkText: {
    color: Colors.brand,
    fontSize: FontSize.md,
  },
});
