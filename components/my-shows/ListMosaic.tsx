import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, BorderRadius } from '@/constants/theme';

interface Props {
  posterUrls: (string | null | undefined)[];
  size?: number;
  layout?: 'mosaic' | 'strip';
}

export function ListMosaic({ posterUrls, size = 96, layout = 'mosaic' }: Props) {
  const slots = [0, 1, 2, 3].map(i => posterUrls[i] || null);

  if (layout === 'strip') {
    const tile = (size - 6) / 4;
    return (
      <View style={[styles.stripWrap, { width: size, height: tile * 1.5 }]}>
        {slots.map((url, i) => (
          <Tile key={i} url={url} size={tile} aspect={2 / 3} />
        ))}
      </View>
    );
  }

  const tile = (size - 2) / 2;
  return (
    <View style={[styles.mosaicWrap, { width: size, height: size }]}>
      {slots.map((url, i) => (
        <Tile key={i} url={url} size={tile} aspect={1} />
      ))}
    </View>
  );
}

function Tile({ url, size, aspect }: { url: string | null; size: number; aspect: number }) {
  const dims = { width: size, height: size / aspect };
  if (!url) {
    return (
      <View style={[styles.tile, styles.placeholder, dims]}>
        <Text style={styles.placeholderGlyph}>🎭</Text>
      </View>
    );
  }
  return <Image source={{ uri: url }} style={[styles.tile, dims]} contentFit="cover" transition={200} />;
}

const styles = StyleSheet.create({
  mosaicWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  stripWrap: {
    flexDirection: 'row',
    gap: 2,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  tile: {
    backgroundColor: Colors.surface.overlay,
    borderRadius: 4,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderGlyph: {
    fontSize: 14,
    opacity: 0.5,
  },
});
