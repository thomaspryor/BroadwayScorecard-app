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
import { nowMs } from '@/lib/date-utils';
import { getScoreColor, getContrastTextColor, getMarketMinReviews, getQualifiedScore } from '@/lib/score-utils';
import { Show, ShowDetail, MobileShowDetail, mapShowDetail } from '@/lib/types';
import { ScoreBadge, StatusBadge, FormatPill, ProductionPill, CategoryBadge } from '@/components/show-cards';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { trackTicketTap, trackTicketLinksVisible, trackTicketBrowserOpened, trackTicketBrowserDismissed, trackShowDetailViewed, trackShowShared, trackFullReviewTapped } from '@/lib/analytics';
import { buildTicketUrl, buildTicketEventProps, isAffiliatePlatform, chooseTicketOpenStrategy, type TicketSource } from '@/lib/ticket-utils';
import { addSentryBreadcrumb, captureException } from '@/lib/sentry';
import Svg, { Path, Rect, Circle, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import ShowPageRating from '@/components/user/ShowPageRating';
import { BookmarkOverlay } from '@/components/BookmarkOverlay';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ceremonyToYear } from '@/lib/tony-utils';
import { recordShowView } from '@/lib/store-review';
import { ShareCardWithRef, ShareCardHandle } from '@/components/ShareCard';
import { SectionCard } from '@/components/show-page/SectionCard';
import { LinearGradient } from 'expo-linear-gradient';
import { ShowDetailSkeleton } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useMyRatingsMap } from '@/hooks/useMyRatingsMap';
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
  // Capture rig: EXPO_PUBLIC_AUTOSCROLL=1 slowly pages the screen so design
  // captures can be taken with simctl alone (no UI-driver needed). Dev only.
  const captureScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_AUTOSCROLL !== '1') return;
    let y = 0;
    const id = setInterval(() => {
      y += 600;
      // animated:false — discrete jumps so every captured frame is at rest
      captureScrollRef.current?.scrollTo({ y, animated: false });
      if (y > 40000) clearInterval(id);
    }, 1400);
    return () => clearInterval(id);
  }, [detail]);

  const show = useMemo(() => shows.find(s => s.slug === slug), [shows, slug]);
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { isWatchlisted, addToWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);
  const ratingsMap = useMyRatingsMap(user?.id || null);

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
        getQualifiedScore(s) != null
      )
      .sort((a, b) => {
        const ref = getQualifiedScore(show) ?? show.compositeScore ?? 0;
        const aDiff = Math.abs((getQualifiedScore(a) ?? 0) - ref);
        const bDiff = Math.abs((getQualifiedScore(b) ?? 0) - ref);
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

    // 2. Open the URL — affiliate vs non-affiliate path.
    //
    // PostHog funnel note: ticket_browser_dismissed fires only on the
    // non-affiliate path. Any tap → opened → dismissed funnel will appear
    // to drop ~100% of TodayTix/Ticketmaster/StubHub/Vivid Seats/SeatPlan
    // traffic at the dismissed stage. Don't rebuild that funnel — use
    // Impact conversion data for affiliates instead. (See ship-check
    // 2026-04-25, P1.3 in commit history.)
    const strategy = chooseTicketOpenStrategy(isAffiliate);
    if (strategy === 'native-handoff') {
      // Native app handoff via Universal Link. No dismiss callback exists,
      // so we skip ticket_browser_dismissed for affiliate clicks.
      try {
        await Linking.openURL(affiliateUrl);
        trackTicketBrowserOpened(eventProps);
      } catch (err) {
        // openURL failed (malformed URL, no handler). Log it — silent
        // failure here would mean dead ticket buttons with no signal.
        addSentryBreadcrumb('ticket-link', 'Linking.openURL failed, falling back to WebBrowser', {
          platform: link.platform,
          source,
        });
        try {
          await WebBrowser.openBrowserAsync(affiliateUrl);
          trackTicketBrowserOpened(eventProps);
        } catch (fallbackErr) {
          // Both paths failed — capture as exception. Tap event still recorded.
          captureException(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)), {
            context: 'ticket-link-open-failed',
            platform: link.platform,
            source,
            linking_error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }

    // Non-affiliate: in-app browser with full lifecycle tracking
    const openedAt = nowMs();
    try {
      await WebBrowser.openBrowserAsync(affiliateUrl);
      trackTicketBrowserOpened(eventProps);

      const timeOnSiteMs = nowMs() - openedAt;
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

  // Market-aware minimum reviews before showing a composite (mirrors the website's gate)
  const hasEnoughReviews = (show.criticScore?.reviewCount ?? 0) >= getMarketMinReviews(show.category);
  const displayScore = getQualifiedScore(show);

  return (
    <>
      <Stack.Screen
        options={{
          title: show.title,
          // Header share button — owner ask 2026-07-31: "Screens like this
          // need a Share button" (the Share Score Card CTA lives below the
          // fold; this makes sharing reachable from the top of every show).
          headerRight: () => (
            <Pressable
              onPress={handleShare}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Share this show"
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.text.primary} strokeWidth={2}>
                <Path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13m0-13l-4 4m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </Svg>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
      <ScrollView ref={captureScrollRef} style={styles.scrollView} contentContainerStyle={styles.content}>
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
                  myRating={ratingsMap.get(show.id) ?? null}
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
                  {show.status === 'previews' ? 'Opens' : 'Opened'} {formatDateShort(show.openingDate)}
                </Text>
              )}
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
            <ScoreBadge score={displayScore} category={show.category} size="large" animated />
            <View style={styles.scoreMeta}>
              {hasEnoughReviews && show.criticScore ? (
                <>
                  <Text style={[styles.sentimentLabel, { color: getScoreColor(displayScore, show.category) }]}>
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
            <View style={styles.criticsTakeBox}>
              <View style={styles.criticsTakeHeader}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill={Colors.brand} opacity={0.7}>
                  <Path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </Svg>
                <View style={styles.criticsTakeHeaderText}>
                  <Text style={styles.criticsTakeLabel}>Critics&apos; Take</Text>
                  <Text style={styles.criticsTakeText}>{detail.criticsTake.text}</Text>
                </View>
              </View>
              <View style={styles.criticsTakeFooter}>
                <Text style={styles.criticsTakeFooterText}>
                  Based on {detail.criticsTake.reviewCount} {detail.criticsTake.reviewCount === 1 ? 'review' : 'reviews'}
                </Text>
              </View>
            </View>
          )}

          {/* Single Get Tickets CTA — TodayTix only (affiliate revenue; owner decision 2026-07-20).
             Official Site moved to Quick Facts at the bottom of the page. */}
          {show.status !== 'closed' && (() => {
            const todayTix = show.ticketLinks?.find(l => /todaytix/i.test(l.platform)) ?? show.ticketLinks?.[0];
            if (!todayTix) return null;
            return (
              <Pressable
                style={({ pressed }) => [styles.getTicketsButton, pressed && styles.pressed]}
                onPress={() => openTicketLink(todayTix, 0, 'show_detail')}
              >
                <Text style={styles.getTicketsText}>Get Tickets</Text>
              </Pressable>
            );
          })()}

          {/* User rating + watchlist (feature-flagged) — inside header card */}
          <ShowPageRating
            showId={show.id}
            showTitle={show.title}
            closingDate={show.closingDate}

          />
        </View>

        {/* Audience Scorecard — grade badge header + horizontal source cards */}
        {detail?.audience && show.audienceGrade && (
          <SectionCard
            title="Audience Scorecard"
            meta={`${
              (detail.audience.sources.showScore?.count ?? 0) +
              (detail.audience.sources.mezzanine?.count ?? 0) +
              (detail.audience.sources.reddit?.count ?? 0)
            } audience reviews`}
          >
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
            {/* Source tile grid — wraps like the web's grid-cols-3; every
               source visible, no horizontal scroll (owner 2026-08-03) */}
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
              </View>
            )}
          </SectionCard>
        )}

        {/* Critic Reviews List — collapsed by default */}
        {detail?.reviews && detail.reviews.length > 0 && (
          <SectionCard title="Critic Scorecard" meta={`${detail.reviews.length} reviews`}>
            {(showAllReviews ? detail.reviews : detail.reviews.slice(0, 3)).map((review, i) => (
              <ReviewRow key={i} review={review} showId={show.id} category={show.category} />
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
          </SectionCard>
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
        {detail?.showtimes && (() => {
          const stTix = show.status !== 'closed'
            ? show.ticketLinks?.find(l => /todaytix/i.test(l.platform)) ?? show.ticketLinks?.[0]
            : undefined;
          return (
            <ShowtimesSection
              data={detail.showtimes}
              onTicketPress={stTix ? () => openTicketLink(stTix, 0, 'showtimes') : undefined}
            />
          );
        })()}

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

        {/* Seating Guidance */}
        {detail?.seatingSections && detail.seatingSections.length > 0 && (
          <SeatingGuidanceSection sections={detail.seatingSections} />
        )}

        {/* Theater Scorecard */}
        {detail?.venueScores && (
          <TheaterScorecardSection
            scores={detail.venueScores}
            venueName={show.venue}
            accessibility={detail.accessibility}
            links={detail.theaterLinks}
          />
        )}

        {/* Synopsis */}
        {show.synopsis && (
          <SectionCard title="About">
            <Text style={styles.synopsis}>{show.synopsis}</Text>
          </SectionCard>
        )}

        {/* Cast — show first 6, expandable */}
        {detail?.cast && detail.cast.length > 0 && (
          <SectionCard title="Cast" meta={`${detail.cast.length} members`}>
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
          </SectionCard>
        )}

        {/* Creative Team */}
        {show.creativeTeam?.length > 0 && (
          <SectionCard title="Creative Team">
            {show.creativeTeam.map((member, i) => (
              <View key={i} style={styles.creditRow}>
                <Text style={styles.creditRole}>{member.role}</Text>
                <Text style={styles.creditName}>{member.name}</Text>
              </View>
            ))}
          </SectionCard>
        )}


        {/* Awards Scorecard — Tony rows OR any award-score data (Pulitzer /
           Lortel-only shows have aw but no tn) */}
        {detail && (detail.tonyAwards.length > 0 || detail.awards) && (
          <AwardsScorecardSection awards={detail.tonyAwards} awardScore={detail.awards} />
        )}

        {/* Video Reviews */}
        {detail?.videoReviews && detail.videoReviews.length > 0 && (
          <VideoReviewsSection reviews={detail.videoReviews} category={show.category} />
        )}

        {/* Other Productions of the same show */}
        {otherProductions.length > 0 && (
          <SectionCard title="Other Productions" meta={show.title}>
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
                  <ScoreBadge score={getQualifiedScore(prod)} category={prod.category} size="small" />
                </Pressable>
              );
            })}
          </SectionCard>
        )}

        {/* Open shows you might like */}
        {relatedShowsOpen.length > 0 && (
          <SectionCard title="Open Shows You Might Like">
            {relatedShowsOpen.map(related => (
              <RelatedShowRow key={related.id} show={related} onPress={() => router.push(`/show/${related.slug}`)} />
            ))}
          </SectionCard>
        )}

        {/* Closed shows you might like */}
        {relatedShowsClosed.length > 0 && (
          <SectionCard title="Closed Shows You Might Like">
            {relatedShowsClosed.map(related => (
              <RelatedShowRow key={related.id} show={related} onPress={() => router.push(`/show/${related.slug}`)} />
            ))}
          </SectionCard>
        )}

        {/* Hidden share card for image capture */}
        <ShareCardWithRef ref={shareCardRef} show={show} />

        {/* Quick Facts — structured basics + Official Site (relocated from the hero ticket row) */}
        <SectionCard title="Quick Facts">
          <View style={styles.qfCard}>
            <View style={styles.qfRow}>
              <Text style={styles.qfLabel}>Status</Text>
              <Text style={styles.qfValue}>
                {show.status === 'open' ? 'Now Playing' : show.status === 'previews' ? 'In Previews' : show.status === 'upcoming' ? 'Upcoming' : 'Closed'}
              </Text>
            </View>
            {show.openingDate && (
              <View style={styles.qfRow}>
                <Text style={styles.qfLabel}>{show.status === 'previews' || show.status === 'upcoming' ? 'Opens' : 'Opened'}</Text>
                <Text style={styles.qfValue}>{formatQuickFactDate(show.openingDate)}</Text>
              </View>
            )}
            {show.closingDate && (
              <View style={styles.qfRow}>
                <Text style={styles.qfLabel}>{show.status === 'closed' ? 'Closed' : 'Closes'}</Text>
                <Text style={styles.qfValue}>{formatQuickFactDate(show.closingDate)}</Text>
              </View>
            )}
            {show.runtime && (
              <View style={styles.qfRow}>
                <Text style={styles.qfLabel}>Runtime</Text>
                <Text style={styles.qfValue}>{show.runtime}</Text>
              </View>
            )}
            {show.ageRecommendation && (
              <View style={styles.qfRow}>
                <Text style={styles.qfLabel}>Ages</Text>
                <Text style={styles.qfValue}>{show.ageRecommendation}</Text>
              </View>
            )}
            <View style={styles.qfRow}>
              <Text style={styles.qfLabel}>{show.category === 'west-end' ? 'Theatre' : 'Theater'}</Text>
              <Text style={[styles.qfValue, styles.qfValueFlex]} numberOfLines={1}>
                {detail?.theaterAddress ? `${show.venue} · ${detail.theaterAddress}` : show.venue}
              </Text>
            </View>
            {show.officialUrl && (
              <Pressable
                style={({ pressed }) => [styles.qfRow, pressed && styles.pressed]}
                onPress={() => WebBrowser.openBrowserAsync(show.officialUrl!)}
              >
                <Text style={styles.qfLabel}>Official Site</Text>
                <Text style={styles.qfLink}>Visit ↗</Text>
              </Pressable>
            )}
          </View>
        </SectionCard>

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

function ReviewRow({ review, showId, category }: { review: ShowDetail['reviews'][0]; showId: string; category?: string }) {
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

  // Option A (owner-approved): whole row is the tap target with a chevron
  // affordance — native list-row idiom, no more tiny "Full Review" text link.
  const openFullReview = review.url
    ? () => {
        trackFullReviewTapped(showId, review.outlet, review.criticName || null);
        WebBrowser.openBrowserAsync(review.url!);
      }
    : undefined;

  return (
    <Pressable
      style={({ pressed }) => [styles.reviewRow, pressed && openFullReview && styles.pressed]}
      onPress={openFullReview}
      disabled={!openFullReview}
      accessibilityRole={openFullReview ? 'link' : undefined}
      accessibilityLabel={`${review.score} from ${review.outlet}${review.criticName ? ` by ${review.criticName}` : ''}${openFullReview ? '. Opens full review' : ''}`}
    >
      <ScoreBadge score={review.score} category={category} size="small" />
      <View style={styles.reviewBody}>
        <View style={styles.reviewTopRow}>
          {logoUrl && (
            <View style={styles.outletLogoBadge}>
              <Image source={{ uri: logoUrl }} style={styles.outletLogo} contentFit="contain" />
            </View>
          )}
          <Text style={styles.reviewOutlet} numberOfLines={1}>{review.outlet}</Text>
          {review.designation === 'Critics_Pick' && (
            <View style={styles.criticsPickBadge}>
              <Text style={styles.criticsPickText}>★ Critics Pick</Text>
            </View>
          )}
        </View>
        {review.pullQuote && (
          <Text style={styles.reviewQuote}>
            {'\u201C'}{review.pullQuote}{/[.!?'\u2019"\u201D]$/.test(review.pullQuote.trim()) ? '' : '.'}{'\u201D'}
          </Text>
        )}
        <View style={styles.reviewMetaRow}>
          <Text style={styles.reviewCritic} numberOfLines={1}>
            {review.criticName || `${review.outlet} Staff`}
          </Text>
          {formattedDate && <Text style={styles.reviewMetaDot}>·</Text>}
          {formattedDate && <Text style={styles.reviewDate}>{formattedDate}</Text>}
        </View>
      </View>
      {openFullReview && (
        <IconSymbol name="chevron.right" size={18} color={Colors.text.muted} style={styles.reviewChevron} />
      )}
    </Pressable>
  );
}

function formatQuickFactDate(d: string): string {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
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
      <ScoreBadge score={getQualifiedScore(show)} category={show.category} size="small" />
    </Pressable>
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

function ShowtimesSection({ data, onTicketPress }: {
  data: NonNullable<ShowDetail['showtimes']>;
  onTicketPress?: () => void;
}) {
  const range = formatWeekRange(data.week);
  const { todayIndex, isPastWeek } = getWeekContext(data.week);
  const rangeLabel = isPastWeek ? 'Last Week' : 'This Week';
  // Times are the affiliate on-ramp: styled as links and tappable when a
  // ticket link exists (owner request 2026-08-03 — this card drives revenue).
  const timeStyle = onTicketPress ? styles.showtimesTimeLink : undefined;
  return (
    <SectionCard title="Showtimes" meta={range ? `${rangeLabel} (${range})` : undefined}>
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
              <Text
                style={[styles.showtimesTimes, isToday && styles.showtimesTimesToday]}
                onPress={hasShow && onTicketPress ? onTicketPress : undefined}
                suppressHighlighting
              >
                {day.matinee && <Text style={timeStyle}>{to12Hour(day.matinee)}</Text>}
                {day.matinee && day.evening && <Text style={styles.showtimesDot}>  ·  </Text>}
                {day.evening && <Text style={timeStyle}>{to12Hour(day.evening)}</Text>}
                {!hasShow && <Text style={styles.showtimesDayEmpty}>—</Text>}
              </Text>
            </View>
          );
        })}
      </View>
      {onTicketPress && (
        <Pressable
          style={({ pressed }) => [styles.showtimesCta, pressed && styles.pressed]}
          onPress={onTicketPress}
        >
          <Text style={styles.showtimesCtaText}>Get Tickets →</Text>
        </Pressable>
      )}
    </SectionCard>
  );
}

// ---------- Box Office Scorecard ----------

function formatMoney(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
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
    <SectionCard title="Box Office Scorecard">
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
              <Text style={styles.boValue}>{at.attendance != null ? (at.attendance >= 1_000_000 ? `${(at.attendance / 1_000_000).toFixed(1)}M` : at.attendance >= 1000 ? `${(at.attendance / 1000).toFixed(1)}K` : at.attendance.toString()) : '—'}</Text>
              <Text style={styles.boLabel}>Attendance</Text>
            </View>
          </View>
        </>
      )}
    </SectionCard>
  );
}

// ---------- Lottery / Rush ----------

// Program names + tints match the web's Discount Tickets card
// (web: LotteryRushCard.tsx — purple lottery, emerald rush, blue digital
// rush, pink student rush, gray standing room).
const LR_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  lottery: { label: 'Digital Lottery', color: '#a78bfa' },
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
  const tint = { backgroundColor: cfg.color + '26', borderColor: cfg.color + '40' };
  const inner = (
    <>
      <View style={styles.lrHeader}>
        <Text style={[styles.lrLabel, { color: cfg.color }]}>{cfg.label}</Text>
        {data.price != null && <Text style={styles.lrPrice}>${data.price}</Text>}
      </View>
      {data.time && <Text style={styles.lrMeta}>{data.time}</Text>}
      {data.location && <Text style={styles.lrMeta}>{data.location}</Text>}
      {data.instructions && <Text style={styles.lrInst}>{data.instructions}</Text>}
      {data.platform && (
        <Text style={[styles.lrPlatform, data.url && { color: cfg.color }]}>
          {data.url
            ? `${type === 'lottery' ? 'Enter' : 'Get'} on ${data.platform} →`
            : `via ${data.platform}`}
        </Text>
      )}
    </>
  );
  // NOTE: plain View must get a resolved style array — passing Pressable's
  // function-style to a View silently drops ALL styling (the pre-redesign bug
  // that unboxed this section for shows without a lottery URL).
  return data.url ? (
    <Pressable
      style={({ pressed }) => [styles.lrCard, tint, pressed && styles.pressed]}
      onPress={open}
    >
      {inner}
    </Pressable>
  ) : (
    <View style={[styles.lrCard, tint]}>{inner}</View>
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
    <SectionCard title="Discount Tickets">
      {entries.map(([type, d]) => <LRCard key={type} type={type} data={d} />)}
      <Text style={styles.lrDisclosure}>Some links may earn us a commission at no extra cost to you.</Text>
    </SectionCard>
  );
}

