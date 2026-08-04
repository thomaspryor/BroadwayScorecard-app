/**
 * Test fixture for the import preview's per-row production picker — renders
 * the SHIPPING EntryRow/ProductionPicker with local state (no auth, no
 * Supabase, no 7.5MB catalog fetch).
 *
 * DEV ONLY — returns null in production builds.
 *
 * Usage (deep link or Expo Go URL bar):
 *   /test/import-picker-fixture?state=closed    — flagged rows, picker shut
 *   /test/import-picker-fixture?state=open      — picker open on the tour row
 *   /test/import-picker-fixture?state=long      — 40 offers: filter + "Show all"
 *   /test/import-picker-fixture?state=searching
 *   /test/import-picker-fixture?state=error
 *   /test/import-picker-fixture?state=empty
 *   /test/import-picker-fixture?state=fixup     — the post-import "Still to fix" round
 *
 * Row data is copied from the owner's real 2026-08-03 Mezzanine import and the
 * real catalog entries those rows matched (verified in tests/unit).
 */
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, FontSize } from '@/constants/theme';
import { EntryRow, type MatchedEntry, type PickerCandidate, type ResolveState } from '../import';

type FixtureState = 'closed' | 'open' | 'long' | 'searching' | 'error' | 'empty' | 'fixup';

const entry = (over: Partial<MatchedEntry>): MatchedEntry => ({
  sourceTitle: 'Untitled',
  sourceRating: null,
  sourceScore: null,
  sourceDate: null,
  sourceVenue: null,
  sourceReview: null,
  match: null,
  matchScore: 0,
  selected: false,
  dateSuspect: false,
  alreadyOwned: false,
  kind: 'diary',
  ...over,
});

const SEED: MatchedEntry[] = [
  // The owner's row whose own data is self-contradictory: Stage 42's run ended
  // 2022-11-20, six months before the logged date.
  entry({
    sourceTitle: 'Kinky Boots',
    sourceRating: 4.5,
    sourceDate: '2023-05-22',
    sourceVenue: 'Stage 42',
    dateSuspect: true,
    matchScore: 0.4,
    match: {
      id: 'kinky-boots-off-broadway-2022', title: 'Kinky Boots', slug: 'kinky-boots-off-broadway',
      venue: 'Stage 42', category: 'off-broadway', openingDate: '2022-08-25', closingDate: '2022-11-20',
    },
  }),
  // The tour case — six of the owner's seven look like this.
  entry({
    sourceTitle: 'The Color Purple',
    sourceRating: 4,
    sourceDate: '2018-05-18',
    dateSuspect: true,
    matchScore: 0.4,
    match: {
      id: 'the-color-purple-2015', title: 'The Color Purple', slug: 'the-color-purple',
      venue: 'Bernard B. Jacobs Theatre', category: 'broadway', openingDate: '2015-12-10', closingDate: '2017-01-08',
    },
  }),
  // Matched to a production that opens a year AFTER the logged date.
  entry({
    sourceTitle: 'Rent',
    sourceRating: 4,
    sourceDate: '2025-06-14',
    dateSuspect: true,
    matchScore: 0.4,
    match: {
      id: 'rent-off-broadway-2026', title: 'Rent', slug: 'rent-off-broadway',
      venue: 'A.R.T./New York Theatres - Mezzanine Theatre', category: 'off-broadway',
      openingDate: '2026-06-04', closingDate: null, city: 'New York', diaryOnly: true,
    },
  }),
  // No match at all — the "Find it" variant of the same affordance.
  entry({ sourceTitle: 'Some Fringe Thing I Saw', sourceRating: 3, sourceDate: '2024-09-02', sourceVenue: 'The Cellar' }),
];

const catalogOffer = (id: string, venue: string, over: Record<string, unknown> = {}): PickerCandidate => ({
  source: 'catalog',
  show: {
    id, title: 'The Color Purple', slug: id, venue, category: 'us-regional',
    openingDate: null, closingDate: null, diaryOnly: true, ratingsCount: 1, ...over,
  },
});

const SHORT_OFFERS: PickerCandidate[] = [
  catalogOffer('the-color-purple-2005', 'Broadway Theatre', {
    category: 'broadway', openingDate: '2005-12-01', closingDate: '2008-02-24', diaryOnly: false, ratingsCount: 0,
  }),
  catalogOffer('purple-fort-wayne', 'Embassy Theater', { city: 'Fort Wayne' }),
  catalogOffer('purple-des-moines', 'Des Moines Civic Center', { city: 'Des Moines' }),
  catalogOffer('purple-kennedy', 'Kennedy Center - Eisenhower Theater', { city: 'Washington' }),
  catalogOffer('purple-fox-atl', 'Fox Theatre', { city: 'Atlanta' }),
  catalogOffer('purple-akron', 'EJ Thomas Hall', { city: 'Akron' }),
  catalogOffer('purple-pittsburgh', 'Benedum Center', { city: 'Pittsburgh' }),
];

const CITIES = ['Atlanta', 'Boston', 'Chicago', 'Denver', 'Fresno', 'Houston', 'Omaha', 'Tempe'];
const LONG_OFFERS: PickerCandidate[] = Array.from({ length: 40 }, (_, i) =>
  catalogOffer(`purple-tour-${i}`, `Touring Venue ${i + 1}`, { city: CITIES[i % CITIES.length] }),
);

