/**
 * Pure show/market category logic — no React Native imports, so it can be
 * required directly from `node --test` without JSX/RN transforms.
 * MarketPicker.tsx re-exports everything here for existing callers.
 */

export type Market = 'nyc' | 'london';

/** Filter shows by market selection (includes off-broadway for NYC) */
export function filterByMarket(category: string, market: Market): boolean {
  if (market === 'nyc') {
    return category === 'broadway' || category === 'off-broadway';
  }
  return category === 'west-end' || category === 'off-west-end';
}

/**
 * Which market a show's category belongs to. Same mapping filterByMarket uses,
 * stated positively so callers can ask "where is this show?" rather than
 * "does it pass my filter?". Off-West-End counts as London (owner directive
 * 2026-08-02).
 */
export function marketForCategory(category?: string): Market | null {
  if (category === 'broadway' || category === 'off-broadway') return 'nyc';
  if (category === 'west-end' || category === 'off-west-end') return 'london';
  return null;
}

/**
 * City label to show when a show sits OUTSIDE the user's current market.
 * Returns null for in-market shows (no chip) and for categories with no home
 * market (regional) — labeling those "NYC"/"London" would be wrong.
 */
export function outOfMarketCity(category: string | undefined, market: Market): string | null {
  const home = marketForCategory(category);
  if (!home || home === market) return null;
  return home === 'london' ? 'London' : 'NYC';
}

/** Filter by market with off-broadway/off-west-end control.
 * NYC: includeOB=false → Broadway only. includeOB=true → Off-Broadway only (swap, not additive).
 * London: includeOB=false → West End only. includeOB=true → West End AND Off-West-End (additive) —
 * see BRO-139 acceptance criteria. */
export function filterByMarketCategory(category: string, market: Market, includeOB: boolean): boolean {
  if (market === 'nyc') {
    return includeOB ? category === 'off-broadway' : category === 'broadway';
  }
  return includeOB ? category === 'west-end' || category === 'off-west-end' : category === 'west-end';
}
