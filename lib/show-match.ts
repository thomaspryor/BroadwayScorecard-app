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
import Fuse, { type IFuseOptions } from 'fuse.js';

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
  /** Audience ratings count from the diary catalog — popularity, used only to
   *  order the "which production did you see?" picker. */
  ratingsCount?: number;
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

/** Scored catalog entries sort ahead of diary-only ones so an exact title that
 *  exists in both resolves to the production with a real show page. */
function scoredFirst(a: MatchCandidate, b: MatchCandidate): number {
  return Number(!!a.diaryOnly) - Number(!!b.diaryOnly);
}

/** Same title, multiple productions: pick the run the user's date falls
 *  inside, else the one that opened closest to it.
 *
 *  Diary-catalog entries carry no closing date, so `distance` treats them as
 *  still running and EVERY diary production that opened before the user's date
 *  ties at 0 — three regional "Cats" would have been settled by catalog order
 *  (ship-check, 2026-08-03). Ties now prefer the most recently opened run,
 *  which is the one a date inside several windows most likely refers to;
 *  input order (scored-catalog-first) remains the final tiebreak. */
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
  const opened = (s: MatchCandidate) => (s.openingDate ? Date.parse(s.openingDate) : -Infinity);
  return [...candidates]
    .map((c, i) => ({ c, i, d: distance(c) }))
    // scoredFirst BEFORE recency: callers pre-sort scored-catalog-first so an
    // exact title present in both catalogs resolves to the production with a
    // real show page. Ranking recency above that sent "Chicago" seen in 2023
    // to a 2019 regional diary entry instead of the Broadway run, at score
    // 1.00 — auto-selected, and written into the user's diary as an unscored
    // row with no show page (ship-check, 2026-08-03).
    .sort((a, b) => a.d - b.d || scoredFirst(a.c, b.c) || opened(b.c) - opened(a.c) || a.i - b.i)
    .map(x => x.c)[0];
}

/** True when dateSeen falls inside this production's run (same 90-day grace as
 *  dateSanity, so previews and a slipped closing notice still count). */
export function runContains(candidate: MatchCandidate, dateSeen?: string | null): boolean {
  if (!dateSeen) return false;
  const seen = Date.parse(dateSeen);
  if (Number.isNaN(seen)) return false;
  if (!candidate.openingDate && !candidate.closingDate) return false;
  return dateSanity(candidate, dateSeen) === 1;
}

/**
 * Order the same-title productions offered by the import screen's "which
 * production did you see?" picker.
 *
 * The rows this exists for are tours: the owner's Mezzanine import flagged
 * seven date mismatches, and every one had dozens-to-hundreds of same-title
 * productions to choose between (379 for "Rent"), of which only the one or two
 * Broadway runs carry dates at all. So a run that actually contains the logged
 * date leads, then productions with a real show page, then the most-rated —
 * which is what puts a well-known tour stop above a community production.
 */
export function rankProductionChoices(
  candidates: MatchCandidate[],
  dateSeen?: string | null,
): MatchCandidate[] {
  return [...candidates]
    .map((c, i) => ({ c, i, contains: runContains(c, dateSeen) ? 0 : 1 }))
    .sort((a, b) =>
      a.contains - b.contains
      || scoredFirst(a.c, b.c)
      || (b.c.ratingsCount ?? 0) - (a.c.ratingsCount ?? 0)
      || a.i - b.i)
    .map(x => x.c);
}

const normVenue = (v: string) =>
  v.toLowerCase().replace(/theatre|theater/gi, '').replace(/^the\s+/, '').trim();


