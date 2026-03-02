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
import { trackTicketTap, trackBuyButtonTap } from '@/lib/analytics';

export default function ShowDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { shows } = useShows();
  const router = useRouter();
  const [detail, setDetail] = useState<ShowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllCast, setShowAllCast] = useState(false);

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
  const headerImage = posterUrl || heroUrl;

  // Primary ticket link: prefer TodayTix, then first available
  const primaryTicketLink = useMemo(() => {
    if (show.ticketLinks.length === 0) return null;
    const todayTix = show.ticketLinks.find(l => l.platform.toLowerCase().includes('todaytix'));
    return todayTix || show.ticketLinks[0];
  }, [show.ticketLinks]);
  const tier = getScoreTier(show.compositeScore);

  return (
    <>
      <Stack.Screen options={{ title: show.title }} />
      <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
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

        {/* Critic Reviews List — collapsed by default */}
        {detail?.reviews && detail.reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Critic Reviews ({detail.reviews.length})
            </Text>
            {(showAllReviews ? detail.reviews : detail.reviews.slice(0, 3)).map((review, i) => (
              <ReviewRow key={i} review={review} />
            ))}
            {!showAllReviews && detail.reviews.length > 3 && (
              <Pressable
                style={({ pressed }) => [styles.showAllButton, pressed && styles.pressed]}
                onPress={() => setShowAllReviews(true)}
              >
                <Text style={styles.showAllText}>
                  Show all {detail.reviews.length} reviews
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Loading indicator for detail */}
        {detailLoading && (
          <View style={styles.detailLoading}>
            <ActivityIndicator size="small" color={Colors.brand} />
            <Text style={styles.detailLoadingText}>Loading reviews...</Text>
          </View>
        )}

        {/* Audience Scorecard — grade badge header + horizontal source cards */}
        {detail?.audience && show.audienceGrade && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audience Scorecard</Text>
            {/* Grade badge header card */}
            <View style={[styles.audienceHeader, { borderColor: show.audienceGrade.color + '40' }]}>
              <View style={[styles.audienceGradeBadge, { backgroundColor: show.audienceGrade.color }]}>
                <Text style={styles.audienceGradeText}>{show.audienceGrade.grade}</Text>
              </View>
              <View style={styles.audienceGradeInfo}>
                <Text style={[styles.audienceGradeLabel, { color: show.audienceGrade.color }]}>
                  {show.audienceGrade.label}
                </Text>
                <Text style={styles.audienceGradeSubtext}>
                  Based on {
                    (detail.audience.sources.showScore?.count ?? 0) +
                    (detail.audience.sources.mezzanine?.count ?? 0) +
                    (detail.audience.sources.reddit?.count ?? 0)
                  } audience reviews
                </Text>
              </View>
            </View>
            {/* Horizontal source cards */}
            {detail.audience.sources && (
              <View style={styles.audienceSourceCards}>
                {detail.audience.sources.showScore && (
                  <View style={styles.audienceSourceCard}>
                    <Text style={styles.audienceSourceLabel}>SHOW SCORE</Text>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.showScore.score}%
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.showScore.count} reviews
                    </Text>
                  </View>
                )}
                {detail.audience.sources.mezzanine && (
                  <View style={styles.audienceSourceCard}>
                    <Text style={styles.audienceSourceLabel}>MEZZANINE</Text>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.mezzanine.starRating != null
                        ? `${detail.audience.sources.mezzanine.starRating}/5`
                        : `${detail.audience.sources.mezzanine.score}%`}
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.mezzanine.count} reviews
                    </Text>
                  </View>
                )}
                {detail.audience.sources.reddit && (
                  <View style={styles.audienceSourceCard}>
                    <Text style={styles.audienceSourceLabel}>REDDIT</Text>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.reddit.score}%
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.reddit.totalPosts} posts
                    </Text>
                  </View>
                )}
              </View>
            )}
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

        {/* Cast — show first 6, expandable */}
        {detail?.cast && detail.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Cast ({detail.cast.length})
            </Text>
            {(showAllCast ? detail.cast : detail.cast.slice(0, 6)).map((member, i) => (
              <View key={i} style={styles.creditRow}>
                <Text style={styles.creditRole}>{member.role}</Text>
                <Text style={styles.creditName}>{member.name}</Text>
              </View>
            ))}
            {!showAllCast && detail.cast.length > 6 && (
              <Pressable
                style={({ pressed }) => [styles.showAllButton, pressed && styles.pressed]}
                onPress={() => setShowAllCast(true)}
              >
                <Text style={styles.showAllText}>
                  Show all {detail.cast.length} cast members
                </Text>
              </Pressable>
            )}
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

        {/* All ticket links (inline, secondary to sticky CTA) */}
        {show.ticketLinks.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Ticket Sources</Text>
            {show.ticketLinks.map((link, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.ticketRowButton, pressed && styles.pressed]}
                onPress={() => {
                  trackTicketTap(show.id, show.title, link.platform, link.url);
                  WebBrowser.openBrowserAsync(link.url);
                }}
              >
                <Text style={styles.ticketRowText}>{link.platform}</Text>
                <Text style={styles.ticketRowArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Related Shows — with poster thumbnails */}
        {relatedShows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Shows to See</Text>
            {relatedShows.map(related => {
              const relatedPoster = getImageUrl(related.images.poster) || getImageUrl(related.images.thumbnail);
              return (
                <Pressable
                  key={related.id}
                  style={({ pressed }) => [styles.relatedShowRow, pressed && styles.pressed]}
                  onPress={() => router.push(`/show/${related.slug}`)}
                >
                  {relatedPoster ? (
                    <Image
                      source={{ uri: relatedPoster }}
                      style={styles.relatedShowImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.relatedShowImage, styles.relatedShowPlaceholder]}>
                      <Text style={styles.relatedShowPlaceholderText}>
                        {related.title.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.relatedShowInfo}>
                    <Text style={styles.relatedShowTitle} numberOfLines={1}>{related.title}</Text>
                    <Text style={styles.relatedShowVenue} numberOfLines={1}>{related.venue}</Text>
                  </View>
                  <ScoreBadge score={related.compositeScore} size="small" />
                </Pressable>
              );
            })}
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

      {/* Sticky Buy Tickets button */}
      {primaryTicketLink && (
        <View style={styles.stickyButtonContainer}>
          <Pressable
            style={({ pressed }) => [styles.stickyBuyButton, pressed && styles.stickyBuyButtonPressed]}
            onPress={() => {
              trackBuyButtonTap(show.id, show.title, primaryTicketLink.platform, primaryTicketLink.url);
              WebBrowser.openBrowserAsync(primaryTicketLink.url);
            }}
          >
            <Text style={styles.stickyBuyText}>Buy Tickets</Text>
            <Text style={styles.stickyBuySubtext}>on {primaryTicketLink.platform}</Text>
          </Pressable>
        </View>
      )}
      </View>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 100, // room for sticky button
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

  // Audience scorecard
  audienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    gap: Spacing.md,
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
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  audienceGradeInfo: {
    flex: 1,
  },
  audienceGradeLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  audienceGradeSubtext: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  audienceSourceCards: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  audienceSourceCard: {
    flex: 1,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  audienceSourceLabel: {
    color: Colors.text.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  audienceSourceValue: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  audienceSourceMeta: {
    color: Colors.text.muted,
    fontSize: 9,
    marginTop: 2,
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
  ticketRowButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  ticketRowText: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  ticketRowArrow: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
  },
  pressed: {
    opacity: 0.7,
  },
  // Show all button (reviews, cast)
  showAllButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
  },
  showAllText: {
    color: Colors.brand,
    fontSize: FontSize.sm,
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
  relatedShowImage: {
    width: 40,
    height: 53,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.md,
  },
  relatedShowPlaceholder: {
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedShowPlaceholderText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Sticky buy button
  stickyButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.surface.default,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  stickyBuyButton: {
    backgroundColor: Colors.brand,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  stickyBuyButtonPressed: {
    opacity: 0.85,
  },
  stickyBuyText: {
    color: Colors.text.inverse,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  stickyBuySubtext: {
    color: Colors.text.inverse,
    fontSize: FontSize.sm,
    opacity: 0.8,
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
