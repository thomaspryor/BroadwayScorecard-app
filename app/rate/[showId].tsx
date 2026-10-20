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
import { useLocalSearchParams, useRouter, useNavigation, Stack } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
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
import { getDiaryShowMeta } from '@/lib/show-format';
import { toLocalYMD } from '@/lib/date-utils';
import { sanitizeRating } from '@/lib/rating';
import { isOnline } from '@/lib/offline-queue';
import { isRateFormDirty, friendlySaveError, RATING_GONE_MESSAGE, type RateFormValues } from '@/lib/rate-form';
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/deferred-auth';
import * as haptics from '@/lib/haptics';
import StarRating from '@/components/user/StarRating';
import { PhotoPickerRow } from '@/components/user/PhotoPickerRow';
import * as Crypto from 'expo-crypto';
import { enqueuePhotoUpload, flushPhotoQueue } from '@/lib/photo-upload-queue';
import type { ProcessedPhoto } from '@/lib/photo-image-pipeline';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { getProductionMarketLabel } from '@/lib/production-labels';

const MAX_CHARS = 2000;

/** Mode eyebrow above the header title — web parity (RatingEditor HEADER_COPY). */
const MODE_EYEBROW = {
  new: 'Your rating for',
  edit: 'Editing your rating for',
} as const;

