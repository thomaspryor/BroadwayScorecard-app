/**
 * In-app long-press context menu — replaces native Alert.alert action
 * sheets across poster grids (To Watch, Diary, Lists). Bottom-sheet style,
 * grouped actions + a visually separated Cancel row (iOS action-sheet
 * convention), built from existing design-system tokens only.
 */

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';

export interface ContextMenuAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  visible: boolean;
  title?: string;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ visible, title, actions, onClose }: ContextMenuProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss menu">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]} onPress={() => {}}>
          <View style={styles.group}>
            {title && (
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
              </View>
            )}
            {actions.map((action, i) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowBorder,
                  pressed && styles.rowPressed,
                  action.disabled && styles.rowDisabled,
                ]}
                disabled={action.disabled}
                onPress={() => { haptics.tap(); onClose(); action.onPress(); }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text style={[styles.rowText, action.destructive && styles.rowTextDestructive]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.group, styles.cancelGroup, pressed && styles.rowPressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  group: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  titleRow: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border.default,
  },
  title: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  row: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border.default,
  },
  rowPressed: { backgroundColor: Colors.surface.overlay },
  rowDisabled: { opacity: 0.4 },
  rowText: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  rowTextDestructive: { color: '#ef4444' },
  cancelGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  cancelText: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
