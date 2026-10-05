/**
 * Signed-out watchlist ("save first, ask later"), pure helpers. Ported from the
 * web's src/lib/local-watchlist.ts (BRO-4616) for BRO-4727.
 *
 * A signed-out bookmark tap used to open the sign-in sheet before anything was
 * saved, and on Home, Browse and the show hero the tapped show was lost after
 * signing in. Now the show is saved on this phone right away and sign-in is
 * offered as the way to keep it. lib/local-watchlist-store.ts holds the
 * AsyncStorage side; hooks/useLocalWatchlistMigration.ts moves these into the
 * account on the next sign-in.
 *
 * Kept free of React Native imports so tests/unit can load it directly.
 */

/** The sign-in sheet appears right after this many local saves (the save happens first)… */
export const PROMPT_AT_COUNT = 1;
/** …and not again for this long after it was shown. */
export const PROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
/** Bound the list so a runaway loop can't fill storage. */
export const MAX_LOCAL_SHOWS = 200;

export interface LocalWatchlistEntry {
  showId: string;
  savedAt: number;
}

/** Parse whatever is in storage; anything malformed counts as empty. */
export function parseLocalWatchlist(raw: string | null): LocalWatchlistEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: LocalWatchlistEntry[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== 'object') continue;
      const { showId, savedAt } = e as Record<string, unknown>;
      if (typeof showId !== 'string' || !showId || seen.has(showId)) continue;
      seen.add(showId);
      out.push({ showId, savedAt: typeof savedAt === 'number' ? savedAt : 0 });
    }
    return out;
  } catch {
    return [];
  }
}

/** Newest first; re-adding an existing show is a no-op. */
export function addEntry(list: LocalWatchlistEntry[], showId: string, now: number): LocalWatchlistEntry[] {
  if (list.some(e => e.showId === showId)) return list;
  return [{ showId, savedAt: now }, ...list].slice(0, MAX_LOCAL_SHOWS);
}

export function removeEntry(list: LocalWatchlistEntry[], showId: string): LocalWatchlistEntry[] {
  return list.filter(e => e.showId !== showId);
}

/**
 * Should this local save open the sign-in sheet (instead of only a toast)?
 * Yes on reaching PROMPT_AT_COUNT saved shows, unless the sheet was shown
 * within the cooldown. The save always happens first; the sheet follows it.
 */
export function shouldPromptAfterSave(count: number, lastPromptedAt: number | null, now: number): boolean {
  if (count < PROMPT_AT_COUNT) return false;
  if (lastPromptedAt !== null && now - lastPromptedAt < PROMPT_COOLDOWN_MS) return false;
  return true;
}

/** Shows to copy into the account: local ones the account doesn't have yet, oldest first. */
export function showsToMigrate(local: LocalWatchlistEntry[], accountShowIds: Iterable<string>): string[] {
  const have = new Set(accountShowIds);
  return [...local].reverse().map(e => e.showId).filter(id => !have.has(id));
}

/** Parse the stored prompt timestamp; anything not a positive number is "never". */
export function parsePromptedAt(raw: string | null): number | null {
  const v = Number(raw);
  return raw !== null && Number.isFinite(v) && v > 0 ? v : null;
}
