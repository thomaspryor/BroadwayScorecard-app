/**
 * Title/date matching for the My Shows import flow.
 *
 * Extracted from app/import.tsx so it can be unit-tested against the real
 * catalogs (tests/unit/show-match.test.mjs) instead of only in a simulator.
 * Behaviour mirrors the web's src/app/my-shows/ImportShows.tsx matchShow —
 * that implementation is the reference the owner measures the app against
 * ("the iOS imports don't work as well as, and are inconsistent with, the web
 * imports", 2026-08-02).
 */
import Fuse from 'fuse.js';

/** The subset of a show the matcher needs. Both the scored catalog (lib/types
 *  Show) and diary-search.json entries adapt to this. */
export interface MatchCandidate {
  id: string;
  title: string;
  slug: string;
  venue: string | null;
  category: string;
  openingDate: string | null;
  closingDate: string | null;
  /** Diary-catalog city, for regional/international productions. */
  city?: string | null;
  /** True for diary-only (unscored) catalog entries. */
  diaryOnly?: boolean;
}

export interface MatchResult {
  match: MatchCandidate | null;
  score: number;
  dateSuspect: boolean;
}

/** Rows at or below this score are shown as "not on Broadway Scorecard"
 *  rather than auto-selected. Same bar as the web. */
export const MATCH_THRESHOLD = 0.7;

const COMBINING_MARKS_RE = /[̀-ͯ]/g;
const SMART_APOSTROPHE_RE = /[‘’‚′']/g;
const SMART_QUOTE_RE = /[“”„″"]/g;

/** Normalize a title for comparison: fancy quotes/dashes → plain, & → and,
 *  accents folded, strip punctuation, collapse whitespace. Accents must fold
 *  BEFORE the [^a-z0-9]+ strip or 'La Bohème' becomes 'la boh me'. */
export function normTitle(t: string): string {
  return String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .replace(SMART_APOSTROPHE_RE, '')
    .replace(SMART_QUOTE_RE, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Downgrade a match whose production can't have been running when the user
 *  saw it (90-day grace on both ends; no closing date = never demoted). */
export function dateSanity(candidate: MatchCandidate, dateSeen?: string | null): number {
  if (!dateSeen) return 1;
  const seen = Date.parse(dateSeen);
  if (Number.isNaN(seen)) return 1;
  const GRACE = 90 * 24 * 3600 * 1000;
  if (candidate.openingDate && seen < Date.parse(candidate.openingDate) - GRACE) return 0.4;
  if (candidate.closingDate && seen > Date.parse(candidate.closingDate) + GRACE) return 0.4;
  return 1;
}

/** Same title, multiple productions: pick the run the user's date falls
 *  inside, else the one that opened closest to it. Ties keep input order,
 *  which callers set scored-catalog-first. */
export function closestRun(candidates: MatchCandidate[], dateSeen?: string | null): MatchCandidate {
  if (!dateSeen || candidates.length < 2) return candidates[0];
  const seen = Date.parse(dateSeen);
  if (Number.isNaN(seen)) return candidates[0];
  const distance = (s: MatchCandidate) => {
    if (!s.openingDate) return 10 * 365 * 24 * 3600 * 1000;
    const od = Date.parse(s.openingDate);
    const cd = s.closingDate ? Date.parse(s.closingDate) : Number.POSITIVE_INFINITY;
    if (seen >= od && seen <= cd) return 0;
    return Math.min(Math.abs(seen - od), Number.isFinite(cd) ? Math.abs(seen - cd) : Number.MAX_SAFE_INTEGER);
  };
  return [...candidates]
    .map((c, i) => ({ c, i, d: distance(c) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(x => x.c)[0];
}

const normVenue = (v: string) =>
  v.toLowerCase().replace(/theatre|theater/gi, '').replace(/^the\s+/, '').trim();

/** Scored catalog entries sort ahead of diary-only ones so an exact title that
 *  exists in both resolves to the production with a real show page. */
function scoredFirst(a: MatchCandidate, b: MatchCandidate): number {
  return Number(!!a.diaryOnly) - Number(!!b.diaryOnly);
}

export class ShowMatcher {
  private readonly pool: MatchCandidate[];
  private readonly byNormTitle: Map<string, MatchCandidate[]>;
  private readonly fuse: Fuse<MatchCandidate>;

  constructor(pool: MatchCandidate[]) {
    this.pool = pool;
    this.byNormTitle = new Map();
    for (const s of pool) {
      const key = normTitle(s.title);
      const bucket = this.byNormTitle.get(key);
      if (bucket) bucket.push(s);
      else this.byNormTitle.set(key, [s]);
    }
    for (const bucket of this.byNormTitle.values()) bucket.sort(scoredFirst);
    this.fuse = new Fuse(pool, {
      keys: [{ name: 'title', weight: 0.8 }, { name: 'venue', weight: 0.2 }],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  get size(): number {
    return this.pool.length;
  }

  match(title: string, venue: string | null, dateSeen: string | null): MatchResult {
    const nameNorm = normTitle(title);
    const withSanity = (match: MatchCandidate, raw: number): MatchResult => {
      const sane = dateSanity(match, dateSeen);
      return { match, score: raw * sane, dateSuspect: sane < 1 && raw > MATCH_THRESHOLD };
    };

    let exactAll = this.byNormTitle.get(nameNorm) ?? [];
    let tierScore = 1;
    if (exactAll.length === 0 && nameNorm.length >= 8) {
      // Prefix tier: "Cabaret at the Kit Kat Club" ↔ "Cabaret".
      exactAll = this.pool
        .filter(s => {
          const c = normTitle(s.title);
          if (c.length < 8) return false;
          return c.startsWith(nameNorm + ' ') || nameNorm.startsWith(c + ' ');
        })
        .sort(scoredFirst);
      tierScore = 0.85;
    }

    if (exactAll.length > 0) {
      if (venue) {
        const venueNorm = normVenue(venue);
        const venueMatch = exactAll.find(s => {
          if (!s.venue) return false;
          const cand = normVenue(s.venue);
          return venueNorm.length < 5 || cand.length < 5 ? cand === venueNorm : cand.includes(venueNorm);
        });
        if (venueMatch) return withSanity(venueMatch, tierScore);
        return withSanity(closestRun(exactAll, dateSeen), tierScore * 0.95);
      }
      return withSanity(closestRun(exactAll, dateSeen), tierScore);
    }

    const results = this.fuse.search(title, { limit: 5 });
    if (results.length === 0) return { match: null, score: 0, dateSuspect: false };

    if (venue) {
      const venueNorm = venue.toLowerCase().replace(/theatre|theater/gi, '').trim();
      const venueMatch = results.find(
        r => r.item.venue && r.item.venue.toLowerCase().replace(/theatre|theater/gi, '').trim().includes(venueNorm),
      );
      if (venueMatch) return withSanity(venueMatch.item, 1 - (venueMatch.score || 0));
    }

    const best = results[0];
    const score = 1 - (best.score || 0);
    const matchNorm = normTitle(best.item.title);
    const contained = nameNorm.includes(matchNorm) || matchNorm.includes(nameNorm);
    return withSanity(best.item, contained ? score : score * 0.6);
  }
}

/** True when a match is too weak (or absent) to import automatically. */
export function isWeakMatch(result: Pick<MatchResult, 'match' | 'score' | 'dateSuspect'>): boolean {
  return !result.match || (result.score <= MATCH_THRESHOLD && !result.dateSuspect);
}
