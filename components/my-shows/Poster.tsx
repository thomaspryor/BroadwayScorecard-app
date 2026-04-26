import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, BorderRadius } from '@/constants/theme';

interface PosterProps {
  posterUrl?: string | null;
  title: string;
  onPress?: () => void;
  onLongPress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  width?: number;
  showGradient?: boolean;
}

export function Poster({
  posterUrl,
  title,
  onPress,
  onLongPress,
  children,
  style,
  width,
  showGradient = true,
}: PosterProps) {
  const posterStyle = [
    styles.poster,
    width !== undefined ? { width } : { width: '100%' as const },
    style,
  ];

  const body = (
    <>
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderText}>{title.charAt(0)}</Text>
        </View>
      )}
      {showGradient ? (
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
          style={styles.gradient}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </>
  );

  if (!onPress && !onLongPress) {
    return <View style={posterStyle}>{body}</View>;
  }

  return (
    <Pressable
      style={({ pressed }) => [posterStyle, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface.overlay,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: 28,
    fontWeight: '600',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  pressed: {
    opacity: 0.75,
  },
});
