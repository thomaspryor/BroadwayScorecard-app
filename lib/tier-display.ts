/**
 * Outlet tier copy for the review list's tier chips (BRO-4881).
 *
 * Mirrors the website's src/config/tier-display.ts (Broadwayscore repo); the
 * weights mirror TIER_WEIGHTS in src/config/scoring.ts there. Keep the two in
 * step: the web side has a test that every example outlet sits in its tier.
 */
export type OutletTier = 1 | 2 | 3 | 4;

interface TierDisplay {
  title: string;
  weight: number;
  relative: string;
  examplesNyc: string;
  examplesLondon: string;
}

export const TIER_DISPLAY: Record<OutletTier, TierDisplay> = {
  1: {
    title: 'Anchor outlet',
    weight: 1.0,
    relative: 'Counts in full.',
    examplesNyc: 'The New York Times, Vulture, Variety, The Hollywood Reporter, WSJ, The New Yorker.',
    examplesLondon: 'The Guardian, The Times, The Telegraph, Evening Standard, The Stage, Time Out London.',
  },
  2: {
    title: 'Major outlet',
    weight: 0.75,
    relative: 'Counts ¾ as much as a Tier 1 review.',
    examplesNyc: 'TheaterMania, New York Stage Review, BroadwayWorld, New York Theatre Guide, Daily News, NY Post.',
    examplesLondon: 'WhatsOnStage, London Theatre, The Reviews Hub, The Arts Desk.',
  },
  3: {
    title: 'General coverage',
    weight: 0.4,
    relative: 'Counts 40% as much as a Tier 1 review.',
    examplesNyc: 'Smaller theater outlets and established single-critic sites.',
    examplesLondon: 'Smaller theater outlets and established single-critic sites.',
  },
  4: {
    title: 'Independent blog',
    weight: 0.2,
    relative: 'Counts 20% as much as a Tier 1 review.',
    examplesNyc: "Single-author blogs we haven't verified yet.",
    examplesLondon: "Single-author blogs we haven't verified yet.",
  },
};

export const TIERS: OutletTier[] = [1, 2, 3, 4];

/** Narrow the data's numeric tier; anything unexpected gets no chip. */
export function asOutletTier(t: unknown): OutletTier | null {
  return t === 1 || t === 2 || t === 3 || t === 4 ? t : null;
}

export function isLondonCategory(category?: string): boolean {
  return category === 'west-end' || category === 'off-west-end';
}

/**
 * Opera shows weight every outlet equally (the web engine flattens tiers), so
 * a chip on every row would say nothing. Same rule as the website show page.
 */
export function showsTierChips(showType?: string): boolean {
  return showType !== 'opera';
}

/** Title, weight and explanation for one review's tier sheet. */
export function tierExplanation(
  tier: OutletTier,
  opts: { london: boolean; isTopCritic?: boolean; criticName?: string | null },
): { title: string; weight: number; relative: string; detail: string } {
  const info = TIER_DISPLAY[tier];
  const promoted = tier === 1 && !!opts.isTopCritic;
  return {
    title: promoted ? 'Top critic' : info.title,
    weight: info.weight,
    relative: info.relative,
    detail: promoted
      ? `${opts.criticName || 'This critic'} is one of a small group of critics whose reviews count in full wherever they are published.`
      : (opts.london ? info.examplesLondon : info.examplesNyc),
  };
}
