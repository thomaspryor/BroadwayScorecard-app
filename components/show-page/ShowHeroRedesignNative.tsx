/**
 * ShowHeroRedesignNative — iOS port of the web v2 show-page hero.
 *
 * Mirrors the web `ShowHeroRedesign.tsx` composition: poster + title header,
 * dual matched-size score boxes (critic ScoreBadge + audience grade box),
 * distribution bar, Critics' Take subtle box, your-rating card (rated state),
 * Want to See / Rate it buttons, on-list caption, brand-gold Get Tickets CTA
 * + secondary tickets row.
 *
 * iOS-specific (per memory/feedback_show_page_redesign_v2_decisions):
 *  - Tap-to-rate: routes to /rate/[showId] (existing pattern). Native sheet
 *    is a future iteration — kept the route push for v1 simplicity.
 *  - Edit pencil: same route push to /rate/[showId]?reviewId=...
 *  - "Also on X list" caption deep-links to /(tabs)/lists.
 *  - Icons: inline SVG via react-native-svg. SF Symbols would be a polish pass.
 *
 * Reuses RatingCard.tsx (extracted earlier on b40f588) for the rated-state card.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Link as ExpoLink, useRouter, usePathname } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useUserLists } from '@/hooks/useUserLists';
import { useToastSafe } from '@/lib/toast-context';
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/deferred-auth';
import { featureFlags } from '@/lib/feature-flags';
import * as haptics from '@/lib/haptics';
import { ScoreBadge, FormatPill, ProductionPill, StatusBadge, CategoryBadge } from '@/components/show-cards';
import { BookmarkOverlay } from '@/components/BookmarkOverlay';
import RatingCard from '@/components/user/RatingCard';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { getScoreTier } from '@/lib/score-utils';
import type { Show, ShowDetail } from '@/lib/types';

// ─── Props ───────────────────────────────────────────────────────────

interface ShowHeroRedesignNativeProps {
  show: Show;
  detail: ShowDetail | null;
  posterUrl: string | null;
  hasEnoughReviews: boolean;
  displayScore: number | null;
  onTicketPress: (link: { platform: string; url: string }, index: number, source: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────

export default function ShowHeroRedesignNative({
  show,
  detail,
  posterUrl,
  hasEnoughReviews,
  displayScore,
  onTicketPress,
}: ShowHeroRedesignNativeProps) {
  const { user, isAuthenticated, showSignIn } = useAuth();
  const { reviews, getReviewsForShow, deleteReview, invalidateCache } = useUserReviews(user?.id || null);
  const {
    isWatchlisted,
    addToWatchlist,
    removeFromWatchlist,
    getWatchlist,
  } = useWatchlist(user?.id || null);
  const { lists, getLists } = useUserLists(user?.id || null);
  const { showToast } = useToastSafe();
  const pathname = usePathname();
  const router = useRouter();

  const hasExecutedPending = useRef(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // ─── Derived ─────────────────────────────────────────────

  const showReviews = reviews.filter(r => r.show_id === show.id);
  const sortedReviews = [...showReviews].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const ratingCount = showReviews.length;
  const hasRating = ratingCount > 0;
  const isMulti = ratingCount > 1;
  const onWatchlist = isWatchlisted(show.id);
  const isClosed = show.status === 'closed';
  const isPreviews = show.status === 'previews' || show.status === 'upcoming';

  // Lists containing this show (caption only, no button on show page)
  const listsWithShow = lists.filter(l =>
    (l.all_show_ids ?? l.preview_show_ids ?? []).includes(show.id)
  );
  const firstListContainingShow = listsWithShow[0];

  const consensusText = detail?.criticsTake?.text ?? null;
  const reviewCount = show.criticScore?.reviewCount ?? 0;
  const criticReviews = detail?.reviews ?? [];

  // Sort tickets — TodayTix first if present (matches web); StubHub hidden by default in iOS data
  const ticketLinks = (show.ticketLinks ?? []).filter(l => l.platform !== 'StubHub');
  const primaryTicket = ticketLinks[0];
  const secondaryTickets = ticketLinks.slice(1);
  const lottery = detail?.lotteryRush?.lottery ?? null;
  const rush = detail?.lotteryRush?.rush ?? null;

  // ─── Effects ─────────────────────────────────────────────

  useEffect(() => {
    if (isAuthenticated && user) {
      getReviewsForShow(show.id);
      getWatchlist();
      getLists();
    }
  }, [isAuthenticated, user, show.id, getReviewsForShow, getWatchlist, getLists]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user) {
        getReviewsForShow(show.id);
        getWatchlist();
        getLists();
      }
    }, [isAuthenticated, user, show.id, getReviewsForShow, getWatchlist, getLists]),
  );

  // Pending action consume after deferred auth
  useEffect(() => {
    if (!isAuthenticated || !user || hasExecutedPending.current) return;
    (async () => {
      const pending = await getPendingAction();
      if (!pending || pending.showId !== show.id) return;
      hasExecutedPending.current = true;
      await clearPendingAction();

      if (pending.type === 'rating' && pending.rating) {
        router.push({
          pathname: '/rate/[showId]',
          params: { showId: show.id, showTitle: show.title, initialRating: String(pending.rating) },
        });
      } else if (pending.type === 'watchlist') {
        try {
          await addToWatchlist(show.id);
          await getWatchlist();
          showToast('Added to Watchlist', 'success', '/(tabs)/watched');
        } catch {
          showToast('Failed to add to watchlist.', 'error');
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, show.id]);

  // ─── Handlers ────────────────────────────────────────────

  const handleWantToSee = useCallback(async () => {
    if (!isAuthenticated) {
      savePendingAction({
        type: 'watchlist',
        showId: show.id,
        returnRoute: pathname,
        timestamp: Date.now(),
      });
      showSignIn('watchlist');
      return;
    }
    setWatchlistLoading(true);
    try {
      if (onWatchlist) {
        await removeFromWatchlist(show.id);
        showToast('Removed from Watchlist', 'info');
      } else {
        await addToWatchlist(show.id);
        showToast('Added to Watchlist', 'success', '/(tabs)/watched');
      }
    } catch {
      showToast('Failed to update watchlist.', 'error');
    } finally {
      setWatchlistLoading(false);
    }
  }, [isAuthenticated, onWatchlist, show.id, pathname, showSignIn, addToWatchlist, removeFromWatchlist, showToast]);

  const handleRateIt = useCallback(() => {
    if (!isAuthenticated) {
      savePendingAction({
        type: 'rating',
        showId: show.id,
        returnRoute: pathname,
        timestamp: Date.now(),
      });
      showSignIn('rating');
      return;
    }
    haptics.tap();
    if (isMulti) {
      // Log another viewing — fresh panel, appends new entry
      router.push({ pathname: '/rate/[showId]', params: { showId: show.id, showTitle: show.title } });
    } else if (hasRating) {
      // Rate it again — edit latest
      router.push({
        pathname: '/rate/[showId]',
        params: { showId: show.id, showTitle: show.title, reviewId: sortedReviews[0].id },
      });
    } else {
      // First rating
      router.push({ pathname: '/rate/[showId]', params: { showId: show.id, showTitle: show.title } });
    }
  }, [isAuthenticated, show.id, show.title, hasRating, isMulti, sortedReviews, pathname, showSignIn, router]);

  const handleEditRating = useCallback(
    (reviewId: string) => {
      router.push({
        pathname: '/rate/[showId]',
        params: { showId: show.id, showTitle: show.title, reviewId },
      });
    },
    [show.id, show.title, router],
  );

  const handleDeleteRating = useCallback(
    async (reviewId: string) => {
      try {
        await deleteReview(reviewId);
        await invalidateCache();
        haptics.action();
        showToast('Rating deleted.', 'info');
        await getReviewsForShow(show.id);
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Unknown error';
        showToast(`Delete failed: ${detail}`, 'error');
      }
    },
    [deleteReview, invalidateCache, showToast, show.id, getReviewsForShow],
  );

  const handleAllRatings = useCallback(() => {
    haptics.tap();
    router.push('/(tabs)/watched');
  }, [router]);

  const handleListsTap = useCallback(() => {
    haptics.tap();
    router.push('/(tabs)/lists');
  }, [router]);

  const userFeaturesEnabled = featureFlags.userAccounts;

  // ─── Render ─────────────────────────────────────────────

  const tier = displayScore != null ? getScoreTier(displayScore) : null;

  return (
    <View style={styles.card}>
      {/* Header: poster left + title block right */}
      <View style={styles.headerRow}>
        <View style={styles.posterWrap}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Text style={styles.posterPlaceholderText}>{show.title.charAt(0)}</Text>
            </View>
          )}
          {userFeaturesEnabled && (
            <BookmarkOverlay
              isWatchlisted={onWatchlist}
              onToggle={handleWantToSee}
            />
          )}
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.pillsRow}>
            <FormatPill type={show.type} />
            {show.isRevival && <ProductionPill isRevival={show.isRevival} />}
            <CategoryBadge category={show.category} />
            <StatusBadge status={show.status} />
          </View>
          <Text style={styles.title} numberOfLines={3}>{show.title}</Text>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLine} numberOfLines={1}>
              {show.venue}{show.runtime ? ` · ${show.runtime}` : ''}
            </Text>
            <DateLine show={show} />
          </View>
        </View>
      </View>

      {/* Score row OR awaiting card. Mobile: dual cards (matches web mobile) */}
      {!hasEnoughReviews ? (
        <View style={styles.awaiting}>
          <Text style={styles.awaitingTitle}>Awaiting reviews</Text>
          <Text style={styles.awaitingSub}>
            {isPreviews ? 'Show in previews' : isClosed ? 'Closed' : 'Show opens soon'}
            {reviewCount > 0 ? ` · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'} collected` : ''}
          </Text>
        </View>
      ) : (
        <View style={[styles.scoreGrid, !show.audienceGrade && styles.scoreGridSingle]}>
          <Pressable style={styles.scoreCard} onPress={() => {}}>
            <ScoreBadge score={displayScore} size="large" animated />
            <View style={styles.scoreCardMeta}>
              {tier && (
                <Text style={[styles.scoreTier, { color: tier.color }]} numberOfLines={2}>
                  {tier.label}
                </Text>
              )}
              <Text style={styles.scoreCount} numberOfLines={2}>
                {reviewCount} critic {reviewCount === 1 ? 'review' : 'reviews'}
              </Text>
            </View>
          </Pressable>
          {show.audienceGrade && (
            <Pressable style={styles.scoreCard} onPress={() => {}}>
              <View
                style={[
                  styles.audienceBox,
                  { backgroundColor: show.audienceGrade.color },
                ]}
              >
                <Text style={[styles.audienceBoxText, { color: getAudienceContrast(show.audienceGrade.color) }]}>
                  {show.audienceGrade.grade}
                </Text>
              </View>
              <View style={styles.scoreCardMeta}>
                <Text style={[styles.scoreTier, { color: show.audienceGrade.color }]} numberOfLines={2}>
                  {show.audienceGrade.label}
                </Text>
                {detail?.audience && (
                  <Text style={styles.scoreCount} numberOfLines={2}>
                    {audienceCountText(detail)}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        </View>
      )}

      {/* Distribution bar */}
      {hasEnoughReviews && criticReviews.length > 0 && (
        <BreakdownBar reviews={criticReviews} />
      )}

      {/* Critics' Take — subtle bordered box (mirrors web mobile redesign treatment) */}
      {hasEnoughReviews && consensusText && (
        <View style={styles.criticsTake}>
          <Text style={styles.criticsTakeLabel}>CRITICS&apos; TAKE</Text>
          <Text style={styles.criticsTakeText}>{consensusText}</Text>
        </View>
      )}

      {/* Your rating card (rated state) */}
      {userFeaturesEnabled && hasRating && (
        <RatingCard
          ratings={showReviews}
          onEdit={handleEditRating}
          onDelete={handleDeleteRating}
          onAddViewing={handleRateIt}
          onSeeAll={handleAllRatings}
        />
      )}

      {/* Action buttons row — Want to See / Rate it */}
      {userFeaturesEnabled && (
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleWantToSee}
            disabled={watchlistLoading}
            style={({ pressed }) => [
              styles.actionBtn,
              onWatchlist && styles.actionBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill={onWatchlist ? Colors.brand : 'none'} stroke={onWatchlist ? Colors.brand : Colors.text.secondary} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </Svg>
            <Text style={[styles.actionBtnText, onWatchlist && styles.actionBtnTextActive]}>
              {onWatchlist ? 'On your list' : 'Want to See'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleRateIt}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </Svg>
            <Text style={styles.actionBtnText}>
              {!hasRating ? 'Rate it' : isMulti ? 'Log another viewing' : 'Rate it again'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* On-list caption (minor indicator) */}
      {userFeaturesEnabled && firstListContainingShow && (
        <Pressable onPress={handleListsTap} style={styles.onListNote}>
          <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h10" />
          </Svg>
          <Text style={styles.onListText} numberOfLines={1}>
            Also on{' '}
            {listsWithShow.length === 1 ? (
              <Text style={styles.onListLink}>&ldquo;{firstListContainingShow.name}&rdquo;</Text>
            ) : (
              <Text style={styles.onListLink}>{listsWithShow.length} of your lists</Text>
            )}
          </Text>
        </Pressable>
      )}

      {/* Get Tickets primary CTA + secondary tickets row */}
      {!isClosed && primaryTicket && (
        <View style={styles.ticketsContainer}>
          <Pressable
            onPress={() => onTicketPress(primaryTicket, 0, 'show_detail')}
            style={({ pressed }) => [styles.ticketsPrimary, pressed && styles.pressed]}
          >
            <Text style={styles.ticketsPrimaryText}>
              {`Get Tickets on ${primaryTicket.platform} →`}
            </Text>
          </Pressable>
          {(secondaryTickets.length > 0 || show.officialUrl || lottery || rush) && (
            <View style={styles.ticketsSecondary}>
              {secondaryTickets.map((link, i) => (
                <Pressable
                  key={link.platform}
                  onPress={() => onTicketPress(link, i + 1, 'show_detail')}
                  style={({ pressed }) => [styles.ticketPill, pressed && styles.pressed]}
                >
                  <Text style={styles.ticketPillText}>{link.platform}</Text>
                </Pressable>
              ))}
              {show.officialUrl && (
                <Pressable
                  onPress={() => WebBrowser.openBrowserAsync(show.officialUrl!)}
                  style={({ pressed }) => [styles.ticketPill, pressed && styles.pressed]}
                >
                  <Text style={styles.ticketPillText}>Official</Text>
                </Pressable>
              )}
              {(lottery || rush) && (
                <View style={[styles.ticketPill, styles.ticketPillMuted]}>
                  <Text style={styles.ticketPillTextMuted}>
                    {lottery
                      ? lottery.price
                        ? `$${lottery.price} Lottery`
                        : 'Lottery'
                      : rush!.price
                        ? `$${rush!.price} Rush`
                        : 'Rush'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────

function DateLine({ show }: { show: Show }) {
  if (show.status === 'closed' && show.openingDate && show.closingDate) {
    return (
      <Text style={styles.metaLine}>
        {formatDate(show.openingDate)} → {formatDate(show.closingDate)}
      </Text>
    );
  }
  if (show.status === 'previews' || show.status === 'upcoming') {
    if (show.openingDate) {
      return <Text style={styles.metaLine}>Opens {formatDate(show.openingDate)}</Text>;
    }
    return null;
  }
  // open
  if (show.openingDate || show.closingDate) {
    const parts: string[] = [];
    if (show.openingDate) parts.push(`Opened ${formatDate(show.openingDate)}`);
    if (show.closingDate) parts.push(`Closes ${formatDate(show.closingDate)}`);
    return <Text style={styles.metaLine}>{parts.join(' · ')}</Text>;
  }
  return null;
}

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
  const seg = (count: number, color: string) =>
    count > 0 ? <View style={{ flex: count, backgroundColor: color }} /> : null;
  return (
    <View style={styles.breakdownContainer}>
      <View style={styles.breakdownBar}>
        {seg(counts.Rave, Colors.score.gold)}
        {seg(counts.Positive, Colors.score.green)}
        {seg(counts.Mixed, Colors.score.amber)}
        {seg(counts.Negative, Colors.score.red)}
      </View>
      <View style={styles.breakdownLabels}>
        {counts.Rave > 0 && <BreakdownLabel color={Colors.score.gold} text={`${counts.Rave} Rave`} />}
        {counts.Positive > 0 && <BreakdownLabel color={Colors.score.green} text={`${counts.Positive} Positive`} />}
        {counts.Mixed > 0 && <BreakdownLabel color={Colors.score.amber} text={`${counts.Mixed} Mixed`} />}
        {counts.Negative > 0 && <BreakdownLabel color={Colors.score.red} text={`${counts.Negative} Negative`} />}
      </View>
    </View>
  );
}

function BreakdownLabel({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.breakdownLabelRow}>
      <View style={[styles.breakdownDot, { backgroundColor: color }]} />
      <Text style={styles.breakdownLabelText}>{text}</Text>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAudienceContrast(bg: string): string {
  // Simple contrast: dark text on light backgrounds, white otherwise.
  // Audience grade colors are vivid (green, teal, amber, red) — dark text reads on them.
  const c = bg.startsWith('#') ? bg.slice(1) : bg;
  if (c.length < 6) return '#0f0f14';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#0f0f14' : '#ECEDEE';
}

function audienceCountText(detail: ShowDetail): string | null {
  if (!detail.audience) return null;
  const total =
    (detail.audience.sources.showScore?.count ?? 0) +
    (detail.audience.sources.mezzanine?.count ?? 0) +
    (detail.audience.sources.theatr?.count ?? 0);
  return total > 0 ? `${total.toLocaleString('en-US')} audience reviews` : null;
}

// ─── Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.raised,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    gap: Spacing.lg,
  },
  pressed: { opacity: 0.6 },

  // Header
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  posterWrap: { flexShrink: 0 },
  poster: {
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
  headerInfo: { flex: 1, gap: 6 },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  metaBlock: { gap: 2, paddingTop: 2 },
  metaLine: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
  },

  // Score row — dual cards (mobile)
  scoreGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  scoreGridSingle: { flexDirection: 'column' },
  scoreCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  scoreCardMeta: { flex: 1, minWidth: 0 },
  scoreTier: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
  },
  scoreCount: {
    color: Colors.text.muted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  audienceBox: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audienceBoxText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },

  // Awaiting
  awaiting: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    alignItems: 'center',
  },
  awaitingTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  awaitingSub: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },

  // Breakdown
  breakdownContainer: { gap: Spacing.sm },
  breakdownBar: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: Colors.surface.overlay,
  },
  breakdownLabels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  breakdownLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownDot: { width: 8, height: 8, borderRadius: 2 },
  breakdownLabelText: { color: Colors.text.secondary, fontSize: FontSize.xs },

  // Critics' Take
  criticsTake: {
    padding: Spacing.md,
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  criticsTakeLabel: {
    color: Colors.text.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  criticsTakeText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.raised,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
    gap: 6,
  },
  actionBtnActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.surface.raised,
  },
  actionBtnText: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  actionBtnTextActive: { color: Colors.brand },

  // On-list caption
  onListNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -Spacing.sm,
  },
  onListText: {
    color: Colors.text.muted,
    fontSize: 11,
    flex: 1,
  },
  onListLink: {
    color: Colors.text.secondary,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },

  // Tickets
  ticketsContainer: { gap: Spacing.sm },
  ticketsPrimary: {
    height: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketsPrimaryText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  ticketsSecondary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  ticketPill: {
    height: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketPillMuted: { borderColor: Colors.border.subtle },
  ticketPillText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  ticketPillTextMuted: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
