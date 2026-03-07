/**
 * ShareCard — beautiful share image for show scores.
 *
 * Renders a dark card with poster, title, score badge, and branding.
 * Captured via react-native-view-shot and shared as a PNG.
 * Designed for Instagram stories / iMessage aspect ratio.
 */

import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Share, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import { getScoreTier, getScoreColor, getContrastTextColor } from '@/lib/score-utils';
import { getImageUrl } from '@/lib/images';
import { Colors, FontSize, BorderRadius, Spacing } from '@/constants/theme';
import { trackShowShared } from '@/lib/analytics';

interface ShareCardProps {
  show: {
    id: string;
    slug: string;
    title: string;
    venue?: string;
    type?: string;
    compositeScore?: number | null;
    criticScore?: { reviewCount?: number; label?: string } | null;
    audienceGrade?: { grade: string; color: string } | null;
    images: { poster?: string | null; thumbnail?: string | null };
  };
  /** Called after successful share */
  onShared?: () => void;
}

const GOLD_GRADIENT: [string, string, string, string, string] = [
  '#DAA520', '#FFD700', '#FFF0A0', '#FFD700', '#DAA520',
];

export function ShareCard({ show, onShared }: ShareCardProps) {
  const viewShotRef = useRef<ViewShot>(null);

  const handleShare = useCallback(async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackShowShared(show.id, show.title);

    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        // Fallback to text share
        await Share.share({
          message: `Check out ${show.title} on Broadway Scorecard!\nhttps://broadwayscorecard.com/show/${show.slug}`,
        });
        return;
      }

      await Share.share(
        Platform.OS === 'ios'
          ? { url: uri }
          : { message: `Check out ${show.title} on Broadway Scorecard!\nhttps://broadwayscorecard.com/show/${show.slug}` },
      );
      onShared?.();
    } catch {
      // User cancelled or share failed
    }
  }, [show, onShared]);

  const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
  const score = show.compositeScore != null ? Math.round(show.compositeScore) : null;
  const tier = getScoreTier(score);
  const isGold = tier?.glow ?? false;
  const reviewCount = show.criticScore?.reviewCount ?? 0;
  const hasScore = score != null && reviewCount >= 3;

  return (
    <>
      {/* Hidden off-screen card for capture */}
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={styles.offscreen}
      >
        <View style={styles.card}>
          {/* Subtle gradient background */}
          <LinearGradient
            colors={['#16161e', '#0f0f14', '#0a0a0f']}
            style={StyleSheet.absoluteFill}
          />

          {/* Top accent line */}
          <View style={[styles.accentLine, { backgroundColor: hasScore ? (tier?.color ?? Colors.brand) : Colors.brand }]} />

          {/* Main content */}
          <View style={styles.cardContent}>
            {/* Poster */}
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                style={styles.poster}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.poster, styles.posterPlaceholder]}>
                <Text style={styles.posterInitial}>{show.title.charAt(0)}</Text>
              </View>
            )}

            {/* Score section */}
            <View style={styles.scoreSection}>
              {hasScore ? (
                <>
                  {isGold ? (
                    <LinearGradient
                      colors={GOLD_GRADIENT}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.scoreBadge}
                    >
                      <Text style={[styles.scoreNumber, { color: tier?.textColor ?? '#1a1a1a' }]}>
                        {score}
                      </Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.scoreBadge, { backgroundColor: tier?.color ?? Colors.score.none }]}>
                      <Text style={[styles.scoreNumber, { color: tier?.textColor ?? '#ffffff' }]}>
                        {score}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.tierLabel, { color: tier?.color ?? Colors.text.secondary }]}>
                    {tier?.label}
                  </Text>
                </>
              ) : (
                <View style={[styles.scoreBadge, { backgroundColor: Colors.score.none }]}>
                  <Text style={styles.scoreNumber}>—</Text>
                </View>
              )}
            </View>

            {/* Title + meta */}
            <Text style={styles.cardTitle} numberOfLines={2}>{show.title}</Text>
            {show.venue && (
              <Text style={styles.cardVenue} numberOfLines={1}>{show.venue}</Text>
            )}

            {/* Review count + audience grade */}
            <View style={styles.metaRow}>
              {hasScore && (
                <Text style={styles.metaText}>
                  Based on {reviewCount} critic review{reviewCount !== 1 ? 's' : ''}
                </Text>
              )}
              {show.audienceGrade && (
                <View style={[styles.audiencePill, { backgroundColor: show.audienceGrade.color + '26' }]}>
                  <Text style={[styles.audiencePillText, { color: show.audienceGrade.color }]}>
                    Audience: {show.audienceGrade.grade}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Branding footer */}
          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <View style={styles.footerContent}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill={Colors.brand}>
                <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </Svg>
              <Text style={styles.footerText}>Broadway Scorecard</Text>
              <Text style={styles.footerUrl}>broadwayscorecard.com</Text>
            </View>
          </View>
        </View>
      </ViewShot>

      {/* The actual share button rendered in parent */}
      {/* Parent calls shareRef.current.share() */}
    </>
  );
}

