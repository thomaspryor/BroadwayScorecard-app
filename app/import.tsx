/**
 * Import shows from Mezzanine or Show Score — web parity port of
 * src/app/my-shows/ImportShows.tsx (see Broadwayscore commits 992f58bc046,
 * 187f8601e30). Date-aware matchShow picks the production whose run CONTAINS
 * the user's date-seen instead of grabbing the first same-title match — the
 * root cause of wrong-production imports (History Boys 2006 etc, 2026-07-14).
 *
 * Catalog: the scored catalog from useShows() MERGED with diary-search.json,
 * exactly as the web does (lib/diary-catalog.ts). Matching the scored catalog
 * alone made the app reject ~45 productions per import that the website
 * matched fine — "the imports miss shows that ARE on the site" and "don't work
 * as well as, and are inconsistent with, the web imports" (owner, 2026-08-02).
 * Flagged rows (date mismatch, not found) carry the web's per-row "Find it"
 * lookup — see findProductions. Without it the preview could only tell the
 * owner a row was wrong and then offer to import it wrongly anyway: their
 * Mezzanine test flagged seven date mismatches with "no way for me to
 * fix/address/action those issues" (2026-08-03). Unmatched rows are listed,
 * never silently dropped, so the self-heal loop (unmatched_imports) can grow
 * the catalog toward matching them later.
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
import { useAuth } from '@/lib/auth-context';
import { useShows } from '@/lib/data-context';
import { supabaseRestInsert } from '@/lib/supabase-rest';
import {
  acquireFromMezzanine,
  acquireFromShowScore,
  type ImportAcquireResult,
  type RawImportEntry,
} from '@/lib/show-import';
import {
  ShowMatcher,
  isWeakMatch,
  normTitle,
  MATCH_THRESHOLD,
  type MatchCandidate,
} from '@/lib/show-match';
import {
  searchMezzanineCatalog,
  resolveMezzanineShow,
  stubRowFromCandidate,
  MEZZANINE_SEARCH_ERROR_COPY,
  type MezzanineCandidate,
} from '@/lib/mezzanine-search';
import {
  fetchDiaryCatalog,
  mergeDiaryCandidates,
  showToCandidate,
} from '@/lib/diary-catalog';
import { recordDiaryTitles } from '@/lib/diary-titles';
import type { DiaryShowMeta } from '@/lib/show-format';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as haptics from '@/lib/haptics';

type ImportSourceId = 'mezzanine' | 'show-score';
type ImportStep = 'source' | 'matching' | 'preview' | 'importing' | 'done';

export interface MatchedEntry {
  sourceTitle: string;
  sourceRating: number | null;
  sourceScore: number | null;
  sourceDate: string | null;
  /** The venue the SOURCE logged, not the matched production's. Shown on
   *  flagged rows because it is often what makes the mismatch legible — the
   *  owner's "Kinky Boots · Stage 42 · May 2023" row is impossible on its own
   *  terms (that run closed Nov 2022), which the matched-production line
   *  alone can't show. */
  sourceVenue: string | null;
  sourceReview: string | null;
  match: MatchCandidate | null;
  matchScore: number;
  selected: boolean;
  /** Real match demoted only by the date-sanity guard — the user's date-seen
   *  falls outside the production's run. Tickable with a caution label, not
   *  auto-rejected — a typo'd diary date must not block a real import. */
  dateSuspect: boolean;
  alreadyOwned: boolean;
  /** Already written to Supabase by a completed pass. Guards the post-import
   *  fix-up round from re-inserting a row the user already imported. */
  imported?: boolean;
  /** Latched when a pass finishes with this row still unimported and flagged.
   *  It must NOT be recomputed from dateSuspect/isUnmatched, because resolving
   *  the row clears both — recomputing made a row disappear from the fix-up
   *  list the instant it was fixed, so the "Import N Fixed Shows" button could
   *  never appear and the fix could never be saved. */
  needsFix?: boolean;
  kind: 'diary' | 'watchlist';
  listName?: string;
  mezzShowId?: string;
}

