/**
 * Persistence for the diary-only title cache (see lib/show-format.ts).
 *
 * Imports can now match productions that live only in diary-search.json, whose
 * ids the scored catalog will never resolve. Recording the title at import
 * time is what keeps those rows readable in Watched / To Watch / Lists / Stats
 * without every screen downloading a 7.5MB catalog.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeDiaryTitleCache, setDiaryTitleCache, type DiaryShowMeta } from './show-format';

/** v2: values are DiaryShowMeta objects. Deliberately a NEW key, not a
 *  migrated v1 — v1 stored plain title strings, and every read of v1 was
 *  cast straight to a string (showTitleFallback, etc). Writing objects into
 *  v1 would mean a TestFlight rollback to a pre-this-change build reads an
 *  object where it expects a string and renders "[object Object]" across
 *  Watched/To Watch/Lists. Keeping v1 untouched (read-only, below) makes
 *  that rollback path safe. */
const KEY = 'diary-show-meta-v2';
const LEGACY_KEY = 'diary-show-titles-v1';
/** Plenty for a lifetime of imports; bounded so the entry can't grow forever. */
const MAX_ENTRIES = 5000;

function normalizeEntries(parsed: unknown): Record<string, DiaryShowMeta> {
  const normalized: Record<string, DiaryShowMeta> = {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return normalized;
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') {
      normalized[id] = { title: value, venue: null, city: null, category: null, openingDate: null };
    } else if (value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string') {
      const v = value as Partial<DiaryShowMeta> & { title: string };
      normalized[id] = {
        title: v.title,
        venue: v.venue ?? null,
        city: v.city ?? null,
        category: v.category ?? null,
        openingDate: v.openingDate ?? null,
      };
    }
  }
  return normalized;
}

/** Load the persisted map into the in-memory cache. Safe to call more than
 *  once; failures are non-fatal (titles just fall back to the humanized id).
 *  Falls back to the legacy v1 (title-only strings) once, on installs that
 *  recorded diary titles before venue/city/category/openingDate existed —
 *  read-only, never written back to v1 (see KEY comment above). */
export async function hydrateDiaryTitles(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      setDiaryTitleCache(normalizeEntries(JSON.parse(raw)));
      return;
    }
    const legacyRaw = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacyRaw) setDiaryTitleCache(normalizeEntries(JSON.parse(legacyRaw)));
  } catch {
    // Corrupt or unavailable storage — keep the empty cache.
  }
}

/** Merge newly-resolved show details into memory and persist. */
export async function recordDiaryTitles(entries: Record<string, DiaryShowMeta>): Promise<void> {
  const filtered = Object.entries(entries).filter(([id, meta]) => id && meta?.title);
  if (filtered.length === 0) return;
  const merged = mergeDiaryTitleCache(Object.fromEntries(filtered));
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
