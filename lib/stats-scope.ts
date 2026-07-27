/**
 * Scope pill model — All time · Seasons · Years (spec §2).
 *
 * Pure functions over the vendored `seasonWindows()`. Nothing here reads state
 * or renders; the pill and every module consume the same `ScopeOption` so a
 * module can never disagree with the pill about which rows it's showing.
 *
 * LABEL COLLISION (spec §2, plan-review design P0): the Browse tab already has
 * a Time-Period filter whose options are Tony ELIGIBILITY windows with labels
 * like "2025-26 Season". Reusing that wording here would make two different
 * date ranges look like the same filter. Season scopes are therefore labelled
 * "Tony season 2025-26" in the pill list and "the 2025-26 Tony season" in
 * module copy — always with the word "Tony", never the bare "2025-26 Season".
 */

import type { DiaryRow, StatsCanon } from '@/lib/stats';
import { seasonWindows, seasonForDate, type SeasonWindow } from '@/lib/stats';

export type ScopeKind = 'all' | 'season' | 'year';

export interface ScopeOption {
  /** Stable identity for state + testIDs: "all", "season:2025-26", "year:2026". */
  id: string;
  kind: ScopeKind;
  /** Pill label. */
  label: string;
  /** Section this option sits under in the picker. */
  section: 'All time' | 'Seasons' | 'Years';
  /** Season label ("2025-26") for season scopes. */
  season?: string;
  year?: number;
  /** Inclusive bounds, "YYYY-MM-DD"; null = unbounded. */
  start: string | null;
  end: string | null;
  /** True for the in-progress season / current calendar year. */
  inProgress: boolean;
}

export const ALL_TIME: ScopeOption = {
  id: 'all',
  kind: 'all',
  label: 'All time',
  section: 'All time',
  start: null,
  end: null,
  inProgress: false,
};

function seasonOption(w: SeasonWindow): ScopeOption {
  return {
    id: `season:${w.label}`,
    kind: 'season',
    // "Tony season" prefix keeps this visually distinct from Browse's
    // eligibility-window labels (see file header).
    label: `Tony season ${w.label}`,
    section: 'Seasons',
    season: w.label,
    start: w.start,
    end: w.end,
    inProgress: w.provisional,
  };
}

function yearOption(year: number, currentYear: number): ScopeOption {
  return {
    id: `year:${year}`,
    kind: 'year',
    label: String(year),
    section: 'Years',
    year,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    inProgress: year === currentYear,
  };
}

export interface BuildScopesOptions {
  /** "YYYY-MM-DD" — defaults to the device's local date. */
  today?: string;
  /** Cap on how many seasons/years to offer, newest first. */
  limit?: number;
}

/** Local calendar date as "YYYY-MM-DD" (never UTC — `date_seen` has no TZ). */
export function localToday(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Build the pill's options: All time, then seasons the diary actually touches
 * (newest first), then calendar years the diary touches (newest first).
 *
 * Only seasons/years with at least one entry are offered — an 80-entry list of
 * empty Tony seasons back to 1947 is not a filter, it's a wall.
 */
export function buildScopes(
  rows: DiaryRow[],
  canon: StatsCanon,
  opts: BuildScopesOptions = {},
): ScopeOption[] {
  const today = opts.today ?? localToday();
  const limit = opts.limit ?? 12;
  const windows = seasonWindows(canon, { today });

  const seasonHits = new Set<string>();
  const yearHits = new Set<number>();
  for (const row of rows) {
    if (!row.date_seen) continue;
    const y = parseInt(row.date_seen.slice(0, 4), 10);
    if (Number.isFinite(y)) yearHits.add(y);
    const w = seasonForDate(windows, row.date_seen);
    if (w) seasonHits.add(w.label);
  }

  // The current season always appears even when empty — it's the default scope
  // and a "This season so far: 0" hero tile is a legitimate answer.
  const current = currentSeasonWindow(windows, today);
  if (current) seasonHits.add(current.label);

  const seasons = windows
    .filter((w) => seasonHits.has(w.label))
    .sort((a, b) => (a.end < b.end ? 1 : -1))
    .slice(0, limit)
    .map(seasonOption);

  const currentYear = parseInt(today.slice(0, 4), 10);
  const years = Array.from(yearHits)
    .sort((a, b) => b - a)
    .slice(0, limit)
    .map((y) => yearOption(y, currentYear));

  return [ALL_TIME, ...seasons, ...years];
}

/** The season `today` falls in — the launch default (spec §2). */
export function currentSeasonWindow(
  windows: SeasonWindow[],
  today: string = localToday(),
): SeasonWindow | null {
  return seasonForDate(windows, today);
}

/**
 * The scope selected on first launch: All time.
 *
 * The spec's season-first default shipped in build 61 and gutted every module
 * for the owner: right after a ceremony the current season is a weeks-old
 * window, so a 107-entry diary opened as "2 of 42 houses", locked taste
 * modules and a 0-of-53 canon. Lifetime is the only default that is always
 * meaningful; the current season is one tap away on the pill's quick toggle.
 */
export function defaultScope(_scopes: ScopeOption[], _rows: DiaryRow[], _today = localToday()): ScopeOption {
  return ALL_TIME;
}

/** Is a plain "YYYY-MM-DD" inside this scope? Undated rows are never in scope. */
export function inScope(scope: ScopeOption, dateSeen: string | null | undefined): boolean {
  if (scope.kind === 'all') return true;
  if (!dateSeen) return false;
  if (scope.start !== null && dateSeen < scope.start) return false;
  if (scope.end !== null && dateSeen > scope.end) return false;
  return true;
}

/**
 * Rows inside a scope.
 *
 * Under All time this returns every row INCLUDING undated ones (they still
 * count toward totals, hours and theaters — spec §7). Under any dated scope
 * undated rows drop out, because they can't be placed on a timeline.
 */
export function filterRows<T extends { date_seen: string | null }>(
  rows: T[],
  scope: ScopeOption,
): T[] {
  if (scope.kind === 'all') return rows;
  return rows.filter((r) => inScope(scope, r.date_seen));
}

/**
 * Label for the fourth hero tile — scope-aware and literal (spec §3.1, GPT
 * review): never mix a season frame and a calendar frame in one tile.
 */
export function periodTileLabel(scope: ScopeOption): string {
  switch (scope.kind) {
    case 'season':
      return scope.inProgress ? 'This season so far' : `${scope.season} season`;
    case 'year':
      return scope.inProgress ? `${scope.year} YTD` : `In ${scope.year}`;
    default:
      // All time has no "period", so the tile answers the next-most-useful
      // question instead of inventing a frame the scope doesn't have.
      return 'Years logged';
  }
}

/** Sentence fragment for module copy: "…in the 2025-26 Tony season". */
export function scopeSuffix(scope: ScopeOption): string {
  switch (scope.kind) {
    case 'season':
      return ` in the ${scope.season} Tony season`;
    case 'year':
      return ` in ${scope.year}`;
    default:
      return '';
  }
}
