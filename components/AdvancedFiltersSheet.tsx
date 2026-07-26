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
  ADVANCED_FILTER_GROUPS,
  countActiveSelections,
  type AdvancedSelections,
} from '@/lib/advanced-filters';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';

interface Props {
  visible: boolean;
  selections: AdvancedSelections;
  /** Shows matching the CURRENT selections (for the Done button count) */
  matchCount: number;
  onChange: (next: AdvancedSelections) => void;
  onClose: () => void;
}

export function AdvancedFiltersSheet({ visible, selections, matchCount, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const activeCount = countActiveSelections(selections);

  const toggle = (groupKey: string, optionId: string) => {
    haptics.tap();
    const current = selections[groupKey] ?? [];
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    onChange({ ...selections, [groupKey]: next });
  };

  const clearAll = () => {
    haptics.tap();
    onChange({});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Close filters" />
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
            {ADVANCED_FILTER_GROUPS.map((group) => (
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: Colors.surface.raised,
    borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm,
    maxHeight: '85%',
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
  groups: { flexGrow: 0 },
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
