/**
 * PosterPlaceholder — what a show tile shows when it has no poster art.
 *
 * The old placeholder was a flat #252530 rectangle with the title's first
 * letter floating in it, which read as a broken image next to real artwork
 * (beta feedback 2026-08-12, ANFWPxJx: "figure out better look placeholders
 * for shows that don't have images"). This renders a deterministic dark
 * gradient with the show's title set like a marquee card instead, so the tile
 * looks intentional and still identifies the show.
 *
 * Deterministic: the same title always gets the same gradient, so a show does
 * not change colour between the diary grid and the list.
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius } from '@/constants/theme';

/** Curated dark pairs rather than generated hues — every one of these has to
 *  sit next to real poster art on a #0f0f14 page without shouting. */
const GRADIENTS: readonly [string, string][] = [
  ['#3b3054', '#191426'], // plum
  ['#1f3b4d', '#0f1c26'], // teal-slate
  ['#4a2f2a', '#241715'], // burgundy
  ['#2c4033', '#141f19'], // forest
  ['#3d3524', '#1e1a12'], // brass
  ['#2a3550', '#151b28'], // indigo
];

function gradientFor(title: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export interface PosterPlaceholderProps {
  title: string;
  /** 'poster' — full tile, sets the whole title. 'thumb' — small list/row
   *  artwork (under ~60pt wide), where only an initial fits. */
  variant?: 'poster' | 'thumb';
  /** Size/radius come from the caller so the placeholder occupies exactly the
   *  same box the real <Image> would have. */
  style?: StyleProp<ViewStyle>;
}

export function PosterPlaceholder({ title, variant = 'poster', style }: PosterPlaceholderProps) {
  const colors = gradientFor(title);
  return (
    <View style={[styles.base, style]} accessible={false}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {variant === 'thumb' ? (
        <Text style={styles.initial}>{title.trim().charAt(0).toUpperCase()}</Text>
      ) : (
        <>
          <View style={styles.rule} />
          <Text style={styles.title} numberOfLines={4}>
            {title.toUpperCase()}
          </Text>
          <View style={styles.rule} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
    // A hairline edge keeps the tile from melting into the page background
    // where the gradient's dark stop lands.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border.default,
    gap: 8,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
    // Padding lives on the text, not the tile — a thumb-variant tile is only
    // ~40pt wide and has no room to give any of it away.
    paddingHorizontal: 10,
  },
  // Marquee rules above and below the title — the thing that makes it read as
  // a designed card rather than a failed image load.
  rule: {
    height: StyleSheet.hairlineWidth,
    width: 26,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  initial: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