/** One offer in the per-row production picker: something already in a catalog
 *  we ship, or a production only Mezzanine knows about. */
export type PickerCandidate =
  | { source: 'catalog'; show: MatchCandidate }
  | { source: 'mezzanine'; candidate: MezzanineCandidate };

export type ResolveState =
  | { status: 'searching' }
  | { status: 'results'; candidates: PickerCandidate[]; expanded: boolean; filter: string }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/** Offers shown before "Show all N" — a phone can't scan 379 productions of
 *  "Rent", and rankProductionChoices puts the plausible ones on top. */
const PICKER_PREVIEW_COUNT = 6;
/** Past this many offers the list needs a filter box, not just a scroll. */
const PICKER_FILTER_THRESHOLD = 12;

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

// Title/date matching lives in lib/show-match.ts (unit-tested against the
// real catalogs in tests/unit/show-match.test.mjs).

function marketLabel(category: string): string {
  if (category === 'west-end' || category === 'off-west-end') return 'London';
  if (category === 'off-broadway') return 'Off-Bway';
  return '';
}

function matchContext(s: MatchCandidate): string {
  const year = s.openingDate?.slice(0, 4);
  // Diary-catalog entries are regional/international far more often than not,
  // so the city is the thing that identifies them (web parity).
  const market = marketLabel(s.category) || (s.diaryOnly ? (s.city ?? '') : '');
  return [[market, year].filter(Boolean).join(' '), s.venue].filter(Boolean).join(' · ');
}

