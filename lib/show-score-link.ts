/**
 * The Show Score page to open from a show's audience tile.
 *
 * The web build ships the real per-show page as `au.sources.ss.u`. The app used
 * to guess `show-score.com/show/<title-slug>`, which 404s for every show
 * (BRO-4821), so never build a URL from the title here. Returns null when the
 * feed carries no usable link (older cached JSON, or an unmatched show); the
 * tile then renders without a tap target.
 */
export function showScoreLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.hostname !== 'www.show-score.com' && u.hostname !== 'show-score.com') return null;
  // A bare host or section root has nothing to show; require a page segment.
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return raw;
}
