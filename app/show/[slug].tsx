/**
 * Show detail page — full info for a single show.
 * Fetches per-show detail data (reviews, breakdown, audience, cast)
 * from CDN on mount, layered on top of browse-level show data.
 */

import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Share, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useShows } from '@/lib/data-context';
import { fetchShowDetail } from '@/lib/api';
import { getImageUrl } from '@/lib/images';
import { getScoreColor, getScoreTier, getContrastTextColor } from '@/lib/score-utils';
import { ShowDetail, MobileShowDetail, mapShowDetail } from '@/lib/types';
import { ScoreBadge, StatusBadge, FormatPill, ProductionPill, CategoryBadge } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { trackTicketTap, trackBuyButtonTap, trackShowDetailViewed, trackShowShared, trackFullReviewTapped } from '@/lib/analytics';
import Svg, { Path } from 'react-native-svg';
import ShowPageRating from '@/components/user/ShowPageRating';

export default function ShowDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { shows } = useShows();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackShowShared(show.id, show.title);
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

  // Track show detail view (once per show load)
  useEffect(() => {
    if (show) {
      trackShowDetailViewed(show.id, show.title, show.category, show.compositeScore ?? null);
    }
  }, [show]);

  // Primary ticket link: prefer TodayTix, then first available
  const primaryTicketLink = useMemo(() => {
    if (!show?.ticketLinks?.length) return null;
    const todayTix = show.ticketLinks.find(l => l.platform.toLowerCase().includes('todaytix'));
    return todayTix || show.ticketLinks[0];
  }, [show?.ticketLinks]);

  if (!show) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFoundText}>Show not found</Text>
      </View>
    );
  }

  const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);

  // Minimum 3 reviews to show a score (1-2 reviews is not a meaningful composite)
  const hasEnoughReviews = (show.criticScore?.reviewCount ?? 0) >= 3;
  const displayScore = hasEnoughReviews ? show.compositeScore : null;

  return (
    <>
      <Stack.Screen options={{ title: show.title }} />
      <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header card — matches website: poster + info, score below */}
        <View style={styles.headerCard}>
          {/* Top row: Poster + Title/Meta */}
          <View style={styles.headerTopRow}>
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                style={styles.posterCard}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.posterCard, styles.posterPlaceholder]}>
                <Text style={styles.posterPlaceholderText}>{show.title.charAt(0)}</Text>
              </View>
            )}

            <View style={styles.headerInfo}>
              <View style={styles.pills}>
                <FormatPill type={show.type} />
                <ProductionPill isRevival={show.isRevival} />
                <StatusBadge status={show.status} />
                <CategoryBadge category={show.category} />
              </View>
              <Text style={styles.title} numberOfLines={2}>{show.title}</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {show.venue}
                {show.runtime ? ` · ${show.runtime}` : ''}
              </Text>
              {show.openingDate && (
                <Text style={styles.meta} numberOfLines={1}>
                  {show.status === 'closed' ? 'Opened' : show.status === 'previews' ? 'Opens' : 'Opened'}{' '}
                  {formatDate(show.openingDate)}
                  {show.closingDate && show.status === 'closed' ? ` · Closed ${formatDate(show.closingDate)}` : ''}
                  {show.closingDate && show.status !== 'closed' ? ` · Closes ${formatDate(show.closingDate)}` : ''}
                </Text>
              )}
            </View>
          </View>

          {/* Score row: badge + sentiment + review count */}
          <View style={styles.scoreRow}>
            <ScoreBadge score={displayScore} size="large" animated />
            <View style={styles.scoreMeta}>
              {hasEnoughReviews && show.criticScore ? (
                <>
                  <Text style={[styles.sentimentLabel, { color: getScoreColor(displayScore) }]}>
                    {show.criticScore.label}
                  </Text>
                  <Text style={styles.reviewCountText}>
                    Based on {show.criticScore.reviewCount} critic reviews
                  </Text>
                </>
              ) : show.criticScore ? (
                <Text style={styles.reviewCountText}>
                  {show.criticScore.reviewCount} review{show.criticScore.reviewCount !== 1 ? 's' : ''} — awaiting more reviews
                </Text>
              ) : (
                <Text style={styles.reviewCountText}>Awaiting reviews</Text>
              )}
              {/* Audience grade chip — matching website */}
              {show.audienceGrade && (
                <View style={[styles.audienceChip, { backgroundColor: show.audienceGrade.color + '26' }]}>
                  <Text style={[styles.audienceChipText, { color: show.audienceGrade.color }]}>
                    Audience: {show.audienceGrade.grade} · {show.audienceGrade.label}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Link buttons: Official Site, Ticket platforms */}
          <View style={styles.linkButtons}>
            {show.officialUrl && (
              <Pressable
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
                onPress={() => WebBrowser.openBrowserAsync(show.officialUrl!)}
              >
                <Text style={styles.linkButtonText}>Official Site</Text>
              </Pressable>
            )}
            {show.status !== 'closed' && show.ticketLinks?.map((link, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
                onPress={() => {
                  trackTicketTap(show.id, show.title, link.platform, link.url);
                  WebBrowser.openBrowserAsync(link.url);
                }}
              >
                <Text style={styles.linkButtonText}>{link.platform}</Text>
              </Pressable>
            ))}
          </View>

          {/* Score Breakdown Bar — inside header card */}
          {detail?.breakdown && hasEnoughReviews && (
            <View style={styles.breakdownSection}>
              <BreakdownBar breakdown={detail.breakdown} />
            </View>
          )}

          {/* User rating + watchlist (feature-flagged) — inside header card */}
          <ShowPageRating
            showId={show.id}
            showTitle={show.title}
            closingDate={show.closingDate}
          />
        </View>

        {/* Critic Reviews List — collapsed by default */}
        {detail?.reviews && detail.reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Critic Reviews ({detail.reviews.length})
            </Text>
            {(showAllReviews ? detail.reviews : detail.reviews.slice(0, 3)).map((review, i) => (
              <ReviewRow key={i} review={review} showId={show.id} />
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
                <Text style={[styles.audienceGradeText, { color: getContrastTextColor(show.audienceGrade.color) }]}>{show.audienceGrade.grade}</Text>
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
            {/* Horizontal source cards with logos (matching website) */}
            {detail.audience.sources && (
              <View style={styles.audienceSourceCards}>
                {detail.audience.sources.showScore && (
                  <Pressable
                    style={styles.audienceSourceCard}
                    onPress={() => {
                      const ssSlug = show.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      WebBrowser.openBrowserAsync(`https://show-score.com/show/${ssSlug}`);
                    }}
                  >
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#facc15">
                        <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel}>SHOW SCORE</Text>
                    </View>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.showScore.score}%
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.showScore.count} reviews →
                    </Text>
                  </Pressable>
                )}
                {detail.audience.sources.mezzanine && (
                  <View style={styles.audienceSourceCard}>
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#c084fc">
                        <Path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm6 6h-4v-4h4v4zm0-6h-4v-4h4v4zm6 6h-4v-4h4v4zm0-6h-4v-4h4v4z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel}>MEZZANINE</Text>
                    </View>
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
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#fb923c">
                        <Path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel}>REDDIT</Text>
                    </View>
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

        {/* Quick facts */}
        <View style={styles.infoSection}>
          {show.runtime && <InfoRow label="Runtime" value={show.runtime} />}
          {show.ageRecommendation && (
            <InfoRow label="Ages" value={show.ageRecommendation} />
          )}
          {detail?.theaterAddress && (
            <InfoRow label="Theater" value={`${show.venue} · ${detail.theaterAddress}`} />
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
        {show.creativeTeam?.length > 0 && (
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
        <View style={[styles.stickyButtonContainer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
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

function ReviewRow({ review, showId }: { review: ShowDetail['reviews'][0]; showId: string }) {
  const scoreColor = getScoreColor(review.score);
  const scoreTextColor = getScoreTier(review.score)?.textColor ?? '#ffffff';

  const formattedDate = review.publishDate ? (() => {
    try {
      return new Date(review.publishDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch { return null; }
  })() : null;

  // Outlet logo from Google Favicons (same as website)
  const outletDomain = getOutletDomain(review.outlet);
  const logoUrl = outletDomain ? `https://www.google.com/s2/favicons?domain=${outletDomain}&sz=64` : null;

  return (
    <View style={styles.reviewRow}>
      {/* Top row: score + logo + outlet + date */}
      <View style={styles.reviewTopRow}>
        <View style={[styles.reviewScore, { backgroundColor: scoreColor }]}>
          <Text style={[styles.reviewScoreText, { color: scoreTextColor }]}>{review.score}</Text>
        </View>
        {logoUrl && (
          <Image source={{ uri: logoUrl }} style={styles.outletLogo} contentFit="cover" />
        )}
        <Text style={styles.reviewOutlet} numberOfLines={1}>{review.outlet}</Text>
        {formattedDate && (
          <Text style={styles.reviewDate}>{formattedDate}</Text>
        )}
      </View>

      {/* Content indented past score badge */}
      <View style={styles.reviewContent}>
        {review.pullQuote && (
          <Text style={styles.reviewQuote} numberOfLines={2}>
            {'\u201C'}{review.pullQuote}{'\u201D'}
          </Text>
        )}
        <View style={styles.reviewFooter}>
          <Text style={styles.reviewCritic} numberOfLines={1}>
            By {review.criticName || `${review.outlet} Staff`}
          </Text>
          {review.url && (
            <Pressable onPress={() => {
              trackFullReviewTapped(showId, review.outlet, review.criticName || null);
              WebBrowser.openBrowserAsync(review.url!);
            }}>
              <Text style={styles.fullReviewLink}>Full Review →</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** Map outlet display names to domains for Google Favicons */
function getOutletDomain(outlet: string): string | null {
  const OUTLET_DOMAINS: Record<string, string> = {
    'The New York Times': 'nytimes.com',
    'Vulture': 'vulture.com',
    'Variety': 'variety.com',
    'The Hollywood Reporter': 'hollywoodreporter.com',
    'Entertainment Weekly': 'ew.com',
    'TheaterMania': 'theatermania.com',
    'New York Post': 'nypost.com',
    'The Wall Street Journal': 'wsj.com',
    'The Washington Post': 'washingtonpost.com',
    'Time Out New York': 'timeout.com',
    'Time Out London': 'timeout.com',
    'BroadwayWorld': 'broadwayworld.com',
    'Deadline': 'deadline.com',
    'The Guardian': 'theguardian.com',
    'The Telegraph': 'telegraph.co.uk',
    'Associated Press': 'apnews.com',
    'NBC New York': 'nbcnewyork.com',
    'amNewYork': 'amny.com',
    'New York Magazine': 'nymag.com',
    'The Daily Beast': 'thedailybeast.com',
    'USA Today': 'usatoday.com',
    'Chicago Tribune': 'chicagotribune.com',
    'Playbill': 'playbill.com',
    'Broadway News': 'broadwaynews.com',
    'New York Theater': 'newyorktheater.me',
    'WhatsOnStage': 'whatsonstage.com',
    'The Stage': 'thestage.co.uk',
    'Evening Standard': 'standard.co.uk',
    'Financial Times': 'ft.com',
    'The Independent': 'independent.co.uk',
    'The Observer': 'observer.com',
    'The Wrap': 'thewrap.com',
    'Vogue': 'vogue.com',
    'The New Yorker': 'newyorker.com',
    'Rolling Stone': 'rollingstone.com',
    'Forbes': 'forbes.com',
    'NPR': 'npr.org',
    'Newsday': 'newsday.com',
    'Daily News': 'nydailynews.com',
    'CurtainUp': 'curtainup.com',
  };
  return OUTLET_DOMAINS[outlet] ?? null;
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
  headerCard: {
    backgroundColor: Colors.surface.raised,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  posterCard: {
    width: 100,
    height: 150,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    color: Colors.text.muted,
    fontSize: FontSize.xxl,
    fontWeight: '600',
  },
  headerInfo: {
    flex: 1,
    gap: 3,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  scoreMeta: {
    flex: 1,
    paddingTop: 2,
  },
  sentimentLabel: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  reviewCountText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 3,
  },
  audienceChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    marginTop: Spacing.sm,
  },
  audienceChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  linkButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  linkButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.surface.overlay,
  },
  linkButtonText: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  breakdownSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  meta: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: 4,
  },

  // Breakdown bar
  breakdownContainer: {
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewScore: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewScoreText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  outletLogo: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  reviewOutlet: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  reviewDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  reviewContent: {
    marginLeft: 48, // align with text past score badge (36 + 12 gap)
    marginTop: 4,
  },
  reviewQuote: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  reviewCritic: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  fullReviewLink: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '500',
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
  audienceSourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  audienceSourceLabel: {
    color: Colors.text.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
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
    paddingTop: Spacing.md,
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
