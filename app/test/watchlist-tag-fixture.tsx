/**
 * Fixture screen for the To Watch poster tags (owner directives 2026-08-02).
 *
 * Renders the SHIPPING components — PosterStatusPill and OutOfMarketChip — at
 * the real To Watch grid geometry against fixed show data, so a sim screenshot
 * proves the web-parity chip and the out-of-market city chip without depending
 * on the signed-in account's watchlist. Dev-only, same guard as the other test
 * screens.
 *
 * Geometry comes from usePosterGrid(3), the same hook the real tab uses. It was
 * hardcoded to the old 4-up '23%' and silently kept showing the pre-2026-08-03
 * layout after the tab moved to 3-up — a fixture that proves the wrong thing is
 * worse than no fixture (/what-else sweep, 2026-08-03).
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { PosterStatusPill } from '@/components/show-cards/PosterStatusPill';
import { OutOfMarketChip } from '@/components/show-cards/OutOfMarketChip';
import type { Market } from '@/components/MarketPicker';
import type { Show } from '@/lib/types';
import { usePosterGrid } from '@/hooks/usePosterGrid';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';

function fixture(partial: Partial<Show> & { id: string; title: string }): Show {
  return { slug: partial.id, venue: '', images: {}, ...partial } as Show;
}

// One card per status the pill can produce, plus both markets for the chip.
const CARDS: Show[] = [
  fixture({ id: 'les-mis', title: 'Les Misérables', status: 'open', category: 'west-end' }),
  fixture({ id: 'avenue-q', title: 'Avenue Q', status: 'open', category: 'broadway' }),
  fixture({ id: 'spies', title: 'The Comedy About Spies', status: 'previews', category: 'west-end' }),
  fixture({ id: 'sixteen', title: '1536', status: 'closed', category: 'off-west-end' }),
  fixture({
    id: 'oscar', title: 'The Importance of Being Oscar', status: 'open',
    category: 'off-broadway', closingDate: '2026-08-09',
  }),
  fixture({
    id: 'heights', title: 'In the Heights', status: 'upcoming',
    category: 'broadway', ticketsOnSale: true,
  }),
  fixture({
    id: 'few-good-men', title: 'A Few Good Men', status: 'upcoming',
    category: 'off-broadway', ticketsOnSale: true,
  }),
  fixture({ id: 'regional', title: 'Regional Show', status: 'open', category: 'regional' }),
];

function Card({ show, market }: { show: Show; market: Market }) {
  const grid = usePosterGrid(3);
  return (
    <View style={[styles.gridCard, { width: grid.cardWidth }]}>
      <View>
        <View style={styles.gridPoster} />
        <PosterStatusPill show={show} />
      </View>
      <Text style={styles.gridTitle} numberOfLines={2}>{show.title}</Text>
      <OutOfMarketChip show={show} market={market} />
    </View>
  );
}

function MarketBlock({ market }: { market: Market }) {
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>
        Viewer market: {market === 'nyc' ? 'NYC' : 'London'}
      </Text>
      <View style={styles.grid}>
        {CARDS.map(s => <Card key={`${market}-${s.id}`} show={s} market={market} />)}
      </View>
    </View>
  );
}

export default function WatchlistTagFixtureScreen() {
  if (!__DEV__ && process.env.EXPO_PUBLIC_DEV_AUTO_SIGNIN !== '1') return null;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <MarketBlock market="nyc" />
      <MarketBlock market="london" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface.default },
  content: { padding: Spacing.lg, paddingTop: 60, gap: Spacing.xl },
  block: { gap: Spacing.md },
  heading: { color: Colors.text.primary, fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, rowGap: 12 },
  // Width comes from usePosterGrid(3) at render time — see lib/poster-grid.ts.
  gridCard: { alignItems: 'center' },
  gridPoster: {
    width: '100%', aspectRatio: 2 / 3, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface.overlay,
  },
  gridTitle: {
    color: Colors.text.secondary, fontSize: 12, fontWeight: '500',
    textAlign: 'center', lineHeight: 15, marginTop: 2, minHeight: 30,
  },
});
