/**
 * Advanced filters bottom sheet for the Browse tab — mobile mirror of the
 * web's Advanced Filter panel (beta feedback 2026-07-26: "Add the Advanced
 * search filters here, same as on desktop").
 *
 * Pure filter logic lives in lib/advanced-filters.ts; this component only
 * renders the group pill rows and reports selection changes up.
 */

import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  advancedFilterGroupsFor,
  countActiveSelections,
  type AdvancedSelections,
} from '@/lib/advanced-filters';
import type { Market } from '@/lib/market-filter';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';

interface Props {
  visible: boolean;
  /** Labels the score tiers for this market (London Gold is 85+) */
  market: Market;
  selections: AdvancedSelections;
  /** Shows matching the CURRENT selections (for the Done button count) */
  matchCount: number;
  /** Toggle one option — parent applies it via a functional state update */
  onToggle: (groupKey: string, optionId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function AdvancedFiltersSheet({ visible, market, selections, matchCount, onToggle, onClearAll, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const activeCount = countActiveSelections(selections);

  const toggle = (groupKey: string, optionId: string) => {
    haptics.tap();
    onToggle(groupKey, optionId);
  };

  const clearAll = () => {
    haptics.tap();
    onClearAll();
  };

  return (
    // Native page sheet: swipe down closes it (onRequestClose), the screen
    // behind recedes, and nothing dims-then-slides. The old transparent modal
    // slid its own dark backdrop up from the bottom along with the sheet.
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Filters</Text>
          {activeCount > 0 && (
            <Pressable onPress={clearAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear all filters">
              <Text style={styles.clearAll}>Clear all</Text>
            </Pressable>
          )}
        </View>
        <ScrollView style={styles.groups} showsVerticalScrollIndicator={false}>
          {advancedFilterGroupsFor(market).map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
              <View style={styles.pillRow}>
                {group.options.map((opt) => {
                  const active = selections[group.key]?.includes(opt.id) ?? false;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => toggle(group.key, opt.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={opt.label}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        <Pressable
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.doneText}>
            {activeCount > 0 ? `Show ${matchCount} ${matchCount === 1 ? 'show' : 'shows'}` : 'Done'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.surface.raised,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm,
  },
  grabber: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surface.overlay, marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: Spacing.sm,
  },
  title: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  clearAll: { color: Colors.brand, fontSize: FontSize.sm, fontWeight: '600' },
  // Fills the sheet between the header and the Done button, scrolling when
  // the groups are taller than the screen.
  groups: { flex: 1 },
  group: { marginBottom: Spacing.lg },
  groupLabel: {
    color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '600',
    letterSpacing: 1, marginBottom: Spacing.sm,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surface.overlay,
    borderWidth: 1, borderColor: Colors.border.subtle,
  },
  pillActive: {
    backgroundColor: Colors.brand + '20',
    borderColor: Colors.brand,
  },
  pillText: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '500' },
  pillTextActive: { color: Colors.brand, fontWeight: '600' },
  doneButton: {
    marginTop: Spacing.sm, backgroundColor: Colors.brand, borderRadius: 12,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  doneText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
