/**
 * Pure Mezzanine JSON export parser (Settings, Export Data, JSON). No React
 * Native or Expo imports so it runs under `node --test`; lib/show-import.ts
 * reads the picked file and hands the text here.
 *
 * Ported from the web's src/lib/show-import.ts acquireFromMezzanine so both
 * platforms accept and reject the same files.
 */
import { sanitizeRating } from './rating';
import type { ImportAcquireResult, RawImportEntry } from './show-import';

/**
 * Shown for any file that isn't a readable Mezzanine export. One fixed string
 * on purpose: JSON.parse's own message quotes a slice of the file ("Unexpected
 * token < in JSON at position 0"), which meant nothing to people who picked
 * the wrong file and must never echo the file's content back.
 */
export const MEZZANINE_FILE_ERROR =
  'That file doesn’t look like a Mezzanine export. In Mezzanine, go to Settings, then Export Data, choose JSON, and pick that file here.';

interface MezzEntry {
  show?: { name?: unknown; id?: unknown };
  rating?: unknown;
  date?: unknown;
  review?: unknown;
  production?: { theater?: { name?: unknown; location?: unknown } };
}

interface MezzExport {
  appVersion?: string;
  data?: {
    diaryEntries?: unknown;
    lists?: unknown;
  };
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function mezzShowIdOf(id: unknown): { mezzShowId?: string } {
  if (typeof id === 'string' && id) return { mezzShowId: id };
  if (typeof id === 'number' && Number.isFinite(id)) return { mezzShowId: String(id) };
  return {};
}

/**
 * @param text  the file's contents
 * @param today the user's local YYYY-MM-DD (localToday()). Not UTC: from about
 *              8pm ET a show planned for tomorrow would otherwise compare
 *              equal to "today" and import as already seen.
 * @throws Error(MEZZANINE_FILE_ERROR) for anything that isn't an export
 */
export function parseMezzanineExport(text: string, today: string): ImportAcquireResult {
  let parsed: MezzExport;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(MEZZANINE_FILE_ERROR);
  }
  const diaryEntries = parsed?.data?.diaryEntries;
  if (!Array.isArray(diaryEntries)) {
    throw new Error(MEZZANINE_FILE_ERROR);
  }

  const entries: RawImportEntry[] = [];
  // A skipped row is counted and told to the user, never dropped silently.
  let skipped = 0;

  for (const entry of diaryEntries as MezzEntry[]) {
    // A hand-edited or partial export can carry entries without a show; skip
    // them instead of failing the whole import on a TypeError.
    const name = entry?.show?.name;
    if (typeof name !== 'string' || !name) { skipped++; continue; }
    // An unreadable date is dropped, never stored or compared: 'garbage'
    // sorts after any real date, so it would file the row as a future plan.
    const day = typeof entry.date === 'string' ? entry.date.split('T')[0] : '';
    const date = isIsoCalendarDate(day) ? day : null;
    const ratingValue = typeof entry.rating === 'string' && entry.rating.trim() ? Number(entry.rating) : entry.rating;
    // Mezzanine ratings are already 1-5 half-star; sanitize defensively.
    const rating = typeof ratingValue === 'number' && Number.isFinite(ratingValue) && ratingValue > 0
      ? sanitizeRating(ratingValue) || null
      : null;
    const hasRating = rating !== null;
    const venue = entry.production?.theater?.name;
    // Unrated future entries are plans, not viewings, so they go to the watchlist.
    const isFuture = date !== null && date > today;
    entries.push({
      title: name,
      venue: typeof venue === 'string' && venue ? venue : null,
      rating,
      sourceScore: null,
      date,
      reviewText: typeof entry.review === 'string' && entry.review ? entry.review : null,
      kind: !hasRating && isFuture ? 'watchlist' : 'diary',
      ...(!hasRating && isFuture ? { listName: 'Upcoming', fromDiary: true } : {}),
      ...mezzShowIdOf(entry.show?.id),
    });
  }

  const lists = parsed.data?.lists;
  for (const list of Array.isArray(lists) ? lists : []) {
    const listName = typeof list?.name === 'string' ? list.name : undefined;
    for (const show of Array.isArray(list?.shows) ? list.shows : []) {
      if (typeof show?.name !== 'string' || !show.name) { skipped++; continue; }
      entries.push({
        title: show.name,
        venue: null,
        rating: null,
        sourceScore: null,
        date: null,
        reviewText: null,
        kind: 'watchlist',
        ...(listName ? { listName } : {}),
        ...mezzShowIdOf(show.id),
      });
    }
  }

  const notices = skipped
    ? [`${skipped} ${skipped === 1 ? 'entry' : 'entries'} in the file had no readable show name and ${skipped === 1 ? 'was' : 'were'} skipped.`]
    : [];
  return { entries, notices };
}
