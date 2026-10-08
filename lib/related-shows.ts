/**
 * "Open / Closed Shows You Might Like" on the show detail screen.
 *
 * Primary source: the curated picks the website uses (public/data/related-shows-mobile.json,
 * an LLM re-rank of algorithmic candidates, see Broadwayscore scripts/generate-related-shows.js).
 * Fallback for shows with no picks yet, and to top up a short list: a local ranking that mirrors
 * the web fallback (Broadwayscore src/lib/data-core.ts getRelatedShowsAlgorithmic).
 *
 * History: the first app version sorted by distance to the current show's score. A show in
 * previews has no score, so the reference was 0 and the closed list came back as the
 * lowest-rated shows on Broadway (33, 41, 41, 43...).
 */
import { getQualifiedScore } from './score-utils';
import type { Show } from './types';

/** Closed inventory is large, so only recommend shows critics liked. */
export const CLOSED_MIN_SCORE = 60;
const LIMIT = 6;

export type RelatedPick = { open: string[]; closed: string[] };
export type RelatedPicks = Map<string, RelatedPick>;

const THEMATIC_TAGS = new Set(['comedy', 'drama', 'romantic', 'family', 'historical', 'fantasy', 'thriller', 'biographical']);
const STRUCTURAL_TAGS = new Set(['jukebox', 'immersive', 'one-person-show', 'concert', 'revue']);

const baseTitle = (t: string) => t.toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim();

/** Broadway + Off-Broadway are one market, West End + Off-West End another (matches web getCity). */
function city(category: string): string {
  if (category === 'broadway' || category === 'off-broadway') return 'nyc';
  if (category === 'west-end' || category === 'off-west-end') return 'london';
  return category;
}

const isActive = (s: Show) => s.status === 'open' || s.status === 'previews';
const closedOk = (s: Show) => s.status === 'closed' && (getQualifiedScore(s) ?? CLOSED_MIN_SCORE) >= CLOSED_MIN_SCORE;

/**
 * Decode related-shows-mobile.json: { _v: 1, ids: [...], r: { "<idx>": [[openIdx], [closedIdx]] } }.
 * Anything malformed yields an empty map, so a bad file only means "use the fallback".
 */
export function decodeRelatedPicks(json: string): RelatedPicks {
  const picks: RelatedPicks = new Map();
  try {
    const data = JSON.parse(json);
    if (data?._v !== 1 || !Array.isArray(data.ids) || typeof data.r !== 'object' || !data.r) return picks;
    const ids: string[] = data.ids;
    const lookup = (row: unknown): string[] =>
      Array.isArray(row) ? row.map((i: number) => ids[i]).filter((x): x is string => typeof x === 'string') : [];
    for (const [key, row] of Object.entries(data.r as Record<string, unknown[]>)) {
      const id = ids[Number(key)];
      if (id && Array.isArray(row)) picks.set(id, { open: lookup(row[0]), closed: lookup(row[1]) });
    }
  } catch {
    return new Map();
  }
  return picks;
}

function roleWeight(role: string): number {
  const r = role.toLowerCase();
  if (r === 'director') return 8;
  if (['book', 'playwright', 'composer', 'music', 'lyrics', 'lyricist'].includes(r)) return 7;
  if (r === 'choreographer') return 5;
  return 2;
}

function similarity(show: Show, cand: Show): number {
  let pts = 0;
  const creatives = new Map(show.creativeTeam.map(m => [m.name.toLowerCase(), m.role]));
  for (const m of cand.creativeTeam) if (creatives.has(m.name.toLowerCase())) pts += roleWeight(m.role);
  const tags = new Set(show.tags);
  for (const t of cand.tags) {
    if (!tags.has(t)) continue;
    if (THEMATIC_TAGS.has(t)) pts += 4;
    else if (STRUCTURAL_TAGS.has(t)) pts += 2;
  }
  const year = (s: Show) => (s.openingDate ? new Date(s.openingDate).getFullYear() : 2020);
  const gap = Math.abs(year(show) - year(cand));
  if (gap <= 2) pts += 3;
  else if (gap <= 5) pts += 1;
  // Quality wins ties (0-5 pts) so an untagged/unscored source show still gets good recs.
  pts += Math.max(0, Math.min(5, (getQualifiedScore(cand) ?? 0) / 20));
  return pts;
}

export function getRelatedShows(
  show: Show,
  shows: Show[],
  picks?: RelatedPick | null
): { open: Show[]; closed: Show[] } {
  const own = baseTitle(show.title);
  const myCity = city(show.category);
  const byId = new Map(shows.map(s => [s.id, s]));

  // Local ranking (fallback + top-up): same type and category, with a score.
  const pool = shows.filter(
    s =>
      s.id !== show.id &&
      baseTitle(s.title) !== own &&
      s.type === show.type &&
      s.category === show.category &&
      getQualifiedScore(s) != null
  );
  const rank = (list: Show[]) =>
    list
      .map(s => ({ s, pts: similarity(show, s) }))
      .sort((a, b) => b.pts - a.pts || (getQualifiedScore(b.s) ?? 0) - (getQualifiedScore(a.s) ?? 0))
      .map(x => x.s);

  // Curated picks, resolved to shows. A pick can be stale (show gone, status changed), so the
  // same status/market rules the web applies are re-checked here.
  const curated = (ids: string[] | undefined, ok: (s: Show) => boolean): Show[] =>
    (ids ?? [])
      .map(id => byId.get(id))
      .filter((s): s is Show => !!s && s.id !== show.id && baseTitle(s.title) !== own && city(s.category) === myCity && ok(s));

  // Fill to LIMIT: curated first, then the local ranking, never repeating a show or a title.
  const fill = (first: Show[], fallback: Show[], taken: Set<string>): Show[] => {
    const out: Show[] = [];
    const titles = new Set(taken);
    for (const s of [...first, ...fallback]) {
      if (out.length >= LIMIT) break;
      const t = baseTitle(s.title);
      if (titles.has(t) || out.some(o => o.id === s.id)) continue;
      out.push(s);
      titles.add(t);
    }
    return out;
  };

  const open = fill(curated(picks?.open, isActive), rank(pool.filter(isActive)), new Set());
  // A title already listed as open (e.g. another production of it) is not repeated as closed.
  const openTitles = new Set(open.map(s => baseTitle(s.title)));
  const closed = fill(curated(picks?.closed, closedOk), rank(pool.filter(closedOk)), openTitles);
  return { open, closed };
}
