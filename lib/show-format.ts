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