const FUSE_OPTIONS: IFuseOptions<MatchCandidate> = {
  keys: [{ name: 'title', weight: 0.8 }, { name: 'venue', weight: 0.2 }],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

/** Token key length for the fuzzy shortlist index.
 *
 *  Four, not three. A typo inside the first four characters does put the query
 *  in a different bucket from the real show ("Hamliton" → "haml", which holds
 *  Hamlet but not Hamilton) — but that changes nothing the user sees, because
 *  rank() only lets a fuzzy hit clear MATCH_THRESHOLD when one normalized
 *  title CONTAINS the other, and "hamliton" contains neither. Both bucket
 *  widths report it unmatched. Measured on the real 33.7k catalog, three
 *  characters recovered exactly the same titles (798/840 on a fuzzy-path
 *  self-recall sweep) while growing common buckets ~11x, so it was pure cost
 *  (ship-check, 2026-08-03). */
const TOKEN_KEY_LEN = 4;
/** Buckets bigger than this are stop-word-ish ("the", "of") — only consulted
 *  when nothing rarer matched. */
const BIG_BUCKET = 4000;
/** Enough candidates for Fuse to rank well; small enough to score instantly. */
const SHORTLIST_TARGET = 600;

function tokenKeys(norm: string): string[] {
  const seen = new Set<string>();
  for (const token of norm.split(' ')) {
    if (!token) continue;
    seen.add(token.length > TOKEN_KEY_LEN ? token.slice(0, TOKEN_KEY_LEN) : token);
  }
  return [...seen];
}

export class ShowMatcher {
  private readonly pool: MatchCandidate[];
  /** normTitle(pool[i].title), precomputed — the prefix tier used to recompute
   *  all ~34k of them on every call. */
  private readonly norms: string[];
  private readonly byNormTitle: Map<string, MatchCandidate[]>;
  private readonly tokenIndex: Map<string, number[]>;
  /** Built on demand — only rows the shortlist cannot resolve ever pay for it. */
  private fullFuse: Fuse<MatchCandidate> | null = null;

  constructor(pool: MatchCandidate[]) {
    this.pool = pool;
    this.norms = new Array(pool.length);
    this.byNormTitle = new Map();
    this.tokenIndex = new Map();

    for (let i = 0; i < pool.length; i++) {
      const norm = normTitle(pool[i].title);
      this.norms[i] = norm;

      const bucket = this.byNormTitle.get(norm);
      if (bucket) bucket.push(pool[i]);
      else this.byNormTitle.set(norm, [pool[i]]);

      for (const key of tokenKeys(norm)) {
        const list = this.tokenIndex.get(key);
        if (list) list.push(i);
        else this.tokenIndex.set(key, [i]);
      }
    }
    for (const bucket of this.byNormTitle.values()) bucket.sort(scoredFirst);
  }

  get size(): number {
    return this.pool.length;
  }

  /** Every catalog production sharing this exact normalized title, ordered for
   *  the import screen's production picker. Reuses the constructor's title
   *  index, so offering alternatives for a flagged row costs nothing. */
  productionsFor(title: string, dateSeen?: string | null): MatchCandidate[] {
    return rankProductionChoices(this.byNormTitle.get(normTitle(title)) ?? [], dateSeen);
  }

  /**
   * Candidates worth fuzzy-scoring for a query. Running Fuse over the whole
   * merged pool costs ~530ms PER unmatched row on desktop V8 and far more
   * under Hermes — an import with 45 unmatched rows froze the app behind a
   * still-spinning indicator (found in review, 2026-08-03). Fuse cannot
   * short-circuit on `limit`: it scores every record. Shortlisting first keeps
   * the same ranking over a set 50-100x smaller.
   */
  private shortlist(nameNorm: string): MatchCandidate[] {
    const keys = tokenKeys(nameNorm)
      .map(k => ({ k, list: this.tokenIndex.get(k) }))
      .filter((e): e is { k: string; list: number[] } => !!e.list)
      .sort((a, b) => a.list.length - b.list.length);

    const picked = new Set<number>();
    for (const { list } of keys) {
      // Skip stop-word buckets unless they are all we have.
      if (list.length > BIG_BUCKET && picked.size > 0) continue;
      for (const idx of list) {
        picked.add(idx);
        if (picked.size >= SHORTLIST_TARGET) break;
      }
      if (picked.size >= SHORTLIST_TARGET) break;
    }
    const out: MatchCandidate[] = [];
    for (const idx of picked) out.push(this.pool[idx]);
    return out;
  }

  private searchFullPool(title: string) {
    this.fullFuse ??= new Fuse(this.pool, FUSE_OPTIONS);
    return this.fullFuse.search(title, { limit: 5 });
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
      const hits: MatchCandidate[] = [];
      for (let i = 0; i < this.pool.length; i++) {
        const c = this.norms[i];
        if (c.length < 8) continue;
        if (c.startsWith(nameNorm + ' ') || nameNorm.startsWith(c + ' ')) hits.push(this.pool[i]);
      }
      exactAll = hits.sort(scoredFirst);
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

    const rank = (results: { item: MatchCandidate; score?: number }[]): MatchResult | null => {
      if (results.length === 0) return null;
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
    };

    const candidates = this.shortlist(nameNorm);
    if (candidates.length > 0) {
      // A fuzzy hit only clears the bar when one normalized title CONTAINS the
      // other (Fuse runs without includeScore, so every hit reads as 1.0 and
      // the containment penalty is what actually discriminates). Containment
      // implies shared leading tokens, so the shortlist cannot hide one —
      // which is why there is no full-pool retry here: it would cost ~490ms
      // per unmatched row to reach the same answer.
      return rank(new Fuse(candidates, FUSE_OPTIONS).search(title, { limit: 5 }))
        ?? { match: null, score: 0, dateSuspect: false };
    }

    // No bucket matched at all — every token was unknown or stop-word-ish.
    // This is the one case where the shortlist has strictly less information
    // than the full pool, so pay for the full scan rather than guess.
    return rank(this.searchFullPool(title)) ?? { match: null, score: 0, dateSuspect: false };
  }
}

/** True when a match is too weak (or absent) to import automatically. */
export function isWeakMatch(result: Pick<MatchResult, 'match' | 'score' | 'dateSuspect'>): boolean {
  return !result.match || (result.score <= MATCH_THRESHOLD && !result.dateSuspect);
}
