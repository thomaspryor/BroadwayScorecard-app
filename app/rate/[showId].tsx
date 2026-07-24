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
import { useWatchlist } from '@/hooks/useWatchlist';
import { useShows } from '@/lib/data-context';
import { useToastSafe } from '@/lib/toast-context';
import { supabaseRestInsert, supabaseRestUpdate } from '@/lib/supabase-rest';
import { recordRatingGiven } from '@/lib/store-review';
import { getImageUrl } from '@/lib/images';
import { toLocalYMD } from '@/lib/date-utils';
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/deferred-auth';
import * as haptics from '@/lib/haptics';
import StarRating from '@/components/user/StarRating';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const MAX_CHARS = 2000;

const MARKET_LABELS: Record<string, string> = {
  'broadway': 'Broadway',
  'off-broadway': 'Off-Broadway',
  'west-end': 'West End',
};

/** Mode eyebrow above the header title — web parity (RatingEditor HEADER_COPY). */
const MODE_EYEBROW = {
  new: 'Your rating for',
  edit: 'Editing your rating for',
} as const;

export default function RateModal() {
  const params = useLocalSearchParams<{ showId: string; showTitle: string; reviewId?: string; initialRating?: string; suggestedDate?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, showSignIn } = useAuth();
  const { getReviewsForShow, deleteReview, invalidateCache } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);
  const { shows } = useShows();
  const { showToast } = useToastSafe();

  // Guard: showId is required
  const showId = params.showId;
  const showTitle = params.showTitle || 'Rate Show';
  const reviewId = params.reviewId;
  const initialRating = params.initialRating ? parseFloat(params.initialRating) : null;
  const suggestedDate = params.suggestedDate;

  // Find show data for poster + production context
  const show = shows.find(s => s.id === showId);
  const posterUrl = show ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail) : null;

  // Production context — which run of this title is being rated
  const marketLabel = show?.category ? MARKET_LABELS[show.category] || null : null;
  const openingYear = show?.openingDate ? show.openingDate.slice(0, 4) : null;
  const closingYear = show?.closingDate ? show.closingDate.slice(0, 4) : null;
  const runLabel = openingYear
    ? closingYear
      ? (openingYear === closingYear ? openingYear : `${openingYear}–${closingYear}`)
      : `${openingYear}–present`
    : null;
  const contextLine = [show?.venue, marketLabel, runLabel].filter(Boolean).join(' · ');

  const todayYMD = toLocalYMD(new Date());

  // Form state. New ratings prefill the watchlist planned date when given
  // (clamped to today), else today — matching web RatingEditor. Edits load
  // the stored date async and start blank.
  const [currentRating, setCurrentRating] = useState<number | null>(initialRating);
  const [reviewText, setReviewText] = useState('');
  const [dateSeen, setDateSeen] = useState(() => {
    if (reviewId) return '';
    if (suggestedDate) return suggestedDate > todayYMD ? todayYMD : suggestedDate;
    return todayYMD;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingReview, setLoadingReview] = useState(!!reviewId);
  const isDirty = useRef(false);
  const populatingRef = useRef(!!reviewId); // true while loading edit data
  const mountedRef = useRef(false); // effect fires once on mount before any user input

  // Track dirty state — skip the mount run and changes from initial data population
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!populatingRef.current) {
      isDirty.current = true;
    }
  }, [currentRating, reviewText, dateSeen]);

  // Fetch existing review data when editing
  useEffect(() => {
    (async () => {
      if (!reviewId || !user) {
        populatingRef.current = false;
        setLoadingReview(false);
        return;
      }
      populatingRef.current = true;
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

  // Refresh watchlist so the "Removed from watchlist" future-plan check
  // (performSave, below) has current data even when this sheet was opened
  // without another screen having already populated the shared cache
  // (e.g. a cold deep link straight to the rate sheet).
  useEffect(() => {
    if (user) getWatchlist();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Computed values
  const charsRemaining = MAX_CHARS - reviewText.length;
  const isOverLimit = charsRemaining < 0;
  const canSave = currentRating !== null && !isOverLimit && !saving;

  const today = new Date();
  // Cap only at today. Do NOT cap at the show's closing date: return
  // engagements, Encores runs, and diary imports mapped to an earlier
  // production made the closing-date cap read as "completely locked"
  // (same rationale as web RatingEditor, La Cage report 2026-07-13 —
  // this was the "only lets me pick May 2011 or earlier" bug).
  const maxDate = today;
  const dateValue = dateSeen ? new Date(dateSeen + 'T00:00:00') : today;
  const formattedDate = dateSeen
    ? new Date(dateSeen + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  const handleDateChange = useCallback((_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (selectedDate) {
      setDateSeen(toLocalYMD(selectedDate));
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

  // Persists a rating for the CURRENTLY signed-in user. Shared by the normal
  // Save path and the post-sign-in resume path below.
  const performSave = useCallback(async (ratingVal: number, textVal: string, dateVal: string) => {
    if (!user) return;
    if (reviewId) {
      const filters = `id=eq.${reviewId}&user_id=eq.${user.id}`;
      const { error } = await supabaseRestUpdate('reviews', filters, {
        rating: ratingVal,
        review_text: textVal.trim() || null,
        date_seen: dateVal || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseRestInsert('reviews', {
        user_id: user.id,
        show_id: showId,
        rating: ratingVal,
        review_text: textVal.trim() || null,
        date_seen: dateVal || null,
      });
      if (error) throw new Error(error.message);
      // Watchlist = want to see; a first rating means you've seen it
      // (web parity, owner rule 2026-07-12). Best-effort — never block save.
      // A FUTURE-dated entry disappearing with no feedback reads as data loss
      // on mobile, so surface a toast for that case only (past-dated/undated
      // removals are the expected "marking it watched" flow, no toast needed).
      const watchlistEntry = watchlist.find(w => w.show_id === showId);
      const hadFuturePlan = !!watchlistEntry?.planned_date && watchlistEntry.planned_date >= toLocalYMD(new Date());
      await removeFromWatchlist(showId).catch(() => {});
      if (hadFuturePlan) showToast('Removed from watchlist', 'success');
    }
    await invalidateCache();
    haptics.success();
    isDirty.current = false; // prevent discard alert
    recordRatingGiven();
  }, [user, reviewId, showId, invalidateCache, removeFromWatchlist, watchlist, showToast]);

  const handleSave = useCallback(async () => {
    if (!canSave || currentRating === null) return;

    // Gate at Save, not at entry — the sheet is reachable pre-auth so a
    // signed-out user can fill out the full rating (stars + notes + date)
    // before ever being interrupted (web "invest then gate" parity). The
    // draft is preserved in PendingAction; the sign-in overlay renders on
    // top of this screen (AuthProvider mounts it globally), so this screen
    // stays alive underneath and resumes the save once auth resolves below.
    if (!user) {
      setSaving(true);
      await savePendingAction({
        type: 'rating',
        showId,
        rating: currentRating,
        reviewText: reviewText.trim() || undefined,
        dateSeen: dateSeen || undefined,
        returnRoute: `/rate/${showId}`,
        timestamp: Date.now(),
      });
      setSaving(false);
      showSignIn('rating');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await performSave(currentRating, reviewText, dateSeen);
      router.back();
      showToast(reviewId ? 'Rating updated' : 'Rating saved', 'success', '/(tabs)/watched');
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Unknown error';
      haptics.error();
      setSaveError(`Save failed: ${detail}`);
    } finally {
      setSaving(false);
    }
  }, [canSave, currentRating, user, reviewId, reviewText, dateSeen, showId, performSave, router, showToast, showSignIn]);

  // Resume a gated save once sign-in succeeds — this screen is still mounted
  // underneath the sign-in sheet, so it picks its own pending action back up.
  const hasExecutedPendingRef = useRef(false);
  useEffect(() => {
    if (!user || hasExecutedPendingRef.current) return;
    (async () => {
      const pending = await getPendingAction();
      if (!pending || pending.type !== 'rating' || pending.showId !== showId) return;
      hasExecutedPendingRef.current = true;
      await clearPendingAction();
      setSaving(true);
      try {
        await performSave(pending.rating ?? currentRating ?? 0, pending.reviewText ?? reviewText, pending.dateSeen ?? dateSeen);
        router.back();
        showToast(reviewId ? 'Rating updated' : 'Rating saved', 'success', '/(tabs)/watched');
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Unknown error';
        setSaveError(`Save failed: ${detail}`);
      } finally {
        setSaving(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resumes once per sign-in, ref guards re-fire
  }, [user, showId]);

  const handleDelete = useCallback(() => {
    if (!reviewId) return;
    Alert.alert(
      'Delete this rating?',
      'This removes it from your diary. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReview(reviewId);
              await invalidateCache();
              haptics.action();
              isDirty.current = false;
              router.back();
              showToast('Rating deleted.', 'info');
            } catch (e) {
              const detail = e instanceof Error ? e.message : 'Unknown error';
              showToast(`Delete failed: ${detail}`, 'error');
            }
          },
        },
      ],
    );
  }, [reviewId, deleteReview, invalidateCache, router, showToast]);

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
          <View style={styles.headerTitleCol}>
            <Text style={styles.headerEyebrow} numberOfLines={1}>
              {reviewId ? MODE_EYEBROW.edit : MODE_EYEBROW.new}
            </Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{showTitle}</Text>
          </View>
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
          {/* Poster thumbnail + production context (which run is being rated) */}
          {posterUrl && (
            <View style={styles.posterContainer}>
              <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
            </View>
          )}
          {contextLine.length > 0 && (
            <Text style={styles.contextLine} numberOfLines={2}>{contextLine}</Text>
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
                  hideLabel
                />
                {currentRating === null && (
                  <Text style={styles.tapHint}>Tap a star to rate</Text>
                )}
                {reviewId && (
                  <Pressable onPress={handleDelete} hitSlop={10} style={styles.deleteButton} accessibilityRole="button" accessibilityLabel="Delete this rating">
                    <Text style={styles.deleteButtonText}>Delete rating</Text>
                  </Pressable>
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
  headerTitleCol: {
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
  headerEyebrow: {
    color: Colors.text.muted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  headerTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
    textAlign: 'center',
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
  posterContainer: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  contextLine: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
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
  deleteButton: {
    marginTop: Spacing.md,
    minHeight: 32,
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: Colors.score.red,
    fontSize: FontSize.xs,
    fontWeight: '500',
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
