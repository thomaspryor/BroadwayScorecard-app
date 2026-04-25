/**
 * Show detail page — full info for a single show.
 * Fetches per-show detail data (reviews, breakdown, audience, cast)
 * from CDN on mount, layered on top of browse-level show data.
 */

import React, { useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Share, Platform, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useShows } from '@/lib/data-context';
import { fetchShowDetail, fetchSocialPulse } from '@/lib/api';
import { getImageUrl } from '@/lib/images';
import { getScoreColor, getScoreTier, getContrastTextColor } from '@/lib/score-utils';
import { Show, ShowDetail, MobileShowDetail, mapShowDetail } from '@/lib/types';
import { ScoreBadge, StatusBadge, FormatPill, ProductionPill, CategoryBadge } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { trackTicketTap, trackTicketLinksVisible, trackTicketBrowserOpened, trackTicketBrowserDismissed, trackShowDetailViewed, trackShowShared, trackFullReviewTapped } from '@/lib/analytics';
import { buildTicketUrl, buildTicketEventProps, isAffiliatePlatform, type TicketSource } from '@/lib/ticket-utils';
import Svg, { Path } from 'react-native-svg';
import ShowPageRating from '@/components/user/ShowPageRating';
import { BookmarkOverlay } from '@/components/BookmarkOverlay';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ceremonyToYear } from '@/lib/tony-utils';
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

  // Related shows: same type + category, sorted by score proximity
  const relatedBase = useMemo(() => {
    if (!show) return [];
    return shows
      .filter(s =>
        s.id !== show.id &&
        s.type === show.type &&
        s.category === show.category &&
        s.compositeScore != null
      )
      .sort((a, b) => {
        const aDiff = Math.abs((a.compositeScore ?? 0) - (show.compositeScore ?? 0));
        const bDiff = Math.abs((b.compositeScore ?? 0) - (show.compositeScore ?? 0));
        return aDiff - bDiff;
      });
  }, [show, shows]);
  const relatedShowsOpen = useMemo(() => relatedBase.filter(s => s.status === 'open' || s.status === 'previews').slice(0, 6), [relatedBase]);
  const relatedShowsClosed = useMemo(() => relatedBase.filter(s => s.status === 'closed').slice(0, 6), [relatedBase]);

  const handleShare = async () => {
    if (!show) return;
    // Try image share card first, falls back to text internally
    await shareCardRef.current?.share();
  };

  /**
   * Open a ticket link.
   *
   * Affiliate links use Linking.openURL so iOS hands off to the partner's native
   * app via Universal Link when installed (TodayTix, Ticketmaster, etc.). This
   * is what unlocks Impact's "Universal App/Web Link" attribution — the in-app
   * SFSafariViewController used by WebBrowser.openBrowserAsync silently swallows
   * Universal Links and forces the user into a web view, which only credits us
   * for web purchases. With Linking.openURL: app installed → native app + full
   * attribution; app missing → Safari + irclickid stamping (Impact still credits).
   *
   * Non-affiliate links (Telecharge, official sites) still use the in-app
   * browser since native handoff isn't a factor and the in-app UX is better.
   */
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

    // 2. Open the URL — affiliate vs non-affiliate path
    if (isAffiliate) {
      // Native app handoff via Universal Link. No dismiss callback exists, so we
      // skip ticket_browser_dismissed; conversion data from Impact is the
      // authoritative downstream signal anyway.
      try {
        await Linking.openURL(affiliateUrl);
        trackTicketBrowserOpened(eventProps);
      } catch {
        // openURL failed (malformed URL, no handler) — tap event still recorded.
        // Fall back to in-app browser so the user isn't stranded.
        try {
          await WebBrowser.openBrowserAsync(affiliateUrl);
          trackTicketBrowserOpened(eventProps);
        } catch {
          // Both paths failed — only the tap event survives.
        }
      }
      return;
    }

    // Non-affiliate: in-app browser with full lifecycle tracking
    const openedAt = Date.now();
    try {
      await WebBrowser.openBrowserAsync(affiliateUrl);
      trackTicketBrowserOpened(eventProps);

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
                {show.openingDate && (
                  <View style={styles.dateChip}>
                    <Text style={styles.dateChipText} numberOfLines={1}>
                      {show.status === 'previews' ? 'Opens' : 'Opened'} {formatDateShort(show.openingDate)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.title} numberOfLines={2}>{show.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>{show.venue}</Text>
              {show.runtime && <Text style={styles.meta} numberOfLines={1}>{show.runtime}</Text>}
              {show.closingDate && (
                <Text style={styles.meta} numberOfLines={1}>
                  {show.status === 'closed' ? 'Closed' : 'Closes'} {formatDate(show.closingDate)}
                </Text>
              )}
              {show.status === 'closed' && show.openingDate && show.closingDate && (
                <Text style={styles.meta} numberOfLines={1}>
                  Ran for {runLength(show.openingDate, show.closingDate)}
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
          {detail?.reviews && detail.reviews.length > 0 && hasEnoughReviews && (
            <View style={styles.breakdownSection}>
              <BreakdownBar reviews={detail.reviews} />
            </View>
          )}

          {/* Critics' Take consensus paragraph — right below breakdown */}
          {detail?.criticsTake && (
            <View
              style={[
                styles.criticsTakeBox,
                { borderLeftColor: getScoreTier(displayScore)?.color ?? Colors.brand },
              ]}
            >
              <Text style={styles.criticsTakeLabel}>Critics&apos; Take</Text>
              <Text style={styles.criticsTakeText}>{detail.criticsTake.text}</Text>
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

        {/* Audience Scorecard — grade badge header + horizontal source cards */}
        {detail?.audience && show.audienceGrade && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audience Grade</Text>
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.audienceSourceCards}
              >
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
                      <Text style={styles.audienceSourceLabel} numberOfLines={1}>SHOW SCORE</Text>
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
                      <Text style={styles.audienceSourceLabel} numberOfLines={1}>MEZZANINE</Text>
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
                {detail.audience.sources.theatr && (
                  <View style={styles.audienceSourceCard}>
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#a78bfa">
                        <Path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel} numberOfLines={1}>THEATR</Text>
                    </View>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.theatr.score}%
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.theatr.count} votes
                    </Text>
                  </View>
                )}
                {detail.audience.sources.broadwayCom && (
                  <View style={styles.audienceSourceCard}>
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#60a5fa">
                        <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel} numberOfLines={1}>BWAY.COM</Text>
                    </View>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.broadwayCom.starRating != null
                        ? `${detail.audience.sources.broadwayCom.starRating}/5`
                        : `${detail.audience.sources.broadwayCom.score}%`}
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.broadwayCom.count} reviews
                    </Text>
                  </View>
                )}
                {detail.audience.sources.reddit && (
                  <View style={styles.audienceSourceCard}>
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#fb923c">
                        <Path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel} numberOfLines={1}>REDDIT</Text>
                    </View>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.reddit.score}%
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.reddit.totalPosts} mentions
                    </Text>
                  </View>
                )}
                {detail.audience.sources.seatplan && (
                  <View style={styles.audienceSourceCard}>
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#34d399">
                        <Path d="M7 4v2H5v12h2v2H3V4h4zm10 0h4v16h-4v-2h2V6h-2V4zM9 8h6v2H9V8zm0 4h6v2H9v-2z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel} numberOfLines={1}>SEATPLAN</Text>
                    </View>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.seatplan.starRating != null
                        ? `${detail.audience.sources.seatplan.starRating}/5`
                        : `${detail.audience.sources.seatplan.score}%`}
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.seatplan.count} reviews
                    </Text>
                  </View>
                )}
                {detail.audience.sources.londonBoxOffice && (
                  <View style={styles.audienceSourceCard}>
                    <View style={styles.audienceSourceHeader}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="#f472b6">
                        <Path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
                      </Svg>
                      <Text style={styles.audienceSourceLabel} numberOfLines={1}>LONDON BO</Text>
                    </View>
                    <Text style={styles.audienceSourceValue}>
                      {detail.audience.sources.londonBoxOffice.starRating != null
                        ? `${detail.audience.sources.londonBoxOffice.starRating}/5`
                        : `${detail.audience.sources.londonBoxOffice.score}%`}
                    </Text>
                    <Text style={styles.audienceSourceMeta}>
                      {detail.audience.sources.londonBoxOffice.count} reviews
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        )}

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

        {/* Showtimes */}
        {detail?.showtimes && (
          <ShowtimesSection data={detail.showtimes} />
        )}

        {/* Box Office Scorecard */}
        {detail?.boxOffice && (
          <BoxOfficeSection data={detail.boxOffice} />
        )}

        {/* Lottery / Rush */}
        {detail?.lotteryRush && (
          <LotteryRushSection data={detail.lotteryRush} />
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


        {/* Tony Awards */}
        {detail?.tonyAwards && detail.tonyAwards.length > 0 && (
          <TonyAwardsSection awards={detail.tonyAwards} />
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

        {/* Open shows you might like */}
        {relatedShowsOpen.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Open Shows You Might Like</Text>
            {relatedShowsOpen.map(related => (
              <RelatedShowRow key={related.id} show={related} onPress={() => router.push(`/show/${related.slug}`)} />
            ))}
          </View>
        )}

        {/* Closed shows you might like */}
        {relatedShowsClosed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Closed Shows You Might Like</Text>
            {relatedShowsClosed.map(related => (
              <RelatedShowRow key={related.id} show={related} onPress={() => router.push(`/show/${related.slug}`)} />
            ))}
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

function BreakdownBar({ reviews }: { reviews: ShowDetail['reviews'] }) {
  const counts = { Rave: 0, Positive: 0, Mixed: 0, Negative: 0 };
  for (const r of reviews) {
    if (r.bucket === 'Rave') counts.Rave++;
    else if (r.bucket === 'Positive') counts.Positive++;
    else if (r.bucket === 'Mixed') counts.Mixed++;
    else if (r.bucket === 'Negative') counts.Negative++;
  }
  const total = counts.Rave + counts.Positive + counts.Mixed + counts.Negative;
  if (total === 0) return null;

  const raveColor = '#FFD700';  // gold
  const positiveColor = Colors.score.green;
  const mixedColor = Colors.score.amber;
  const negativeColor = Colors.score.red;

  const seg = (count: number, color: string) => count > 0 ? (
    <View style={[styles.breakdownSegment, { flex: count, backgroundColor: color }]} />
  ) : null;

  return (
    <View style={styles.breakdownContainer}>
      <View style={styles.breakdownBar}>
        {seg(counts.Rave, raveColor)}
        {seg(counts.Positive, positiveColor)}
        {seg(counts.Mixed, mixedColor)}
        {seg(counts.Negative, negativeColor)}
      </View>
      <View style={styles.breakdownLabels}>
        {counts.Rave > 0 && (
          <View style={styles.breakdownLabelRow}>
            <View style={[styles.breakdownDot, { backgroundColor: raveColor }]} />
            <Text style={styles.breakdownLabelText}>{counts.Rave} Rave</Text>
          </View>
        )}
        {counts.Positive > 0 && (
          <View style={styles.breakdownLabelRow}>
            <View style={[styles.breakdownDot, { backgroundColor: positiveColor }]} />
            <Text style={styles.breakdownLabelText}>{counts.Positive} Positive</Text>
          </View>
        )}
        {counts.Mixed > 0 && (
          <View style={styles.breakdownLabelRow}>
            <View style={[styles.breakdownDot, { backgroundColor: mixedColor }]} />
            <Text style={styles.breakdownLabelText}>{counts.Mixed} Mixed</Text>
          </View>
        )}
        {counts.Negative > 0 && (
          <View style={styles.breakdownLabelRow}>
            <View style={[styles.breakdownDot, { backgroundColor: negativeColor }]} />
            <Text style={styles.breakdownLabelText}>{counts.Negative} Negative</Text>
          </View>
        )}
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
        {review.designation === 'Critics_Pick' && (
          <View style={styles.criticsPickBadge}>
            <Text style={styles.criticsPickText}>★ Critics Pick</Text>
          </View>
        )}
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

function RelatedShowRow({ show, onPress }: { show: Show; onPress: () => void }) {
  const poster = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
  return (
    <Pressable
      style={({ pressed }) => [styles.relatedShowRow, pressed && styles.pressed]}
      onPress={onPress}
    >
      {poster ? (
        <Image source={{ uri: poster }} style={styles.relatedShowImage} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.relatedShowImage, styles.relatedShowPlaceholder]}>
          <Text style={styles.relatedShowPlaceholderText}>{show.title.charAt(0)}</Text>
        </View>
      )}
      <View style={styles.relatedShowInfo}>
        <Text style={styles.relatedShowTitle} numberOfLines={1}>{show.title}</Text>
        <Text style={styles.relatedShowVenue} numberOfLines={1}>{show.venue}</Text>
      </View>
      <ScoreBadge score={show.compositeScore} size="small" />
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

function runLength(openingDate: string, closingDate: string): string {
  try {
    const open = new Date(openingDate + 'T12:00:00');
    const close = new Date(closingDate + 'T12:00:00');
    const days = Math.round((close.getTime() - open.getTime()) / (1000 * 60 * 60 * 24));
    const months = Math.round(days / 30.44);
    if (months < 2) return `${days} days`;
    if (months < 12) return `${months} months`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem === 0 ? `${years} year${years > 1 ? 's' : ''}` : `${years}yr ${rem}mo`;
  } catch { return ''; }
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

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
  } catch {
    return iso;
  }
}

// ---------- Showtimes ----------

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function to12Hour(t: string | null): string {
  if (!t) return '—';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return mStr === '00' ? `${h} ${ampm}` : `${h}:${mStr} ${ampm}`;
}

function formatWeekRange(wkKey: string): string {
  if (!wkKey || wkKey.length !== 8) return '';
  const y = wkKey.slice(0, 4);
  const m = wkKey.slice(4, 6);
  const d = wkKey.slice(6, 8);
  try {
    const start = new Date(`${y}-${m}-${d}T12:00:00`);
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    const fmt = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  } catch { return ''; }
}

function getWeekContext(wkKey: string): { todayIndex: number; isPastWeek: boolean } {
  if (!wkKey || wkKey.length !== 8) return { todayIndex: -1, isPastWeek: false };
  try {
    const y = parseInt(wkKey.slice(0, 4), 10);
    const m = parseInt(wkKey.slice(4, 6), 10);
    const d = parseInt(wkKey.slice(6, 8), 10);
    const weekStart = new Date(y, m - 1, d);
    weekStart.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    return {
      todayIndex: diffDays >= 0 && diffDays < 7 ? diffDays : -1,
      isPastWeek: diffDays >= 7,
    };
  } catch { return { todayIndex: -1, isPastWeek: false }; }
}

function ShowtimesSection({ data }: { data: NonNullable<ShowDetail['showtimes']> }) {
  const range = formatWeekRange(data.week);
  const { todayIndex, isPastWeek } = getWeekContext(data.week);
  const rangeLabel = isPastWeek ? 'Last Week' : 'This Week';
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Showtimes</Text>
      {range && <Text style={styles.showtimesRange}>{rangeLabel} ({range})</Text>}
      <View style={styles.showtimesGrid}>
        {data.days.slice(0, 7).map((day, i) => {
          const hasShow = day.matinee || day.evening;
          const isToday = i === todayIndex;
          const isPast = todayIndex >= 0 && i < todayIndex;
          return (
            <View key={i} style={[styles.showtimesRow, isPast && styles.showtimesRowPast]}>
              <Text style={[
                styles.showtimesDay,
                !hasShow && styles.showtimesDayEmpty,
                isToday && styles.showtimesDayToday,
              ]}>{DAY_LABELS[i]}{isToday ? ' • TODAY' : ''}</Text>
              <Text style={[styles.showtimesTimes, isToday && styles.showtimesTimesToday]}>
                {day.matinee && <Text>{to12Hour(day.matinee)}</Text>}
                {day.matinee && day.evening && <Text style={styles.showtimesDot}>  ·  </Text>}
                {day.evening && <Text>{to12Hour(day.evening)}</Text>}
                {!hasShow && <Text style={styles.showtimesDayEmpty}>—</Text>}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Box Office Scorecard ----------

function formatMoney(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function pctChange(curr: number | null, prev: number | null): { label: string; positive: boolean } | null {
  if (curr == null || prev == null || prev === 0) return null;
  const delta = ((curr - prev) / prev) * 100;
  // Suppress normal weekly noise (holiday weeks, schedule shifts) — only show meaningful swings
  if (Math.abs(delta) < 10) return null;
  return { label: `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%`, positive: delta > 0 };
}

function BoxOfficeSection({ data }: { data: NonNullable<ShowDetail['boxOffice']> }) {
  const tw = data.thisWeek;
  const at = data.allTime;
  if (!tw && !at) return null;

  const grossDelta = tw ? pctChange(tw.gross, tw.grossPrev) : null;
  const capDelta = tw ? pctChange(tw.capacity, tw.capacityPrev) : null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Box Office Scorecard</Text>
      {tw && (
        <>
          <Text style={styles.boSubheading}>This Week</Text>
          <View style={styles.boRow}>
            <View style={styles.boCell}>
              <Text style={styles.boValue}>{formatMoney(tw.gross)}</Text>
              <Text style={styles.boLabel}>Gross</Text>
              {grossDelta && <Text style={[styles.boDelta, { color: grossDelta.positive ? Colors.score.green : Colors.score.red }]}>{grossDelta.label} WoW</Text>}
            </View>
            <View style={styles.boCell}>
              <Text style={styles.boValue}>{tw.capacity != null ? `${Math.round(tw.capacity)}%` : '—'}</Text>
              <Text style={styles.boLabel}>Capacity</Text>
              {capDelta && <Text style={[styles.boDelta, { color: capDelta.positive ? Colors.score.green : Colors.score.red }]}>{capDelta.label} WoW</Text>}
            </View>
            <View style={styles.boCell}>
              <Text style={styles.boValue}>{tw.avgTicket != null ? `$${Math.round(tw.avgTicket)}` : '—'}</Text>
              <Text style={styles.boLabel}>Avg Ticket</Text>
            </View>
          </View>
        </>
      )}
      {at && (
        <>
          <Text style={[styles.boSubheading, { marginTop: Spacing.md }]}>All Time</Text>
          <View style={styles.boRow}>
            <View style={styles.boCell}>
              <Text style={styles.boValue}>{formatMoney(at.gross)}</Text>
              <Text style={styles.boLabel}>Gross</Text>
            </View>
            <View style={styles.boCell}>
              <Text style={styles.boValue}>{at.performances != null ? at.performances.toLocaleString() : '—'}</Text>
              <Text style={styles.boLabel}>Performances</Text>
            </View>
            <View style={styles.boCell}>
              <Text style={styles.boValue}>{at.attendance != null ? (at.attendance >= 1000 ? `${(at.attendance / 1000).toFixed(1)}K` : at.attendance.toString()) : '—'}</Text>
              <Text style={styles.boLabel}>Attendance</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ---------- Lottery / Rush ----------

const LR_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  lottery: { label: 'Lottery', color: '#a78bfa' },
  rush: { label: 'Rush', color: '#34d399' },
  digitalRush: { label: 'Digital Rush', color: '#60a5fa' },
  studentRush: { label: 'Student Rush', color: '#f472b6' },
  standingRoom: { label: 'Standing Room', color: '#94a3b8' },
};

type LRWindow = NonNullable<NonNullable<ShowDetail['lotteryRush']>['lottery']>;

function LRCard({ type, data }: { type: keyof typeof LR_TYPE_CONFIG; data: LRWindow }) {
  const cfg = LR_TYPE_CONFIG[type];
  const open = async () => {
    if (data.url) await WebBrowser.openBrowserAsync(data.url);
  };
  const Wrapper: any = data.url ? Pressable : View;
  return (
    <Wrapper
      style={({ pressed }: { pressed: boolean }) => [styles.lrCard, { borderColor: cfg.color + '40' }, pressed && styles.pressed]}
      onPress={data.url ? open : undefined}
    >
      <View style={styles.lrHeader}>
        <Text style={[styles.lrLabel, { color: cfg.color }]}>{cfg.label}</Text>
        {data.price != null && <Text style={styles.lrPrice}>${data.price}</Text>}
      </View>
      {data.time && <Text style={styles.lrMeta}>{data.time}</Text>}
      {data.location && <Text style={styles.lrMeta}>{data.location}</Text>}
      {data.instructions && <Text style={styles.lrInst} numberOfLines={3}>{data.instructions}</Text>}
      {data.platform && <Text style={styles.lrPlatform}>via {data.platform}{data.url ? ' →' : ''}</Text>}
    </Wrapper>
  );
}

function LotteryRushSection({ data }: { data: NonNullable<ShowDetail['lotteryRush']> }) {
  const entries: [keyof typeof LR_TYPE_CONFIG, LRWindow][] = [];
  if (data.lottery) entries.push(['lottery', data.lottery]);
  if (data.rush) entries.push(['rush', data.rush]);
  if (data.digitalRush) entries.push(['digitalRush', data.digitalRush]);
  if (data.studentRush) entries.push(['studentRush', data.studentRush]);
  if (data.standingRoom) entries.push(['standingRoom', data.standingRoom]);
  if (entries.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Same-Day Tickets</Text>
      {entries.map(([type, d]) => <LRCard key={type} type={type} data={d} />)}
    </View>
  );
}

// ---------- Tony Awards ----------

function TonyAwardsSection({ awards }: { awards: ShowDetail['tonyAwards'] }) {
  const wins = awards.filter(a => a.won);
  const noms = awards.filter(a => !a.won);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Tony Awards {wins.length > 0 ? `· ${wins.length} Win${wins.length > 1 ? 's' : ''}` : ''}
      </Text>
      {wins.length > 0 && (
        <>
          <Text style={styles.tonyGroupLabel}>WINS</Text>
          {wins.map((a, i) => (
            <View key={i} style={styles.tonyRow}>
              <View style={styles.tonyIconSlot}>
                <IconSymbol name="trophy.fill" size={16} color="#FFD700" />
              </View>
              <View style={styles.tonyInfo}>
                <Text style={styles.tonyCategory}>{a.category}</Text>
                {a.name && <Text style={styles.tonyName}>{a.name} · {ceremonyToYear(a.year)}</Text>}
                {!a.name && <Text style={styles.tonyName}>{ceremonyToYear(a.year)}</Text>}
              </View>
            </View>
          ))}
        </>
      )}
      {noms.length > 0 && (
        <>
          <Text style={[styles.tonyGroupLabel, { marginTop: wins.length > 0 ? Spacing.md : 0 }]}>NOMINATIONS</Text>
          {noms.map((a, i) => (
            <View key={i} style={styles.tonyRow}>
              <View style={styles.tonyIconSlot}>
                <IconSymbol name="star" size={16} color={Colors.text.muted} />
              </View>
              <View style={styles.tonyInfo}>
                <Text style={styles.tonyCategory}>{a.category}</Text>
                {a.name && <Text style={styles.tonyName}>{a.name} · {ceremonyToYear(a.year)}</Text>}
                {!a.name && <Text style={styles.tonyName}>{ceremonyToYear(a.year)}</Text>}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
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
  const quotes = (sp.q ?? [])
    .filter(q => {
      const text = (q.t ?? '').trim();
      // Drop entries that are pure URLs or mostly link-shortener noise — keep
      // short reactions like "Masterpiece!" that theatergoers actually post.
      const stripped = text.replace(/https?:\/\/\S+/g, '').trim();
      if (stripped.length < 10) return false;
      return true;
    })
    .slice(0, 2);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Socials Scorecard</Text>
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
      {quotes.length > 0 && quotes.map((q, i) => (
        <View key={i} style={styles.socialQuote}>
          <Text style={styles.socialQuoteText} numberOfLines={2}>{'\u201C'}{q.t.trim()}{'\u201D'}</Text>
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
      <Text style={styles.sectionTitle}>Seating Scorecard</Text>
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
        // Venue dimensions are on a 1-5 scale
        const pct = Math.max(0, Math.min(100, (score / 5) * 100));
        const color = score >= 4 ? '#10b981' : score >= 3 ? '#f59e0b' : '#ef4444';
        return (
          <View key={d.key} style={styles.venueDimRow}>
            <Text style={styles.venueDimLabel}>{d.label}</Text>
            <View style={styles.venueDimBarBg}>
              <View style={[styles.venueDimBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
            </View>
            <Text style={[styles.venueDimScore, { color }]}>{score} / 5</Text>
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
    alignItems: 'center',
  },
  dateChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  dateChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text.secondary,
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
  criticsPickBadge: {
    backgroundColor: '#facc15' + '22',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  criticsPickText: {
    color: '#facc15',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
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
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  audienceSourceCard: {
    width: 110,
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  // Show all button (reviews, cast) — filled pill
  showAllButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.brand,
    borderRadius: 999,
  },
  showAllText: {
    color: '#0a0a0a',
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
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

  // Critics' Take
  criticsTakeBox: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.brand,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.sm,
  },
  criticsTakeLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  criticsTakeText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  // Showtimes
  showtimesRange: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
  },
  showtimesGrid: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  showtimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  showtimesRowPast: {
    opacity: 0.4,
  },
  showtimesDay: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    width: 100,
  },
  showtimesDayEmpty: {
    color: Colors.text.muted,
  },
  showtimesDayToday: {
    color: Colors.score.teal,
  },
  showtimesTimes: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    flex: 1,
  },
  showtimesTimesToday: {
    color: Colors.score.teal,
    fontWeight: '700',
  },
  showtimesDot: {
    color: Colors.text.muted,
  },

  // Box Office
  boSubheading: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  boRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  boCell: {
    flex: 1,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  boValue: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  boLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  boDelta: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },

  // Lottery/Rush
  lrCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface.raised,
  },
  lrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  lrLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lrPrice: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  lrMeta: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  lrInst: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 4,
    lineHeight: 16,
  },
  lrPlatform: {
    color: Colors.brand,
    fontSize: FontSize.xs,
    marginTop: 6,
    fontWeight: '600',
  },

  // Tony Awards
  tonyGroupLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  tonyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    gap: Spacing.sm,
  },
  tonyIconSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  tonyInfo: {
    flex: 1,
  },
  tonyCategory: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  tonyName: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
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
