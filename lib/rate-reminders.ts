/**
 * Pure helpers for the "How was <show>?" planned-date reminders
 * (lib/local-notifications.ts schedules them). No React Native imports, so
 * tests/unit/rate-reminders.test.mjs can load it.
 */
import { showTitleFallback } from './show-format';

interface TitledShow {
  id: string;
  title: string;
}

/**
 * The title a reminder should name. No caller of updatePlannedDate passed a
 * title, and the hook only scheduled when one was given, so planned-date
 * reminders were never scheduled at all. The hook now resolves it from the
 * loaded show list, falling back to the recorded diary title / humanized id.
 */
export function resolveShowTitle(
  showId: string,
  shows: readonly TitledShow[],
  explicitTitle?: string | null,
): string {
  const given = (explicitTitle ?? '').trim();
  if (given) return given;
  return shows.find(s => s.id === showId)?.title || showTitleFallback(showId);
}

/** Same rule as resolveShowTitle, indexed once for rescheduling many entries. */
export function makeShowTitleLookup(shows: readonly TitledShow[]): (showId: string) => string {
  const byId = new Map(shows.map(s => [s.id, s.title] as const));
  return showId => byId.get(showId) || showTitleFallback(showId);
}

export interface PlannedEntry {
  show_id: string;
  planned_date: string | null;
}

/** Read a cached watchlist (@bsc:watchlist:{userId}) into reminder inputs;
 *  anything malformed reads as no entries. */
export function parseCachedWatchlist(raw: string | null | undefined): PlannedEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: PlannedEntry[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const { show_id, planned_date } = row as { show_id?: unknown; planned_date?: unknown };
    if (typeof show_id !== 'string' || !show_id) continue;
    out.push({ show_id, planned_date: typeof planned_date === 'string' ? planned_date : null });
  }
  return out;
}
