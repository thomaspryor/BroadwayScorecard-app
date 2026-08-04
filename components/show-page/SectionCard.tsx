/**
 * Shared card shell for show-page sections, replicating the web's unified
 * "scorecard chrome" (web: `.card` in globals.css + the eyebrow/meta header
 * used by every scorecard section): raised surface, 16pt radius, hairline
 * border, uppercase eyebrow title on the left, lowercase meta on the right.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BorderRadius, Colors, Spacing } from '@/constants/theme';

type Props = {
  title: string;
  meta?: string;
  /** Custom right-side header content (e.g. a tier pill) — wins over meta. */
  metaContent?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SectionCard({ title, meta, metaContent, children, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{title}</Text>
        {metaContent ?? (meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null)}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  meta: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.7,
    textTransform: 'lowercase',
    flexShrink: 0,
  },
});
