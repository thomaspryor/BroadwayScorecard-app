/**
 * Fallback formatting for diary/list/watchlist entries whose show_id isn't in
 * the current mobile catalog (imports, seasonal drops). Used instead of
 * rendering the raw id string, which read as a broken/dead row.
 */

/** Turn a raw show_id slug into a readable title-ish fallback, e.g.
 * "hamilton-2015" -> "Hamilton 2015". */
export function humanizeShowId(showId: string): string {
  return showId
    .split('-')
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Cached detail for a show_id that exists only in the diary catalog
 *  (diary-search.json) — enough to render app/diary-show/[id].tsx without
 *  ever fetching the 7.5MB catalog on tap. */
export interface DiaryShowMeta {
  title: string;
  venue: string | null;
  city: string | null;
  category: string | null;
  openingDate: string | null;
}

/**
 * Detail for show_ids that exist only in the diary catalog, recorded when an
 * import matches one. Without it a diary-only import renders as "Sleep No
 * More Off Broadway 2011" — the humanized id — on every screen. Hydrated once
 * at app start from AsyncStorage (see lib/diary-titles.ts).
 */
let diaryShowMeta: Record<string, DiaryShowMeta> = {};

export function setDiaryTitleCache(entries: Record<string, DiaryShowMeta>): void {
  diaryShowMeta = entries;
}

export function mergeDiaryTitleCache(entries: Record<string, DiaryShowMeta>): Record<string, DiaryShowMeta> {
  diaryShowMeta = { ...diaryShowMeta, ...entries };
  return diaryShowMeta;
}

export function getDiaryTitleCache(): Record<string, DiaryShowMeta> {
  return diaryShowMeta;
}

/** Best available title for a show_id the scored catalog doesn't know about:
 *  the recorded diary title if we have it, otherwise the humanized id. */
export function showTitleFallback(showId: string): string {
  return diaryShowMeta[showId]?.title || humanizeShowId(showId);
}

/** Cached venue/city/category/opening-date for a diary-only show_id, or null
 *  when nothing was ever recorded (e.g. added before this cache existed). */
export function getDiaryShowMeta(showId: string): DiaryShowMeta | null {
  return diaryShowMeta[showId] || null;
}
