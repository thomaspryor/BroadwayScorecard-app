/**
 * Shared building blocks for the Stats modules.
 *
 * DESIGN RULE (owner mandate, spec §9): tokens from constants/theme.ts ONLY.
 * System font, brand gold `Colors.brand`, existing surfaces. Charts are
 * single-hue gold marks on surface grounds — bars are plain Views, rings are
 * react-native-svg (already a dependency; nothing was added to package.json).
 * Score-tier colours appear ONLY inside ScoreBadge, as semantic score chips.
 *
 * Intensity variation is done with opacity on the SAME gold, never with a
 * second hue — `withAlpha()` is the only colour derivation in this file.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

/**
 * Alpha variant of an existing token hex. NOT a new colour: it is the same
 * token composited on the same surface, which is how the app already writes
 * `rgba(255,255,255,0.1)` for pressed states.
 */
export function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Tabular numerals so columns of stats don't jitter (spec §3.1). */
export const TABULAR = { fontVariant: ['tabular-nums' as const] };

// ─── Card + module header ─────────────────────────────────────────────

export function StatsCard({
  children,
  style,
  flush,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Marquee variant: rules instead of card chrome. */
  flush?: boolean;
}) {
  return <View style={[flush ? styles.flushSection : styles.card, style]}>{children}</View>;
}