function formatDateSeen(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function isUnmatched(e: MatchedEntry): boolean {
  return isWeakMatch({ match: e.match, score: e.matchScore, dateSuspect: e.dateSuspect });
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
  /** Kept from the matching pass so a flagged row can offer the other
   *  productions of the same title without rebuilding the 34k-entry pool. */
  const matcherRef = useRef<ShowMatcher | null>(null);
  const ownedRef = useRef<{ reviews: Set<string>; watchlist: Set<string> }>({ reviews: new Set(), watchlist: new Set() });
  const [resolve, setResolve] = useState<Record<number, ResolveState>>({});

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

  /** Scored catalog + diary catalog, built once per import run. The diary
   *  fetch is ~7.5MB, so it is deliberately NOT done at mount. */
  const buildMatcher = useCallback(async (): Promise<{ matcher: ShowMatcher; notice: string | null }> => {
    const base = shows.map(showToCandidate);
    try {
      const diary = await fetchDiaryCatalog();
      return { matcher: new ShowMatcher(mergeDiaryCandidates(base, diary)), notice: null };
    } catch {
      // Degrade to the scored catalog rather than failing the whole import,
      // but say so — silently matching fewer shows is the bug this fixes.
      return {
        matcher: new ShowMatcher(base),
        notice: "Couldn't load the full show catalog, so some Off-Broadway, touring and regional productions may show as not found. Check your connection and re-run the import to match them.",
      };
    }
  }, [shows]);

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
    ownedRef.current = { reviews: existingReviewShowIds, watchlist: existingWatchlistShowIds };

    const { matcher, notice: catalogNotice } = await buildMatcher();
    matcherRef.current = matcher;
    setResolve({});
    const matchShow = (title: string, venue: string | null, dateSeen: string | null) =>
      matcher.match(title, venue, dateSeen);

    const matched: MatchedEntry[] = [];
    const diaryShowIds = new Set<string>();
    const unmatchedForLog: RawImportEntry[] = [];
    /** Detail for diary-only matches, so Watched/To Watch/Lists/the diary-show
     *  page don't render the raw id. */
    const diaryTitleUpdates: Record<string, DiaryShowMeta> = {};
    const noteDiaryTitle = (m: MatchCandidate | null) => {
      if (m?.diaryOnly) {
        diaryTitleUpdates[m.id] = {
          title: m.title,
          venue: m.venue,
          city: m.city ?? null,
          category: m.category,
          openingDate: m.openingDate,
        };
      }
    };

    for (const raw of acquired.entries.filter(e => e.kind === 'diary')) {
      const { match, score, dateSuspect } = matchShow(raw.title, raw.venue, raw.date);
      const showId = match?.id || '';
      const alreadyReviewed = showId ? existingReviewShowIds.has(showId) : false;
      matched.push({
        sourceTitle: raw.title,
        sourceRating: raw.rating,
        sourceScore: raw.sourceScore,
        sourceDate: raw.date,
        sourceVenue: raw.venue,
        sourceReview: raw.reviewText,
        match,
        matchScore: score,
        selected: !!match && score > MATCH_THRESHOLD && !alreadyReviewed,
        alreadyOwned: alreadyReviewed,
        dateSuspect,
        kind: 'diary',
        mezzShowId: raw.mezzShowId,
      });
      noteDiaryTitle(match);
      if (showId) diaryShowIds.add(showId);
      if (isWeakMatch({ match, score, dateSuspect })) unmatchedForLog.push(raw);
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
        sourceVenue: raw.venue,
        sourceReview: null,
        match,
        matchScore: score,
        selected: !!match && score > MATCH_THRESHOLD && autoSelect,
        alreadyOwned: alreadyWatchlisted || (raw.fromDiary ? alreadyReviewed : alreadyInDiary),
        dateSuspect,
        kind: 'watchlist',
        listName: raw.listName,
        mezzShowId: raw.mezzShowId,
      });
      noteDiaryTitle(match);
      if (isWeakMatch({ match, score, dateSuspect })) unmatchedForLog.push(raw);
    }

    recordDiaryTitles(diaryTitleUpdates).catch(() => {});

    setEntries(matched);
    setNotices(catalogNotice ? [...acquired.notices, catalogNotice] : acquired.notices);
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
  }, [buildMatcher, user]);

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

  /**
   * Per-row "which production did you see?" — the missing half of the
   * date-mismatch and not-found flags. Both told the owner something was wrong
   * and then offered nothing but "import it into the wrong production anyway"
   * (2026-08-03). Web parity: ImportShows.tsx's findItForRow.
   *
   * Our own catalogs first (they have real show pages, and Mezzanine has no
   * coverage at all of some of what we carry), then Mezzanine's wider catalog
   * for productions neither of ours knows.
   */
  const findProductions = useCallback(async (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    haptics.tap();
    setResolve(prev => ({ ...prev, [index]: { status: 'searching' } }));

    // Exclude the row's current match — a flagged row must not just re-offer
    // the production it was already flagged for.
    const own = (matcherRef.current?.productionsFor(entry.sourceTitle, entry.sourceDate) ?? [])
      .filter(s => s.id !== entry.match?.id);
    const ownIds = new Set(own.map(s => s.id));
    const ownCandidates: PickerCandidate[] = own.map(show => ({ source: 'catalog', show }));

    let mezzCandidates: PickerCandidate[] = [];
    try {
      const results = entry.mezzShowId
        ? await resolveMezzanineShow(entry.mezzShowId)
        : await searchMezzanineCatalog(entry.sourceTitle);
      mezzCandidates = results
        .filter(c => !ownIds.has(c.id) && c.id !== entry.match?.id)
        .map(candidate => ({ source: 'mezzanine', candidate }));
    } catch (err) {
      // Our own candidates are still usable when the wider search fails —
      // only surface the error when there is nothing at all to show.
      if (ownCandidates.length === 0) {
        setResolve(prev => ({
          ...prev,
          [index]: { status: 'error', message: err instanceof Error ? err.message : MEZZANINE_SEARCH_ERROR_COPY.internal },
        }));
        return;
      }
    }

    const candidates = [...ownCandidates, ...mezzCandidates];
    setResolve(prev => ({
      ...prev,
      [index]: candidates.length > 0
        ? { status: 'results', candidates, expanded: false, filter: '' }
        : { status: 'empty' },
    }));
  }, [entries]);

  const updateResolve = useCallback((index: number, patch: Partial<Extract<ResolveState, { status: 'results' }>>) => {
    setResolve(prev => {
      const current = prev[index];
      if (current?.status !== 'results') return prev;
      return { ...prev, [index]: { ...current, ...patch } };
    });
  }, []);

  const clearResolve = useCallback((index: number) => {
    setResolve(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  /** Reassign a row to the production the user picked. The choice is explicit,
   *  so the date guard is cleared — but alreadyOwned is rechecked, since the
   *  picked production can be one they already have. */
  const pickProduction = useCallback((index: number, choice: PickerCandidate) => {
    haptics.tap();
    const match: MatchCandidate = choice.source === 'catalog'
      ? choice.show
      : {
          id: choice.candidate.id,
          title: choice.candidate.title,
          slug: choice.candidate.id,
          venue: choice.candidate.venue,
          category: choice.candidate.category,
          openingDate: choice.candidate.openingDate,
          closingDate: null,
          city: choice.candidate.city,
          diaryOnly: true,
          ratingsCount: choice.candidate.ratingsCount,
        };

    if (choice.source === 'mezzanine' && user) {
      // Give the production a row of its own so it stops being unmatchable
      // for everyone else too (self-heal loop, web parity).
      supabaseRestInsert('user_show_stubs', stubRowFromCandidate(choice.candidate, user.id)).catch(() => {});
    }
    // Without this the picked production renders as a raw slug in Watched /
    // To Watch / Lists — it has no entry in the scored catalog.
    if (match.diaryOnly) {
      recordDiaryTitles({
        [match.id]: {
          title: match.title,
          venue: match.venue,
          city: match.city ?? null,
          category: match.category,
          openingDate: match.openingDate,
        },
      }).catch(() => {});
    }

    setEntries(prev => prev.map((e, i) => {
      if (i !== index) return e;
      const alreadyOwned = e.kind === 'diary'
        ? ownedRef.current.reviews.has(match.id)
        : ownedRef.current.watchlist.has(match.id);
      return { ...e, match, matchScore: 1, selected: !alreadyOwned, alreadyOwned, dateSuspect: false };
    }));
    clearResolve(index);
  }, [user, clearResolve]);

  const indexedEntries = useMemo(() => entries.map((entry, idx) => ({ entry, idx })), [entries]);
  const dateSuspectRows = useMemo(() => indexedEntries.filter(({ entry }) => entry.dateSuspect && !entry.alreadyOwned && !isUnmatched(entry)), [indexedEntries]);
  const diaryRows = useMemo(() => indexedEntries.filter(({ entry }) => entry.kind === 'diary' && (!entry.dateSuspect || entry.alreadyOwned) && !isUnmatched(entry)), [indexedEntries]);
  const watchlistRows = useMemo(() => indexedEntries.filter(({ entry }) => entry.kind === 'watchlist' && (!entry.dateSuspect || entry.alreadyOwned) && !isUnmatched(entry)), [indexedEntries]);
  const unmatchedRows = useMemo(() => indexedEntries.filter(({ entry }) => isUnmatched(entry)), [indexedEntries]);
  /** The point of the post-import fix-up round: everything the preview could
   *  only WARN about — no production matched, or the matched one's run doesn't
   *  contain the logged date — that the user has not resolved and imported.
   *  Before this, finishing an import stranded these permanently (owner,
   *  2026-08-03: "there should be another step to fix/address the unmatched
   *  shows … find the actual production at the right theater/date/city/year"). */
  const unresolvedRows = useMemo(
    () => indexedEntries.filter(({ entry }) => entry.needsFix && !entry.imported),
    [indexedEntries],
  );
  const fixedReadyCount = useMemo(() => unresolvedRows.filter(({ entry }) => entry.selected && entry.match).length, [unresolvedRows]);

  const selectedCount = useMemo(() => entries.filter(e => e.selected && e.match).length, [entries]);
  const skippedOwnedCount = useMemo(() => entries.filter(e => e.alreadyOwned && !e.selected && e.match && (e.matchScore > MATCH_THRESHOLD || e.dateSuspect)).length, [entries]);

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
      // Persist after every row. The `reviews` table intentionally has no
      // unique constraint (multiple viewings per show are allowed), so a
      // kill between persists would replay already-inserted review rows on
      // resume as genuine duplicates instead of hitting 23505 — confirmed
      // live (task #436): rows landed in Supabase but re-inserted on resume.
      // Watchlist has a DB constraint and self-heals via 23505 either way.
      await AsyncStorage.setItem(CHECKPOINT_KEY(user!.id), JSON.stringify(checkpoint)).catch(() => {});
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
      // Rows that just landed are off the table for the fix-up round; whatever
      // is left over and flagged is latched INTO it.
      setEntries(prev => prev.map(e => {
        if (e.selected && e.match) return { ...e, imported: true, selected: false, needsFix: false };
        const flagged = !e.alreadyOwned && (e.dateSuspect || isWeakMatch({ match: e.match, score: e.matchScore, dateSuspect: e.dateSuspect }));
        return flagged ? { ...e, needsFix: true } : e;
      }));
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
      stats: { ...importStats },
    };
    checkpointRef.current = checkpoint;
    runImport(checkpoint);
  }, [user, entries, notices, source, buildPlan, runImport, importStats]);

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
                  (a tour or revival) of the same title. Tap &ldquo;Find the production I saw&rdquo; to pick the right one,
                  or tick to import into the matched production anyway.
                </Text>
                {dateSuspectRows.map(({ entry, idx }) => (
                  <EntryRow
                    key={`s-${idx}`}
                    entry={entry}
                    onToggle={() => toggleEntry(idx)}
                    resolve={resolve[idx]}
                    onFind={() => findProductions(idx)}
                    onPick={choice => pickProduction(idx, choice)}
                    onUpdateResolve={patch => updateResolve(idx, patch)}
                  />
                ))}
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
                <Text style={styles.sectionHint}>
                  We couldn&apos;t match these to a production. Tap &ldquo;Find it&rdquo; to search the wider catalog.
                </Text>
                {unmatchedRows.map(({ entry, idx }) => (
                  <EntryRow
                    key={`u-${idx}`}
                    entry={entry}
                    onToggle={() => toggleEntry(idx)}
                    disabled
                    resolve={resolve[idx]}
                    onFind={() => findProductions(idx)}
                    onPick={choice => pickProduction(idx, choice)}
                    onUpdateResolve={patch => updateResolve(idx, patch)}
                  />
                ))}
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
          <View style={{ gap: Spacing.md }}>
            <View style={styles.centerBlock}>
              <Text style={{ fontSize: 40 }}>🎉</Text>
              <Text style={styles.doneTitle}>{importStats.imported} shows imported</Text>
              {importStats.skipped > 0 && <Text style={styles.mutedText}>{importStats.skipped} already existed (skipped)</Text>}
              {importStats.errors > 0 && <Text style={styles.errorText}>{importStats.errors} failed</Text>}
            </View>

            {unresolvedRows.length > 0 && (
              <View style={{ width: '100%' }}>
                <Text style={[styles.sectionTitle, { color: Colors.score.amber }]}>
                  Still to fix — {unresolvedRows.length} show{unresolvedRows.length === 1 ? '' : 's'}
                </Text>
                <Text style={styles.sectionHint}>
                  These didn&apos;t import: we either couldn&apos;t find the show, or the production we found
                  wasn&apos;t running on the date you logged. Find the one you actually saw — the right theatre,
                  city and year — then import them.
                </Text>
                {unresolvedRows.map(({ entry, idx }) => (
                  <EntryRow
                    key={`fx-${idx}`}
                    entry={entry}
                    onToggle={() => toggleEntry(idx)}
                    disabled={isUnmatched(entry)}
                    resolve={resolve[idx]}
                    onFind={() => findProductions(idx)}
                    onPick={choice => pickProduction(idx, choice)}
                    onUpdateResolve={patch => updateResolve(idx, patch)}
                  />
                ))}
                <Text style={styles.sectionHint}>
                  Can&apos;t find one? Leave it — we log every unmatched title and keep adding productions,
                  so re-running this import later will pick them up.
                </Text>
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

      {step === 'done' && fixedReadyCount > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Pressable style={styles.primaryBtn} onPress={handleImport}>
            <Text style={styles.primaryBtnText}>
              Import {fixedReadyCount} Fixed Show{fixedReadyCount === 1 ? '' : 's'}
            </Text>
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

/** The row above already names the show, and catalog offers are always the
 *  same title — repeating it eats the whole line on a phone. Lead with the
 *  venue, and only name the title when it actually differs (Mezzanine's wider
 *  search can return a differently-titled production). */
function candidateLabel(choice: PickerCandidate, rowTitle: string): { line: string; detail: string } {
  const c = choice.source === 'catalog'
    ? {
        title: choice.show.title,
        venue: choice.show.venue,
        city: choice.show.city ?? null,
        year: choice.show.openingDate?.slice(0, 4) ?? null,
        ratings: choice.show.ratingsCount ?? 0,
        onSite: !choice.show.diaryOnly,
      }
    : {
        title: choice.candidate.title,
        venue: choice.candidate.venue,
        city: choice.candidate.city,
        year: choice.candidate.openingDate?.slice(0, 4) ?? null,
        ratings: choice.candidate.ratingsCount ?? 0,
        onSite: false,
      };
  const sameTitle = normTitle(c.title) === normTitle(rowTitle);
  return {
    line: [sameTitle ? null : c.title, c.venue].filter(Boolean).join(' — ') || c.title,
    detail: [c.city, c.year, c.onSite ? 'on Broadway Scorecard' : null, c.ratings > 0 ? `${c.ratings} ratings` : null]
      .filter(Boolean)
      .join(' · '),
  };
}

function candidateKey(choice: PickerCandidate): string {
  return choice.source === 'catalog' ? `catalog:${choice.show.id}` : `mezz:${choice.candidate.id}`;
}

function matchesFilter(choice: PickerCandidate, filter: string, rowTitle: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  const { line, detail } = candidateLabel(choice, rowTitle);
  return `${line} ${detail}`.toLowerCase().includes(q);
}

export function ProductionPicker({ state, onFind, onPick, onUpdate, isUnmatchedRow, rowTitle }: {
  state: ResolveState | undefined;
  rowTitle: string;
  onFind: () => void;
  onPick: (choice: PickerCandidate) => void;
  onUpdate: (patch: Partial<Extract<ResolveState, { status: 'results' }>>) => void;
  isUnmatchedRow: boolean;
}) {
  if (!state) {
    return (
      <Pressable onPress={onFind} hitSlop={8} style={styles.findItWrap}>
        <Text style={styles.findItText}>{isUnmatchedRow ? 'Find it' : 'Find the production I saw'}</Text>
      </Pressable>
    );
  }
  if (state.status === 'searching') {
    return <Text style={styles.pickerMuted}>Searching the wider catalog…</Text>;
  }
  if (state.status === 'empty') {
    return <Text style={styles.pickerMuted}>No other production of this title found.</Text>;
  }
  if (state.status === 'error') {
    return (
      <View style={styles.findItWrap}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Pressable onPress={onFind} hitSlop={8}>
          <Text style={styles.findItText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const filtered = state.candidates.filter(c => matchesFilter(c, state.filter, rowTitle));
  const shown = state.expanded ? filtered : filtered.slice(0, PICKER_PREVIEW_COUNT);
  const hidden = filtered.length - shown.length;
  return (
    <View style={styles.pickerWrap}>
      {state.candidates.length > PICKER_FILTER_THRESHOLD && (
        <TextInput
          value={state.filter}
          onChangeText={text => onUpdate({ filter: text })}
          placeholder="Filter by city or theatre"
          placeholderTextColor={Colors.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.pickerFilter}
        />
      )}
      {shown.map(choice => {
        const { line, detail } = candidateLabel(choice, rowTitle);
        return (
          <Pressable
            key={candidateKey(choice)}
            onPress={() => onPick(choice)}
            style={({ pressed }) => [styles.pickerOption, pressed && styles.pressed]}
          >
            <Text style={styles.pickerOptionText} numberOfLines={2}>{line}</Text>
            {detail ? <Text style={styles.pickerOptionDetail} numberOfLines={1}>{detail}</Text> : null}
          </Pressable>
        );
      })}
      {filtered.length === 0 && <Text style={styles.pickerMuted}>Nothing matches that filter.</Text>}
      {hidden > 0 && (
        <Pressable onPress={() => onUpdate({ expanded: true })} hitSlop={8}>
          <Text style={styles.findItText}>Show all {filtered.length}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EntryRow({ entry, onToggle, disabled, resolve, onFind, onPick, onUpdateResolve }: {
  entry: MatchedEntry;
  onToggle: () => void;
  disabled?: boolean;
  resolve?: ResolveState;
  onFind?: () => void;
  onPick?: (choice: PickerCandidate) => void;
  onUpdateResolve?: (patch: Partial<Extract<ResolveState, { status: 'results' }>>) => void;
}) {
  const noMatch = isUnmatched(entry);
  const canResolve = !!onFind && !!onPick && !!onUpdateResolve;
  return (
    <View>
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
          <Text style={styles.rowContext} numberOfLines={3}>
            → {entry.match.title} · {matchContext(entry.match)}
            {entry.sourceDate ? ` · you logged ${formatDateSeen(entry.sourceDate)}` : ''}
            {entry.dateSuspect && entry.sourceVenue ? ` at ${entry.sourceVenue}` : ''}
            {entry.alreadyOwned ? ' · already in your shows' : ''}
            {entry.dateSuspect ? ' · date is outside this run' : ''}
          </Text>
        ) : (
          <Text style={styles.rowUnmatched}>
            Not on Broadway Scorecard
            {entry.sourceVenue ? ` · you logged it at ${entry.sourceVenue}` : ''}
          </Text>
        )}
      </View>
      {entry.listName && <Text style={styles.rowMuted}>{entry.listName}</Text>}
    </Pressable>
    {canResolve && (noMatch || entry.dateSuspect) && (
      <ProductionPicker
        state={resolve}
        onFind={onFind!}
        onPick={onPick!}
        onUpdate={onUpdateResolve!}
        isUnmatchedRow={noMatch}
        rowTitle={entry.sourceTitle}
      />
    )}
    </View>
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
  // Indented to the row's text column (checkbox 20 + gap) so the picker reads
  // as belonging to the row above it.
  findItWrap: { paddingLeft: 20 + Spacing.sm + Spacing.xs, paddingBottom: Spacing.sm, gap: 2 },
  findItText: { color: Colors.brand, fontSize: FontSize.xs, fontWeight: '600', paddingVertical: 4 },
  pickerWrap: { paddingLeft: 20 + Spacing.sm + Spacing.xs, paddingBottom: Spacing.sm, gap: 2 },
  pickerMuted: { color: Colors.text.muted, fontSize: FontSize.xs, paddingLeft: 20 + Spacing.sm + Spacing.xs, paddingBottom: Spacing.sm },
  pickerFilter: {
    height: 36, paddingHorizontal: Spacing.sm, fontSize: FontSize.xs, marginBottom: 2,
    backgroundColor: Colors.surface.overlay, borderRadius: BorderRadius.sm,
    color: Colors.text.primary, borderWidth: 1, borderColor: Colors.border.default,
  },
  pickerOption: {
    paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay, marginBottom: 2,
  },
  pickerOptionText: { color: Colors.text.primary, fontSize: FontSize.xs },
  pickerOptionDetail: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 1 },
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
});
