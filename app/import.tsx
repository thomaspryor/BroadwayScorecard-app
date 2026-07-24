/**
 * Import shows from Mezzanine or Show Score — web parity port of
 * src/app/my-shows/ImportShows.tsx (see Broadwayscore commits 992f58bc046,
 * 187f8601e30). Date-aware matchShow picks the production whose run CONTAINS
 * the user's date-seen instead of grabbing the first same-title match — the
 * root cause of wrong-production imports (History Boys 2006 etc, 2026-07-14).
 *
 * Scope vs web: matches against useShows()'s scored catalog only (no
 * diary-only 32k-show catalog merge, no per-row live "Find it" lookup — v1
 * cut per the iOS parity card). Unmatched rows are still listed, never
 * silently dropped, so the self-heal loop (unmatched_imports) can grow the
 * catalog toward matching them later.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Fuse from 'fuse.js';
import { useAuth } from '@/lib/auth-context';
import { useShows } from '@/lib/data-context';
import { supabaseRestInsert } from '@/lib/supabase-rest';
import {
  acquireFromMezzanine,
  acquireFromShowScore,
  type ImportAcquireResult,
  type RawImportEntry,
} from '@/lib/show-import';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';

type ImportSourceId = 'mezzanine' | 'show-score';
type ImportStep = 'source' | 'matching' | 'preview' | 'importing' | 'done';

interface MatchedEntry {
  sourceTitle: string;
  sourceRating: number | null;
  sourceScore: number | null;
  sourceDate: string | null;
  sourceReview: string | null;
  match: Show | null;
  matchScore: number;
  selected: boolean;
  /** Real match demoted only by the date-sanity guard — the user's date-seen
   *  falls outside the production's run. Tickable with a caution label, not
   *  auto-rejected — a typo'd diary date must not block a real import. */
  dateSuspect: boolean;
  alreadyOwned: boolean;
  kind: 'diary' | 'watchlist';
  listName?: string;
  mezzShowId?: string;
}

interface ImportEntryPlan {
  type: 'review' | 'watchlist';
  showId: string;
  rating?: number;
  reviewText?: string | null;
  dateSeen?: string | null;
  plannedDate?: string | null;
}

interface ImportCheckpoint {
  userId: string;
  sourceKey: string;
  entries: MatchedEntry[];
  notices: string[];
  plans: ImportEntryPlan[];
  processedCount: number;
  stats: { imported: number; skipped: number; errors: number };
}

const CHECKPOINT_KEY = (userId: string) => `@bsc:import-checkpoint:${userId}`;

// ─── Title/date matching (ported from web's ImportShows.tsx matchShow) ────

/** Normalize a title for comparison: fancy quotes/dashes → plain, & → and,
 *  accents folded, strip punctuation, collapse whitespace. */
const COMBINING_MARKS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
const SMART_APOSTROPHE_RE = new RegExp('[\\u2018\\u2019\\u201a\\u2032\']', 'g');
const SMART_QUOTE_RE = new RegExp('[\\u201c\\u201d\\u201e\\u2033"]', 'g');

function normTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .replace(SMART_APOSTROPHE_RE, '')
    .replace(SMART_QUOTE_RE, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Downgrade a match whose production can't have been running when the user
 *  saw it (90-day grace on both ends; no closing date = never demoted). */
function dateSanity(candidate: Show, dateSeen?: string | null): number {
  if (!dateSeen) return 1;
  const seen = Date.parse(dateSeen);
  if (Number.isNaN(seen)) return 1;
  const GRACE = 90 * 24 * 3600 * 1000;
  if (candidate.openingDate && seen < Date.parse(candidate.openingDate) - GRACE) return 0.4;
  if (candidate.closingDate && seen > Date.parse(candidate.closingDate) + GRACE) return 0.4;
  return 1;
}

/** Same title, multiple productions: pick the run the user's date falls
 *  inside, else the one that opened closest to it. */
function closestRun(candidates: Show[], dateSeen?: string | null): Show {
  if (!dateSeen || candidates.length < 2) return candidates[0];
  const seen = Date.parse(dateSeen);
  const distance = (s: Show) => {
    if (!s.openingDate) return 10 * 365 * 24 * 3600 * 1000;
    const od = Date.parse(s.openingDate);
    const cd = s.closingDate ? Date.parse(s.closingDate) : Number.POSITIVE_INFINITY;
    if (seen >= od && seen <= cd) return 0;
    return Math.min(Math.abs(seen - od), Number.isFinite(cd) ? Math.abs(seen - cd) : Number.MAX_SAFE_INTEGER);
  };
  return [...candidates].sort((a, b) => distance(a) - distance(b))[0];
}

function marketLabel(category: string): string {
  if (category === 'west-end' || category === 'off-west-end') return 'London';
  if (category === 'off-broadway') return 'Off-Bway';
  return '';
}

function matchContext(s: Show): string {
  const year = s.openingDate?.slice(0, 4);
  return [[marketLabel(s.category), year].filter(Boolean).join(' '), s.venue].filter(Boolean).join(' · ');
}

function formatDateSeen(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function isUnmatched(e: MatchedEntry): boolean {
  return !e.match || (e.matchScore <= 0.7 && !e.dateSuspect);
}

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { shows } = useShows();

  const [step, setStep] = useState<ImportStep>('source');
  const [source, setSource] = useState<ImportSourceId>('mezzanine');
  const [entries, setEntries] = useState<MatchedEntry[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [profileInput, setProfileInput] = useState('');
  const [importStats, setImportStats] = useState({ imported: 0, skipped: 0, errors: 0 });
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [resumeSummary, setResumeSummary] = useState<{ total: number; remaining: number } | null>(null);
  const checkpointRef = useRef<ImportCheckpoint | null>(null);
  const cancelledRef = useRef(false);

  const fuse = useMemo(() => new Fuse(shows, {
    keys: [{ name: 'title', weight: 0.8 }, { name: 'venue', weight: 0.2 }],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [shows]);

  // Check for an unfinished import from a previous session (checkpointing —
  // a killed/backgrounded app mid-bulk-import shouldn't force a full redo).
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(CHECKPOINT_KEY(user.id)).then(raw => {
      if (!raw) return;
      try {
        const cp: ImportCheckpoint = JSON.parse(raw);
        if (cp.userId === user.id && cp.processedCount < cp.plans.length) {
          checkpointRef.current = cp;
          setResumeSummary({ total: cp.plans.length, remaining: cp.plans.length - cp.processedCount });
        }
      } catch { /* corrupt checkpoint — ignore */ }
    }).catch(() => {});
  }, [user]);

  const matchShow = useCallback((title: string, venue: string | null, dateSeen: string | null): { match: Show | null; score: number; dateSuspect: boolean } => {
    const nameNorm = normTitle(title);
    const withSanity = (match: Show, raw: number) => {
      const sane = dateSanity(match, dateSeen);
      return { match, score: raw * sane, dateSuspect: sane < 1 && raw > 0.7 };
    };

    let exactAll = shows.filter(s => normTitle(s.title) === nameNorm);
    let tierScore = 1;
    if (exactAll.length === 0 && nameNorm.length >= 8) {
      exactAll = shows.filter(s => {
        const c = normTitle(s.title);
        if (c.length < 8) return false;
        return c.startsWith(nameNorm + ' ') || nameNorm.startsWith(c + ' ');
      });
      tierScore = 0.85;
    }
    if (exactAll.length > 0) {
      if (venue) {
        const vnorm = (v: string) => v.toLowerCase().replace(/theatre|theater/gi, '').replace(/^the\s+/, '').trim();
        const venueNorm = vnorm(venue);
        const venueMatch = exactAll.find(s => {
          if (!s.venue) return false;
          const cand = vnorm(s.venue);
          return venueNorm.length < 5 || cand.length < 5 ? cand === venueNorm : cand.includes(venueNorm);
        });
        if (venueMatch) return withSanity(venueMatch, tierScore);
        return withSanity(closestRun(exactAll, dateSeen), tierScore * 0.95);
      }
      return withSanity(closestRun(exactAll, dateSeen), tierScore);
    }

    const results = fuse.search(title, { limit: 5 });
    if (results.length === 0) return { match: null, score: 0, dateSuspect: false };

    if (venue) {
      const venueNorm = venue.toLowerCase().replace(/theatre|theater/gi, '').trim();
      const venueMatch = results.find(r =>
        r.item.venue && r.item.venue.toLowerCase().replace(/theatre|theater/gi, '').trim().includes(venueNorm)
      );
      if (venueMatch) return withSanity(venueMatch.item, 1 - (venueMatch.score || 0));
    }

    const best = results[0];
    const score = 1 - (best.score || 0);
    const nameL = nameNorm;
    const matchL = normTitle(best.item.title);
    const contained = nameL.includes(matchL) || matchL.includes(nameL);
    return withSanity(best.item, contained ? score : score * 0.6);
  }, [shows, fuse]);

  const matchAndPreview = useCallback(async (acquired: ImportAcquireResult, sourceId: ImportSourceId) => {
    const existingReviewShowIds = new Set<string>(); // populated below from cache; import happens against live DB state
    const existingWatchlistShowIds = new Set<string>();
    try {
      const [reviewsCache, watchlistCache] = await Promise.all([
        AsyncStorage.getItem(`@bsc:reviews:${user!.id}`),
        AsyncStorage.getItem(`@bsc:watchlist:${user!.id}`),
      ]);
      if (reviewsCache) (JSON.parse(reviewsCache) as { show_id: string }[]).forEach(r => existingReviewShowIds.add(r.show_id));
      if (watchlistCache) (JSON.parse(watchlistCache) as { show_id: string }[]).forEach(w => existingWatchlistShowIds.add(w.show_id));
    } catch { /* best-effort de-dupe hint only — unique constraints are the real guard */ }

    const matched: MatchedEntry[] = [];
    const diaryShowIds = new Set<string>();
    const unmatchedForLog: RawImportEntry[] = [];

    for (const raw of acquired.entries.filter(e => e.kind === 'diary')) {
      const { match, score, dateSuspect } = matchShow(raw.title, raw.venue, raw.date);
      const showId = match?.id || '';
      const alreadyReviewed = showId ? existingReviewShowIds.has(showId) : false;
      matched.push({
        sourceTitle: raw.title,
        sourceRating: raw.rating,
        sourceScore: raw.sourceScore,
        sourceDate: raw.date,
        sourceReview: raw.reviewText,
        match,
        matchScore: score,
        selected: !!match && score > 0.7 && !alreadyReviewed,
        alreadyOwned: alreadyReviewed,
        dateSuspect,
        kind: 'diary',
        mezzShowId: raw.mezzShowId,
      });
      if (showId) diaryShowIds.add(showId);
      if (!match || (score <= 0.7 && !dateSuspect)) unmatchedForLog.push(raw);
    }

    for (const raw of acquired.entries.filter(e => e.kind === 'watchlist')) {
      const { match, score, dateSuspect } = matchShow(raw.title, raw.venue, raw.date);
      const showId = match?.id || '';
      const alreadyWatchlisted = showId ? existingWatchlistShowIds.has(showId) : false;
      const alreadyReviewed = showId ? existingReviewShowIds.has(showId) : false;
      const alreadyInDiary = showId ? diaryShowIds.has(showId) : false;
      const autoSelect = raw.fromDiary
        ? !alreadyWatchlisted && !alreadyReviewed
        : !alreadyWatchlisted && !alreadyInDiary;
      matched.push({
        sourceTitle: raw.title,
        sourceRating: null,
        sourceScore: null,
        sourceDate: raw.date,
        sourceReview: null,
        match,
        matchScore: score,
        selected: !!match && score > 0.7 && autoSelect,
        alreadyOwned: alreadyWatchlisted || (raw.fromDiary ? alreadyReviewed : alreadyInDiary),
        dateSuspect,
        kind: 'watchlist',
        listName: raw.listName,
        mezzShowId: raw.mezzShowId,
      });
      if (!match || (score <= 0.7 && !dateSuspect)) unmatchedForLog.push(raw);
    }

    setEntries(matched);
    setNotices(acquired.notices);
    setStep('preview');

    // Fire-and-forget self-heal logging (mirrors web's unmatched_imports insert,
    // #170) — best-effort, never blocks or surfaces to the user.
    for (const raw of unmatchedForLog) {
      supabaseRestInsert('unmatched_imports', {
        user_id: user!.id,
        source: sourceId,
        title: raw.title,
        venue: raw.venue,
        date_seen: raw.date,
        mezz_show_id: raw.mezzShowId || null,
      }).catch(() => {});
    }
  }, [matchShow, user]);

  const handlePickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    setSource('mezzanine');
    setStep('matching');
    setError(null);
    try {
      await matchAndPreview(await acquireFromMezzanine(result.assets[0].uri), 'mezzanine');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setStep('source');
    }
  }, [matchAndPreview]);

  const handleShowScoreFetch = useCallback(async () => {
    setSource('show-score');
    setStep('matching');
    setError(null);
    try {
      await matchAndPreview(await acquireFromShowScore(profileInput), 'show-score');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed — try again.');
      setStep('source');
    }
  }, [matchAndPreview, profileInput]);

  const toggleEntry = useCallback((index: number) => {
    haptics.tap();
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, selected: !e.selected } : e));
  }, []);

  const indexedEntries = useMemo(() => entries.map((entry, idx) => ({ entry, idx })), [entries]);
  const dateSuspectRows = useMemo(() => indexedEntries.filter(({ entry }) => entry.dateSuspect && !entry.alreadyOwned && !isUnmatched(entry)), [indexedEntries]);
  const diaryRows = useMemo(() => indexedEntries.filter(({ entry }) => entry.kind === 'diary' && (!entry.dateSuspect || entry.alreadyOwned) && !isUnmatched(entry)), [indexedEntries]);
  const watchlistRows = useMemo(() => indexedEntries.filter(({ entry }) => entry.kind === 'watchlist' && (!entry.dateSuspect || entry.alreadyOwned) && !isUnmatched(entry)), [indexedEntries]);
  const unmatchedRows = useMemo(() => indexedEntries.filter(({ entry }) => isUnmatched(entry)), [indexedEntries]);
  const selectedCount = useMemo(() => entries.filter(e => e.selected && e.match).length, [entries]);
  const skippedOwnedCount = useMemo(() => entries.filter(e => e.alreadyOwned && !e.selected && e.match && (e.matchScore > 0.7 || e.dateSuspect)).length, [entries]);

  /** Build the ordered insert plan: rated diary entries → reviews table;
   *  unrated diary entries + watchlist entries → watchlist table. */
  const buildPlan = useCallback((selected: MatchedEntry[]): ImportEntryPlan[] => {
    const plans: ImportEntryPlan[] = [];
    for (const e of selected) {
      if (!e.match) continue;
      if (e.kind === 'diary' && e.sourceRating && e.sourceRating > 0) {
        plans.push({ type: 'review', showId: e.match.id, rating: e.sourceRating, reviewText: e.sourceReview, dateSeen: e.sourceDate });
      } else {
        plans.push({ type: 'watchlist', showId: e.match.id, plannedDate: e.sourceDate });
      }
    }
    return plans;
  }, []);

  const runImport = useCallback(async (checkpoint: ImportCheckpoint) => {
    cancelledRef.current = false;
    setStep('importing');
    setImportProgress({ done: checkpoint.processedCount, total: checkpoint.plans.length });
    const stats = { ...checkpoint.stats };

    for (let i = checkpoint.processedCount; i < checkpoint.plans.length; i++) {
      if (cancelledRef.current) break;
      const plan = checkpoint.plans[i];
      try {
        const table = plan.type === 'review' ? 'reviews' : 'watchlist';
        const row = plan.type === 'review'
          ? { user_id: user!.id, show_id: plan.showId, rating: plan.rating, review_text: plan.reviewText || null, date_seen: plan.dateSeen || null }
          : { user_id: user!.id, show_id: plan.showId, ...(plan.plannedDate ? { planned_date: plan.plannedDate } : {}) };
        const { error: insertErr } = await supabaseRestInsert(table, row);
        if (insertErr) {
          if (insertErr.code === '23505') stats.skipped++;
          else stats.errors++;
        } else {
          stats.imported++;
        }
      } catch {
        stats.errors++;
      }

      checkpoint.processedCount = i + 1;
      checkpoint.stats = stats;
      setImportProgress({ done: checkpoint.processedCount, total: checkpoint.plans.length });
      // Persist every 5 rows — durable enough to survive a kill without
      // making every single insert wait on an AsyncStorage round-trip.
      if (checkpoint.processedCount % 5 === 0 || checkpoint.processedCount === checkpoint.plans.length) {
        await AsyncStorage.setItem(CHECKPOINT_KEY(user!.id), JSON.stringify(checkpoint)).catch(() => {});
      }
    }

    setImportStats(stats);
    if (checkpoint.processedCount >= checkpoint.plans.length) {
      await AsyncStorage.removeItem(CHECKPOINT_KEY(user!.id)).catch(() => {});
      // Invalidate the diary/watchlist caches so Watched/To Watch refetch
      // fresh data instead of serving stale AsyncStorage on next focus.
      await Promise.all([
        AsyncStorage.removeItem(`@bsc:reviews:${user!.id}`).catch(() => {}),
        AsyncStorage.removeItem(`@bsc:watchlist:${user!.id}`).catch(() => {}),
      ]);
      setStep('done');
    }
  }, [user]);

  const handleImport = useCallback(() => {
    if (!user) return;
    const selected = entries.filter(e => e.selected && e.match);
    const plans = buildPlan(selected);
    const checkpoint: ImportCheckpoint = {
      userId: user.id,
      sourceKey: source,
      entries,
      notices,
      plans,
      processedCount: 0,
      stats: { imported: 0, skipped: 0, errors: 0 },
    };
    checkpointRef.current = checkpoint;
    runImport(checkpoint);
  }, [user, entries, notices, source, buildPlan, runImport]);

  const handleResume = useCallback(() => {
    const cp = checkpointRef.current;
    if (!cp) return;
    setResumeSummary(null);
    setEntries(cp.entries);
    setNotices(cp.notices);
    runImport(cp);
  }, [runImport]);

  const handleDiscardCheckpoint = useCallback(() => {
    if (user) AsyncStorage.removeItem(CHECKPOINT_KEY(user.id)).catch(() => {});
    checkpointRef.current = null;
    setResumeSummary(null);
  }, [user]);

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    router.back();
  }, [router]);

  const totalToImport = entries.filter(e => e.selected).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={handleClose} hitSlop={12}>
          <Text style={styles.cancelText}>{step === 'done' ? 'Done' : 'Cancel'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {step === 'source' && 'Import your shows'}
          {step === 'matching' && (source === 'show-score' ? 'Fetching your profile…' : 'Matching shows…')}
          {step === 'preview' && 'Review Import'}
          {step === 'importing' && 'Importing…'}
          {step === 'done' && 'Import Complete'}
        </Text>
        <View style={{ minWidth: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}>
        {step === 'source' && (
          <View style={{ gap: Spacing.xl, paddingTop: Spacing.sm }}>
            {resumeSummary && (
              <View style={styles.resumeBanner}>
                <Text style={styles.resumeText}>
                  Unfinished import — {resumeSummary.remaining} of {resumeSummary.total} remaining.
                </Text>
                <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm }}>
                  <Pressable style={styles.smallBtnPrimary} onPress={handleResume}>
                    <Text style={styles.smallBtnPrimaryText}>Resume</Text>
                  </Pressable>
                  <Pressable style={styles.smallBtnGhost} onPress={handleDiscardCheckpoint}>
                    <Text style={styles.smallBtnGhostText}>Discard</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View>
              <Text style={styles.sourceLabel}>🎭 Show Score</Text>
              <Text style={styles.sourceHint}>
                Paste your public profile link — your reviews and ratings import directly. No password needed.
                Find it on show-score.com: tap your profile picture, then copy the page address.
              </Text>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TextInput
                  value={profileInput}
                  onChangeText={setProfileInput}
                  placeholder="show-score.com/member/your-name"
                  placeholderTextColor={Colors.text.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  onSubmitEditing={() => profileInput.trim() && handleShowScoreFetch()}
                />
                <Pressable
                  style={[styles.smallBtnPrimary, !profileInput.trim() && styles.disabled]}
                  disabled={!profileInput.trim()}
                  onPress={handleShowScoreFetch}
                >
                  <Text style={styles.smallBtnPrimaryText}>Import</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View>
              <Text style={styles.sourceLabel}>📱 Mezzanine</Text>
              <Text style={styles.sourceHint}>In the app: Settings → Export Data → JSON, then choose the file below.</Text>
              <Pressable style={styles.smallBtnGhost} onPress={handlePickFile}>
                <Text style={styles.smallBtnGhostText}>Choose JSON File</Text>
              </Pressable>
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        )}

        {step === 'matching' && (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={Colors.brand} />
            <Text style={styles.mutedText}>
              {source === 'show-score' ? 'Fetching and matching your Show Score reviews…' : 'Matching your shows…'}
            </Text>
          </View>
        )}

        {step === 'preview' && (
          <View>
            <View style={styles.summaryRow}>
              <Text style={styles.summarySelected}>{selectedCount} selected to import</Text>
              {skippedOwnedCount > 0 && <Text style={styles.summaryMuted}>{skippedOwnedCount} skipped — already in your shows</Text>}
              {unmatchedRows.length > 0 && <Text style={styles.summaryWarn}>{unmatchedRows.length} not on Broadway Scorecard</Text>}
            </View>
            {notices.map((n, i) => <Text key={i} style={styles.noticeText}>{n}</Text>)}
            <Text style={styles.captionText}>
              Imported ratings are private until you choose to share them.
              {source === 'show-score' ? ' Show Score scores convert to the nearest half-star.' : ''}
            </Text>

            {dateSuspectRows.length > 0 && (
              <Section title={`Not selected — date mismatch (${dateSuspectRows.length})`} titleColor={Colors.score.amber}>
                <Text style={styles.sectionHint}>
                  The date you logged falls outside this production&apos;s run — you may have seen a different production
                  (a tour or revival) of the same title. Tick to import into the matched production anyway.
                </Text>
                {dateSuspectRows.map(({ entry, idx }) => <EntryRow key={`s-${idx}`} entry={entry} onToggle={() => toggleEntry(idx)} />)}
              </Section>
            )}

            {diaryRows.length > 0 && (
              <Section title={`Diary — ${diaryRows.filter(r => r.entry.selected).length} of ${diaryRows.length} selected`}>
                {diaryRows.map(({ entry, idx }) => <EntryRow key={`d-${idx}`} entry={entry} onToggle={() => toggleEntry(idx)} />)}
              </Section>
            )}

            {watchlistRows.length > 0 && (
              <Section title={`Watchlist — ${watchlistRows.filter(r => r.entry.selected).length} of ${watchlistRows.length} selected`}>
                {watchlistRows.map(({ entry, idx }) => <EntryRow key={`w-${idx}`} entry={entry} onToggle={() => toggleEntry(idx)} />)}
              </Section>
            )}

            {unmatchedRows.length > 0 && (
              <Section title={`Not on Broadway Scorecard (${unmatchedRows.length})`}>
                {unmatchedRows.map(({ entry, idx }) => <EntryRow key={`u-${idx}`} entry={entry} onToggle={() => toggleEntry(idx)} disabled />)}
              </Section>
            )}
          </View>
        )}

        {step === 'importing' && (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={Colors.brand} />
            <Text style={styles.mutedText}>
              Importing {importProgress.done} of {importProgress.total}…
            </Text>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.centerBlock}>
            <Text style={{ fontSize: 40 }}>🎉</Text>
            <Text style={styles.doneTitle}>{importStats.imported} shows imported</Text>
            {importStats.skipped > 0 && <Text style={styles.mutedText}>{importStats.skipped} already existed (skipped)</Text>}
            {importStats.errors > 0 && <Text style={styles.errorText}>{importStats.errors} failed</Text>}
            {unmatchedRows.length > 0 && (
              <View style={{ width: '100%', marginTop: Spacing.lg }}>
                <Text style={styles.sectionTitle}>
                  Not imported — {unmatchedRows.length} show{unmatchedRows.length === 1 ? '' : 's'} we couldn&apos;t find
                </Text>
                {unmatchedRows.map(({ entry, idx }) => (
                  <View key={`nu-${idx}`} style={styles.unmatchedDoneRow}>
                    <Text style={styles.unmatchedDoneText} numberOfLines={1}>{entry.sourceTitle}</Text>
                    {entry.sourceRating ? <Text style={styles.unmatchedDoneRating}>★ {entry.sourceRating}</Text> : null}
                  </View>
                ))}
                <Text style={styles.sectionHint}>Try the Add show search, or send us feedback to ask us to add them.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {step === 'preview' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Pressable
            style={[styles.primaryBtn, totalToImport === 0 && styles.disabled]}
            disabled={totalToImport === 0}
            onPress={handleImport}
          >
            <Text style={styles.primaryBtnText}>Import {totalToImport} Show{totalToImport === 1 ? '' : 's'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Section({ title, titleColor, children }: { title: string; titleColor?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: Spacing.lg }}>
      <Text style={[styles.sectionTitle, titleColor ? { color: titleColor } : null]}>{title}</Text>
      {children}
    </View>
  );
}

function EntryRow({ entry, onToggle, disabled }: { entry: MatchedEntry; onToggle: () => void; disabled?: boolean }) {
  const noMatch = isUnmatched(entry);
  return (
    <Pressable
      style={({ pressed }) => [styles.row, (noMatch || !entry.selected) && styles.rowDim, pressed && !disabled && styles.pressed]}
      onPress={disabled ? undefined : onToggle}
      disabled={disabled && !noMatch}
    >
      <View style={[styles.checkbox, entry.selected && styles.checkboxChecked, noMatch && styles.checkboxDisabled]}>
        {entry.selected && <Text style={styles.checkboxMark}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{entry.sourceTitle}</Text>
          {entry.sourceRating ? (
            <Text style={styles.rowRating}>{entry.sourceScore !== null ? `${entry.sourceScore} → ` : ''}★ {entry.sourceRating}</Text>
          ) : entry.kind === 'diary' ? (
            <Text style={styles.rowMuted}>no rating → watchlist</Text>
          ) : null}
        </View>
        {entry.match && !noMatch ? (
          <Text style={styles.rowContext} numberOfLines={2}>
            → {entry.match.title} · {matchContext(entry.match)}
            {entry.sourceDate ? ` · you logged ${formatDateSeen(entry.sourceDate)}` : ''}
            {entry.alreadyOwned ? ' · already in your shows' : ''}
            {entry.dateSuspect ? ' · date is outside this run' : ''}
          </Text>
        ) : (
          <Text style={styles.rowUnmatched}>Not on Broadway Scorecard</Text>
        )}
      </View>
      {entry.listName && <Text style={styles.rowMuted}>{entry.listName}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border.subtle,
  },
  cancelText: { color: Colors.brand, fontSize: FontSize.sm, minWidth: 60 },
  headerTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '600', textAlign: 'center', flex: 1 },
  content: { flex: 1, paddingHorizontal: Spacing.lg },
  centerBlock: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  mutedText: { color: Colors.text.secondary, fontSize: FontSize.sm, textAlign: 'center' },
  doneTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  sourceLabel: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700', marginBottom: 4 },
  sourceHint: { color: Colors.text.muted, fontSize: FontSize.xs, marginBottom: Spacing.sm, lineHeight: 18 },
  input: {
    flex: 1, minWidth: 0, paddingHorizontal: Spacing.md, height: 44, fontSize: FontSize.sm,
    backgroundColor: Colors.surface.overlay, borderRadius: BorderRadius.md,
    color: Colors.text.primary, borderWidth: 1, borderColor: Colors.border.default,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border.subtle },
  dividerText: { color: Colors.text.muted, fontSize: FontSize.xs },
  smallBtnPrimary: {
    backgroundColor: Colors.brand, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  smallBtnPrimaryText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  smallBtnGhost: {
    borderWidth: 1, borderColor: Colors.border.default, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, height: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
  },
  smallBtnGhostText: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  errorText: { color: Colors.score.red, fontSize: FontSize.sm },
  resumeBanner: {
    backgroundColor: 'rgba(212, 165, 116, 0.08)', borderWidth: 1, borderColor: 'rgba(212, 165, 116, 0.25)',
    borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  resumeText: { color: Colors.text.primary, fontSize: FontSize.sm },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: 4 },
  summarySelected: { color: Colors.score.green, fontSize: FontSize.sm },
  summaryMuted: { color: Colors.text.muted, fontSize: FontSize.sm },
  summaryWarn: { color: Colors.score.amber, fontSize: FontSize.sm },
  noticeText: { color: Colors.score.amber, fontSize: FontSize.xs, marginTop: 2 },
  captionText: { color: Colors.text.muted, fontSize: FontSize.xs, marginBottom: Spacing.md, lineHeight: 16 },
  sectionTitle: { color: Colors.text.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
  sectionHint: { color: Colors.text.muted, fontSize: FontSize.xs, marginBottom: Spacing.sm, lineHeight: 16 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, borderRadius: BorderRadius.sm,
  },
  rowDim: { opacity: 0.6 },
  pressed: { backgroundColor: Colors.surface.overlay },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border.default,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkboxChecked: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  checkboxDisabled: { opacity: 0.4 },
  checkboxMark: { color: Colors.text.inverse, fontSize: 13, fontWeight: '700' },
  rowTitle: { color: Colors.text.primary, fontSize: FontSize.sm, flexShrink: 1 },
  rowRating: { color: Colors.score.amber, fontSize: FontSize.xs },
  rowMuted: { color: Colors.text.muted, fontSize: FontSize.xs },
  rowContext: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 1 },
  rowUnmatched: { color: Colors.score.amber, fontSize: FontSize.xs, marginTop: 1 },
  footer: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border.subtle,
    backgroundColor: Colors.surface.default,
  },
  primaryBtn: {
    backgroundColor: Colors.brand, borderRadius: BorderRadius.md, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: Colors.text.inverse, fontSize: FontSize.md, fontWeight: '700' },
  unmatchedDoneRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    backgroundColor: Colors.surface.overlay, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, marginBottom: 4,
  },
  unmatchedDoneText: { color: Colors.text.secondary, fontSize: FontSize.sm, flexShrink: 1 },
  unmatchedDoneRating: { color: Colors.score.amber, fontSize: FontSize.xs },
});
