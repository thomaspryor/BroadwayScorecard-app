/**
 * ShowSearchModal — lightweight modal for searching and selecting a show.
 *
 * Used by Watched tab (to rate) and To Watch tab (to add to watchlist).
 * Shows search input + results. Calls onSelect with the chosen show.
 *
 * Searches three layers, mirroring the web's ShowSearchDropdown
 * (includeDiary + enableLiveLookup, src/components/show-cards/):
 *   1. The scored catalog (useShows) — instant, always first.
 *   2. The diary catalog (diary-search.json, ~33k unscored productions
 *      worldwide) — fetched lazily on first open, merged below scored results.
 *      Owner request 2026-08-11: watchlist/diary adds were limited to the four
 *      scored markets even though imports could already reach these shows.
 *   3. A live Mezzanine catalog search when nothing local matches — selecting
 *      a live result writes a user_show_stubs row (self-heal loop, web parity).
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import Fuse, { IFuseOptions } from 'fuse.js';
import { useShows } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';
import { getImageUrl } from '@/lib/images';
import { ScoreBadge } from '@/components/show-cards';
import { getQualifiedScore } from '@/lib/score-utils';
import {
  fetchDiaryCatalog,
  mergeDiaryCandidates,
  showToCandidate,
  type DiarySearchEntry,
} from '@/lib/diary-catalog';
import {
  searchMezzanineCatalog,
  stubRowFromCandidate,
  MEZZANINE_SEARCH_ERROR_COPY,
  type MezzanineCandidate,
} from '@/lib/mezzanine-search';
import { recordDiaryTitles } from '@/lib/diary-titles';
import { supabaseRestInsert } from '@/lib/supabase-rest';
import type { MatchCandidate } from '@/lib/show-match';
import type { Show } from '@/lib/types';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

const FUSE_OPTIONS: IFuseOptions<Show> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'venue', weight: 1 },
  ],
  threshold: 0.35,
  minMatchCharLength: 2,
};

const DIARY_FUSE_OPTIONS: IFuseOptions<MatchCandidate> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'venue', weight: 1 },
  ],
  threshold: 0.35,
  minMatchCharLength: 2,
  ignoreLocation: true,
};

/** Scored results keep their existing cap; diary matches fill in below so a
 *  popular title's regional tail can't push the list into the hundreds. */
const SCORED_LIMIT = 20;
const DIARY_LIMIT = 15;

// NYC (off-broadway) and London (west-end) diary shows surface before the
// deep tail — same rule as the web's tierSearchResults (owner direction
// 2026-07-14: "typing 'Cats' should never bury the Broadway revival under 40
// regional Cats productions").
const NEAR_MARKET_CATEGORIES = new Set(['off-broadway', 'west-end']);

function tierDiaryResults(results: MatchCandidate[]): MatchCandidate[] {
  return [...results].sort((a, b) => {
    const marketDiff =
      Number(!NEAR_MARKET_CATEGORIES.has(a.category || '')) -
      Number(!NEAR_MARKET_CATEGORIES.has(b.category || ''));
    if (marketDiff !== 0) return marketDiff;
    const popDiff = (b.ratingsCount || 0) - (a.ratingsCount || 0);
    if (popDiff !== 0) return popDiff;
    return (b.openingDate || '').localeCompare(a.openingDate || '');
  });
}

/** What a selection resolves to. Diary/live picks have no scored Show object —
 *  callers get the id + title they need for watchlist rows and the rate route;
 *  the modal itself records the diary-title cache entry (and stub row for live
 *  picks) before firing this. */
export interface SearchSelection {
  id: string;
  title: string;
  /** True when the pick came from the diary catalog or a live Mezzanine
   *  lookup — it has no /show page and no critic score. */
  diaryOnly: boolean;
}

type ResultRow =
  | { kind: 'show'; show: Show }
  | { kind: 'diary'; candidate: MatchCandidate };

type LiveLookupState = 'idle' | 'searching' | 'results' | 'error' | 'empty';

