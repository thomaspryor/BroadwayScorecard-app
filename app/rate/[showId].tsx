/**
 * Rating Modal — dedicated screen for rating + reviewing a show.
 *
 * Presented as an iOS card-style modal (slides up from bottom).
 * Entry points: show page star tap, "Edit" button, "To Be Rated", watchlist "Rate".
 *
 * Route params (IDs only — review data fetched inside modal):
 *   showId (required) — show to rate
 *   showTitle (required) — display in header
 *   reviewId? — edit existing review (fetch data on mount)
 *   initialRating? — pre-fill stars (from show page star tap)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { useUserReviews } from '@/hooks/useUserReviews';
import { useShows } from '@/lib/data-context';
import { useToastSafe } from '@/lib/toast-context';
import { supabaseRestInsert, supabaseRestUpdate } from '@/lib/supabase-rest';
import { recordRatingGiven } from '@/lib/store-review';
import { getImageUrl } from '@/lib/images';
import * as haptics from '@/lib/haptics';
import StarRating from '@/components/user/StarRating';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const MAX_CHARS = 2000;

export default function RateModal() {
  const params = useLocalSearchParams<{ showId: string; showTitle: string; reviewId?: string; initialRating?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getReviewsForShow, invalidateCache } = useUserReviews(user?.id || null);
  const { shows } = useShows();
  const { showToast } = useToastSafe();

  // Guard: showId is required
  const showId = params.showId;
  const showTitle = params.showTitle || 'Rate Show';
  const reviewId = params.reviewId;
  const initialRating = params.initialRating ? parseFloat(params.initialRating) : null;

  // Find show data for poster + closingDate
  const show = shows.find(s => s.id === showId);
  const posterUrl = show ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail) : null;
  const closingDate = show?.closingDate;

  // Form state
  const [currentRating, setCurrentRating] = useState<number | null>(initialRating);
  const [reviewText, setReviewText] = useState('');
  const [dateSeen, setDateSeen] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingReview, setLoadingReview] = useState(!!reviewId);
  const isDirty = useRef(false);
  const populatingRef = useRef(!!reviewId); // true while loading edit data

  // Track dirty state — skip changes from initial data population
  useEffect(() => {
    if (!populatingRef.current) {
      isDirty.current = true;
    }
  }, [currentRating, reviewText, dateSeen]);

  // Fetch existing review data when editing
  useEffect(() => {
    if (!reviewId || !user) {
      setLoadingReview(false);
      populatingRef.current = false;
      return;
    }
    populatingRef.current = true;
    (async () => {
      try {
        const showReviews = await getReviewsForShow(showId);
        const existing = showReviews.find(r => r.id === reviewId);
        if (existing) {
          setCurrentRating(existing.rating);
          setReviewText(existing.review_text || '');
          setDateSeen(existing.date_seen || '');
        }
      } catch {
        // If fetch fails, user can still enter new data
      } finally {
        setLoadingReview(false);
        // React batches the state updates above, so the dirty-tracking effect
        // fires on the NEXT render. We clear populatingRef in a microtask to
        // ensure it's still true when the batched render fires the effect.
        queueMicrotask(() => { populatingRef.current = false; });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId, user, showId]);

  // Computed values
  const charsRemaining = MAX_CHARS - reviewText.length;
  const isOverLimit = charsRemaining < 0;
  const canSave = currentRating !== null && !isOverLimit && !saving;

  const today = new Date();
  const maxDate = closingDate ? new Date(closingDate + 'T00:00:00') : today;
  const dateValue = dateSeen ? new Date(dateSeen + 'T00:00:00') : today;
  const formattedDate = dateSeen
    ? new Date(dateSeen + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  const handleDateChange = useCallback((_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (selectedDate) {
      setDateSeen(selectedDate.toISOString().split('T')[0]);
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (isDirty.current) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes that will be lost.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  }, [router]);

  const handleSave = useCallback(async () => {
    if (!canSave || currentRating === null) return;
    if (!user) {
      setSaveError('You must be signed in to save. Please close and try again.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    try {
      if (reviewId) {
        // Update existing review
        const filters = `id=eq.${reviewId}&user_id=eq.${user.id}`;
        const { error } = await supabaseRestUpdate('reviews', filters, {
          rating: currentRating,
          review_text: reviewText.trim() || null,
          date_seen: dateSeen || null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
      } else {
        // Insert new review
        const { error } = await supabaseRestInsert('reviews', {
          user_id: user.id,
          show_id: showId,
          rating: currentRating,
          review_text: reviewText.trim() || null,
          date_seen: dateSeen || null,
        });
        if (error) throw new Error(error.message);
      }

      // Success: invalidate cache FIRST, then navigate back
      await invalidateCache();
      haptics.success();
      isDirty.current = false; // prevent discard alert
      router.back();
      showToast(reviewId ? 'Rating updated' : 'Rating saved', 'success', '/(tabs)/my-shows');
      recordRatingGiven();
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Unknown error';
      haptics.error();
      setSaveError(`Save failed: ${detail}`);
    } finally {
      setSaving(false);
    }
  }, [canSave, currentRating, user, reviewId, reviewText, dateSeen, showId, invalidateCache, router, showToast]);

  // If showId is missing, bail
  if (!showId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Something went wrong. Please try again.</Text>
        <Pressable onPress={() => router.back()} style={styles.errorDismiss}>
          <Text style={styles.errorDismissText}>Dismiss</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ presentation: 'modal', headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, Spacing.md) }]}>
          <Pressable onPress={handleCancel} hitSlop={12} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{showTitle}</Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={12}
            style={styles.headerButton}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.score.gold} />
            ) : (
              <Text style={[styles.saveText, !canSave && styles.saveDisabled]}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Close X button (iOS 15 safety) */}
          <Pressable onPress={handleCancel} style={styles.closeButton} hitSlop={12} accessibilityLabel="Close">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.text.muted} strokeWidth={2.5}>
              <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </Svg>
          </Pressable>

          {/* Poster thumbnail */}
          {posterUrl && (
            <View style={styles.posterContainer}>
              <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
            </View>
          )}

          {/* Loading state for edit mode */}
          {loadingReview ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.text.muted} />
              <Text style={styles.loadingText}>Loading review...</Text>
            </View>
          ) : (
            <>
              {/* Star rating — hero element */}
              <View style={styles.starsContainer}>
                <StarRating
                  rating={currentRating}
                  onRatingChange={setCurrentRating}
                  size="lg"
                />
                {currentRating === null && (
                  <Text style={styles.tapHint}>Tap a star to rate</Text>
                )}
              </View>

              {/* Save error */}
              {saveError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{saveError}</Text>
                </View>
              )}

              {/* Date Seen */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Date Seen <Text style={styles.optional}>(optional)</Text>
                </Text>
                <Pressable
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose date seen"
                >
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

              {/* Private Notes */}
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
                  numberOfLines={4}
                  maxLength={MAX_CHARS + 100}
                  textAlignVertical="top"
                  accessibilityLabel="Private notes"
                />
                <Text
                  style={[
                    styles.charCount,
                    isOverLimit ? styles.charCountError
                      : charsRemaining < 200 ? styles.charCountWarn
                      : styles.charCountNormal,
                  ]}
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
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.default,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    backgroundColor: Colors.surface.default,
  },
  headerButton: {
    minWidth: 60,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  cancelText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
  },
  saveText: {
    color: Colors.score.gold,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'right',
  },
  saveDisabled: {
    opacity: 0.35,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  posterContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.raised,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
  },
  starsContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  tapHint: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorBannerText: {
    color: '#ef4444',
    fontSize: FontSize.xs,
  },
  field: {
    marginBottom: Spacing.lg,
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
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text.primary,
    fontSize: FontSize.sm,
    minHeight: 100,
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
    marginTop: Spacing.sm,
  },
  privacyText: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  errorText: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
  errorDismiss: {
    alignSelf: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface.raised,
    borderRadius: BorderRadius.sm,
  },
  errorDismissText: {
    color: Colors.text.primary,
    fontSize: FontSize.sm,
  },
});
