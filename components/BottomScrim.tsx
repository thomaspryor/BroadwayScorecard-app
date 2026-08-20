/**
 * Fixed fade at the bottom of a scrollable screen, sitting just above the
 * floating NativeTabs bar. Content used to scroll with no visual cue that it
 * was approaching the tab bar's footprint — the fade signals "more below,
 * chrome ahead" the same way the canon poster shelf's trailing fade does
 * (build-61 sim QA). `pointerEvents="none"` so it never blocks taps on the
 * content or the tab bar underneath it.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/theme';

export function BottomScrim({ height = 48 }: { height?: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['transparent', Colors.surface.default]}
      style={[styles.scrim, { height }]}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