export default function RateModal() {
  const params = useLocalSearchParams<{ showId: string; showTitle: string; reviewId?: string; initialRating?: string; suggestedDate?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, showSignIn } = useAuth();
  const { getReviewsForShow, deleteReview, saveReview, invalidateCache } = useUserReviews(user?.id || null);
  const { watchlist, getWatchlist, removeFromWatchlist } = useWatchlist(user?.id || null);
  const { shows } = useShows();
  const { showToast } = useToastSafe();

  // Guard: showId is required
  const showId = params.showId;
  const showTitle = params.showTitle || 'Rate Show';
  const reviewId = params.reviewId;
  const initialRating = params.initialRating ? parseFloat(params.initialRating) : null;
  const suggestedDate = params.suggestedDate;

  // Find show data for poster + production context. Diary-only ids (wide-
  // catalog adds, imports) aren't in the scored catalog — fall back to the
  // diary-title cache recorded when they were picked, so the header still
  // says which production is being rated.
  const show = shows.find(s => s.id === showId);
  const diaryMeta = !show ? getDiaryShowMeta(showId) : null;
  const posterUrl = show ? getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail) : null;

  // Production context — which run of this title is being rated
  const category = show?.category ?? diaryMeta?.category;
  const marketLabel = getProductionMarketLabel(category);
  const openingDate = show?.openingDate ?? diaryMeta?.openingDate;
  const openingYear = openingDate ? openingDate.slice(0, 4) : null;
  const closingYear = show?.closingDate ? show.closingDate.slice(0, 4) : null;
  const runLabel = openingYear
    ? closingYear
      ? (openingYear === closingYear ? openingYear : `${openingYear}–${closingYear}`)
      : show
        ? `${openingYear}–present`
        : openingYear
    : null;
  const contextLine = [show?.venue ?? diaryMeta?.venue, diaryMeta?.city, marketLabel, runLabel]
    .filter(Boolean)
    .join(' · ');

  const todayYMD = toLocalYMD(new Date());

  // Form state. New ratings prefill the watchlist planned date when given
  // (clamped to today), else today — matching web RatingEditor. Edits load
  // the stored date async and start blank.
  const [currentRating, setCurrentRating] = useState<number | null>(initialRating);
  const [reviewText, setReviewText] = useState('');
  const initialDate = reviewId
    ? ''
    : suggestedDate ? (suggestedDate > todayYMD ? todayYMD : suggestedDate) : todayYMD;
  const [dateSeen, setDateSeen] = useState(initialDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Photos picked before the first save (new entries only) — uploaded right
  // after the review row is created. Ref keeps performSave's dependency list
  // stable while always seeing the latest picks.
  const [stagedPhotos, setStagedPhotos] = useState<ProcessedPhoto[]>([]);
  const stagedPhotosRef = useRef<ProcessedPhoto[]>([]);
  useEffect(() => { stagedPhotosRef.current = stagedPhotos; }, [stagedPhotos]);
  const [loadingReview, setLoadingReview] = useState(!!reviewId);
  // What the form held when it opened (or when the stored rating finished
  // loading). Dirty = differs from this. State, not a ref, so the swipe-down
  // guard below re-renders when it flips. Null while an edit is loading.
  const [baseline, setBaseline] = useState<RateFormValues | null>(() => (reviewId ? null : {
    rating: initialRating,
    text: '',
    date: initialDate,
    stagedCount: 0,
  }));
  const isDirty = isRateFormDirty(baseline, {
    rating: currentRating,
    text: reviewText,
    date: dateSeen,
    stagedCount: stagedPhotos.length,
  });
  // Set right before a deliberate close (Save, Delete, resumed save) so the
  // guard lets it through without asking "Discard changes?".
  const bypassGuardRef = useRef(false);
  // A second Save tap while the first is in flight would insert twice.
  const savingRef = useRef(false);

  // Fetch existing review data when editing
  useEffect(() => {
    (async () => {
      if (!reviewId) return;
      if (!user) {
        setBaseline(prev => prev ?? { rating: initialRating, text: '', date: '', stagedCount: 0 });
        setLoadingReview(false);
        return;
      }
      // Not found or fetch failed: the form keeps its opening values, so
      // those are the baseline.
      let loaded: RateFormValues = { rating: initialRating, text: '', date: '', stagedCount: 0 };
      try {
        const showReviews = await getReviewsForShow(showId);
        const existing = showReviews.find(r => r.id === reviewId);
        if (existing) {
          loaded = {
            rating: existing.rating,
            text: existing.review_text || '',
            date: existing.date_seen || '',
            stagedCount: 0,
          };
          setCurrentRating(loaded.rating);
          setReviewText(loaded.text);
          setDateSeen(loaded.date);
        }
      } catch {
        // If fetch fails, user can still enter new data
      } finally {
        setBaseline(loaded);
        setLoadingReview(false);
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

  // One guard for every way out: Cancel, the iOS swipe-down, and the
  // Android back button. Before this, only Cancel asked; a swipe dropped the
  // stars, notes and staged photos silently.
  usePreventRemove(isDirty, ({ data }) => {
    if (bypassGuardRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      'Discard changes?',
      'You have unsaved changes that will be lost.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });

  const closeWithoutPrompt = useCallback(() => {
    bypassGuardRef.current = true;
    router.back();
  }, [router]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // Persists a rating for the CURRENTLY signed-in user. Shared by the normal
  // Save path and the post-sign-in resume path below.
  const performSave = useCallback(async (ratingVal: number, textVal: string, dateVal: string) => {
    if (!user) return;
    const rating = sanitizeRating(ratingVal);
    if (reviewId) {
      const filters = `id=eq.${reviewId}&user_id=eq.${user.id}`;
      const { data: updated, error } = await supabaseRestUpdate<{ id: string }>('reviews', filters, {
        rating,
        review_text: textVal.trim() || null,
        date_seen: dateVal || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      // PATCH matching zero rows is a 200 with an empty body. Without this
      // the sheet said "Rating updated" for a rating deleted on another
      // device (web parity: ShowHeroRedesign throws the same way).
      if (!updated) throw new Error(RATING_GONE_MESSAGE);
    } else {
      const { data: inserted, error } = await supabaseRestInsert<{ id: string }>('reviews', {
        user_id: user.id,
        show_id: showId,
        rating,
        review_text: textVal.trim() || null,
        date_seen: dateVal || null,
      });
      if (error) throw new Error(error.message);
      // Photos picked BEFORE the first save (beta feedback 2026-08-02) —
      // now that the review row exists, queue them for upload. Best-effort:
      // the upload queue retries on next foreground if this flush fails.
      if (inserted?.id && stagedPhotosRef.current.length > 0) {
        for (const photo of stagedPhotosRef.current) {
          await enqueuePhotoUpload({
            id: Crypto.randomUUID(),
            reviewId: inserted.id,
            userId: user.id,
            localUri: photo.uri,
            width: photo.width,
            height: photo.height,
            takenAt: null,
          }).catch(() => {});
        }
        setStagedPhotos([]);
        flushPhotoQueue().catch(() => {});
      }
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
    recordRatingGiven();
  }, [user, reviewId, showId, invalidateCache, removeFromWatchlist, watchlist, showToast]);

  const handleSave = useCallback(async () => {
    if (!canSave || currentRating === null || savingRef.current) return;

    // Gate at Save, not at entry — the sheet is reachable pre-auth so a
    // signed-out user can fill out the full rating (stars + notes + date)
    // before ever being interrupted (web "invest then gate" parity). The
    // draft is preserved in PendingAction; the sign-in overlay renders on
    // top of this screen (AuthProvider mounts it globally), so this screen
    // stays alive underneath and resumes the save once auth resolves below.
    if (!user) {
      savingRef.current = true;
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
      savingRef.current = false;
      setSaving(false);
      showSignIn('rating');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await performSave(currentRating, reviewText, dateSeen);
      closeWithoutPrompt();
      showToast(reviewId ? 'Rating updated' : 'Rating saved', 'success', '/(tabs)/watched');
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Unknown error';
      haptics.error();
      setSaveError(friendlySaveError(detail, await isOnline()));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [canSave, currentRating, user, reviewId, reviewText, dateSeen, showId, performSave, closeWithoutPrompt, showToast, showSignIn]);

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
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await performSave(pending.rating ?? currentRating ?? 0, pending.reviewText ?? reviewText, pending.dateSeen ?? dateSeen);
        closeWithoutPrompt();
        showToast(reviewId ? 'Rating updated' : 'Rating saved', 'success', '/(tabs)/watched');
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Unknown error';
        setSaveError(friendlySaveError(detail, await isOnline()));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resumes once per sign-in, ref guards re-fire
  }, [user, showId]);

  const handleDelete = useCallback(() => {
    if (!reviewId) return;
    // Snapshot the current form values so a same-session Undo can recreate
    // the rating — deleting a rating you just made was previously permanent.
    const deletedSnapshot = { rating: currentRating, reviewText, dateSeen };
    Alert.alert(
      'Delete this rating?',
      'This removes it from your diary.',
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
              closeWithoutPrompt();
              showToast('Rating deleted.', 'info', {
                actionLabel: 'Undo',
                onAction: () => {
                  if (deletedSnapshot.rating === null) return;
                  saveReview({
                    showId,
                    rating: deletedSnapshot.rating,
                    reviewText: deletedSnapshot.reviewText,
                    dateSeen: deletedSnapshot.dateSeen,
                  }).catch(() => showToast('Undo failed. Please re-rate the show.', 'error'));
                },
              });
            } catch (e) {
              const detail = e instanceof Error ? e.message : 'Unknown error';
              showToast(`Delete failed: ${detail}`, 'error');
            }
          },
        },
      ],
    );
  }, [reviewId, currentRating, reviewText, dateSeen, showId, deleteReview, saveReview, invalidateCache, closeWithoutPrompt, showToast]);

  // If showId is missing, bail
  if (!showId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Something went wrong. Please try again.</Text>
        <Pressable onPress={() => router.back()} style={styles.errorDismiss} accessibilityRole="button">
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
          <Pressable onPress={handleCancel} hitSlop={12} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Cancel">
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
            accessibilityRole="button"
            accessibilityLabel={saving ? 'Saving' : 'Save rating'}
            accessibilityState={{ disabled: !canSave, busy: saving }}
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

              {/* Photos (task #571) — attaches to a saved review, so a brand
                  new (unsaved) entry shows a hint instead until reviewId
                  exists (Save always closes this sheet immediately, so
                  photos are added on a subsequent edit visit). */}
              <PhotoPickerRow
                reviewId={reviewId ?? null}
                userId={user?.id ?? null}
                dateSeen={dateSeen || null}
                stagedPhotos={stagedPhotos}
                onStagePhotos={(items) => setStagedPhotos(prev => [...prev, ...items])}
                onRemoveStaged={(index) => setStagedPhotos(prev => prev.filter((_, i) => i !== index))}
              />

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