export function ModuleHeader({
  title,
  caption,
  right,
}: {
  title: string;
  caption?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.moduleHeader}>
      <View style={styles.moduleHeaderText}>
        <Text style={styles.moduleTitle}>{title}</Text>
        {!!caption && <Text style={styles.moduleCaption}>{caption}</Text>}
      </View>
      {right}
    </View>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────

export function StatTile({
  value,
  label,
  sublabel,
  onPress,
  size = 'md',
  testID,
}: {
  value: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  size?: 'md' | 'hero';
  testID?: string;
}) {
  const body = (
    <>
      <Text
        style={[size === 'hero' ? styles.tileValueHero : styles.tileValue, TABULAR]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
      {!!sublabel && (
        <Text style={styles.tileSublabel} numberOfLines={1}>
          {sublabel}
        </Text>
      )}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.tile} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}. Opens the list.`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

// ─── Gold bar (bar charts, histograms, gauges) ────────────────────────

/**
 * One vertical bar. Plain View, single-hue gold; the selected bar goes fully
 * opaque and everything else sits at 45% of the same gold.
 */
export function GoldBar({
  heightPct,
  heightPx,
  selected,
  minHeight = 3,
}: {
  /** 0–1 of the track height. */
  heightPct: number;
  /** Explicit px height — pass when the track's own height is fixed. A %-height
      here resolves against an undefined parent inside horizontal ScrollViews
      and collapses to minHeight (build-61 sliver-bars bug). */
  heightPx?: number;
  selected?: boolean;
  minHeight?: number;
}) {
  return (
    <View
      style={{
        width: '100%',
        height: heightPx !== undefined ? Math.round(heightPx) : `${Math.max(heightPct * 100, 0)}%`,
        minHeight: heightPct > 0 ? Math.max(minHeight, 4) : minHeight,
        borderRadius: 3,
        backgroundColor: heightPct > 0 ? (selected ? Colors.brand : withAlpha(Colors.brand, 0.45)) : Colors.surface.overlay,
      }}
    />
  );
}

/** Horizontal progress track — used by the canon checklists and the gauge. */
export function GoldTrack({ pct, height = 8 }: { pct: number; height?: number }) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${Math.min(Math.max(pct, 0), 1) * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: Colors.brand,
        }}
      />
    </View>
  );
}

// ─── Completion ring ──────────────────────────────────────────────────

/**
 * Completion ring. react-native-svg is ALREADY a dependency (package.json
 * "react-native-svg": "15.15.4" — used by every icon in the app), so no
 * package was added for charting.
 */
export function ProgressRing({
  pct,
  size = 96,
  stroke = 9,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 1);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Colors.surface.overlay}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Colors.brand}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          // Start at 12 o'clock rather than 3. Explicit rotation/origin props
          // rather than a transform string — the string form has bitten this
          // repo's SVG usage before and these are unambiguous.
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

// ─── Chevron / disclosure ─────────────────────────────────────────────

export function Chevron({ color = Colors.text.muted, size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </Svg>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────

/** A "record" pill: label above, value below, taps to its shows. */
export function RecordPill({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  testID?: string;
}) {
  const inner = (
    <>
      <Text style={styles.recordLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.recordValue, TABULAR]} numberOfLines={1}>
        {value}
      </Text>
    </>
  );
  if (!onPress) return <View style={styles.recordPill} testID={testID}>{inner}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Opens the list.`}
      style={({ pressed }) => [styles.recordPill, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

/** Full-width tappable stat row with a trailing chevron. */
export function StatRow({
  title,
  subtitle,
  value,
  onPress,
  testID,
  right,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  testID?: string;
  right?: React.ReactNode;
}) {
  const inner = (
    <>
      <View style={styles.statRowText}>
        <Text style={styles.statRowTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.statRowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!value && <Text style={[styles.statRowValue, TABULAR]}>{value}</Text>}
      {right}
      {!!onPress && <Chevron />}
    </>
  );
  if (!onPress) return <View style={styles.statRow} testID={testID}>{inner}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.statRow, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

// ─── Empty / sparse states (spec §7) ──────────────────────────────────

export function GhostState({
  logged,
  needed,
  onAction,
}: {
  logged: number;
  needed: number;
  onAction?: () => void;
}) {
  return (
    <View style={styles.ghost}>
      {/* Ghost bar chart — shows the shape of what they'll get. */}
      <View style={styles.ghostChart}>
        {[0.35, 0.6, 0.45, 0.8, 0.55, 0.9, 0.5].map((h, i) => (
          <View key={i} style={styles.ghostBarSlot}>
            <View style={[styles.ghostBar, { height: `${h * 100}%` }]} />
          </View>
        ))}
      </View>
      <Text style={styles.ghostTitle}>Log {Math.max(needed - logged, 0)} more to open your Scorecard</Text>
      <Text style={styles.ghostBody}>
        Stats need at least {needed} shows in your diary. You have {logged}.
      </Text>
      <View style={styles.ghostDots}>
        {Array.from({ length: needed }).map((_, i) => (
          <View key={i} style={[styles.ghostDot, i < logged && styles.ghostDotFilled]} />
        ))}
      </View>
      {!!onAction && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [styles.ghostAction, pressed && styles.pressed]}
        >
          <Text style={styles.ghostActionText}>Rate a show</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Under-threshold placeholder for a single module. */
export function ModuleLocked({ title, need }: { title: string; need: string }) {
  return (
    <StatsCard>
      <ModuleHeader title={title} />
      <Text style={styles.lockedText}>{need}</Text>
    </StatsCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border.subtle,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  flushSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  moduleHeaderText: { flex: 1 },
  moduleTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  moduleCaption: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    minHeight: 88,
    justifyContent: 'center',
  },
  tileValue: {
    color: Colors.text.primary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  tileValueHero: {
    color: Colors.text.primary,
    fontSize: FontSize.title,
    fontWeight: '800',
  },
  tileLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  tileSublabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  track: {
    width: '100%',
    backgroundColor: Colors.surface.overlay,
    overflow: 'hidden',
  },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  recordPill: {
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    flexGrow: 1,
    // Two per row, not three: at 30% "Gershwin · 1,933" truncated to
    // "Gershwin ·…" on a Pro Max, which is the half of the record that
    // matters (caught in simulator review).
    flexBasis: '46%',
  },
  recordLabel: { color: Colors.text.muted, fontSize: FontSize.xs },
  recordValue: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600', marginTop: 2 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 44,
    paddingVertical: Spacing.sm,
  },
  statRowText: { flex: 1, minWidth: 0 },
  statRowTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  statRowSubtitle: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 2 },
  statRowValue: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  ghost: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  ghostChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    height: 96,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  ghostBarSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  ghostBar: {
    width: '100%',
    borderRadius: 3,
    backgroundColor: Colors.surface.overlay,
  },
  ghostTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  ghostBody: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  ghostDots: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  ghostDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surface.overlay,
  },
  ghostDotFilled: { backgroundColor: Colors.brand },
  ghostAction: {
    marginTop: Spacing.xl,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.brand,
  },
  ghostActionText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  lockedText: { color: Colors.text.muted, fontSize: FontSize.sm },
});
