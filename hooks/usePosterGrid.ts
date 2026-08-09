/**
 * Screen-width-derived poster grid metrics. See lib/poster-grid.ts for why the
 * widths are computed rather than expressed as percentages.
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  posterCardWidth,
  POSTER_GRID_GAP,
  POSTER_GRID_ROW_GAP,
  POSTER_GRID_PADDING,
  type PosterGrid,
} from '@/lib/poster-grid';

export function usePosterGrid(columns: number): PosterGrid {
  const { width } = useWindowDimensions();
  // Capture rig: EXPO_PUBLIC_GRID_COLS overrides every poster grid's column
  // count so density variants can be screenshotted. Dev only; unset in prod.
  const envCols = Number(process.env.EXPO_PUBLIC_GRID_COLS);
  const cols = Number.isInteger(envCols) && envCols > 0 ? envCols : columns;
  return useMemo(
    () => ({
      cardWidth: posterCardWidth(width, cols),
      gap: POSTER_GRID_GAP,
      rowGap: POSTER_GRID_ROW_GAP,
      horizontalPadding: POSTER_GRID_PADDING,
      columns: cols,
    }),
    [width, cols],
  );
}
