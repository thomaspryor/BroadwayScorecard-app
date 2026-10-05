/**
 * One-time welcome for a brand-new account (BRO-4727, app port of the web's
 * src/components/onboarding/WelcomeSheet.tsx from BRO-4619). Opened by
 * WelcomeGate after claim_onboarding() succeeds. Three skippable steps:
 *   shows  — tap the shows you've seen (stars optional)
 *   import — offer to bring a history over (IMPORT_SOURCES), via app/import.tsx
 *   done   — where to go next
 * Decisions live in lib/welcome-onboarding.ts.
 *
 * Analytics use welcome_* names (the web sends onboarding_*), because the
 * app's first-launch carousel already owns onboarding_completed/skipped.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useShows } from '@/lib/data-context';
import { getSupabaseClient } from '@/lib/supabase';
import { getImageUrl } from '@/lib/images';
import { toLocalYMD } from '@/lib/date-utils';
import { trackEvent } from '@/lib/analytics';
import { IMPORT_SOURCES, importSourceNames } from '@/lib/import-sources';
import {
  nextWelcomeStep,
  pickWelcomeShows,
  welcomeDoneMessage,
  welcomeFinishDestination,
  welcomeSaveStep,
  welcomeWriteFor,
  type WelcomeShow,
  type WelcomeStep,
} from '@/lib/welcome-onboarding';
import { usePosterGrid } from '@/hooks/usePosterGrid';
import { useWatchlist } from '@/hooks/useWatchlist';
import { POSTER_GRID_GAP, POSTER_GRID_ROW_GAP } from '@/lib/poster-grid';
import StarRating from '@/components/user/StarRating';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

/**
 * Where a show already being in My Shows makes its poster unpickable. At save
 * time only reviews and seen_unrated skip a pick (welcomeSaveStep).
 */
const EXISTING_TABLES = ['reviews', 'watchlist', 'seen_unrated'] as const;
const SAVE_ERROR = 'We could not save those just now. Check your connection and try again.';

interface WelcomeSheetProps {
  /** null in preview mode (web build ?welcome=preview): nothing is written or tracked. */
  userId: string | null;
  onClose: () => void;
}