function stateFor(mode: FixtureState): Record<number, ResolveState> {
  if (mode === 'open') return { 1: { status: 'results', candidates: SHORT_OFFERS, expanded: false, filter: '' } };
  if (mode === 'long') return { 1: { status: 'results', candidates: LONG_OFFERS, expanded: false, filter: '' } };
  if (mode === 'searching') return { 1: { status: 'searching' } };
  if (mode === 'empty') return { 1: { status: 'empty' } };
  if (mode === 'error') return { 1: { status: 'error', message: "Can't reach the wider catalog right now." } };
  return {};
}

export default function ImportPickerFixture() {
  const { state } = useLocalSearchParams<{ state?: FixtureState }>();
  const mode: FixtureState = state ?? 'closed';

  const [entries, setEntries] = useState<MatchedEntry[]>(SEED);
  const [picked, setPicked] = useState<string | null>(null);

  const [resolve, setResolve] = useState<Record<number, ResolveState>>(() => stateFor(mode));
  // Re-deep-linking the SAME route does not remount, so a ?state= change has
  // to be picked up here or every capture shows whichever state loaded first.
  // Adjusted during render (React's documented derive-from-props pattern)
  // rather than in an effect, which would cascade renders.
  const [lastMode, setLastMode] = useState(mode);
  if (mode !== lastMode) {
    setLastMode(mode);
    setResolve(stateFor(mode));
    setEntries(SEED);
    setPicked(null);
  }

  const onFind = useCallback((idx: number) => {
    setResolve(prev => ({ ...prev, [idx]: { status: 'results', candidates: SHORT_OFFERS, expanded: false, filter: '' } }));
  }, []);

  const onUpdate = useCallback((idx: number, patch: Partial<Extract<ResolveState, { status: 'results' }>>) => {
    setResolve(prev => {
      const cur = prev[idx];
      if (cur?.status !== 'results') return prev;
      return { ...prev, [idx]: { ...cur, ...patch } };
    });
  }, []);

  const onPick = useCallback((idx: number, choice: PickerCandidate) => {
    const show = choice.source === 'catalog' ? choice.show : null;
    if (!show) return;
    setPicked(`${show.title} — ${show.venue}`);
    setEntries(prev => prev.map((e, i) => i === idx
      ? { ...e, match: show, matchScore: 1, selected: true, dateSuspect: false }
      : e));
    setResolve(prev => { const next = { ...prev }; delete next[idx]; return next; });
  }, []);

  if (!__DEV__) return null;

  const fixup = mode === 'fixup';
  const readyCount = entries.filter(e => e.selected && e.match).length;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {fixup && (
        <View style={{ alignItems: 'center', gap: 6, marginBottom: 24 }}>
          <Text style={{ fontSize: 40 }}>🎉</Text>
          <Text style={styles.doneTitle}>102 shows imported</Text>
        </View>
      )}
      <Text style={styles.heading}>
        {fixup
          ? `Still to fix — ${entries.length} shows`
          : `Not selected — date mismatch (${entries.filter(e => e.dateSuspect).length})`}
      </Text>
      <Text style={styles.hint}>
        {fixup
          ? "These didn't import: we either couldn't find the show, or the production we found wasn't running on the date you logged. Find the one you actually saw — the right theatre, city and year — then import them."
          : 'The date you logged falls outside this production\u2019s run — you may have seen a different production (a tour or revival) of the same title. Tap \u201cFind the production I saw\u201d to pick the right one, or tick to import into the matched production anyway.'}
      </Text>
      {entries.map((e, idx) => (
        <EntryRow
          key={idx}
          entry={e}
          onToggle={() => setEntries(prev => prev.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x))}
          resolve={resolve[idx]}
          onFind={() => onFind(idx)}
          onPick={choice => onPick(idx, choice)}
          onUpdateResolve={patch => onUpdate(idx, patch)}
        />
      ))}
      {fixup && (
        <Text style={styles.hint}>
          Can&apos;t find one? Leave it — we log every unmatched title and keep adding productions,
          so re-running this import later will pick them up.
        </Text>
      )}
      {picked && <Text style={styles.picked}>picked → {picked}</Text>}
    </ScrollView>
    {fixup && readyCount > 0 && (
      <View style={styles.footer}>
        <View style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Import {readyCount} Fixed Show{readyCount === 1 ? '' : 's'}</Text>
        </View>
      </View>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface.default },
  content: { padding: Spacing.lg, paddingTop: Spacing.xxl },
  heading: {
    color: Colors.score.amber, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  hint: { color: Colors.text.muted, fontSize: FontSize.xs, marginBottom: Spacing.sm, lineHeight: 16 },
  picked: { color: Colors.score.green, fontSize: FontSize.sm, marginTop: Spacing.lg },
  doneTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  footer: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xl,
    borderTopWidth: 1, borderTopColor: Colors.border.subtle, backgroundColor: Colors.surface.default,
  },
  primaryBtn: {
    backgroundColor: Colors.brand, borderRadius: 10, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: Colors.text.inverse, fontSize: FontSize.md, fontWeight: '700' },
});
