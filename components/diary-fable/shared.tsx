/**
 * Shared helpers for the FABLE Diary design round (D/E/F). DESIGN ONLY.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/theme';
import { getImageUrl } from '@/lib/images';
import type { Show } from '@/lib/types';
import type { UserReview } from '@/lib/user-types';

export const SERIF = 'Georgia';
export const MONO = 'Menlo';

/** Plain-object absolute fill (typed for style-object props). */
export const FILL = {
  position: 'absolute' as const,
  top: 0, left: 0, right: 0, bottom: 0,
};

export function posterFor(show: Show | undefined): string | null {
  if (!show?.images) return null;
  return getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
}

export function parseSeen(dateSeen: string | null): Date | null {
  if (!dateSeen) return null;
  return new Date(dateSeen + 'T00:00:00');
}

export function toHundred(rating: number): number {
  return Math.round(rating * 20);
}

/** Score-tier color for a 0-100 score, mirroring the app's tier system. */
export function tierColor(score: number): string {
  if (score >= 90) return Colors.score.gold;
  if (score >= 80) return Colors.score.green;
  if (score >= 70) return Colors.score.teal;
  if (score >= 55) return Colors.score.amber;
  return Colors.score.red;
}

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const STAR = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

/** Compact gold star row with half-star support. */
export function StarsRow({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => {
        const fill = rating >= i ? 1 : rating >= i - 0.5 ? 0.5 : 0;
        return (
          <View key={i} style={{ width: size, height: size }}>
            <Svg width={size} height={size} viewBox="0 0 24 24" fill={Colors.surface.elevated}>
              <Path d={STAR} />
            </Svg>
            {fill > 0 && (
              <View style={[FILL, { width: size * fill, overflow: 'hidden' }]}>
                <Svg width={size} height={size} viewBox="0 0 24 24" fill={Colors.score.gold}>
                  <Path d={STAR} />
                </Svg>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Poster with placeholder fallback. */
export function Poster({ show, style, radius = 8 }: { show: Show | undefined; style: object; radius?: number }) {
  const url = posterFor(show);
  if (!url) {
    return (
      <View style={[style, { borderRadius: radius, backgroundColor: Colors.surface.overlay, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: Colors.text.muted, fontSize: 16, fontWeight: '600' }}>
          {(show?.title || '?').charAt(0)}
        </Text>
      </View>
    );
  }
  return <Image source={{ uri: url }} style={[style, { borderRadius: radius }]} contentFit="cover" transition={150} />;
}

/** Season aggregates shared by the D/E/F headers. */
export function seasonStats(reviews: UserReview[], showMap: Record<string, Show>) {
  const shows = new Set(reviews.map(r => r.show_id));
  const venues = new Set(
    reviews.map(r => showMap[r.show_id]?.venue).filter(Boolean),
  );
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;
  return { viewings: reviews.length, shows: shows.size, venues: venues.size, avg };
}
