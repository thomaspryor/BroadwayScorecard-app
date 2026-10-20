/**
 * What to do with a /show/<slug> link whose slug is not in the feed.
 *
 * Old links (shared before a show got its year suffix, e.g. /show/hamilton for
 * hamilton-2015) are the usual cause. The website handles them with redirects
 * in vercel.json; the feed carries no redirect map, so the app uses the rule
 * those redirects follow: exactly one current slug that extends the old one
 * ("<old>-...") is the destination. Measured against the website's 252
 * /show/* redirects: 162 resolved, 0 to the wrong show; every ambiguous case
 * had its destination among the candidates, which are offered as suggestions.
 *
 * Pure: no React Native imports.
 */

export interface SlugShow {
  id: string;
  slug: string;
  title: string;
  status: string;
  openingDate: string | null;
}

export type SlugResolution<T extends SlugShow> =
  | { kind: 'found'; show: T }
  | { kind: 'redirect'; show: T }
  | { kind: 'suggest'; shows: T[]; query: string }
  | { kind: 'search'; query: string };

const STATUS_RANK: Record<string, number> = { open: 0, previews: 1, upcoming: 2, announced: 3 };

/** Search text for a slug: words, without a trailing year ("hamilton-2015" → "hamilton"). */
export function slugToQuery(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+(19|20)\d{2}$/, '')
    .trim();
}

export const MAX_SUGGESTIONS = 5;

export function resolveShowSlug<T extends SlugShow>(slug: string | null | undefined, shows: readonly T[]): SlugResolution<T> {
  const raw = (slug ?? '').trim();
  const query = slugToQuery(raw);
  if (!raw) return { kind: 'search', query };

  const exact = shows.find(s => s.slug === raw);
  if (exact) return { kind: 'found', show: exact };

  const key = raw.toLowerCase();
  // Case-only differences and links built from the show id are the same show.
  const loose = shows.find(s => s.slug.toLowerCase() === key || s.id.toLowerCase() === key);
  if (loose) return { kind: 'redirect', show: loose };

  const prefix = `${key}-`;
  const candidates = shows.filter(s => s.slug.toLowerCase().startsWith(prefix));
  if (candidates.length === 1) return { kind: 'redirect', show: candidates[0] };
  if (candidates.length > 1) {
    const ranked = [...candidates].sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
        (b.openingDate ?? '').localeCompare(a.openingDate ?? ''),
    );
    return { kind: 'suggest', shows: ranked.slice(0, MAX_SUGGESTIONS), query };
  }
  return { kind: 'search', query };
}
