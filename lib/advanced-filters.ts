/**
 * Advanced filter groups for the Browse tab — mobile mirror of the web's
 * Advanced Filter panel (src/components/filters/filter-ui-config.ts).
 *
 * Semantics match web: multi-select OR within a group, AND across groups.
 * Groups the mobile payload can't support (award nominees, Drama Desk) are
 * omitted — tags on mobile-shows.json only carry winner flags.
 */

import type { Show } from '@/lib/types';
import { getQualifiedScore } from '@/lib/score-utils';

export type FilterPredicate = (show: Show) => boolean;

export interface AdvancedFilterOption {
  id: string;
  label: string;
  predicate: FilterPredicate;
}

export interface AdvancedFilterGroup {
  key: string;
  label: string;
  options: AdvancedFilterOption[];
}

/** Selected option ids per group key. Missing/empty array = group inactive. */
export type AdvancedSelections = Record<string, string[]>;

const hasTag = (tag: string): FilterPredicate =>
  (s) => s.tags.includes(tag);

// Round before bucketing: compositeScore is fractional for most shows and the
// displayed badge is the rounded value — a raw 82.94 must land in the 83+ tier
// it displays as, not fall between closed ranges.
const inScoreRange = (min: number, max: number): FilterPredicate =>
  (s) => {
    // Min-review-gated: a show whose badge renders "—" must not match a
    // score-tier filter (getQualifiedScore, beta feedback 2026-08-01).
    const score = getQualifiedScore(s);
    if (score === null) return false;
    const rounded = Math.round(score);
    return rounded >= min && rounded <= max;
  };

export const ADVANCED_FILTER_GROUPS: AdvancedFilterGroup[] = [
  {
    key: 'production',
    label: 'Production',
    options: [
      { id: 'original', label: 'Original', predicate: (s) => !s.isRevival },
      { id: 'revival', label: 'Revival', predicate: (s) => s.isRevival },
    ],
  },
  {
    key: 'score_tier',
    label: 'Score tier',
    options: [
      { id: 'critical-gold', label: 'Critical Gold (83+)', predicate: inScoreRange(83, 100) },
      { id: 'recommended', label: 'Recommended (75–82)', predicate: inScoreRange(75, 82) },
      { id: 'worth-seeing', label: 'Worth Seeing (65–74)', predicate: inScoreRange(65, 74) },
      { id: 'skippable', label: 'Mixed (55–64)', predicate: inScoreRange(55, 64) },
      { id: 'critical-miss', label: 'Critical Miss (<55)', predicate: inScoreRange(0, 54) },
    ],
  },
  {
    key: 'awards',
    label: 'Awards',
    options: [
      { id: 'tony-winner', label: 'Tony winner', predicate: hasTag('tony-winner') },
      { id: 'olivier-winner', label: 'Olivier winner', predicate: hasTag('olivier-winner') },
      { id: 'nyt-pick', label: "NYT Critic's Pick", predicate: hasTag('nyt-pick') },
    ],
  },
  {
    key: 'genre',
    label: 'Genre & format',
    options: [
      { id: 'comedy', label: 'Comedy', predicate: hasTag('comedy') },
      { id: 'drama', label: 'Drama', predicate: hasTag('drama') },
      { id: 'jukebox', label: 'Jukebox', predicate: hasTag('jukebox') },
      { id: 'family', label: 'Family-friendly', predicate: hasTag('family') },
      { id: 'based-on-book', label: 'Based on book', predicate: hasTag('based-on-book') },
      { id: 'based-on-true-story', label: 'True story', predicate: hasTag('based-on-true-story') },
      { id: 'film-adaptation', label: 'Film adaptation', predicate: hasTag('film-adaptation') },
    ],
  },
  {
    key: 'tickets',
    label: 'Tickets & access',
    options: [
      { id: 'lottery', label: 'Has lottery', predicate: hasTag('lottery') },
      { id: 'rush', label: 'Has rush', predicate: hasTag('rush') },
    ],
  },
];

/**
 * Toggle one option in a selections map (pure — safe for functional
 * setState, so rapid consecutive taps can't clobber each other).
 */
export function toggleSelection(
  prev: AdvancedSelections,
  groupKey: string,
  optionId: string,
): AdvancedSelections {
  const current = prev[groupKey] ?? [];
  const next = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
  return { ...prev, [groupKey]: next };
}

/** Total selected option count across all groups (badge on the Filters pill). */
export function countActiveSelections(selections: AdvancedSelections): number {
  return Object.values(selections).reduce((n, ids) => n + (ids?.length ?? 0), 0);
}

/**
 * Apply advanced selections to a show list.
 * OR within a group, AND across groups (web parity: usePanelFilters).
 */
export function applyAdvancedFilters(shows: Show[], selections: AdvancedSelections): Show[] {
  const activeGroups = ADVANCED_FILTER_GROUPS
    .map((group) => ({
      group,
      selected: group.options.filter((o) => selections[group.key]?.includes(o.id)),
    }))
    .filter((g) => g.selected.length > 0);

  if (activeGroups.length === 0) return shows;

  return shows.filter((show) =>
    activeGroups.every(({ selected }) => selected.some((opt) => opt.predicate(show))),
  );
}
