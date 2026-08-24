/**
 * Poster placeholder for shows without an image — web parity
 * (src/components/show-cards/MiniShowCard.tsx `fallback`): a theater mask
 * emoji centered on the poster's own surface-overlay background, instead of
 * a bare first-letter monogram (beta feedback 2026-08-12, ANFWPxJxRJF6PJmtTOMaO-I:
 * "figure out better look placeholders for shows that don't have images").
 */

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '@/constants/theme';

/** Drop-in replacement for the old `<View style={[posterStyle, placeholder]}>
 *  <Text>{title.charAt(0)}</Text></View>` pattern — pass the same poster box
 *  style (width/height/aspect ratio) via `style`. */
export function PosterPlaceholder({
  style,
  upcoming = false,
}: {
  style?: StyleProp<ViewStyle>;
  upcoming?: boolean;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.emoji}>🎭</Text>
      {upcoming && <Text style={styles.caption}>Image{'\n'}coming soon</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: Colors.surface.overlay,
  },
  emoji: { fontSize: 22 },
  caption: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 2,
  },
});
