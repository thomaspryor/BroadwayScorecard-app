/**
 * Poster-grid column math (pure — no react-native import, so
 * tests/unit/poster-grid.test.mjs can load it under --experimental-strip-types).
 * The hook wrapper lives in hooks/usePosterGrid.ts.
 *
 * Percentage card widths ('31%' / '23%') never divide the row evenly: three
 * 31% cards plus two 8pt gaps leave ~13pt stranded on the right, so the grid
 * reads as "right gap bigger than left" (beta feedback 2026-08-02, AKGsYTnH).
 * Deriving the width from the real screen width removes the residue by
 * construction — every column is identical and the row ends exactly where the
 * container's padding says it should.
 *
 * Widths land on a half-point so the columns can never sum to MORE than the
 * container (which would wrap the last card onto its own row).
 */
import { Spacing } from '@/constants/theme';

// Gutter between poster columns. Widened from Spacing.sm 2026-08-09 (beta
// feedback APv8Zqbv: the tiles on the diary grid and the To Watch grid "need
// some more space in between them. They're too crowded"). Rows get more still,
// because each poster carries a two-line title underneath that ran straight
// into the next row's artwork.
export const POSTER_GRID_GAP = Spacing.md;
export const POSTER_GRID_ROW_GAP = Spacing.lg;
export const POSTER_GRID_PADDING = Spacing.lg;

export function posterCardWidth(
  screenWidth: number,
  columns: number,
  gap: number = POSTER_GRID_GAP,
  horizontalPadding: number = POSTER_GRID_PADDING,
): number {
  if (columns < 1) return 0;
  const inner = screenWidth - horizontalPadding * 2 - gap * (columns - 1);
  if (inner <= 0) return 0;
  return Math.floor((inner / columns) * 2) / 2;
}

export interface PosterGrid {
  /** Exact per-card width in points. */
  cardWidth: number;
  /** Column gutter — the one the card width is derived from. */
  gap: number;
  /** Row gutter. Larger than the column gutter: titles sit under the posters. */
  rowGap: number;
  horizontalPadding: number;
  columns: number;
}
