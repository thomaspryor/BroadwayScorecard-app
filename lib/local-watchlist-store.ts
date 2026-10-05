/**
 * AsyncStorage side of the signed-out watchlist (pure rules: lib/local-watchlist.ts).
 *
 * One module-level copy shared by every bookmark on screen, like
 * hooks/useWatchlist.ts's shared state: the first read loads storage, every
 * write updates memory first and then persists. A failed read or write keeps
 * the in-memory list, so a save still shows as saved for the life of the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addEntry,
  parseLocalWatchlist,
  parsePromptedAt,
  removeEntry,
  type LocalWatchlistEntry,
} from './local-watchlist';

const LIST_KEY = '@bsc:local_watchlist';
const PROMPTED_KEY = '@bsc:local_watchlist_prompted_at';

type Listener = (list: LocalWatchlistEntry[]) => void;
const listeners = new Set<Listener>();
let current: LocalWatchlistEntry[] = [];
let promptedAt: number | null = null;
let loading: Promise<void> | null = null;

function emit() {
  listeners.forEach(fn => fn(current));
}

/** Load once; later calls reuse the same promise. Writes wait for it so a slow read can't overwrite them. */
export function loadLocalWatchlist(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.multiGet([LIST_KEY, PROMPTED_KEY])
      .then(([[, rawList], [, rawPrompted]]) => {
        current = parseLocalWatchlist(rawList);
        promptedAt = parsePromptedAt(rawPrompted);
        emit();
      })
      .catch(() => {});
  }
  return loading;
}

export function getLocalWatchlist(): LocalWatchlistEntry[] {
  return current;
}

export function subscribeLocalWatchlist(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function write(next: LocalWatchlistEntry[]): Promise<LocalWatchlistEntry[]> {
  current = next;
  emit();
  try {
    if (next.length === 0) await AsyncStorage.removeItem(LIST_KEY);
    else await AsyncStorage.setItem(LIST_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: the save lives in memory until the app closes
  }
  return next;
}

export async function addLocalShow(showId: string): Promise<LocalWatchlistEntry[]> {
  await loadLocalWatchlist();
  return write(addEntry(current, showId, Date.now()));
}

export async function removeLocalShow(showId: string): Promise<LocalWatchlistEntry[]> {
  await loadLocalWatchlist();
  return write(removeEntry(current, showId));
}

export function getLastPromptedAt(): number | null {
  return promptedAt;
}

export function markPrompted(now: number = Date.now()): void {
  promptedAt = now;
  AsyncStorage.setItem(PROMPTED_KEY, String(now)).catch(() => {});
}
