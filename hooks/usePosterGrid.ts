/**
 * Screen-width-derived poster grid metrics. See lib/poster-grid.ts for why the
 * widths are computed rather than expressed as percentages.
 */
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  posterCardWidth,
  POSTER_GRID_GAP,
  POSTER_GRID_PADDING,
  type PosterGrid,
} from '@/lib/poster-grid';

export function usePosterGrid(columns: number): PosterGrid {
  const { width } = useWindowDimensions();
  return useMemo(
    () => ({
      cardWidth: posterCardWidth(width, columns),
      gap: POSTER_GRID_GAP,
      horizontalPadding: POSTER_GRID_PADDING,
      columns,
    }),
    [width, columns],
  );
}