/** Imperative handle for parent to trigger share */
export interface ShareCardHandle {
  share: () => Promise<void>;
}

export const ShareCardWithRef = React.forwardRef<ShareCardHandle, ShareCardProps>(
  function ShareCardWithRef(props, ref) {
    const viewShotRef = useRef<ViewShot>(null);

    const share = useCallback(async () => {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      trackShowShared(props.show.id, props.show.title);

      try {
        const uri = await viewShotRef.current?.capture?.();
        if (!uri) {
          await Share.share({
            message: `Check out ${props.show.title} on Broadway Scorecard!\nhttps://broadwayscorecard.com/show/${props.show.slug}`,
          });
          return;
        }

        await Share.share(
          Platform.OS === 'ios'
            ? { url: uri }
            : { message: `Check out ${props.show.title} on Broadway Scorecard!\nhttps://broadwayscorecard.com/show/${props.show.slug}` },
        );
        props.onShared?.();
      } catch {
        // User cancelled
      }
    }, [props]);

    React.useImperativeHandle(ref, () => ({ share }), [share]);

    const posterUrl = getImageUrl(props.show.images.poster) || getImageUrl(props.show.images.thumbnail);
    const score = props.show.compositeScore != null ? Math.round(props.show.compositeScore) : null;
    const tier = getScoreTier(score);
    const isGold = tier?.glow ?? false;
    const reviewCount = props.show.criticScore?.reviewCount ?? 0;
    const hasScore = score != null && reviewCount >= 3;

    return (
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={styles.offscreen}
      >
        <View style={styles.card}>
          <LinearGradient
            colors={['#16161e', '#0f0f14', '#0a0a0f']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.accentLine, { backgroundColor: hasScore ? (tier?.color ?? Colors.brand) : Colors.brand }]} />

          <View style={styles.cardContent}>
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
            ) : (
              <View style={[styles.poster, styles.posterPlaceholder]}>
                <Text style={styles.posterInitial}>{props.show.title.charAt(0)}</Text>
              </View>
            )}

            <View style={styles.scoreSection}>
              {hasScore ? (
                <>
                  {isGold ? (
                    <LinearGradient
                      colors={GOLD_GRADIENT}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.scoreBadge}
                    >
                      <Text style={[styles.scoreNumber, { color: tier?.textColor ?? '#1a1a1a' }]}>{score}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.scoreBadge, { backgroundColor: tier?.color ?? Colors.score.none }]}>
                      <Text style={[styles.scoreNumber, { color: tier?.textColor ?? '#ffffff' }]}>{score}</Text>
                    </View>
                  )}
                  <Text style={[styles.tierLabel, { color: tier?.color ?? Colors.text.secondary }]}>{tier?.label}</Text>
                </>
              ) : (
                <View style={[styles.scoreBadge, { backgroundColor: Colors.score.none }]}>
                  <Text style={styles.scoreNumber}>—</Text>
                </View>
              )}
            </View>

            <Text style={styles.cardTitle} numberOfLines={2}>{props.show.title}</Text>
            {props.show.venue && <Text style={styles.cardVenue} numberOfLines={1}>{props.show.venue}</Text>}

            <View style={styles.metaRow}>
              {hasScore && (
                <Text style={styles.metaText}>
                  Based on {reviewCount} critic review{reviewCount !== 1 ? 's' : ''}
                </Text>
              )}
              {props.show.audienceGrade && (
                <View style={[styles.audiencePill, { backgroundColor: props.show.audienceGrade.color + '26' }]}>
                  <Text style={[styles.audiencePillText, { color: props.show.audienceGrade.color }]}>
                    Audience: {props.show.audienceGrade.grade}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <View style={styles.footerContent}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill={Colors.brand}>
                <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </Svg>
              <Text style={styles.footerText}>Broadway Scorecard</Text>
              <Text style={styles.footerUrl}>broadwayscorecard.com</Text>
            </View>
          </View>
        </View>
      </ViewShot>
    );
  },
);

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
  card: {
    width: 390,
    backgroundColor: '#0f0f14',
    borderRadius: 0, // No radius for clean share image
    overflow: 'hidden',
  },
  accentLine: {
    height: 4,
    width: '100%',
  },
  cardContent: {
    padding: 32,
    alignItems: 'center',
  },
  poster: {
    width: 180,
    height: 270,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterInitial: {
    color: Colors.text.muted,
    fontSize: 48,
    fontWeight: '600',
  },
  scoreSection: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  scoreBadge: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  tierLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32,
  },
  cardVenue: {
    color: Colors.text.secondary,
    fontSize: FontSize.md,
    marginTop: 6,
    textAlign: 'center',
  },
  metaRow: {
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  metaText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  audiencePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
  },
  audiencePillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 24,
    paddingTop: 8,
  },
  footerLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerText: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  footerUrl: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
});
