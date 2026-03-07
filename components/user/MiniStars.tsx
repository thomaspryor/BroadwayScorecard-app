/**
 * MiniStars — read-only 5-star display for diary grid cards.
 * Matches the web's MiniStars: 14px stars, gold/gray, half-star support.
 */

import React, { useId } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect } from 'react-native-svg';

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
const GOLD = '#fcd34d';
const EMPTY = '#4b5563';
const STAR_SIZE = 14;

export default function MiniStars({ rating }: { rating: number }) {
  const id = useId();

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map(i => {
        const fill = rating >= i ? 'full' : rating >= i - 0.5 ? 'half' : 'empty';
        return (
          <Svg key={i} width={STAR_SIZE} height={STAR_SIZE} viewBox="0 0 24 24">
            {fill === 'full' ? (
              <Path d={STAR_PATH} fill={GOLD} />
            ) : fill === 'empty' ? (
              <Path d={STAR_PATH} fill="none" stroke={EMPTY} strokeWidth={1.5} strokeLinejoin="round" />
            ) : (
              <>
                <Defs>
                  <ClipPath id={`mini-half-${id}-${i}`}>
                    <Rect x="0" y="0" width="12" height="24" />
                  </ClipPath>
                </Defs>
                <Path d={STAR_PATH} fill="none" stroke={EMPTY} strokeWidth={1.5} strokeLinejoin="round" />
                <Path d={STAR_PATH} fill={GOLD} clipPath={`url(#mini-half-${id}-${i})`} />
              </>
            )}
          </Svg>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 1,
  },
});