export default function WelcomeSheet({ userId, onClose }: WelcomeSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shows: allShows } = useShows();
  const grid = usePosterGrid(3);
  const preview = userId === null;
  // Only its remove is used: the shared list, its cache and the offline queue stay in step.
  const { removeFromWatchlist } = useWatchlist(userId);
  const [step, setStep] = useState<WelcomeStep>('shows');
  const [existing, setExisting] = useState<Set<string>>(new Set());
  // showId -> stars (null = "seen it", no stars). Map keeps tap order.
  const [picks, setPicks] = useState<Map<string, number | null>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(0);
  const [showsAdded, setShowsAdded] = useState(0);
  // Of showsAdded, how many went in without stars (they wait under To Be Rated).
  const [unratedAdded, setUnratedAdded] = useState(0);

  const shows: WelcomeShow[] = useMemo(() => pickWelcomeShows(
    allShows.map(s => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      status: s.status,
      category: s.category,
      openingDate: s.openingDate,
      closingDate: s.closingDate,
      image: s.images?.poster || s.images?.thumbnail || null,
      reviewCount: s.criticScore?.reviewCount ?? 0,
    })),
    toLocalYMD(new Date()),
  ), [allShows]);

  const track = useCallback((event: string, props: Record<string, string | number | boolean | null> = {}) => {
    if (!preview) trackEvent(event, props);
  }, [preview]);

  useEffect(() => {
    track('welcome_shown');
  }, [track]);

  // Someone who signed up by rating or saving a show already has it.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!userId || !client) return;
    Promise.all(EXISTING_TABLES.map(t => client.from(t).select('show_id').eq('user_id', userId)))
      .then(results => setExisting(new Set(results.flatMap(r => (r.data || []) as { show_id: string }[]).map(r => r.show_id))))
      .catch(() => {});
  }, [userId]);

  const showById = useMemo(() => new Map(shows.map(s => [s.id, s])), [shows]);
  const activeShow = activeId ? showById.get(activeId) : undefined;

  const togglePick = (id: string) => {
    const wasPicked = picks.has(id);
    setPicks(prev => {
      const next = new Map(prev);
      if (wasPicked) next.delete(id);
      else next.set(id, null);
      return next;
    });
    if (!wasPicked) setActiveId(id);
    else if (activeId === id) setActiveId(null);
  };

  const go = (to: WelcomeStep, addedNow = showsAdded) => {
    setStep(to);
    if (to === 'done') {
      track('welcome_completed', {
        shows_added: addedNow,
        destination: welcomeFinishDestination({ showsAdded: addedNow }),
      });
    }
  };

  /** Saves the picks. thenClose: closed with picks still unsaved, so save on the way out. */
  const savePicks = async ({ thenClose = false } = {}) => {
    const entries = Array.from(picks.entries());
    const rated = entries.filter(([, r]) => r !== null).length;
    const client = getSupabaseClient();
    if (preview || !client) {
      setShowsAdded(entries.length);
      setUnratedAdded(entries.filter(([showId, rating]) => welcomeWriteFor({ showId, rating }).table === 'seen_unrated').length);
      track('welcome_step_completed', { step: 'shows', shows_added: entries.length, rated });
      if (thenClose) onClose();
      else go(nextWelcomeStep('shows'), entries.length);
      return;
    }
    setSaving(true);
    setSaveError(null);
    // Look again right before writing: the first lookup may have failed, or a
    // show may have been added since. reviews allows several rows per show, so
    // a second write would duplicate.
    const ids = entries.map(([id]) => id);
    let seen: Set<string>;
    let watchlisted: Set<string>;
    try {
      const results = await Promise.all(EXISTING_TABLES.map(t =>
        client.from(t).select('show_id').eq('user_id', userId as string).in('show_id', ids)));
      if (results.some(r => r.error)) throw new Error('lookup failed');
      const idsIn = (t: (typeof EXISTING_TABLES)[number]) =>
        ((results[EXISTING_TABLES.indexOf(t)].data || []) as { show_id: string }[]).map(r => r.show_id);
      watchlisted = new Set(idsIn('watchlist'));
      seen = new Set([...idsIn('reviews'), ...idsIn('seen_unrated')]);
    } catch {
      setSaving(false);
      if (thenClose) { onClose(); return; }
      setSaveError(SAVE_ERROR);
      return;
    }
    // Only new writes count as added; a show already seen is left as it was.
    let added = 0;
    let addedUnrated = 0;
    let failed = 0;
    for (const [showId, rating] of entries) {
      const { write, clearWatchlist } = welcomeSaveStep({ showId, rating }, { seen: seen.has(showId), watchlisted: watchlisted.has(showId) });
      if (!write) continue;
      let saved = false;
      try {
        const { error } = await client.from(write.table).insert({ user_id: userId, ...write.row });
        if (!error) {
          added++;
          saved = true;
          if (write.table === 'seen_unrated') addedUnrated++;
        } else if (error.code === '23505') {
          saved = true; // already there: kept, not new
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      if (saved && clearWatchlist) {
        await removeFromWatchlist(showId).catch(() => { /* pick saved; watchlist cleanup is best-effort */ });
      }
    }
    setSaving(false);
    if (added === 0 && failed > 0 && !thenClose) {
      setSaveError(SAVE_ERROR);
      return;
    }
    setShowsAdded(added);
    setUnratedAdded(addedUnrated);
    setSaveFailed(failed);
    track('welcome_step_completed', { step: 'shows', shows_added: added, rated, failed });
    if (thenClose) onClose();
    else go(nextWelcomeStep('shows'), added);
  };

  const skip = (via: 'skip' | 'close') => {
    if (saving) return;
    if (via === 'close' && step === 'done') { onClose(); return; }
    track('welcome_skipped', { step, via });
    if (via === 'close') {
      if (step === 'shows' && picks.size > 0) {
        void savePicks({ thenClose: true });
        return;
      }
      onClose();
      return;
    }
    go(nextWelcomeStep(step));
  };

  const openImport = () => {
    track('welcome_import_opened');
    onClose();
    router.push('/import' as any);
  };

  const finish = (dest: 'my-shows' | 'stay') => {
    onClose();
    if (dest === 'my-shows') router.push('/(tabs)/watched' as any);
  };

  const destination = welcomeFinishDestination({ showsAdded });
  const pickCount = picks.size;
  const cardStyle = { width: grid.cardWidth };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => skip('close')}>
      <View style={styles.container} testID="welcome-sheet">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>
              {step === 'done' ? 'ALL SET' : `WELCOME · STEP ${step === 'shows' ? 1 : 2} OF 2`}
            </Text>
            <Text style={styles.title}>
              {step === 'shows' && 'Which shows have you seen?'}
              {step === 'import' && 'Bring over your history'}
              {step === 'done' && (showsAdded > 0 ? 'Your diary is started' : "You're all set")}
            </Text>
            {step === 'shows' && <Text style={styles.subtitle}>Tap any you{"'"}ve seen. Stars are optional.</Text>}
          </View>
          <Pressable
            onPress={() => skip('close')}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.text.secondary} strokeWidth={2.5}>
              <Path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </Svg>
          </Pressable>
        </View>

        {step === 'shows' && (
          <>
            <ScrollView style={styles.body} contentContainerStyle={styles.gridContent}>
              {shows.length === 0 ? (
                <Text style={styles.bodyText}>Search for any show from the Browse tab to add it.</Text>
              ) : (
                <View style={styles.grid} testID="welcome-grid">
                  {shows.map(show => {
                    const already = existing.has(show.id);
                    const picked = picks.has(show.id);
                    const stars = picks.get(show.id);
                    const starsLabel = typeof stars === 'number' ? `, ${stars} ${stars === 1 ? 'star' : 'stars'}` : '';
                    const uri = getImageUrl(show.image);
                    return (
                      <View key={show.id} style={cardStyle}>
                        <Pressable
                          onPress={() => !already && togglePick(show.id)}
                          disabled={already}
                          accessibilityRole="button"
                          accessibilityState={{ selected: picked || already, disabled: already }}
                          accessibilityLabel={already ? `${show.title}, already in My Shows` : `${show.title}${picked ? `, seen${starsLabel}` : ''}`}
                          style={[styles.poster, picked && styles.posterPicked]}
                        >
                          {uri ? (
                            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                          ) : (
                            <Text style={styles.posterFallback}>{show.title}</Text>
                          )}
                          {(picked || already) && <View style={styles.posterDim} />}
                          {(picked || already) && (
                            <View style={styles.check}>
                              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.surface.default} strokeWidth={3.5}>
                                <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </Svg>
                            </View>
                          )}
                          {already && <Text style={styles.posterBand}>In My Shows</Text>}
                          {picked && typeof stars === 'number' && <Text style={styles.posterBand}>★ {stars}</Text>}
                        </Pressable>
                        <Text style={styles.posterTitle} numberOfLines={1}>{show.title}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
              {activeShow && picks.has(activeShow.id) && (
                <View style={styles.rateRow} testID="welcome-rate-row">
                  <Text style={styles.rateLabel} numberOfLines={1}>
                    Rate <Text style={styles.rateTitle}>{activeShow.title}</Text>?
                  </Text>
                  <StarRating
                    rating={picks.get(activeShow.id) ?? null}
                    onRatingChange={r => setPicks(prev => new Map(prev).set(activeShow.id, r))}
                    size="sm"
                    hideLabel
                  />
                </View>
              )}
              {saveError && <Text style={styles.errorText}>{saveError}</Text>}
              <View style={styles.footerRow}>
                {pickCount === 0 ? (
                  <Pressable onPress={() => skip('skip')} style={styles.secondaryButton} accessibilityRole="button">
                    <Text style={styles.secondaryText}>Skip</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.footerNote}>{pickCount} picked</Text>
                )}
                <Pressable
                  onPress={pickCount === 0 ? () => skip('skip') : () => savePicks()}
                  disabled={saving}
                  style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.pressed]}
                  accessibilityRole="button"
                >
                  {saving ? (
                    <ActivityIndicator color={Colors.surface.default} />
                  ) : (
                    <Text style={styles.primaryText}>{pickCount === 0 ? 'Next' : `Add ${pickCount} to my diary`}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </>
        )}

        {step === 'import' && (
          <>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {showsAdded > 0 && (
                <Text style={styles.successText}>Added {showsAdded} {showsAdded === 1 ? 'show' : 'shows'} to your diary.</Text>
              )}
              {saveFailed > 0 && (
                <Text style={styles.warnText}>
                  {saveFailed === 1 ? '1 show' : `${saveFailed} shows`} could not be saved. You can add {saveFailed === 1 ? 'it' : 'them'} from the show page.
                </Text>
              )}
              <Text style={styles.bodyText}>
                Kept a theater diary somewhere else? Bring your ratings over from {importSourceNames()} in about a minute.
              </Text>
              {IMPORT_SOURCES.map(src => (
                <View key={src.id} style={styles.sourceCard}>
                  <Text style={styles.sourceName}>{src.icon} {src.name}</Text>
                  <Text style={styles.sourceHint}>{src.hint}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
              <View style={styles.footerRow}>
                <Pressable onPress={() => skip('skip')} style={styles.secondaryButton} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Not now</Text>
                </Pressable>
                <Pressable onPress={openImport} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} accessibilityRole="button">
                  <Text style={styles.primaryText}>Import my shows</Text>
                </Pressable>
              </View>
              <Text style={styles.footerHint}>You can always import later from the Watched tab.</Text>
            </View>
          </>
        )}

        {step === 'done' && (
          <>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <Text style={styles.bodyText}>
                {welcomeDoneMessage({ showsAdded, unratedAdded })}
              </Text>
              <Text style={styles.listText}>Your diary lives in the Watched tab, and your watchlist in To Watch.</Text>
              <Text style={styles.listText}>Import from {importSourceNames()} there whenever you like.</Text>
            </ScrollView>
            <View style={[styles.footer, styles.footerRow, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
              {destination === 'my-shows' ? (
                <>
                  <Pressable onPress={() => finish('stay')} style={styles.secondaryButton} accessibilityRole="button">
                    <Text style={styles.secondaryText}>Keep browsing</Text>
                  </Pressable>
                  <Pressable onPress={() => finish('my-shows')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} accessibilityRole="button">
                    <Text style={styles.primaryText}>See my diary</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={() => finish('my-shows')} style={styles.secondaryButton} accessibilityRole="button">
                    <Text style={styles.secondaryText}>Open my diary</Text>
                  </Pressable>
                  <Pressable onPress={() => finish('stay')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} accessibilityRole="button">
                    <Text style={styles.primaryText}>Start exploring</Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.md,
  },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { color: Colors.brand, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  title: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700' },
  subtitle: { color: Colors.text.secondary, fontSize: FontSize.sm, marginTop: 4 },
  closeButton: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface.overlay,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.md },
  gridContent: { paddingBottom: Spacing.lg },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    columnGap: POSTER_GRID_GAP, rowGap: POSTER_GRID_ROW_GAP,
    paddingHorizontal: Spacing.lg,
  },
  poster: {
    width: '100%', aspectRatio: 2 / 3, borderRadius: BorderRadius.md, overflow: 'hidden',
    backgroundColor: Colors.surface.raised, borderWidth: 1, borderColor: Colors.border.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  posterPicked: { borderWidth: 2, borderColor: Colors.brand },
  posterFallback: { color: Colors.text.secondary, fontSize: 12, textAlign: 'center', padding: Spacing.sm },
  posterDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  check: {
    position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  posterBand: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 12, textAlign: 'center',
  },
  posterTitle: { color: Colors.text.secondary, fontSize: 12, marginTop: 4 },
  footer: {
    borderTopWidth: 1, borderTopColor: Colors.border.subtle, backgroundColor: Colors.surface.raised,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  footerNote: { color: Colors.text.secondary, fontSize: FontSize.sm },
  footerHint: { color: Colors.text.muted, fontSize: 12, marginTop: Spacing.sm },
  rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, marginBottom: Spacing.md },
  rateLabel: { flex: 1, color: Colors.text.secondary, fontSize: FontSize.sm },
  rateTitle: { color: Colors.text.primary, fontWeight: '600' },
  errorText: { color: Colors.score.red, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  primaryButton: {
    backgroundColor: Colors.brand, borderRadius: 10, minHeight: 44,
    paddingHorizontal: Spacing.lg, alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: '#0d0d1a', fontSize: FontSize.md, fontWeight: '700' },
  secondaryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  secondaryText: { color: Colors.text.secondary, fontSize: FontSize.md, fontWeight: '500' },
  pressed: { opacity: 0.7 },
  bodyText: { color: Colors.text.secondary, fontSize: FontSize.md, lineHeight: 22 },
  listText: { color: Colors.text.muted, fontSize: FontSize.sm, lineHeight: 20 },
  successText: { color: Colors.status.open, fontSize: FontSize.sm },
  warnText: { color: Colors.score.amber, fontSize: FontSize.sm },
  sourceCard: {
    backgroundColor: Colors.surface.raised, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border.subtle, padding: Spacing.md,
  },
  sourceName: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700', marginBottom: 2 },
  sourceHint: { color: Colors.text.muted, fontSize: FontSize.sm },
});
