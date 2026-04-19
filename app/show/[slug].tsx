/**
 * Show detail page — full info for a single show.
 * Fetches per-show detail data (reviews, breakdown, audience, cast)
 * from CDN on mount, layered on top of browse-level show data.
 */

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Share, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useShows } from '@/lib/data-context';
import { fetchShowDetail, fetchSocialPulse } from '@/lib/api';
import { getImageUrl } from '@/lib/images';
import { getScoreColor, getScoreTier, getContrastTextColor } from '@/lib/score-utils';
import { ShowDetail, MobileShowDetail, mapShowDetail } from '@/lib/types';
import { ScoreBadge, StatusBadge, FormatPill, ProductionPill, CategoryBadge } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { trackTicketTap, trackTicketLinksVisible, trackTicketBrowserOpened, trackTicketBrowserDismissed, trackShowDetailViewed, trackShowShared, trackFullReviewTapped } from '@/lib/analytics';
import { buildTicketUrl, buildTicketEventProps, isAffiliatePlatform, type TicketSource } from '@/lib/ticket-utils';
import Svg, { Path } from 'react-native-svg';
import ShowPageRating from '@/components/user/ShowPageRating';
import { BookmarkOverlay } from '@/components/BookmarkOverlay';
import { recordShowView } from '@/lib/store-review';
import { ShareCardWithRef, ShareCardHandle } from '@/components/ShareCard';
import { ShowDetailSkeleton } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { useWatchlist } from '@/hooks/useWatchlist';
import { featureFlags } from '@/lib/feature-flags';

interface SocialPulsePayload {
  _v: number;
  t: 'Buzzing' | 'Rising' | 'Steady' | 'Troubled' | 'BuildingBaseline' | 'Hidden';
  v: number;
  p: number;
  wow: number | null;
  pl: { x: number; tt: number; ig: number; r?: number };
  xv?: number;
  q: Array<{ t: string; p: string; a: string | null; u: string | null }>;
  u: string;
  r?: string;
}

