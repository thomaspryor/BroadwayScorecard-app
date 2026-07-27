/**
 * Scope pill — pinned under the Stats header, filters every module (spec §2).
 *
 * The pill itself is a single control; tapping it opens a sectioned picker
 * (All time · Seasons · Years). Season labels carry the word "Tony" so they can
 * never be confused with the Browse tab's Tony-ELIGIBILITY period filter, which
 * is a different date range (see lib/stats-scope.ts header).
 */

import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import * as haptics from '@/lib/haptics';
import { ALL_TIME, type ScopeOption } from '@/lib/stats-scope';

const SECTIONS: ScopeOption['section'][] = ['All time', 'Seasons', 'Years'];

export function ScopePill({
  scopes,
  active,
  onChange,
}: {
  scopes: ScopeOption[];
  active: ScopeOption;
  onChange: (s: ScopeOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentSeason = scopes.find((s) => s.kind === 'season' && s.inProgress) ?? null;

  return (
    <>
      <View style={styles.bar}>
        <Pressable
          testID="stats-scope-pill"
          onPress={() => {
            haptics.tap();
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Scope: ${active.label}. Opens the scope picker.`}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        >
          <Text style={styles.pillText} numberOfLines={1}>
            {active.label}
          </Text>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={Colors.text.inverse} strokeWidth={2.5}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </Svg>
        </Pressable>
        {active.kind !== 'all' ? (
          <Pressable
            testID="stats-scope-clear"
            onPress={() => {
              // ALL_TIME by identity, not scopes[0] — the button says "All
              // time" and must mean it even if the list order ever changes.
              haptics.tap();
              onChange(ALL_TIME);
            }}
            accessibilityRole="button"
            accessibilityLabel="Show all time"
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          >
            <Text style={styles.clearText}>All time</Text>
          </Pressable>
        ) : (
          // Symmetric quick toggle: under All time the shortcut flips BACK to
          // the current season. Build-61 owner report: with only the vanishing
          // "All time" button, tapping it made the season option "disappear".
          currentSeason && (
            <Pressable
              testID="stats-scope-season"
              onPress={() => {
                haptics.tap();
                onChange(currentSeason);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Scope to ${currentSeason.label}`}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <Text style={styles.clearText}>{currentSeason.label}</Text>
            </Pressable>
          )
        )}
      </View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Scope</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {SECTIONS.map((section) => {
              const items = scopes.filter((s) => s.section === section);
              if (!items.length) return null;
              return (
                <View key={section} style={styles.section}>
                  <Text style={styles.sectionLabel}>{section.toUpperCase()}</Text>
                  {items.map((s) => (
                    <Pressable
                      key={s.id}
                      testID={`stats-scope-option-${s.id}`}
                      onPress={() => {
                        haptics.tap();
                        onChange(s);
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: s.id === active.id }}
                      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                    >
                      <Text style={[styles.optionText, s.id === active.id && styles.optionTextActive]}>
                        {s.label}
                      </Text>
                      {s.id === active.id && (
                        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.brand} strokeWidth={3}>
                          <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </Svg>
                      )}
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.brand,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.lg,
    minHeight: 44,
    maxWidth: '72%',
  },
  pillText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  clear: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  clearText: { color: Colors.text.muted, fontSize: FontSize.xs, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  sheet: { flex: 1, backgroundColor: Colors.surface.default },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    minHeight: 44,
  },
  sheetTitle: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700' },
  done: { color: Colors.brand, fontSize: FontSize.md, fontWeight: '600' },
  sheetContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  section: { marginBottom: Spacing.xl },
  sectionLabel: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  optionText: { color: Colors.text.secondary, fontSize: FontSize.md },
  optionTextActive: { color: Colors.text.primary, fontWeight: '700' },
});