// ---------- Awards Scorecard ----------

/** "2016" ceremony → "2015-16" season label, matching the web's season meta. */
function seasonLabel(ceremonyYear: number): string {
  return `${ceremonyYear - 1}-${String(ceremonyYear).slice(-2)}`;
}

// Tier styling for the award-score badge — same medal treatment as the
// site's AwardScoreBadge (metallic gradient fill, rim, glow, dark digit).
const AWARD_BADGE_CONFIG: Record<string, {
  label: string;
  gradient: [string, string, string, string, string] | null;
  fill: string;          // used when gradient is null
  rim: string;
  digit: string;
  labelColor: string;
  glow: string | null;
  dashed?: boolean;
}> = {
  sweeper: {
    label: 'SWEEPER',
    gradient: ['#C9A227', '#F7D560', '#FFF1B5', '#F7D560', '#C9A227'],
    fill: '#F7D560', rim: 'rgba(255,232,117,0.85)', digit: '#451a03',
    labelColor: '#fbbf24', glow: 'rgba(247,213,96,0.6)',
  },
  decorated: {
    label: 'DECORATED',
    gradient: ['#9a9a9a', '#D0D0D0', '#F0F0F0', '#D0D0D0', '#9a9a9a'],
    fill: '#D0D0D0', rim: 'rgba(240,240,240,0.7)', digit: '#111827',
    labelColor: '#d1d5db', glow: 'rgba(200,200,200,0.5)',
  },
  honored: {
    label: 'HONORED',
    gradient: ['#8a4a23', '#C2773A', '#D89668', '#C2773A', '#8a4a23'],
    fill: '#C2773A', rim: 'rgba(216,150,104,0.75)', digit: '#451a03',
    labelColor: '#fb923c', glow: 'rgba(194,119,58,0.55)',
  },
  nominated: {
    label: 'NOMINATED',
    gradient: null,
    fill: 'rgba(255,255,255,0.03)', rim: 'rgba(255,255,255,0.22)', digit: 'rgba(255,255,255,0.55)',
    labelColor: '#9ca3af', glow: null,
  },
  eligible: {
    label: 'ELIGIBLE',
    gradient: null,
    fill: 'transparent', rim: 'rgba(255,255,255,0.18)', digit: 'rgba(255,255,255,0.4)',
    labelColor: '#6b7280', glow: null, dashed: true,
  },
};

