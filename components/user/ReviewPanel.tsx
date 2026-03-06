/**
 * Review panel — date seen + private notes form.
 *
 * Expanded below the star rating when user taps a star.
 * Uses @react-native-community/datetimepicker for date input.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface ReviewPanelProps {
  rating: number;
  existingReviewText?: string | null;
  existingDateSeen?: string | null;
  showTitle: string;
  latestDate?: string | null;
  onSave: (data: { rating: number; reviewText: string | null; dateSeen: string | null }) => void;
  onCancel: () => void;
  saving?: boolean;
}

const MAX_CHARS = 2000;

export default function ReviewPanel({
  rating,
  existingReviewText,
  existingDateSeen,
  showTitle,
  latestDate,
  onSave,
  onCancel,
  saving = false,
}: ReviewPanelProps) {
  const [reviewText, setReviewText] = useState(existingReviewText || '');
  const [dateSeen, setDateSeen] = useState(existingDateSeen || '');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const charsRemaining = MAX_CHARS - reviewText.length;
  const isOverLimit = charsRemaining < 0;

  const handleSave = useCallback(() => {
    if (isOverLimit || saving) return;
    onSave({
      rating,
      reviewText: reviewText.trim() || null,
      dateSeen: dateSeen || null,
    });
  }, [rating, reviewText, dateSeen, isOverLimit, saving, onSave]);

  const handleDateChange = useCallback((_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // iOS keeps picker open
    if (selectedDate) {
      const iso = selectedDate.toISOString().split('T')[0];
      setDateSeen(iso);
    }
  }, []);

  const today = new Date();
  const maxDate = latestDate ? new Date(latestDate + 'T00:00:00') : today;
  const dateValue = dateSeen ? new Date(dateSeen + 'T00:00:00') : today;

  const formattedDate = dateSeen
    ? new Date(dateSeen + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Rating display */}
        <View style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>Your rating for </Text>
          <Text style={styles.showTitle} numberOfLines={1}>
            {showTitle}
          </Text>
          <Text style={styles.ratingValue}> {rating.toFixed(1)}</Text>
        </View>

        {/* Date seen */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Date Seen <Text style={styles.optional}>(optional)</Text>
          </Text>
          <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)} accessibilityRole="button" accessibilityLabel="Choose date seen">
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
              <Path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </Svg>
            <Text style={[styles.dateText, !formattedDate && styles.datePlaceholder]}>
              {formattedDate || 'Select date'}
            </Text>
          </Pressable>
          {showDatePicker && (
            <View style={styles.datePickerWrapper}>
              <DateTimePicker
                value={dateValue}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                maximumDate={maxDate}
                minimumDate={new Date('1950-01-01')}
                themeVariant="dark"
                style={{ height: 150 }}
              />
              {Platform.OS === 'ios' && (
                <Pressable onPress={() => setShowDatePicker(false)} style={styles.datePickerDone}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </Pressable>
              )}
            </View>
          )}
          {dateSeen && (
            <Pressable onPress={() => { setDateSeen(''); setShowDatePicker(false); }} accessibilityRole="button" accessibilityLabel="Clear date">
              <Text style={styles.clearDate}>Clear date</Text>
            </Pressable>
          )}
        </View>

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Private Notes <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="What did you think?"
            placeholderTextColor={Colors.text.muted}
            multiline
            numberOfLines={3}
            maxLength={MAX_CHARS + 100}
            textAlignVertical="top"
            accessibilityLabel="Private notes"
          />
          <Text
            style={[
              styles.charCount,
              isOverLimit
                ? styles.charCountError
                : charsRemaining < 200
                ? styles.charCountWarn
                : styles.charCountNormal,
            ]}
            accessibilityLabel="Character count"
          >
            {charsRemaining.toLocaleString()} characters remaining
          </Text>
        </View>

        {/* Privacy note */}
        <View style={styles.privacyRow}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2}>
            <Path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </Svg>
          <Text style={styles.privacyText}>Only visible to you</Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.saveButton, (isOverLimit || saving) && styles.saveDisabled, pressed && styles.buttonPressed]}
            onPress={handleSave}
            disabled={isOverLimit || saving}
            accessibilityRole="button"
            accessibilityLabel={saving ? 'Saving...' : 'Save'}
          >
            <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
            onPress={onCancel}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: Colors.border.subtle,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  ratingLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
  },
  showTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  ratingValue: {
    color: '#fcd34d',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  field: {
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    color: Colors.text.secondary,
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  optional: {
    color: Colors.text.muted,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  dateText: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
  },
  datePlaceholder: {
    color: Colors.text.muted,
  },
  clearDate: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    minHeight: 80,
  },
  charCount: {
    textAlign: 'right',
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  charCountNormal: { color: Colors.text.muted },
  charCountWarn: { color: '#fcd34d' },
  charCountError: { color: Colors.score.red },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  privacyText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  saveButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFD700',
    borderRadius: BorderRadius.sm,
  },
  saveDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: '#000',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  datePickerWrapper: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  datePickerDone: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
  },
  datePickerDoneText: {
    color: Colors.score.gold,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
