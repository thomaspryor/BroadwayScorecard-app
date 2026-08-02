/**
 * Real cast/creative-team/synopsis data for the show-below-fold-variants
 * fixture screen, pulled from the web repo's cast-manifest.json + Tony
 * nomination index (task #595) — not fabricated.
 *
 * Regenerate with:
 *   cd ~/Broadwayscore && npx tsx -e "<see task #595 session log>"
 */
import raw from './show-below-fold-fixtures.json';

export type TonyInfo = { nominated: boolean; won: boolean; categories: string[] } | null;

export type CastMember = {
  name: string;
  role: string;
  flags: string[];
  tony: TonyInfo;
};

export type CreativeMember = { name: string; role: string };

export type AudienceSource = { s: number; c: number; sr?: number; tp?: number };

export type ReviewFixture = {
  criticName: string;
  outlet: string;
  score: number;
  bucket: 'Rave' | 'Positive' | 'Mixed' | 'Negative';
  tier: 1 | 2 | 3 | 4;
  url: string | null;
  publishDate: string;
  quote: string;
};

export type TicketLinkFixture = { p: string; u: string };

export type ShowFixture = {
  id: string;
  slug: string;
  title: string;
  category: string;
  type: string;
  venue: string;
  status: string;
  synopsis: string;
  creativeTeam: CreativeMember[];
  currentCast: CastMember[];
  openingNightCast: CastMember[];
  replacements: CastMember[];
  audience: {
    score: number;
    designation: string;
    sources: Record<string, AudienceSource>;
  } | null;
  reviews: ReviewFixture[];
  reviewCount: number;
  criticsTake: { text: string; reviewCount: number };
  ticketLinks: TicketLinkFixture[];
  officialUrl: string;
};

type FixtureFile = { hamilton: ShowFixture; deathOfASalesman: ShowFixture };

export const FIXTURES = raw as unknown as FixtureFile;
