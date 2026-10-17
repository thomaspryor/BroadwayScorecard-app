/**
 * Human label for a production's market category — the "Other Productions"
 * subtitle on the show page and the market line on the rate screen.
 *
 * Pure (no React Native / alias imports) so it runs under plain `node --test`.
 * Before BRO-4254 the show page labeled every category that was not
 * west-end/off-broadway as "Broadway", so a national tour or a regional
 * production read as a Broadway run.
 */
const PRODUCTION_MARKET_LABELS: Record<string, string> = {
  broadway: 'Broadway',
  'off-broadway': 'Off-Broadway',
  'west-end': 'West End',
  'off-west-end': 'Off-West End',
  tour: 'National Tour',
  regional: 'Regional',
};

/**
 * Returns the label for a known category, or null for a missing/unknown one
 * (callers omit the label rather than guess a market).
 */
export function getProductionMarketLabel(category?: string | null): string | null {
  if (!category) return null;
  return Object.prototype.hasOwnProperty.call(PRODUCTION_MARKET_LABELS, category)
    ? PRODUCTION_MARKET_LABELS[category]
    : null;
}