export default function ShowDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { shows } = useShows();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<ShowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllCast, setShowAllCast] = useState(false);
  const [socialPulse, setSocialPulse] = useState<SocialPulsePayload | null>(null);
  const shareCardRef = useRef<ShareCardHandle>(null);

  const show = useMemo(() => shows.find(s => s.slug === slug), [shows, slug]);
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { isWatchlisted, addToWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);

  // Other Productions: same title, different ID (any status)
  const otherProductions = useMemo(() => {
    if (!show) return [];
    return shows
      .filter(s => s.id !== show.id && s.title === show.title)
      .sort((a, b) => (b.openingDate ?? '').localeCompare(a.openingDate ?? ''));
  }, [show, shows]);

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
    // Try image share card first, falls back to text internally
    await shareCardRef.current?.share();
  };

  /** Open a ticket link with full funnel tracking (tap → browser open → browser dismiss with duration) */
  const openTicketLink = async (link: { platform: string; url: string }, position: number, source: TicketSource) => {
    if (!show) return;
    const { url: affiliateUrl, isAffiliate } = buildTicketUrl(link.url, link.platform, source);
    const eventProps = buildTicketEventProps({
      show,
      platform: link.platform,
      originalUrl: link.url,
      affiliateUrl,
      isAffiliate,
      source,
      linkPosition: position,
    });

    // 1. Track the tap
    trackTicketTap(eventProps);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // 2. Open browser and track lifecycle
    const openedAt = Date.now();
    try {
      const result = await WebBrowser.openBrowserAsync(affiliateUrl);
      trackTicketBrowserOpened(eventProps);

      // 3. Browser was dismissed — track with time-on-site
      const timeOnSiteMs = Date.now() - openedAt;
      trackTicketBrowserDismissed({
        ...eventProps,
        time_on_site_ms: timeOnSiteMs,
        time_on_site_seconds: Math.round(timeOnSiteMs / 1000),
      });
    } catch {
      // Browser failed to open — tap event still recorded
    }
  };

  // Track ticket link impressions once per show load
  const ticketImpressionTracked = useRef(false);
  useEffect(() => {
    if (!show || ticketImpressionTracked.current) return;
    if (show.status === 'closed' || !show.ticketLinks?.length) return;
    ticketImpressionTracked.current = true;
    const platforms = show.ticketLinks.map(l => l.platform);
    trackTicketLinksVisible({
      show_id: show.id,
      show_title: show.title,
      show_slug: show.slug,
      source: 'show_detail',
      platforms,
      affiliate_platforms: platforms.filter(isAffiliatePlatform),
      ticket_link_count: show.ticketLinks.length,
    });
  }, [show]);

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

  // Fetch social pulse data
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    fetchSocialPulse(show.id).then(raw => {
      if (!cancelled && raw) {
        const sp = raw as SocialPulsePayload;
        if (sp.t !== 'Hidden') setSocialPulse(sp);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [show?.id]);

  // Track show detail view (once per show load — keyed on id, not object ref)
  useEffect(() => {
    if (show) {
      trackShowDetailViewed(show.id, show.title, show.category, show.compositeScore ?? null);
      recordShowView(show.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id]);

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
            <View>
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
              {featureFlags.userAccounts && (
                <BookmarkOverlay
                  isWatchlisted={isWatchlisted(show.id)}
                  onToggle={async () => {
                    if (!isAuthenticated) { showSignIn('watchlist'); return; }
                    try {
                      if (isWatchlisted(show.id)) await removeFromWatchlist(show.id);
                      else await addToWatchlist(show.id);
                    } catch {}
                  }}
                />
              )}
            </View>

            <View style={styles.headerInfo}>
              <View style={styles.pills}>
                <FormatPill type={show.type} />
                <ProductionPill isRevival={show.isRevival} />
                <StatusBadge status={show.status} />
                <CategoryBadge category={show.category} />
              </View>
              <Text style={styles.title} numberOfLines={2}>{show.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>{show.venue}</Text>
              {show.runtime && <Text style={styles.meta} numberOfLines={1}>{show.runtime}</Text>}
              {show.openingDate && (
                <Text style={styles.meta} numberOfLines={1}>
                  {show.status === 'closed' ? 'Opened' : show.status === 'previews' ? 'Opens' : 'Opened'}{' '}
                  {formatDate(show.openingDate)}
                </Text>
              )}
              {show.closingDate && (
                <Text style={styles.meta} numberOfLines={1}>
                  {show.status === 'closed' ? 'Closed' : 'Closes'} {formatDate(show.closingDate)}
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

          {/* Score Breakdown Bar — right under score row */}
          {detail?.breakdown && hasEnoughReviews && (
            <View style={styles.breakdownSection}>
              <BreakdownBar breakdown={detail.breakdown} />
            </View>
          )}

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
                onPress={() => openTicketLink(link, i, 'show_detail')}
              >
                <Text style={styles.linkButtonText}>{link.platform}</Text>
              </Pressable>
            ))}
          </View>

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

        {/* Loading skeleton for detail */}
        {detailLoading && (
          <ShowDetailSkeleton />
        )}

        {/* Offline notice when detail fetch failed */}
        {!detailLoading && !detail && (
          <View style={styles.detailLoading}>
            <Text style={styles.detailLoadingText}>Reviews unavailable offline</Text>
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

        {/* Social Scorecard */}
        {socialPulse && (
          <SocialScorecardSection sp={socialPulse} />
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

        {/* Seating Guidance */}
        {detail?.seatingSections && detail.seatingSections.length > 0 && (
          <SeatingGuidanceSection sections={detail.seatingSections} />
        )}

        {/* Theater Scorecard */}
        {detail?.venueScores && (
          <TheaterScorecardSection scores={detail.venueScores} venueName={show.venue} />
        )}

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


        {/* Video Reviews */}
        {detail?.videoReviews && detail.videoReviews.length > 0 && (
          <VideoReviewsSection reviews={detail.videoReviews} />
        )}

        {/* Other Productions of the same show */}
        {otherProductions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Productions of {show.title}</Text>
            {otherProductions.map(prod => {
              const prodPoster = getImageUrl(prod.images.poster) || getImageUrl(prod.images.thumbnail);
              const marketLabel = prod.category === 'west-end' ? 'West End'
                : prod.category === 'off-broadway' ? 'Off-Broadway'
                : 'Broadway';
              const openYear = prod.openingDate ? new Date(prod.openingDate + 'T12:00:00').getFullYear() : null;
              const closeYear = prod.closingDate ? new Date(prod.closingDate + 'T12:00:00').getFullYear() : null;
              const yearRange = openYear
                ? (closeYear && closeYear !== openYear ? `${openYear}–${String(closeYear).slice(-2)}` : String(openYear))
                : null;
              const subtitle = [marketLabel, yearRange].filter(Boolean).join(' · ');
              const subtitleColor = prod.status === 'open' || prod.status === 'previews' ? Colors.score.teal : Colors.text.muted;
              return (
                <Pressable
                  key={prod.id}
                  style={({ pressed }) => [styles.relatedShowRow, pressed && styles.pressed]}
                  onPress={() => router.push(`/show/${prod.slug}`)}
                >
                  {prodPoster ? (
                    <Image source={{ uri: prodPoster }} style={styles.relatedShowImage} contentFit="cover" transition={200} />
                  ) : (
                    <View style={[styles.relatedShowImage, styles.relatedShowPlaceholder]}>
                      <Text style={styles.relatedShowPlaceholderText}>{prod.title.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={styles.relatedShowInfo}>
                    <Text style={styles.relatedShowTitle} numberOfLines={1}>{prod.title}</Text>
                    <Text style={[styles.relatedShowVenue, { color: subtitleColor }]} numberOfLines={1}>{subtitle}</Text>
                  </View>
                  <ScoreBadge score={prod.compositeScore} size="small" />
                </Pressable>
              );
            })}
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

        {/* Hidden share card for image capture */}
        <ShareCardWithRef ref={shareCardRef} show={show} />

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <Pressable
            style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
            onPress={handleShare}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill={Colors.text.primary} style={{ marginRight: 6 }}>
              <Path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
            </Svg>
            <Text style={styles.shareButtonText}>Share Score Card</Text>
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

// ---------- Social Scorecard ----------

const SOCIAL_TIER_CONFIG = {
  Buzzing: { label: 'BUZZING', color: '#f97316', subtitle: 'Trending hot right now' },
  Rising: { label: 'RISING', color: '#10b981', subtitle: 'Picking up momentum' },
  Steady: { label: 'STEADY', color: '#3b82f6', subtitle: 'Consistent buzz' },
  Troubled: { label: 'TROUBLED', color: '#ef4444', subtitle: 'Negative chatter outweighs positive' },
  BuildingBaseline: { label: 'BUILDING', color: '#8b5cf6', subtitle: 'Gathering early buzz' },
  Hidden: null,
} as const;

function SocialScorecardSection({ sp }: { sp: SocialPulsePayload }) {
  const config = SOCIAL_TIER_CONFIG[sp.t];
  if (!config) return null;
  const totalMentions = sp.v;
  const platforms = [
    { label: 'X / Twitter', count: sp.xv ?? sp.pl.x },
    { label: 'TikTok', count: sp.pl.tt },
    { label: 'Instagram', count: sp.pl.ig },
    ...(sp.pl.r != null ? [{ label: 'Reddit', count: sp.pl.r }] : []),
  ].filter(p => p.count > 0);
  const quotes = sp.q.slice(0, 2);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Social Scorecard</Text>
      {/* Tier badge row */}
      <View style={[styles.socialTierRow, { borderColor: config.color + '40', backgroundColor: config.color + '14' }]}>
        <View style={[styles.socialTierBadge, { backgroundColor: config.color }]}>
          <Text style={styles.socialTierLabel}>{config.label}</Text>
        </View>
        <View style={styles.socialTierInfo}>
          <Text style={[styles.socialTierSubtitle, { color: config.color }]}>{config.subtitle}</Text>
          <Text style={styles.socialMentions}>{totalMentions.toLocaleString()} mentions · {sp.p}% positive</Text>
          {sp.r && <Text style={styles.socialRank}>{sp.r}</Text>}
        </View>
      </View>
      {/* Platform breakdown */}
      {platforms.length > 0 && (
        <View style={styles.socialPlatforms}>
          {platforms.map((p, i) => (
            <View key={i} style={styles.socialPlatformChip}>
              <Text style={styles.socialPlatformLabel}>{p.label}</Text>
              <Text style={styles.socialPlatformCount}>{p.count.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}
      {/* Sample quotes */}
      {quotes.map((q, i) => (
        <View key={i} style={styles.socialQuote}>
          <Text style={styles.socialQuoteText} numberOfLines={2}>{'\u201C'}{q.t}{'\u201D'}</Text>
          {q.a && <Text style={styles.socialQuoteAuthor}>— {q.a} on {q.p}</Text>}
        </View>
      ))}
    </View>
  );
}

// ---------- Seating Guidance ----------

const VERDICT_CONFIG: Record<string, { label: string; color: string }> = {
  'sweet-spot': { label: 'Best Seats', color: '#10b981' },
  'solid': { label: 'Good Seats', color: '#3b82f6' },
  'avoid': { label: 'Risky', color: '#ef4444' },
};

function SeatingGuidanceSection({ sections }: { sections: ShowDetail['seatingSections'] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Seating Guide</Text>
      {sections.map((s, i) => {
        const cfg = VERDICT_CONFIG[s.verdict] ?? { label: s.verdictLabel, color: Colors.text.muted };
        return (
          <View key={i} style={[styles.seatRow, s.isValuePick && styles.seatRowValuePick]}>
            <View style={styles.seatRowLeft}>
              <Text style={styles.seatName} numberOfLines={1}>{s.name}</Text>
              {s.rowRange && <Text style={styles.seatMeta}>Rows {s.rowRange}</Text>}
              {s.rationale && <Text style={styles.seatRationale} numberOfLines={2}>{s.rationale}</Text>}
            </View>
            <View style={[styles.seatVerdict, { backgroundColor: cfg.color + '20' }]}>
              <Text style={[styles.seatVerdictText, { color: cfg.color }]}>{cfg.label}</Text>
              {s.isValuePick && <Text style={[styles.seatValuePick, { color: cfg.color }]}>Value Pick</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------- Theater Scorecard ----------

const VENUE_DIMENSIONS = [
  { key: 'sightlines' as const, label: 'Sightlines' },
  { key: 'sound' as const, label: 'Sound' },
  { key: 'comfort' as const, label: 'Comfort' },
  { key: 'ambiance' as const, label: 'Ambiance' },
  { key: 'facilities' as const, label: 'Facilities' },
];

function TheaterScorecardSection({ scores, venueName }: { scores: ShowDetail['venueScores']; venueName: string }) {
  if (!scores) return null;
  const dims = VENUE_DIMENSIONS.filter(d => scores[d.key] != null);
  if (dims.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Theater Scorecard</Text>
      <Text style={styles.venueScorecardName}>{venueName}</Text>
      {dims.map(d => {
        const score = scores[d.key] as number;
        const color = score >= 75 ? '#10b981' : score >= 55 ? '#f59e0b' : '#ef4444';
        return (
          <View key={d.key} style={styles.venueDimRow}>
            <Text style={styles.venueDimLabel}>{d.label}</Text>
            <View style={styles.venueDimBarBg}>
              <View style={[styles.venueDimBarFill, { width: `${score}%` as any, backgroundColor: color }]} />
            </View>
            <Text style={[styles.venueDimScore, { color }]}>{score}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------- Video Reviews ----------

function VideoReviewsSection({ reviews }: { reviews: ShowDetail['videoReviews'] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Video Reviews ({reviews.length})</Text>
      {reviews.map((v, i) => {
        const bucketColor = v.bucket === 'Rave' || v.bucket === 'Positive' ? '#10b981'
          : v.bucket === 'Mixed' ? '#f59e0b' : '#ef4444';
        return (
          <Pressable
            key={i}
            style={({ pressed }) => [styles.videoReviewRow, pressed && styles.pressed]}
            onPress={() => WebBrowser.openBrowserAsync(v.url)}
          >
            {v.thumbnail ? (
              <Image source={{ uri: v.thumbnail }} style={styles.videoThumb} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.videoThumb, styles.videoThumbPlaceholder]}>
                <Text style={styles.videoThumbPlaceholderText}>▶</Text>
              </View>
            )}
            <View style={styles.videoInfo}>
              <Text style={styles.videoCreator} numberOfLines={1}>
                {v.channelName || v.handle || 'Video Review'}
              </Text>
              {v.platform && <Text style={styles.videoPlatform}>{v.platform}</Text>}
              {v.keyQuote && <Text style={styles.videoQuote} numberOfLines={2}>{'\u201C'}{v.keyQuote}{'\u201D'}</Text>}
            </View>
            {v.bucket && (
              <View style={[styles.videoBucket, { backgroundColor: bucketColor + '20' }]}>
                <Text style={[styles.videoBucketText, { color: bucketColor }]}>{v.bucket}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
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
    paddingBottom: Spacing.xxl,
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    gap: Spacing.md,
  },
  infoLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    flexShrink: 0,
  },
  infoValue: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
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

  // Action buttons
  actionButtons: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  shareButton: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
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

  // Social Scorecard
  socialTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  socialTierBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  socialTierLabel: {
    color: '#ffffff',
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  socialTierInfo: {
    flex: 1,
  },
  socialTierSubtitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  socialMentions: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  socialRank: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  socialPlatforms: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  socialPlatformChip: {
    backgroundColor: Colors.surface.raised,
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  socialPlatformLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
  },
  socialPlatformCount: {
    color: Colors.text.primary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  socialQuote: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  socialQuoteText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  socialQuoteAuthor: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 4,
  },

  // Seating Guidance
  seatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    gap: Spacing.md,
  },
  seatRowValuePick: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 0,
    marginBottom: Spacing.sm,
  },
  seatRowLeft: {
    flex: 1,
  },
  seatName: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  seatMeta: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  seatRationale: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 4,
    lineHeight: 18,
  },
  seatVerdict: {
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 80,
  },
  seatVerdictText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  seatValuePick: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },

  // Theater Scorecard
  venueScorecardName: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  venueDimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  venueDimLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    width: 80,
  },
  venueDimBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surface.raised,
    borderRadius: 3,
    overflow: 'hidden',
  },
  venueDimBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  venueDimScore: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    width: 28,
    textAlign: 'right',
  },

  // Video Reviews
  videoReviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    gap: Spacing.md,
  },
  videoThumb: {
    width: 80,
    height: 52,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.raised,
  },
  videoThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumbPlaceholderText: {
    color: Colors.text.muted,
    fontSize: FontSize.lg,
  },
  videoInfo: {
    flex: 1,
  },
  videoCreator: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  videoPlatform: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  videoQuote: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    marginTop: 4,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  videoBucket: {
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  videoBucketText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
});
