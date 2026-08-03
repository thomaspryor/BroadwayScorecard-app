/**
 * PlannedDateSheet — "when are you going?" date picker, presented as a modal
 * bottom sheet.
 *
 * Why a sheet and not an inline picker: the show page rendered
 * DateTimePicker (display="inline", ~320pt wide, non-shrinkable) INSIDE the
 * narrow right-hand column of a flex row. The picker forced that column to its
 * intrinsic width, collapsing the left column to a few points, so
 * "MY RATING & REVIEW" wrapped one or two characters per line and the stars
 * overlapped the "+ List" button — the "crazy horrible screen" the owner hit
 * twice (beta feedback 2026-08-03, ADu0gjsK and AODNE6S9). A modal takes the
 * picker out of the flow entirely, so no layout can be squeezed by it, and it
 * gives both callers (show page + To Watch tab) one identical presentation.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface PlannedDateSheetProps {
  visible: boolean;
  /** Date the picker opens on. */
  initialDate: Date;
  title?: string;
  /** Shown as a tertiary action; omit to hide (e.g. nothing to clear yet). */
  onClear?: () => void;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
  /** "Skip" reads better than "Cancel" right after adding a show. */
  cancelLabel?: string;
}

export function PlannedDateSheet({
  visible,
  initialDate,
  title = 'When are you going?',
  onClear,
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
}: PlannedDateSheetProps) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<Date>(initialDate);

  // Render-phase reset when the sheet opens (keeps setState out of an effect).
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setPending(initialDate);
  }

  const handleChange = useCallback(
    (_event: DateTimePickerEvent, selected?: Date) => {
      if (!selected) return;
      if (Platform.OS === 'ios') {
        // iOS inline picker stays open; commit on Done.
        setPending(selected);
      } else {
        // Android dismisses itself on selection — that IS the confirmation.
        onConfirm(selected);
      }
    },
    [onConfirm],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss date picker" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button">
            <Text style={styles.cancel}>{cancelLabel}</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable onPress={() => onConfirm(pending)} hitSlop={10} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <DateTimePicker
          value={pending}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleChange}
          themeVariant="dark"
          style={styles.picker}
        />

        {onClear && (
          <Pressable onPress={onClear} hitSlop={8} style={styles.clearRow} accessibilityRole="button">
            <Text style={styles.clear}>Clear date</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface.raised,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderColor: Colors.border.subtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    minHeight: 44,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  cancel: { color: Colors.text.muted, fontSize: FontSize.sm, fontWeight: '500', minWidth: 52 },
  done: { color: Colors.brand, fontSize: FontSize.sm, fontWeight: '700', minWidth: 52, textAlign: 'right' },
  picker: { alignSelf: 'center' },
  clearRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clear: { color: Colors.text.muted, fontSize: FontSize.sm, textDecorationLine: 'underline' },
});