interface ShowSearchModalProps {
  visible: boolean;
  title: string;
  onSelect: (selection: SearchSelection) => void;
  onClose: () => void;
  /** Show IDs already on the caller's list. These stay VISIBLE and are marked
   *  rather than filtered out: silently dropping them made the search look
   *  broken — typing a show you'd already added returned "No shows found"
   *  (beta feedback 2026-08-03, ANI-fwc0). */
  excludeIds?: Set<string>;
  /** Caption + toast wording for an already-listed row. */
  excludedLabel?: string;
  /** Fires once this modal has finished dismissing (iOS). Callers that open
   *  ANOTHER modal after a selection must wait for this — presenting over a
   *  view controller that is still dismissing is refused by UIKit and leaves
   *  the incoming modal permanently unable to present. */
  onDismiss?: () => void;
}

export function ShowSearchModal({
  visible,
  title,
  onSelect,
  onClose,
  excludeIds,
  excludedLabel = 'Already on your list',
  onDismiss,
}: ShowSearchModalProps) {
  const { shows } = useShows();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Diary catalog — fetched once per session (memoised in lib/diary-catalog),
  // merged into results below the scored matches. A failed fetch silently
  // degrades to scored-only (previous behaviour); the live lookup still works.
  const [diaryEntries, setDiaryEntries] = useState<DiarySearchEntry[] | null>(null);

  // Live Mezzanine lookup, offered only when nothing local matches.
  const [liveState, setLiveState] = useState<LiveLookupState>('idle');
  const [liveCandidates, setLiveCandidates] = useState<MezzanineCandidate[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  // A live pick writes a stub row + fires onSelect with no caller-side guard —
  // track it here so a rapid double-tap can't fire the add twice.
  const [addingLiveId, setAddingLiveId] = useState<string | null>(null);

  // Reset query when modal opens — render-phase reset (React-sanctioned pattern)
  // keeps setState out of the effect for the React Compiler.
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setQuery('');
      setDebouncedQuery('');
      setLiveState('idle');
      setAddingLiveId(null);
    }
  }

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || diaryEntries) return;
    let cancelled = false;
    fetchDiaryCatalog()
      .then(entries => {
        if (!cancelled) setDiaryEntries(entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, diaryEntries]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    // A fresh keystroke invalidates live results shown for the previous query.
    setLiveState('idle');
    setAddingLiveId(null);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(text), 150);
  }, []);

  const fuse = useMemo(() => new Fuse(shows, FUSE_OPTIONS), [shows]);

  // Diary-only candidates: the merge dedups against the scored catalog
  // (never shadow a scored production with its unscored diary duplicate);
  // filtering to diaryOnly leaves just the deduped unscored tail.
  const diaryCandidates = useMemo(() => {
    if (!diaryEntries) return [];
    return mergeDiaryCandidates(shows.map(showToCandidate), diaryEntries).filter(c => c.diaryOnly);
  }, [shows, diaryEntries]);

  const diaryFuse = useMemo(
    () => (diaryCandidates.length > 0 ? new Fuse(diaryCandidates, DIARY_FUSE_OPTIONS) : null),
    [diaryCandidates],
  );

  const results = useMemo<ResultRow[]>(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) return [];
    const scored: ResultRow[] = fuse
      .search(q, { limit: SCORED_LIMIT })
      .map(r => ({ kind: 'show', show: r.item }));
    if (!diaryFuse) return scored;
    // Search a wider window than we show, then tier (NYC/London first →
    // popularity → recency) and trim — a Fuse window capped at DIARY_LIMIT
    // could fill with fuzzy regional matches and bury the popular ones.
    const diaryMatches = diaryFuse.search(q, { limit: DIARY_LIMIT * 3 }).map(r => r.item);
    const diary: ResultRow[] = tierDiaryResults(diaryMatches)
      .slice(0, DIARY_LIMIT)
      .map(candidate => ({ kind: 'diary', candidate }));
    return [...scored, ...diary];
  }, [fuse, diaryFuse, debouncedQuery]);

  const selectDiary = useCallback(
    (candidate: MatchCandidate) => {
      // Without this the pick renders as a raw slug in Watched / To Watch /
      // Lists — it has no entry in the scored catalog.
      recordDiaryTitles({
        [candidate.id]: {
          title: candidate.title,
          venue: candidate.venue,
          city: candidate.city ?? null,
          category: candidate.category,
          openingDate: candidate.openingDate,
        },
      }).catch(() => {});
      onSelect({ id: candidate.id, title: candidate.title, diaryOnly: true });
    },
    [onSelect],
  );

  const runLiveSearch = useCallback(async () => {
    setLiveState('searching');
    setLiveError(null);
    try {
      const candidates = await searchMezzanineCatalog(debouncedQuery.trim());
      setLiveCandidates(candidates);
      setLiveState(candidates.length > 0 ? 'results' : 'empty');
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : MEZZANINE_SEARCH_ERROR_COPY.internal);
      setLiveState('error');
    }
  }, [debouncedQuery]);

  const selectLive = useCallback(
    (candidate: MezzanineCandidate) => {
      setAddingLiveId(candidate.id);
      // Give the production a row of its own so it stops being unmatchable
      // for everyone else too (self-heal loop, web parity). Best-effort —
      // the diary-title cache alone keeps the row readable locally.
      if (user) {
        supabaseRestInsert('user_show_stubs', stubRowFromCandidate(candidate, user.id)).catch(() => {});
      }
      recordDiaryTitles({
        [candidate.id]: {
          title: candidate.title,
          venue: candidate.venue,
          city: candidate.city,
          category: candidate.category,
          openingDate: candidate.openingDate,
        },
      }).catch(() => {});
      onSelect({ id: candidate.id, title: candidate.title, diaryOnly: true });
    },
    [user, onSelect],
  );

  const renderDiaryMeta = (candidate: MatchCandidate) => {
    const parts = [candidate.city, candidate.openingDate?.slice(0, 4)].filter(Boolean);
    return `${parts.join(' · ')}${parts.length > 0 ? ' · ' : ''}No critic score`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ minWidth: 60 }} />
        </View>

        {/* Search input */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search shows..."
            placeholderTextColor={Colors.text.muted}
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>

        {/* Results */}
        {query.trim().length < 2 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Search for a show by name</Text>
          </View>
        ) : results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={item => (item.kind === 'show' ? item.show.id : item.candidate.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              if (item.kind === 'diary') {
                const { candidate } = item;
                const alreadyListed = !!excludeIds?.has(candidate.id);
                return (
                  <Pressable
                    style={({ pressed }) => [styles.resultRow, alreadyListed && styles.resultRowMuted, pressed && styles.pressed]}
                    disabled={alreadyListed}
                    onPress={() => selectDiary(candidate)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: alreadyListed }}
                    accessibilityLabel={alreadyListed ? `${candidate.title} — ${excludedLabel}` : candidate.title}
                  >
                    <View style={[styles.resultPoster, styles.resultPlaceholder]}>
                      <Text style={styles.placeholderText}>{candidate.title.charAt(0)}</Text>
                    </View>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultTitle} numberOfLines={1}>{candidate.title}</Text>
                      {candidate.venue && <Text style={styles.resultVenue} numberOfLines={1}>{candidate.venue}</Text>}
                      {alreadyListed && (
                        <Text style={styles.resultAlready} numberOfLines={1}>{excludedLabel}</Text>
                      )}
                      <Text style={styles.resultMeta} numberOfLines={1}>{renderDiaryMeta(candidate)}</Text>
                    </View>
                  </Pressable>
                );
              }
              const { show } = item;
              const posterUrl = getImageUrl(show.images.poster) || getImageUrl(show.images.thumbnail);
              const alreadyListed = !!excludeIds?.has(show.id);
              return (
                <Pressable
                  style={({ pressed }) => [styles.resultRow, alreadyListed && styles.resultRowMuted, pressed && styles.pressed]}
                  // Inert rather than toast-on-tap: this modal is a native
                  // Modal, so a toast rendered by the app-level provider would
                  // paint BEHIND it. The persistent caption is the explanation.
                  disabled={alreadyListed}
                  onPress={() => onSelect({ id: show.id, title: show.title, diaryOnly: false })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: alreadyListed }}
                  accessibilityLabel={alreadyListed ? `${show.title} — ${excludedLabel}` : show.title}
                >
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={styles.resultPoster} contentFit="cover" />
                  ) : (
                    <View style={[styles.resultPoster, styles.resultPlaceholder]}>
                      <Text style={styles.placeholderText}>{show.title.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{show.title}</Text>
                    {show.venue && <Text style={styles.resultVenue} numberOfLines={1}>{show.venue}</Text>}
                    {alreadyListed && (
                      <Text style={styles.resultAlready} numberOfLines={1}>{excludedLabel}</Text>
                    )}
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {show.status === 'open' ? 'Now Playing' : show.status === 'previews' ? 'In Previews' : show.status === 'closed' ? 'Closed' : show.status}
                      {show.openingDate ? ` · ${show.openingDate.slice(0, 4)}` : ''}
                      {show.closingDate && show.status === 'closed' ? `–${show.closingDate.slice(0, 4)}` : ''}
                      {show.category === 'west-end' ? ' · London' : show.category === 'off-broadway' ? ' · Off-Bway' : ''}
                    </Text>
                  </View>
                  <ScoreBadge score={getQualifiedScore(show)} category={show.category} size="small" />
                </Pressable>
              );
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        ) : liveState === 'results' ? (
          <FlatList
            data={liveCandidates}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <Text style={styles.wideHeader}>From the wider theater catalog</Text>
            }
            renderItem={({ item }) => {
              const alreadyListed = !!excludeIds?.has(item.id);
              return (
                <Pressable
                  style={({ pressed }) => [styles.resultRow, (alreadyListed || !!addingLiveId) && styles.resultRowMuted, pressed && styles.pressed]}
                  disabled={alreadyListed || !!addingLiveId}
                  onPress={() => selectLive(item)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: alreadyListed || !!addingLiveId }}
                  accessibilityLabel={alreadyListed ? `${item.title} — ${excludedLabel}` : item.title}
                >
                  {item.posterUrl ? (
                    <Image source={{ uri: item.posterUrl }} style={styles.resultPoster} contentFit="cover" />
                  ) : (
                    <View style={[styles.resultPoster, styles.resultPlaceholder]}>
                      <Text style={styles.placeholderText}>{item.title.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                    {item.venue && <Text style={styles.resultVenue} numberOfLines={1}>{item.venue}</Text>}
                    {alreadyListed && (
                      <Text style={styles.resultAlready} numberOfLines={1}>{excludedLabel}</Text>
                    )}
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {[item.city, item.openingDate?.slice(0, 4)].filter(Boolean).join(' · ')}
                      {item.city || item.openingDate ? ' · ' : ''}No critic score
                    </Text>
                  </View>
                  <Text style={styles.liveAdd}>{addingLiveId === item.id ? 'Adding…' : '+ Add'}</Text>
                </Pressable>
              );
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No shows found for {'“'}{query.trim()}{'”'}
            </Text>
            {liveState === 'idle' && (
              <Pressable onPress={runLiveSearch} hitSlop={12} accessibilityRole="button">
                <Text style={styles.liveLink}>Can{'’'}t find it? Search the wider theater catalog</Text>
              </Pressable>
            )}
            {liveState === 'searching' && (
              <Text style={styles.liveStatus}>Searching the wider catalog…</Text>
            )}
            {liveState === 'empty' && (
              <Text style={styles.liveStatus}>
                Not found in the wider catalog either. Try a different spelling.
              </Text>
            )}
            {liveState === 'error' && (
              <>
                <Text style={styles.liveErrorText}>{liveError}</Text>
                <Pressable onPress={runLiveSearch} hitSlop={12} accessibilityRole="button">
                  <Text style={styles.liveLink}>Try again</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  cancelText: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    minWidth: 60,
  },
  headerTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.overlay,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: FontSize.md,
    padding: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyText: {
    color: Colors.text.muted,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  liveLink: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    textAlign: 'center',
    // Text (~18pt) + padding (16) + hitSlop (12×2) clears the 44pt HIG floor.
    paddingVertical: Spacing.sm,
  },
  liveStatus: {
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  liveErrorText: {
    color: Colors.score.red,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  wideHeader: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  liveAdd: {
    color: Colors.brand,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  list: {
    paddingBottom: Spacing.xxl,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  // Dimmed, not hidden — the row still proves the show exists in the catalog.
  resultRowMuted: {
    opacity: 0.55,
  },
  resultAlready: {
    color: Colors.brand,
    fontSize: 12,
    fontWeight: '600',
  },
  resultPoster: {
    width: 44,
    height: 58,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface.overlay,
  },
  resultPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: 18,
    fontWeight: '600',
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    color: Colors.text.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  resultVenue: {
    color: Colors.text.muted,
    fontSize: FontSize.xs,
  },
  resultMeta: {
    color: Colors.text.muted,
    fontSize: 12,
  },
});
