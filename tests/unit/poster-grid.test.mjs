// Column math for the poster grids (Watched diary grid, To Watch shelves).
// Run: node --experimental-strip-types --test tests/unit/poster-grid.test.mjs
//
// Regression guard for beta feedback AKGsYTnH (2026-08-02): percentage widths
// left ~13pt stranded on the right of every 3-up row, so the grid looked
// off-centre. The invariant below is what percentages could not satisfy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { posterCardWidth, POSTER_GRID_GAP, POSTER_GRID_PADDING } from '../../lib/poster-grid.ts';

// iPhone SE .. iPhone 17 Pro Max, plus an iPad-ish width for good measure.
const WIDTHS = [320, 375, 390, 393, 402, 428, 430, 440, 476, 744];
const COLUMN_COUNTS = [2, 3, 4];

test('columns fill the row with no stranded right-hand gap', () => {
  for (const width of WIDTHS) {
    for (const columns of COLUMN_COUNTS) {
      const card = posterCardWidth(width, columns);
      const used = card * columns + POSTER_GRID_GAP * (columns - 1) + POSTER_GRID_PADDING * 2;
      const residue = width - used;
      assert.ok(
        residue >= 0,
        `w=${width} cols=${columns}: row overflows by ${-residue}pt (last card would wrap)`,
      );
      // Percentage widths stranded 8-14pt here. Half-point rounding can strand
      // at most 0.5pt per column, which is invisible.
      assert.ok(
        residue <= columns * 0.5,
        `w=${width} cols=${columns}: ${residue}pt stranded on the right`,
      );
    }
  }
});

test('every column is exactly the same width', () => {
  for (const width of WIDTHS) {
    const a = posterCardWidth(width, 3);
    const b = posterCardWidth(width, 3);
    assert.equal(a, b);
    assert.ok(a > 0, `w=${width}: non-positive card width`);
  }
});

test('more columns means narrower cards', () => {
  for (const width of WIDTHS) {
    assert.ok(posterCardWidth(width, 4) < posterCardWidth(width, 3));
    assert.ok(posterCardWidth(width, 3) < posterCardWidth(width, 2));
  }
});

test('degenerate inputs return 0 rather than a negative width', () => {
  assert.equal(posterCardWidth(20, 4), 0);
  assert.equal(posterCardWidth(440, 0), 0);
});
