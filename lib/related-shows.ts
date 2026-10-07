/**
 * "Open / Closed Shows You Might Like" on the show detail screen.
 *
 * Mirrors the web fallback (Broadwayscore src/lib/data-core.ts getRelatedShowsAlgorithmic).
 * The old inline version sorted by score distance to the current show, and an unscored show
 * (previews, no reviews yet) used 0 as its reference, so the "closed" list came back as the
 * lowest-rated shows on Broadway (33, 41, 41, 43...). Ranking is now: creative-team overlap,
 * tag overlap, era, then critic score, and the closed pool drops anything critics disliked.
 */
import { getQualifiedScore } from './score-utils';
import type { Show } from './types';

/** Closed inventory is large, so only recommend shows critics liked. */
export const CLOSED_MIN_SCORE = 60;
const LIMIT = 6;

const THEMATIC_TAGS = new Set(['comedy', 'drama', 'romantic', 'family', 'historical', 'fantasy', 'thriller', 'biographical']);
const STRUCTURAL_TAGS = new Set(['jukebox', 'immersive', 'one-person-show', 'concert', 'revue']);

const baseTitle = (t: string) => t.toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim();

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

export function getRelatedShows(show: Show, shows: Show[]): { open: Show[]; closed: Show[] } {
  const own = baseTitle(show.title);
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

  const open = rank(pool.filter(s => s.status === 'open' || s.status === 'previews')).slice(0, LIMIT);
  // A show already listed as open (e.g. another production of the same title) is not repeated as closed.
  const openTitles = new Set(open.map(s => baseTitle(s.title)));
  const closed = rank(
    pool.filter(s => s.status === 'closed' && (getQualifiedScore(s) ?? 0) >= CLOSED_MIN_SCORE && !openTitles.has(baseTitle(s.title)))
  ).slice(0, LIMIT);
  return { open, closed };
}
