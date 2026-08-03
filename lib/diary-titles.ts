/**
 * Persistence for the diary-only title cache (see lib/show-format.ts).
 *
 * Imports can now match productions that live only in diary-search.json, whose
 * ids the scored catalog will never resolve. Recording the title at import
 * time is what keeps those rows readable in Watched / To Watch / Lists / Stats
 * without every screen downloading a 7.5MB catalog.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeDiaryTitleCache, setDiaryTitleCache } from './show-format';

const KEY = 'diary-show-titles-v1';
/** Plenty for a lifetime of imports; bounded so the entry can't grow forever. */
const MAX_ENTRIES = 5000;

/** Load the persisted map into the in-memory cache. Safe to call more than
 *  once; failures are non-fatal (titles just fall back to the humanized id). */
export async function hydrateDiaryTitles(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      setDiaryTitleCache(parsed as Record<string, string>);
    }
  } catch {
    // Corrupt or unavailable storage — keep the empty cache.
  }
}

/** Merge newly-resolved titles into memory and persist. */
export async function recordDiaryTitles(titles: Record<string, string>): Promise<void> {
  const entries = Object.entries(titles).filter(([id, title]) => id && title);
  if (entries.length === 0) return;
  const merged = mergeDiaryTitleCache(Object.fromEntries(entries));
  try {
    const keys = Object.keys(merged);
    const trimmed = keys.length > MAX_ENTRIES
      ? Object.fromEntries(keys.slice(keys.length - MAX_ENTRIES).map(k => [k, merged[k]]))
      : merged;
    await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Best effort — the in-memory cache still helps this session.
  }
}
