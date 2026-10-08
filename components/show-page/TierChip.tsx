/**
 * Outlet tier chip (T1-T4) next to the outlet name in the Critic Scorecard,
 * matching the website's chip (BRO-4881). The website opens a popover on
 * hover; on a phone a tap opens a small sheet saying what the tier means and
 * how much the review counts. The chip sits inside the review row's own
 * Pressable, so tapping it explains the tier instead of opening the review.
 *
 * TierKey is the "Weighted by outlet tier T1-T4" line at the top of the list;
 * it opens the same sheet listing all four tiers.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { TIERS, tierExplanation, type OutletTier } from '@/lib/tier-display';

const METHODOLOGY_URL = 'https://broadwayscorecard.com/methodology#critic-score';

export function TierChip({ tier, london, isTopCritic, criticName }: {
  tier: OutletTier;
  london: boolean;
  isTopCritic?: boolean;
  criticName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const info = tierExplanation(tier, { london, isTopCritic, criticName });
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Tier ${tier}: ${info.title}. ${info.relative}`}
        accessibilityHint="Explains how much this review counts"
        testID="tier-chip"
      >
        <Text style={[styles.chipText, tier === 1 && styles.chipTextT1]}>T{tier}</Text>
      </Pressable>
      <TierSheet visible={open} onClose={() => setOpen(false)}>
        <TierBlock tier={tier} title={info.title} weight={info.weight} relative={info.relative} detail={info.detail} />
      </TierSheet>
    </>
  );
}

export function TierKey({ london }: { london: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.keyRow, pressed && styles.chipPressed]}
        accessibilityRole="button"
        accessibilityLabel="Weighted by outlet tier, T1 to T4. How we weight critics"
        testID="tier-key"
      >
        <Text style={styles.keyText}>Weighted by outlet tier</Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>T1–T4</Text>
        </View>
      </Pressable>
      <TierSheet visible={open} onClose={() => setOpen(false)}>
        {TIERS.map((t) => {
          const info = tierExplanation(t, { london });
          return <TierBlock key={t} tier={t} title={info.title} weight={info.weight} relative={info.relative} detail={info.detail} compact />;
        })}
      </TierSheet>
    </>
  );
}

function TierSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.sheetBody}>{children}</View>
          <Pressable
            onPress={() => { onClose(); WebBrowser.openBrowserAsync(METHODOLOGY_URL); }}
            style={({ pressed }) => [styles.link, pressed && styles.chipPressed]}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>How we weight critics →</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TierBlock({ tier, title, weight, relative, detail, compact }: {
  tier: OutletTier; title: string; weight: number; relative: string; detail: string; compact?: boolean;
}) {
  return (
    <View style={[styles.block, compact && styles.blockCompact]}>
      <View style={styles.blockHead}>
        <Text style={styles.eyebrow}>TIER {tier}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.weightRow}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${weight * 100}%` }]} />
        </View>
        <Text style={styles.weightText}>{weight.toFixed(2)}×</Text>
      </View>
      <Text style={styles.body}>
        <Text style={styles.bodyStrong}>{relative}</Text> {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    flexShrink: 0,
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  chipTextT1: {
    color: Colors.text.secondary,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  keyText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface.raised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: Spacing.md,
  },
  sheetBody: {
    gap: Spacing.lg,
  },
  block: {
    gap: 10,
  },
  blockCompact: {
    gap: 6,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  eyebrow: {
    color: Colors.brand,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  title: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
  weightText: {
    color: Colors.text.primary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  body: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  bodyStrong: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  link: {
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  linkText: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