// Per-ceremony chip tints, mirroring the site's OTHER_CEREMONY_CONFIGS.
const OTHER_AWARD_COLORS: Record<string, string> = {
  'Lortel Award': '#a78bfa',
  'Drama Desk': '#c084fc',
  'Outer Critics': '#2dd4bf',
  'Drama League': '#34d399',
  'NY Drama Critics': '#fb7185',
  'Obie Award': '#fbbf24',
  'Olivier': '#60a5fa',
};

function AwardsScorecardSection({ awards, awardScore }: {
  awards: ShowDetail['tonyAwards'];
  awardScore: ShowDetail['awards'];
}) {
  // Capture rig: default the category list open so the expanded state can be
  // screenshotted without a tap driver. Collapsed remains the shipped default.
  const [expanded, setExpanded] = useState(process.env.EXPO_PUBLIC_EXPAND_AWARDS === '1');
  // Group like the site's AwardScoreCard: one row per CATEGORY ("13" for
  // Hamilton), co-nominees joined (" · "). Won categories show the winners'
  // names; nominated-only categories show all nominees. The raw feed lists
  // one row per nominee and can repeat a category with and without a name.
  const grouped = new Map<string, { category: string; won: boolean; winners: string[]; nominees: string[]; year: number }>();
  for (const a of awards) {
    let g = grouped.get(a.category);
    if (!g) {
      g = { category: a.category, won: false, winners: [], nominees: [], year: a.year };
      grouped.set(a.category, g);
    }
    if (a.won) g.won = true;
    const bucket = a.won ? g.winners : g.nominees;
    if (a.name && !bucket.includes(a.name)) bucket.push(a.name);
  }
  const rows = [...grouped.values()].map(g => {
    const names = g.won ? g.winners : g.nominees;
    return {
      category: g.category,
      won: g.won,
      name: names.length > 0 ? names.join(' · ') : null,
      year: g.year,
    };
  });
  const wins = rows.filter(a => a.won);
  const noms = rows.filter(a => !a.won);
  // Prefer the site-computed counts from the feed so numbers match the web
  // exactly ("11 wins of 13 noms"); fall back to grouped-row counts.
  const winCount = awardScore?.tonyWins ?? wins.length;
  const nomCount = awardScore?.tonyNoms ?? rows.length;
  const seasonFromRows = rows.length > 0
    ? seasonLabel(Math.max(...rows.map(a => ceremonyToYear(a.year))))
    : null;
  const season = awardScore?.season ?? seasonFromRows;
  const ordered = [...wins, ...noms];
  const badge = awardScore ? AWARD_BADGE_CONFIG[awardScore.badge] ?? AWARD_BADGE_CONFIG.eligible : null;

  return (
    <SectionCard title="Awards Scorecard" meta={season ? `${season} season` : undefined}>
      {/* Award-score hero row — site parity (AwardScoreBadge medal + tier + sublabel) */}
      {awardScore && badge && (
        <View style={styles.awardsHeroRow}>
          <View
            style={[
              styles.awardsScoreBadge,
              {
                borderColor: badge.rim,
                borderStyle: badge.dashed ? 'dashed' : 'solid',
                backgroundColor: badge.gradient ? 'transparent' : badge.fill,
              },
              badge.glow ? { shadowColor: badge.glow, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } } : null,
            ]}
          >
            {badge.gradient && (
              <LinearGradient
                colors={badge.gradient}
                locations={[0, 0.3, 0.5, 0.7, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.awardsScoreBadgeFill}
              />
            )}
            <Text style={[styles.awardsScoreText, { color: badge.digit }]}>{awardScore.score}</Text>
          </View>
          <View style={styles.awardsHeroInfo}>
            <Text style={[styles.awardsTierLabel, { color: badge.labelColor }]}>{badge.label}</Text>
            {awardScore.sublabel && (
              <Text style={styles.awardsSublabel}>{awardScore.sublabel}</Text>
            )}
          </View>
        </View>
      )}
      {awardScore?.pulitzer && (
        <View style={styles.awardsPulitzerRow}>
          <IconSymbol name="bookmark.fill" size={16} color="#FFD700" />
          <Text style={styles.awardsPulitzerText}>
            Pulitzer Prize for Drama {awardScore.pulitzer.result}
            {awardScore.pulitzer.year ? ` (${awardScore.pulitzer.year})` : ''}
          </Text>
        </View>
      )}
      {rows.length > 0 && (
      <View style={styles.awardsPanel}>
        <Text style={styles.awardsPanelLabel}>TONY AWARDS{season ? ` (${season})` : ''}</Text>
        <View style={styles.awardsSummaryRow}>
          <IconSymbol name="trophy.fill" size={18} color="#FFD700" />
          <Text style={styles.awardsSummaryNumber}>{winCount}</Text>
          <Text style={styles.awardsSummaryUnit}>{winCount === 1 ? 'win' : 'wins'}</Text>
          <Text style={styles.awardsSummaryOf}>of</Text>
          <IconSymbol name="star" size={18} color={Colors.text.muted} />
          <Text style={styles.awardsSummaryNumber}>{nomCount}</Text>
          <Text style={styles.awardsSummaryUnit}>{nomCount === 1 ? 'nom' : 'noms'}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.awardsToggle, pressed && styles.pressed]}
          onPress={() => setExpanded(v => !v)}
        >
          <Text style={styles.awardsToggleText}>
            {expanded ? 'Hide categories' : `See all categories (${rows.length})`}
          </Text>
          <IconSymbol
            name={expanded ? 'chevron.up' : 'chevron.down'}
            size={14}
            color={Colors.text.muted}
          />
        </Pressable>
        {expanded && ordered.map((a, i) => (
          <View key={i} style={styles.tonyRow}>
            <View style={styles.tonyIconSlot}>
              {a.won ? (
                <IconSymbol name="trophy.fill" size={16} color="#FFD700" />
              ) : (
                <IconSymbol name="star" size={16} color={Colors.text.muted} />
              )}
            </View>
            <View style={styles.tonyInfo}>
              <Text style={styles.tonyCategory}>{a.category}</Text>
              {a.name ? <Text style={styles.tonyName}>{a.name}</Text> : null}
            </View>
            {a.won && (
              <View style={styles.awardsWonTag}>
                <Text style={styles.awardsWonTagText}>Won</Text>
              </View>
            )}
          </View>
        ))}
      </View>
      )}
      {/* Other Major Awards — per-ceremony chips, site parity */}
      {awardScore && awardScore.other.length > 0 && (
        <>
          <Text style={styles.awardsOtherLabel}>
            OTHER MAJOR AWARDS  ({awardScore.other.reduce((sum, o) => sum + o.wins, 0)} wins)
          </Text>
          <View style={styles.awardsOtherChips}>
            {awardScore.other.map((o, i) => {
              const color = OTHER_AWARD_COLORS[o.name] ?? Colors.text.secondary;
              return (
                <View
                  key={i}
                  style={[styles.awardsOtherChip, { borderColor: color + '66', backgroundColor: color + '14' }]}
                >
                  <Text style={[styles.awardsOtherChipName, { color }]}>{o.name}:</Text>
                  <Text style={styles.awardsOtherChipCount}>
                    {` ${o.wins} ${o.wins === 1 ? 'win' : 'wins'}`}
                    {o.noms > o.wins ? ` / ${o.noms} noms` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </SectionCard>
  );
}

// ---------- Social Scorecard ----------

// Brand-colored platform icons — ports of the web's SocialPulseCard.tsx icon
// set (same paths/colors), sized down for the mobile chip row.
function XIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Rect width={24} height={24} rx={4} fill="#000000" />
      <Path
        fill="#ffffff"
        d="M17.95 5.5h2.213l-4.835 5.527 5.687 7.516h-4.453l-3.488-4.561-3.992 4.561H6.864l5.171-5.913L6.55 5.5h4.567l3.154 4.17zm-.776 11.731h1.226L9.875 6.708H8.559z"
      />
    </Svg>
  );
}

function TikTokIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Rect width={24} height={24} rx={4} fill="#000000" />
      <Path fill="#ff0050" d="M17.5 8.4c-1.13 0-2.13-.6-2.7-1.5v6.7c0 2.65-2.15 4.8-4.8 4.8a4.8 4.8 0 1 1 0-9.6c.18 0 .35.02.5.04v2.4a2.4 2.4 0 1 0 1.9 2.36V4h2.4a3.6 3.6 0 0 0 2.7 3.5z" />
      <Path fill="#00f2ea" d="M18.1 7.8c-1.13 0-2.13-.6-2.7-1.5V13c0 2.65-2.15 4.8-4.8 4.8a4.8 4.8 0 1 1 0-9.6c.18 0 .35.02.5.04v2.4a2.4 2.4 0 1 0 1.9 2.36V3.4h2.4a3.6 3.6 0 0 0 2.7 3.5z" />
      <Path fill="#ffffff" d="M17.8 8.1c-1.13 0-2.13-.6-2.7-1.5v6.7c0 2.65-2.15 4.8-4.8 4.8a4.8 4.8 0 1 1 0-9.6c.18 0 .35.02.5.04v2.4a2.4 2.4 0 1 0 1.9 2.36V3.7h2.4a3.6 3.6 0 0 0 2.7 3.5z" />
    </Svg>
  );
}

function InstagramIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Defs>
        <SvgLinearGradient id="ig-grad-mobile" x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#feda75" />
          <Stop offset="25%" stopColor="#fa7e1e" />
          <Stop offset="50%" stopColor="#d62976" />
          <Stop offset="75%" stopColor="#962fbf" />
          <Stop offset="100%" stopColor="#4f5bd5" />
        </SvgLinearGradient>
      </Defs>
      <Rect width={24} height={24} rx={6} fill="url(#ig-grad-mobile)" />
      <Rect x={5} y={5} width={14} height={14} rx={4} fill="none" stroke="#ffffff" strokeWidth={1.6} />
      <Circle cx={12} cy={12} r={3.4} fill="none" stroke="#ffffff" strokeWidth={1.6} />
      <Circle cx={16.4} cy={7.6} r={0.9} fill="#ffffff" />
    </Svg>
  );
}

function RedditIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Rect width={24} height={24} rx={4} fill="#ff4500" />
      <Circle cx={12} cy={13} r={6} fill="#ffffff" />
      <Circle cx={16.2} cy={5.6} r={1.3} fill="#ffffff" />
      <Line x1={12} y1={7} x2={15.3} y2={6.5} stroke="#ffffff" strokeWidth={1.2} strokeLinecap="round" />
      <Circle cx={9.5} cy={12.2} r={1.1} fill="#ff4500" />
      <Circle cx={14.5} cy={12.2} r={1.1} fill="#ff4500" />
      <Path d="M9 15 Q12 17 15 15" stroke="#ff4500" strokeWidth={1.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// Colors + labels match the web's TIER_DISPLAY (SocialPulseCard.tsx). The
// web also shows a tier emoji next to the label — dropped here because real
// Apple Color Emoji glyphs (🔥📈⚪💔) render as broken tofu boxes in this
// Text component in on-device testing (simulator-verified 2026-08-04); the
// tier color + text label already carry the same information without it.
const SOCIAL_TIER_CONFIG = {
  Buzzing: { label: 'BUZZING', color: '#f97316', subtitle: 'Trending hot right now' },
  Rising: { label: 'RISING', color: '#10b981', subtitle: 'Picking up momentum' },
  Steady: { label: 'STEADY', color: '#3b82f6', subtitle: 'Consistent buzz' },
  Troubled: { label: 'TROUBLED', color: '#ef4444', subtitle: 'Negative chatter outweighs positive' },
  // Legacy state — old data files may still tag a show BuildingBaseline. The
  // web now treats it as an alias for Steady rather than a distinct tier
  // (SocialPulseCard.tsx TIER_DISPLAY comment) — match that here instead of
  // showing app-only purple "BUILDING" branding the web doesn't have.
  BuildingBaseline: { label: 'STEADY', color: '#3b82f6', subtitle: 'Consistent buzz' },
  Hidden: null,
} as const;

const PLATFORM_ICONS: Record<string, () => React.ReactElement> = {
  x: XIcon,
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  reddit: RedditIcon,
};

/** Splits a rank string like "3/42 Broadway" into its parts — port of the
 * web's parseRank (SocialPulseCard.tsx). */
function parseSocialRank(r: string | undefined): { position: string; total: string; market: string } | null {
  if (!r) return null;
  const m = /^(\d+)\/(\d+)\s+(.+)$/.exec(r);
  if (!m) return null;
  return { position: m[1], total: m[2], market: m[3] };
}

function formatSocialUpdatedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function SocialScorecardSection({ sp }: { sp: SocialPulsePayload }) {
  const config = SOCIAL_TIER_CONFIG[sp.t];
  if (!config) return null;
  const totalMentions = sp.v;
  const platforms = [
    { key: 'x', label: 'X / Twitter', count: sp.xv ?? sp.pl.x },
    { key: 'tiktok', label: 'TikTok', count: sp.pl.tt },
    { key: 'instagram', label: 'Instagram', count: sp.pl.ig },
    ...(sp.pl.r != null ? [{ key: 'reddit', label: 'Reddit', count: sp.pl.r }] : []),
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
  const rank = parseSocialRank(sp.r);

  return (
    <SectionCard title="Socials Scorecard" meta={`${totalMentions.toLocaleString()} mentions`}>
      {/* Tier badge row */}
      <View style={[styles.socialTierRow, { borderColor: config.color + '40', backgroundColor: config.color + '14' }]}>
        <View style={[styles.socialTierBadge, { backgroundColor: config.color }]}>
          <Text style={styles.socialTierLabel}>{config.label}</Text>
        </View>
        <View style={styles.socialTierInfo}>
          <Text style={[styles.socialTierSubtitle, { color: config.color }]}>{config.subtitle}</Text>
          <Text style={styles.socialMentions}>{totalMentions.toLocaleString()} mentions · {sp.p}% positive</Text>
          {rank ? (
            <Text style={styles.socialRank}>Ranked #{rank.position} of {rank.total} in {rank.market} social buzz</Text>
          ) : sp.r ? (
            <Text style={styles.socialRank}>{sp.r}</Text>
          ) : null}
        </View>
      </View>
      {/* Platform breakdown — brand icon + count, matches the web's icon row
         (no text label chip on web; SocialPulseCard.tsx). */}
      {platforms.length > 0 && (
        <View style={styles.socialPlatforms}>
          {platforms.map((p) => {
            const Icon = PLATFORM_ICONS[p.key];
            return (
              <View
                key={p.key}
                style={styles.socialPlatformChip}
                accessible
                accessibilityLabel={`${p.label}: ${p.count.toLocaleString()}`}
              >
                {Icon && <Icon />}
                <Text style={styles.socialPlatformCount}>{p.count.toLocaleString()}</Text>
              </View>
            );
          })}
        </View>
      )}
      {/* Sample quotes — plain text, no card-in-card box (matches the web's
         quote treatment and the app's own ReviewRow quote style). */}
      {quotes.length > 0 && quotes.map((q, i) => (
        <View key={i} style={styles.socialQuote}>
          <Text style={styles.socialQuoteText} numberOfLines={2}>{'\u201C'}{q.t.trim()}{'\u201D'}</Text>
          {q.a && <Text style={styles.socialQuoteAuthor}>— {q.a} on {q.p}</Text>}
        </View>
      ))}
      {/* Footer — refresh metadata (matches the web's footer meta line; the
         web also links to a full /trending leaderboard, which the app has
         no screen for yet, so that half of the footer is omitted). */}
      {sp.u && (
        <Text style={styles.socialFooter}>updated {formatSocialUpdatedDate(sp.u)} · refreshed weekly</Text>
      )}
    </SectionCard>
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
    <SectionCard title="Seating Scorecard" meta={`${sections.length} sections`}>
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
    </SectionCard>
  );
}

// ---------- Theater Scorecard ----------

// Labels match the web's Theater Scorecard rows (facilities → "Restrooms").
const VENUE_DIMENSIONS = [
  { key: 'sightlines' as const, label: 'Sightlines' },
  { key: 'sound' as const, label: 'Sound' },
  { key: 'comfort' as const, label: 'Comfort' },
  { key: 'ambiance' as const, label: 'Ambiance' },
  { key: 'facilities' as const, label: 'Restrooms' },
];

/** Five filled/unfilled squares, the web's ScoreDots pattern. */
function ScoreSquares({ score, color }: { score: number; color: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <View style={styles.venueSquares}>
      {[1, 2, 3, 4, 5].map(i => (
        <View
          key={i}
          style={[
            styles.venueSquare,
            { backgroundColor: i <= filled ? color : Colors.surface.overlay },
          ]}
        />
      ))}
    </View>
  );
}

// Port of the site's getVenueDesignation (TheaterScorecardCard.tsx) —
// same thresholds, labels, and tier colors.
function venueDesignation(overall: number): { label: string; color: string } {
  if (overall >= 4.5) return { label: 'Exceptional Venue', color: '#22c55e' };
  if (overall >= 3.8) return { label: 'Great Venue', color: '#22c55e' };
  if (overall >= 3.0) return { label: 'Typical Venue', color: '#d97706' };
  if (overall >= 2.5) return { label: 'Below Average', color: '#ef4444' };
  return { label: 'Rough Venue', color: '#ef4444' };
}

const ACCESSIBILITY_PILLS: { key: 'wheelchair' | 'elevator' | 'hearingLoop' | 'assistiveListening'; label: string }[] = [
  { key: 'wheelchair', label: 'Wheelchair' },
  { key: 'elevator', label: 'Elevator' },
  { key: 'hearingLoop', label: 'Hearing Loop' },
  { key: 'assistiveListening', label: 'Assistive Listening' },
];

function TheaterScorecardSection({ scores, venueName, accessibility, links }: {
  scores: ShowDetail['venueScores'];
  venueName: string;
  accessibility: ShowDetail['accessibility'];
  links: ShowDetail['theaterLinks'];
}) {
  if (!scores) return null;
  const dims = VENUE_DIMENSIONS.filter(d => scores[d.key] != null);
  if (dims.length === 0) return null;
  const avg = dims.reduce((sum, d) => sum + (scores[d.key] as number), 0) / dims.length;
  const accPills = accessibility ? ACCESSIBILITY_PILLS.filter(p => accessibility[p.key]) : [];
  const seatLinks = [
    links?.seatplan ? { label: 'SeatPlan', url: links.seatplan } : null,
    links?.aviewfrommyseat ? { label: 'A View From My Seat', url: links.aviewfrommyseat } : null,
  ].filter(Boolean) as { label: string; url: string }[];

  const designation = venueDesignation(avg);
  return (
    <SectionCard
      title="Theater Scorecard"
      metaContent={
        <View style={[styles.venueTierPill, { borderColor: designation.color + '4D', backgroundColor: designation.color + '1A' }]}>
          <Text style={[styles.venueTierPillText, { color: designation.color }]}>{designation.label.toUpperCase()}</Text>
        </View>
      }
    >
      <Text style={styles.venueScorecardName}>{venueName}</Text>
      {scores.summary && <Text style={styles.venueSummary}>{scores.summary}</Text>}
      {dims.map(d => {
        const score = scores[d.key] as number;
        // Venue dimensions are on a 1-5 scale
        const color = score >= 4 ? '#10b981' : score >= 3 ? '#f59e0b' : '#ef4444';
        return (
          <View key={d.key} style={styles.venueDimRow}>
            <Text style={styles.venueDimLabel}>{d.label}</Text>
            <ScoreSquares score={score} color={color} />
            <Text style={[styles.venueDimScore, { color }]}>{score}/5</Text>
          </View>
        );
      })}
      {accPills.length > 0 && (
        <>
          <Text style={styles.venueSubheading}>ACCESSIBILITY</Text>
          <View style={styles.venueAccPills}>
            {accPills.map(p => (
              <View key={p.key} style={styles.venueAccPill}>
                <Text style={styles.venueAccPillText}>{p.label}</Text>
              </View>
            ))}
          </View>
          {accessibility?.note && <Text style={styles.venueAccNote}>{accessibility.note}</Text>}
        </>
      )}
      {seatLinks.length > 0 && (
        <>
          <Text style={styles.venueSubheading}>FIND YOUR SEAT</Text>
          <View style={styles.venueSeatLinks}>
            {seatLinks.map(l => (
              <Pressable
                key={l.label}
                style={({ pressed }) => [styles.venueSeatLink, pressed && styles.pressed]}
                onPress={() => WebBrowser.openBrowserAsync(l.url)}
              >
                <Text style={styles.venueSeatLinkText}>{l.label} ↗</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.venueFootnote}>
            Venue ratings based on audience reviews from SeatPlan, A View From My Seat, and community feedback.
          </Text>
        </>
      )}
    </SectionCard>
  );
}

// ---------- Video Reviews ----------

function VideoReviewsSection({ reviews, category }: { reviews: ShowDetail['videoReviews']; category?: string }) {
  return (
    <SectionCard title="Video Reviews" meta={`${reviews.length} creators`}>
      {reviews.map((v, i) => {
        // TikTok/Instagram stills are portrait (9:16); YouTube is landscape.
        const isPortrait = v.platform === 'tiktok' || v.platform === 'instagram';
        const thumbStyle = isPortrait ? styles.videoThumbPortrait : styles.videoThumb;
        const score = v.score != null ? Math.round(v.score) : null;
        return (
          <Pressable
            key={i}
            style={({ pressed }) => [styles.videoReviewRow, pressed && styles.pressed]}
            onPress={() => WebBrowser.openBrowserAsync(v.url)}
          >
            {v.thumbnail ? (
              <Image source={{ uri: v.thumbnail }} style={thumbStyle} contentFit="cover" transition={200} />
            ) : (
              <View style={[thumbStyle, styles.videoThumbPlaceholder]}>
                <Text style={styles.videoThumbPlaceholderText}>▶</Text>
              </View>
            )}
            <View style={styles.videoInfo}>
              <Text style={styles.videoCreator} numberOfLines={1}>
                {v.channelName || v.handle || 'Video Review'}
              </Text>
              {v.platform && <Text style={styles.videoPlatform}>{v.platform}</Text>}
              {v.keyQuote && <Text style={styles.videoQuote} numberOfLines={3}>{'\u201C'}{v.keyQuote}{'\u201D'}</Text>}
            </View>
            {/* Same score chip as the written Critic Reviews rows — no
               sentiment pill (owner decision 2026-08-03). */}
            {score != null && <ScoreBadge score={score} category={category} size="small" />}
          </Pressable>
        );
      })}
    </SectionCard>
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
    marginTop: 4,
    lineHeight: 20,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: 4,
    alignItems: 'center',
  },
  // Breakdown bar
  breakdownContainer: {
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  breakdownSegment: {
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
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  reviewBody: {
    flex: 1,
    minWidth: 0,
  },
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  outletLogoBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  outletLogo: {
    width: 15,
    height: 15,
  },
  reviewOutlet: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    flexShrink: 1,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  reviewQuote: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  reviewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  reviewCritic: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    flexShrink: 1,
  },
  reviewMetaDot: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  reviewChevron: {
    alignSelf: 'center',
  },
  getTicketsButton: {
    backgroundColor: Colors.brand,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  getTicketsText: {
    color: Colors.text.inverse,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  qfCard: {
    // Rows sit directly inside the SectionCard shell; no nested surface.
  },
  qfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    minHeight: 44,
  },
  qfLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  qfValue: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  qfValueFlex: {
    flexShrink: 1,
    textAlign: 'right',
  },
  qfLink: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '700',
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
    backgroundColor: Colors.surface.overlay,
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
    flexWrap: 'wrap',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  audienceSourceCard: {
    // 3-per-row wrapped grid (web grid-cols-3); flexGrow keeps a short last
    // row filled edge-to-edge.
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
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
    fontSize: 12,
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
    fontSize: 12,
    marginTop: 2,
  },

  // Info section
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
    padding: Spacing.md,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
  },
  criticsTakeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  criticsTakeHeaderText: {
    flex: 1,
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
  criticsTakeFooter: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  criticsTakeFooterText: {
    color: Colors.text.muted,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // Showtimes
  showtimesGrid: {
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
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
  showtimesTimeLink: {
    color: Colors.brand,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  showtimesCta: {
    // 44pt-min tap target (HIG) — this is the affiliate on-ramp
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.xl,
  },
  showtimesCtaText: {
    color: Colors.brand,
    fontSize: FontSize.md,
    fontWeight: '700',
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
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
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
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },

  // Lottery/Rush
  lrCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.surface.raised,
  },
  lrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  lrLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flexShrink: 1,
  },
  lrPrice: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  lrMeta: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 2,
    lineHeight: 20,
  },
  lrInst: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    lineHeight: 19,
  },
  lrPlatform: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    marginTop: Spacing.md,
    fontWeight: '600',
  },
  lrDisclosure: {
    color: Colors.text.muted,
    fontSize: 12,
  },

  // Awards Scorecard
  awardsHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  awardsScoreBadge: {
    // No overflow:hidden — it would clip the iOS shadow glow; the gradient
    // fill is rounded itself instead.
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardsScoreBadgeFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
  },
  awardsScoreText: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  awardsHeroInfo: {
    flex: 1,
  },
  awardsTierLabel: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  awardsSublabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  awardsPulitzerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  awardsPulitzerText: {
    color: '#FFD700',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  awardsOtherLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  awardsOtherChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  awardsOtherChip: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  awardsOtherChipName: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  awardsOtherChipCount: {
    color: Colors.text.primary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  awardsPanel: {
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  awardsPanelLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  awardsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
  },
  awardsSummaryNumber: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  awardsSummaryUnit: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    marginRight: 2,
  },
  awardsSummaryOf: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    marginHorizontal: 4,
  },
  awardsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  awardsToggleText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  awardsWonTag: {
    backgroundColor: '#FFD70022',
    borderRadius: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    alignSelf: 'center',
  },
  awardsWonTagText: {
    color: '#FFD700',
    fontSize: FontSize.xs,
    fontWeight: '700',
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
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  socialPlatformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  socialPlatformCount: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  socialQuote: {
    marginBottom: Spacing.sm,
  },
  socialQuoteText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  socialQuoteAuthor: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  socialFooter: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
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
    backgroundColor: Colors.surface.overlay,
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
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // Theater Scorecard
  venueScorecardName: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '800',
    marginBottom: Spacing.lg,
  },
  venueDimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  venueDimLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    width: 96,
  },
  venueSquares: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
  },
  venueSquare: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  venueDimScore: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
    flexShrink: 0,
  },
  venueTierPill: {
    borderWidth: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    flexShrink: 0,
  },
  venueTierPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  venueSummary: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 21,
    marginBottom: Spacing.lg,
  },
  venueSubheading: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  venueAccPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  venueAccPill: {
    backgroundColor: '#10b98122',
    borderWidth: 1,
    borderColor: '#10b98155',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  venueAccPillText: {
    color: '#34d399',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  venueAccNote: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    lineHeight: 17,
    marginTop: Spacing.md,
  },
  venueSeatLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  venueSeatLink: {
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  venueSeatLinkText: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  venueFootnote: {
    color: Colors.text.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: Spacing.md,
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
    backgroundColor: Colors.surface.overlay,
  },
  videoThumbPortrait: {
    width: 72,
    height: 128,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
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
});
