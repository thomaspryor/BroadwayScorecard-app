/**
 * Mobile app types for Broadway Scorecard.
 *
 * MobileShow matches the abbreviated JSON schema from generate-mobile-data.js
 * in the web project (scripts/generate-mobile-data.js). If the schema changes
 * there, update MobileShow and mapMobileShow() here.
 */

// Expected schema versions
export const EXPECTED_SCHEMA_VERSION = 1;
export const EXPECTED_DETAIL_SCHEMA_VERSION = 1;

/** Raw abbreviated show data from mobile-shows.json */
export interface MobileShow {
  id: string;
  t: string;      // title
  s: string;      // slug
  v: string;      // venue
  st: string;     // status: open | closed | previews | upcoming
  ty: string;     // type: musical | play
  cat?: string;   // category: broadway (default) | off-broadway | west-end
  od?: string;    // openingDate (ISO date)
  cd?: string;    // closingDate (ISO date)
  img?: {
    th?: string;  // thumbnail path
    po?: string;  // poster path
  };
  cs?: number;    // compositeScore (0-100)
  cr?: {
    s: number;    // score
    rc: number;   // reviewCount
    l: string;    // label (Critical Gold, Recommended, etc.)
    t1: number;   // tier1Count
  };
  ag?: {
    g: string;    // grade (A+, B-, etc.)
    l: string;    // label (Loving It, Shrugging, etc.)
    c: string;    // color hex
  };
  tg?: string[];  // tags
  syn?: string;   // synopsis
  ar?: string;    // ageRecommendation
  rv?: boolean;   // isRevival
  rt?: string;    // runtime
  ct?: { n: string; r: string }[];  // creativeTeam [{name, role}]
  tl?: { p: string; u: string }[];  // ticketLinks [{platform, url}]
  ou?: string;    // officialUrl
}

/** Root structure of mobile-shows.json */
export interface MobileDataResponse {
  _v: number;     // schema version
  _ts: string;    // generation timestamp
  shows: MobileShow[];
}

/** Expanded show type for use in components */
export interface Show {
  id: string;
  title: string;
  slug: string;
  venue: string;
  status: string;
  type: string;
  category: string;
  openingDate: string | null;
  closingDate: string | null;
  images: {
    thumbnail: string | null;
    poster: string | null;
  };
  compositeScore: number | null;
  criticScore: {
    score: number;
    reviewCount: number;
    label: string;
    tier1Count: number;
  } | null;
  audienceGrade: {
    grade: string;
    label: string;
    color: string;
  } | null;
  tags: string[];
  synopsis: string | null;
  ageRecommendation: string | null;
  isRevival: boolean;
  runtime: string | null;
  creativeTeam: { name: string; role: string }[];
  ticketLinks: { platform: string; url: string }[];
  officialUrl: string | null;
}

// ===========================================
// PER-SHOW DETAIL (from /data/shows/{id}.json)
// ===========================================

/** Raw abbreviated per-show detail from CDN */
export interface MobileShowDetail {
  _v: number;
  id: string;
  bd?: { positive: number; mixed: number; negative: number };
  rv?: {
    cn: string | null;  // criticName
    o: string;          // outlet display name
    s: number;          // score 0-100
    b: string;          // bucket (Positive/Mixed/Negative)
    t: number;          // tier (1/2/3)
    u?: string;         // url
    d?: string;         // publishDate
    q?: string;         // pullQuote
    dg?: string;        // designation
  }[];
  au?: {
    score: number;
    designation: string | null;
    sources?: {
      ss?: { s: number; c: number };
      mz?: { s: number; c: number; sr?: number | null };
      rd?: { s: number; c: number; tp?: number; sent?: string | null };
    };
  };
  hi?: string;   // hero image path
  ta?: string;   // theater address
  pd?: string;   // previews start date
  ca?: { n: string; r: string }[];  // cast
}

/** Expanded per-show detail for components */
export interface ShowDetail {
  id: string;
  breakdown: { positive: number; mixed: number; negative: number } | null;
  reviews: {
    criticName: string | null;
    outlet: string;
    score: number;
    bucket: string;
    tier: number;
    url: string | null;
    publishDate: string | null;
    pullQuote: string | null;
    designation: string | null;
  }[];
  audience: {
    score: number;
    designation: string | null;
    sources: {
      showScore: { score: number; count: number } | null;
      mezzanine: { score: number; count: number; starRating: number | null } | null;
      reddit: { score: number; count: number; totalPosts: number; sentiment: string | null } | null;
    };
  } | null;
  heroImage: string | null;
  theaterAddress: string | null;
  previewsStartDate: string | null;
  cast: { name: string; role: string }[];
}

/** Convert abbreviated detail to expanded form */
export function mapShowDetail(raw: MobileShowDetail): ShowDetail {
  return {
    id: raw.id,
    breakdown: raw.bd ?? null,
    reviews: (raw.rv ?? []).map(r => ({
      criticName: r.cn ?? null,
      outlet: r.o,
      score: r.s,
      bucket: r.b,
      tier: r.t,
      url: r.u ?? null,
      publishDate: r.d ?? null,
      pullQuote: r.q ?? null,
      designation: r.dg ?? null,
    })),
    audience: raw.au ? {
      score: raw.au.score,
      designation: raw.au.designation ?? null,
      sources: {
        showScore: raw.au.sources?.ss ? { score: raw.au.sources.ss.s, count: raw.au.sources.ss.c } : null,
        mezzanine: raw.au.sources?.mz ? { score: raw.au.sources.mz.s, count: raw.au.sources.mz.c, starRating: raw.au.sources.mz.sr ?? null } : null,
        reddit: raw.au.sources?.rd ? { score: raw.au.sources.rd.s, count: raw.au.sources.rd.c, totalPosts: raw.au.sources.rd.tp ?? 0, sentiment: raw.au.sources.rd.sent ?? null } : null,
      },
    } : null,
    heroImage: raw.hi ?? null,
    theaterAddress: raw.ta ?? null,
    previewsStartDate: raw.pd ?? null,
    cast: (raw.ca ?? []).map(c => ({ name: c.n, role: c.r })),
  };
}

/**
 * Convert abbreviated MobileShow to expanded Show.
 * Gracefully handles missing fields and schema version mismatches.
 */
export function mapMobileShow(raw: MobileShow): Show {
  return {
    id: raw.id,
    title: raw.t ?? 'Unknown Show',
    slug: raw.s ?? '',
    venue: raw.v ?? '',
    status: raw.st ?? 'closed',
    type: raw.ty ?? 'play',
    category: raw.cat ?? 'broadway',
    openingDate: raw.od ?? null,
    closingDate: raw.cd ?? null,
    images: {
      thumbnail: raw.img?.th ?? null,
      poster: raw.img?.po ?? null,
    },
    compositeScore: raw.cs ?? null,
    criticScore: raw.cr
      ? {
          score: raw.cr.s,
          reviewCount: raw.cr.rc,
          label: raw.cr.l,
          tier1Count: raw.cr.t1,
        }
      : null,
    audienceGrade: raw.ag
      ? {
          grade: raw.ag.g,
          label: raw.ag.l,
          color: raw.ag.c,
        }
      : null,
    tags: raw.tg ?? [],
    synopsis: raw.syn ?? null,
    ageRecommendation: raw.ar ?? null,
    isRevival: raw.rv ?? false,
    runtime: raw.rt ?? null,
    creativeTeam: (raw.ct ?? []).map(m => ({ name: m.n, role: m.r })),
    ticketLinks: (raw.tl ?? []).map(l => ({ platform: l.p, url: l.u })),
    officialUrl: raw.ou ?? null,
  };
}
