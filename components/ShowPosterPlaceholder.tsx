/**
 * ShowPosterPlaceholder — fills a poster-shaped slot when a show has no
 * image. Replaces the old flat gray box + bare initial (beta feedback
 * 2026-08-12, ANFWPxJxRJF6PJmtTOMaO-I: "figure out better look placeholders
 * for shows that don't have images") with a subtle brand-toned gradient and
 * a ticket glyph — legible at grid-tile size without singling out any one
 * show by its initial.
 *
 * Renders StyleSheet.absoluteFill, so the caller keeps its existing sized
 * container (width/aspectRatio/borderRadius) and just swaps the child.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/theme';

export function ShowPosterPlaceholder() {
  return (
    <LinearGradient
      colors={[Colors.surface.raised, Colors.surface.elevated]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.center]}
    >
      <Svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M4 7a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 100-4V7z" />
        <Path d="M12 5.5v2M12 16.5v2M12 10v4" strokeDasharray="2,2.5" />
      </Svg>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
