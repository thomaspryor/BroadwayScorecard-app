/**
 * Diary-only show page — for show_ids that exist only in the diary catalog
 * (diary-search.json, see lib/diary-catalog.ts), not the ~1.6k scored
 * catalog useShows() carries. Imports can now match these (build 69/70), so
 * Watched/To Watch/Lists rows can point at ids the app has no other route
 * for — this renders purely from the title/venue/city/category/openingDate
 * recorded at import time (lib/diary-titles.ts) so a tap never needs to fetch
 * the 7.5MB diary catalog. Mirrors the web's src/app/diary-show/[id]/page.tsx,
 * minus rating/watchlist actions — those are already reachable from the row
 * (star chip, long-press menu) without visiting this screen.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDiaryShowMeta, showTitleFallback } from '@/lib/show-format';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const MARKET_LABELS: Record<string, string> = {
  'off-broadway': 'Off-Broadway',
  'west-end': 'West End',
  'us-regional': 'Regional (US)',
  'uk-regional': 'Regional (UK)',
  international: 'International',
  other: 'Other',
};

export default function DiaryShowScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const showId = params.id ?? '';

  const meta = showId ? getDiaryShowMeta(showId) : null;
  const title = showId ? showTitleFallback(showId) : 'Show';
  const marketLabel = meta?.category ? (MARKET_LABELS[meta.category] || 'Regional') : null;
  const marketDetail = [meta?.city, marketLabel].filter(Boolean).join(' · ');
  const openingLabel = meta?.openingDate
    ? new Date(`${meta.openingDate}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <View style={styles.headerRow}>
        <View style={styles.poster}>
          <Text style={styles.posterEmoji}>🎭</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.title} numberOfLines={3}>{title}</Text>
          {!!meta?.venue && <Text style={styles.venue} numberOfLines={1}>{meta.venue}</Text>}
          {!!marketDetail && <Text style={styles.marketDetail} numberOfLines={1}>{marketDetail}</Text>}
          <Text style={styles.openingDate}>{openingLabel ? `Opened ${openingLabel}` : 'Opening date unknown'}</Text>
        </View>
      </View>

      <View style={styles.explainerCard}>
        <Text style={styles.explainerText}>
          We don&apos;t have critic reviews for this production — it&apos;s outside Broadway Scorecard&apos;s coverage area.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
    paddingHorizontal: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  poster: {
    width: 96,
    height: 144,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterEmoji: {
    fontSize: 36,
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  venue: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
  },
  marketDetail: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  openingDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  explainerCard: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  explainerText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
