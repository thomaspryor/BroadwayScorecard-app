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

/**
 * Real titles for show_ids that exist only in the diary catalog
 * (diary-search.json), recorded when an import matches one. Without it a
 * diary-only import renders as "Sleep No More Off Broadway 2011" — the
 * humanized id — on every screen. Hydrated once at app start from
 * AsyncStorage (see lib/diary-titles.ts).
 */
let diaryTitles: Record<string, string> = {};

export function setDiaryTitleCache(titles: Record<string, string>): void {
  diaryTitles = titles;
}

export function mergeDiaryTitleCache(titles: Record<string, string>): Record<string, string> {
  diaryTitles = { ...diaryTitles, ...titles };
  return diaryTitles;
}

export function getDiaryTitleCache(): Record<string, string> {
  return diaryTitles;
}

/** Best available title for a show_id the scored catalog doesn't know about:
 *  the recorded diary title if we have it, otherwise the humanized id. */
export function showTitleFallback(showId: string): string {
  return diaryTitles[showId] || humanizeShowId(showId);
}
