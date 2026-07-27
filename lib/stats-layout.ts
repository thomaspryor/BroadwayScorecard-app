/**
 * Stats screen layout variant.
 *
 * Two options were rendered from THIS code (per app CLAUDE.md "Design
 * Proposals" — proposals must be captured from the real product, never mocked)
 * and screenshotted at two device sizes for the owner review gate:
 *
 *   'ledger'  — faithful polish. Every module is a standard raised card in a
 *               single column, 2×2 hero tile grid, houses as a 3-across chip
 *               grid. Reads as the existing app with a new tab.
 *   'marquee' — bolder LAYOUT (colors/type identical): the hero collapses to
 *               one full-bleed headline number with a 3-across secondary strip,
 *               module rules replace card chrome, and the house checklist goes
 *               to a dense 6-across grid with the completion ring inline in the
 *               header.
 *
 * Bold is layout/IA only — both variants use identical tokens, identical system
 * font, identical brand gold. A screenshot of either must be indistinguishable
 * in font + colour from the rest of the app (spec §9, owner priority 3).
 *
 * Override for capture: EXPO_PUBLIC_STATS_LAYOUT=marquee (inlined at bundle
 * time by Expo, same mechanism as EXPO_PUBLIC_DEV_AUTO_SIGNIN).
 */

export type StatsLayout = 'ledger' | 'marquee';

/** Committed default = the recommended option (see the screenshot manifest). */
export const DEFAULT_STATS_LAYOUT: StatsLayout = 'ledger';

export const STATS_LAYOUT: StatsLayout =
  process.env.EXPO_PUBLIC_STATS_LAYOUT === 'marquee' ? 'marquee' : DEFAULT_STATS_LAYOUT;
