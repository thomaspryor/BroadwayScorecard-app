/**
 * PosterPlaceholder — fallback poster art for shows with no image.
 * Beta feedback: the old flat-gray-box-with-a-letter look read as broken,
 * not "no photo yet". A muted gradient (picked deterministically from the
 * title so the same show always looks the same) plus a faint masks
 * watermark reads as intentional placeholder art instead.
 */
import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/theme';

const GRADIENTS: [string, string][] = [
  ['#2a2436', '#15131c'],
  ['#2a2020', '#171212'],
  ['#1f2a28', '#121a18'],
  ['#2c2416', '#1a1610'],
  ['#20242e', '#13151b'],
];

function pickGradient(title: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

export function PosterPlaceholder({ title, style }: { title: string; style?: StyleProp<ViewStyle> }) {
  const colors = useMemo(() => pickGradient(title), [title]);

  return (
    <View style={[styles.container, style]}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <View style={styles.iconWrap} pointerEvents="none">
        <Svg width="46%" height="46%" viewBox="0 0 24 24" fill="none" stroke={Colors.text.primary} strokeWidth={1.2} opacity={0.16}>
          <Path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5c0-1.5-1-2.5-2.5-2.5S4.5 8 4.5 9.5 5.5 12 7 13.5c1 1 1.5 2 1.5 3.5" />
          <Path strokeLinecap="round" strokeLinejoin="round" d="M14.5 9.5c0-1.5 1-2.5 2.5-2.5S19.5 8 19.5 9.5 18.5 12 17 13.5c-1 1-1.5 2-1.5 3.5" />
          <Path strokeLinecap="round" strokeLinejoin="round" d="M8 6.5c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5" />
        </Svg>
      </View>
      <Text style={styles.letter}>{title.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  letter: { color: Colors.text.secondary, fontSize: 18, fontWeight: '600' },
});
