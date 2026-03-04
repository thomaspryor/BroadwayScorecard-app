/**
 * Market picker — dropdown selector for NYC / London.
 * White-styled to differentiate from the brown score toggle.
 */

import React, { useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, findNodeHandle, UIManager, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export type Market = 'nyc' | 'london';

interface MarketPickerProps {
  market: Market;
  onChange: (market: Market) => void;
}

const OPTIONS: { key: Market; label: string }[] = [
  { key: 'nyc', label: 'NYC' },
  { key: 'london', label: 'London' },
];

export function MarketPicker({ market, onChange }: MarketPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<View>(null);
  const currentLabel = OPTIONS.find(o => o.key === market)?.label ?? 'NYC';

  const handleOpen = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setPos({ top: y + height + 4, right: 16 });
      setOpen(true);
    });
  }, []);

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel={`Market: ${currentLabel}. Tap to change.`}
        >
          <Text style={styles.triggerText}>{currentLabel}</Text>
          <Text style={styles.chevron}>{'\u25BE'}</Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={[styles.dropdown, { position: 'absolute', top: pos.top, right: pos.right }]}>
            {OPTIONS.map(opt => (
              <Pressable
                key={opt.key}
                style={[styles.dropdownItem, market === opt.key && styles.dropdownItemActive]}
                onPress={() => {
                  if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChange(opt.key);
                  setOpen(false);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: market === opt.key }}
              >
                <Text style={[styles.dropdownText, market === opt.key && styles.dropdownTextActive]}>
                  {opt.label}
                </Text>
                {market === opt.key && <Text style={styles.checkmark}>{'\u2713'}</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Filter shows by market selection (includes off-broadway for NYC) */
export function filterByMarket(category: string, market: Market): boolean {
  if (market === 'nyc') {
    return category === 'broadway' || category === 'off-broadway';
  }
  return category === 'west-end';
}

/** Filter by market with off-broadway control.
 * includeOB=false → Broadway only. includeOB=true → Off-Broadway only. */
export function filterByMarketCategory(category: string, market: Market, includeOB: boolean): boolean {
  if (market === 'nyc') {
    return includeOB ? category === 'off-broadway' : category === 'broadway';
  }
  return category === 'west-end';
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    gap: 6,
  },
  triggerPressed: {
    opacity: 0.7,
  },
  triggerText: {
    color: '#ffffff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  chevron: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FontSize.xs,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropdown: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: BorderRadius.md,
    minWidth: 180,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dropdownText: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
  },
  dropdownTextActive: {
    fontWeight: '600',
  },
  checkmark: {
    color: Colors.brand,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
