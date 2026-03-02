/**
 * Show detail page — full info for a single show.
 * Fetches per-show detail data (reviews, breakdown, audience, cast)
 * from CDN on mount, layered on top of browse-level show data.
 */

import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Share } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useShows } from '@/lib/data-context';
import { fetchShowDetail } from '@/lib/api';
import { getImageUrl } from '@/lib/images';
import { getScoreTier, getScoreColor } from '@/lib/score-utils';
import { Show, ShowDetail, MobileShowDetail, mapShowDetail } from '@/lib/types';
import { ScoreBadge, StatusBadge, FormatPill, ProductionPill, CategoryBadge } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function ShowDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { shows } = useShows();
  const router = useRouter();
  const [detail, setDetail] = useState<ShowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  const show = useMemo(() => shows.find(s => s.slug === slug), [shows, slug]);

  // Related shows: same type, similar score, currently open
  const relatedShows = useMemo(() => {
    if (!show) return [];
    return shows
      .filter(s =>
        s.id !== show.id &&
        s.type === show.type &&
        s.category === show.category &&
        (s.status === 'open' || s.status === 'previews') &&
        s.compositeScore != null
      )
      .sort((a, b) => {
        const aDiff = Math.abs((a.compositeScore ?? 0) - (show.compositeScore ?? 0));
        const bDiff = Math.abs((b.compositeScore ?? 0) - (show.compositeScore ?? 0));
        return aDiff - bDiff;
      })
      .slice(0, 6);
  }, [show, shows]);

  const handleShare = async () => {
    if (!show) return;
    const scoreText = show.compositeScore ? ` (Score: ${Math.round(show.compositeScore)})` : '';
    await Share.share({
      message: `Check out ${show.title}${scoreText} on Broadway Scorecard!\nhttps://broadwayscorecard.com/show/${show.slug}`,
    });
  };

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await fetchShowDetail(show.id);
        if (!cancelled && raw) {
          setDetail(mapShowDetail(raw as MobileShowDetail));
        }
      } catch {
        // Detail fetch failed — show page still works with browse data
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [show]);

  if (!show) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>Show not found</Text>
      </View>
    );
  }

  const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
  const heroUrl = detail?.heroImage ? getImageUrl(detail.heroImage) : null;
  const headerImage = heroUrl || posterUrl;
  const tier = getScoreTier(show.compositeScore);

  return (
    <>
      <Stack.Screen options={{ title: show.title }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Hero / Poster */}
        {headerImage && (
          <Image
            source={{ uri: headerImage }}
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
              {detail?.theaterAddress && (
                <Text style={styles.address}>{detail.theaterAddress}</Text>
              )}
              <View style={styles.pills}>
                <FormatPill type={show.type} />
                <ProductionPill isRevival={show.isRevival} />
                <StatusBadge status={show.status} />
                <CategoryBadge category={show.category} />
              </View>
            </View>
            <ScoreBadge score={show.compositeScore} size="large" showLabel />
          </View>

          {/* Score cards — Critic + Audience side by side */}
          <View style={styles.scoreCards}>
            {show.criticScore && (
              <View style={[styles.scoreCard, { borderColor: (tier?.color ?? Colors.text.muted) + '40' }]}>
                <Text style={styles.scoreCardTitle}>Critics</Text>
                <Text style={[styles.scoreCardScore, { color: tier?.color ?? Colors.text.muted }]}>
                  {show.criticScore.score}
                </Text>
                <Text style={[styles.scoreCardLabel, { color: tier?.color ?? Colors.text.muted }]}>
                  {show.criticScore.label}
                </Text>
                <Text style={styles.scoreCardDetail}>
                  {show.criticScore.reviewCount} reviews
                </Text>
              </View>
            )}

            {show.audienceGrade && (
              <View style={[styles.scoreCard, { borderColor: show.audienceGrade.color + '40' }]}>
                <Text style={styles.scoreCardTitle}>Audience</Text>
                <Text style={[styles.scoreCardScore, { color: show.audienceGrade.color }]}>
                  {show.audienceGrade.grade}
                </Text>
                <Text style={[styles.scoreCardLabel, { color: show.audienceGrade.color }]}>
                  {show.audienceGrade.label}
                </Text>
                {detail?.audience && (
                  <Text style={styles.scoreCardDetail}>
                    Score: {detail.audience.score}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Score Breakdown Bar */}
          {detail?.breakdown && (
            <BreakdownBar breakdown={detail.breakdown} />
          )}
        </View>

        {/* Critic Reviews List */}
        {detail?.reviews && detail.reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Critic Reviews ({detail.reviews.length})
            </Text>
            {detail.reviews.map((review, i) => (
              <ReviewRow key={i} review={review} />
            ))}
          </View>
        )}

        {/* Loading indicator for detail */}
        {detailLoading && (
          <View style={styles.detailLoading}>
            <ActivityIndicator size="small" color={Colors.brand} />
            <Text style={styles.detailLoadingText}>Loading reviews...</Text>
          </View>
        )}

        {/* Audience Sources */}
        {detail?.audience && detail.audience.sources && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audience Sources</Text>
            <View style={styles.audienceSourcesCard}>
              {detail.audience.sources.showScore && (
                <AudienceSourceRow
                  name="ShowScore"
                  score={detail.audience.sources.showScore.score}
                  count={detail.audience.sources.showScore.count}
                />
              )}
              {detail.audience.sources.mezzanine && (
                <AudienceSourceRow
                  name="Mezzanine"
                  score={detail.audience.sources.mezzanine.score}
                  count={detail.audience.sources.mezzanine.count}
                />
              )}
              {detail.audience.sources.reddit && (
                <AudienceSourceRow
                  name="Reddit"
                  score={detail.audience.sources.reddit.score}
                  count={detail.audience.sources.reddit.count}
                  extra={`${detail.audience.sources.reddit.totalPosts} posts`}
                />
              )}
            </View>
          </View>
        )}

        {/* Show info */}
        <View style={styles.infoSection}>
          {show.openingDate && (
            <InfoRow label="Opening" value={formatDate(show.openingDate)} />
          )}
          {detail?.previewsStartDate && (
            <InfoRow label="Previews" value={formatDate(detail.previewsStartDate)} />
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

        {/* Cast */}
        {detail?.cast && detail.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            {detail.cast.map((member, i) => (
              <View key={i} style={styles.creditRow}>
                <Text style={styles.creditRole}>{member.role}</Text>
                <Text style={styles.creditName}>{member.name}</Text>
              </View>
            ))}
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

        {/* Related Shows */}
        {relatedShows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Shows to See</Text>
            {relatedShows.map(related => (
              <Pressable
                key={related.id}
                style={({ pressed }) => [styles.relatedShowRow, pressed && styles.pressed]}
                onPress={() => router.push(`/show/${related.slug}`)}
              >
                <View style={styles.relatedShowInfo}>
                  <Text style={styles.relatedShowTitle} numberOfLines={1}>{related.title}</Text>
                  <Text style={styles.relatedShowVenue} numberOfLines={1}>{related.venue}</Text>
                </View>
                <ScoreBadge score={related.compositeScore} size="small" />
              </Pressable>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <Pressable
            style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
            onPress={handleShare}
          >
            <Text style={styles.shareButtonText}>Share This Show</Text>
          </Pressable>
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
        </View>
      </ScrollView>
    </>
  );
}

// ===========================================
// SUB-COMPONENTS
// ===========================================

function BreakdownBar({ breakdown }: { breakdown: { positive: number; mixed: number; negative: number } }) {
  const total = breakdown.positive + breakdown.mixed + breakdown.negative;
  if (total === 0) return null;

  const pctPositive = (breakdown.positive / total) * 100;
  const pctMixed = (breakdown.mixed / total) * 100;
  const pctNegative = (breakdown.negative / total) * 100;

  return (
    <View style={styles.breakdownContainer}>
      <View style={styles.breakdownBar}>
        {pctPositive > 0 && (
          <View style={[styles.breakdownSegment, { flex: pctPositive, backgroundColor: Colors.score.green }]} />
        )}
        {pctMixed > 0 && (
          <View style={[styles.breakdownSegment, { flex: pctMixed, backgroundColor: Colors.score.amber }]} />
        )}
        {pctNegative > 0 && (
          <View style={[styles.breakdownSegment, { flex: pctNegative, backgroundColor: Colors.score.red }]} />
        )}
      </View>
      <View style={styles.breakdownLabels}>
        <View style={styles.breakdownLabelRow}>
          <View style={[styles.breakdownDot, { backgroundColor: Colors.score.green }]} />
          <Text style={styles.breakdownLabelText}>
            {breakdown.positive} Positive
          </Text>
        </View>
        <View style={styles.breakdownLabelRow}>
          <View style={[styles.breakdownDot, { backgroundColor: Colors.score.amber }]} />
          <Text style={styles.breakdownLabelText}>
            {breakdown.mixed} Mixed
          </Text>
        </View>
        <View style={styles.breakdownLabelRow}>
          <View style={[styles.breakdownDot, { backgroundColor: Colors.score.red }]} />
          <Text style={styles.breakdownLabelText}>
            {breakdown.negative} Negative
          </Text>
        </View>
      </View>
    </View>
  );
}

function ReviewRow({ review }: { review: ShowDetail['reviews'][0] }) {
  const scoreColor = getScoreColor(review.score);
  const tierLabel = review.tier === 1 ? 'T1' : review.tier === 2 ? 'T2' : 'T3';

  return (
    <Pressable
      style={({ pressed }) => [styles.reviewRow, pressed && review.url ? styles.pressed : null]}
      onPress={review.url ? () => WebBrowser.openBrowserAsync(review.url!) : undefined}
      disabled={!review.url}
    >
      {/* Score circle */}
      <View style={[styles.reviewScore, { backgroundColor: scoreColor }]}>
        <Text style={styles.reviewScoreText}>{review.score}</Text>
      </View>

      {/* Review info */}
      <View style={styles.reviewInfo}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewCritic} numberOfLines={1}>
            {review.criticName || 'Staff'}
          </Text>
          <Text style={styles.reviewTier}>{tierLabel}</Text>
        </View>
        <Text style={styles.reviewOutlet} numberOfLines={1}>
          {review.outlet}
        </Text>
        {review.pullQuote && (
          <Text style={styles.reviewQuote} numberOfLines={2}>
            "{review.pullQuote}"
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function AudienceSourceRow({
  name,
  score,
  count,
  extra,
}: {
  name: string;
  score: number;
  count: number;
  extra?: string;
}) {
  return (
    <View style={styles.audienceSourceRow}>
      <Text style={styles.audienceSourceName}>{name}</Text>
      <View style={styles.audienceSourceRight}>
        <Text style={styles.audienceSourceScore}>{score}</Text>
        <Text style={styles.audienceSourceCount}>
          {count} reviews{extra ? ` / ${extra}` : ''}
        </Text>
      </View>
    </View>
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

// ===========================================
// STYLES
// ===========================================

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
  address: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  scoreCards: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  scoreCardTitle: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  scoreCardScore: {
    fontSize: FontSize.title,
    fontWeight: '700',
  },
  scoreCardLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  scoreCardDetail: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 4,
  },

  // Breakdown bar
  breakdownContainer: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    gap: 2,
  },
  breakdownSegment: {
    borderRadius: 6,
  },
  breakdownLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabelText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
  },

  // Review rows
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  reviewScore: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  reviewScoreText: {
    color: '#ffffff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  reviewInfo: {
    flex: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewCritic: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  reviewTier: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '500',
    backgroundColor: Colors.surface.overlay,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  reviewOutlet: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 1,
  },
  reviewQuote: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 18,
  },

  // Detail loading
  detailLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  detailLoadingText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },

  // Audience sources
  audienceSourcesCard: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  audienceSourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  audienceSourceName: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  audienceSourceRight: {
    alignItems: 'flex-end',
  },
  audienceSourceScore: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  audienceSourceCount: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 1,
  },

  // Info section
  infoSection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
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
  // Related shows
  relatedShowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  relatedShowInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  relatedShowTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  relatedShowVenue: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },

  // Action buttons
  actionButtons: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  shareButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  shareButtonText: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  webLink: {
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
