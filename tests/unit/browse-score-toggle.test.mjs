// Run with: node --test tests/unit/browse-score-toggle.test.mjs
//
// BRO-270: the Browse tab's CRITICS/AUDIENCE ScoreToggle overlapped the
// status-filter pill row (a stray letter peeked out from behind the
// toggle) because RN's horizontal ScrollView doesn't respect flexShrink
// the way a plain View does — filterGroupMaxWidth replaces that shrink
// negotiation with an explicit cap so the row can never be wide enough
// to reach the toggle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterGroupMaxWidth,
  SCORE_TOGGLE_WIDTH,
  STATUS_ROW_HORIZONTAL_PADDING,
  STATUS_ROW_GAP,
} from '../../lib/browse-score-toggle.ts';

// iPhone SE .. iPhone 17 Pro Max, plus an iPad-ish width.
const WIDTHS = [320, 360, 375, 390, 393, 402, 428, 430, 440, 476, 744];

test('filterGroup max width never overlaps the ScoreToggle', () => {
  for (const width of WIDTHS) {
    const maxWidth = filterGroupMaxWidth(width);
    const used = maxWidth + STATUS_ROW_GAP + SCORE_TOGGLE_WIDTH + STATUS_ROW_HORIZONTAL_PADDING;
    assert.ok(
      used <= width,
      `w=${width}: filterGroup (${maxWidth}) + gap + toggle would overflow by ${used - width}pt`,
    );
  }
});

test('360px width (the reported overlap width) leaves positive room for the pill row', () => {
  assert.ok(filterGroupMaxWidth(360) > 0);
});

test('wider screens give the pill row more room', () => {
  assert.ok(filterGroupMaxWidth(430) > filterGroupMaxWidth(360));
});

test('degenerate/very narrow widths clamp to 0 rather than going negative', () => {
  assert.equal(filterGroupMaxWidth(0), 0);
  assert.equal(filterGroupMaxWidth(100), 0);
});

test('accepts a live-measured ScoreToggle width in place of the fallback constant', () => {
  const measured = 150; // e.g. a narrower locale where "AUDIENCE" renders smaller
  const maxWidth = filterGroupMaxWidth(360, measured);
  const used = maxWidth + STATUS_ROW_GAP + measured + STATUS_ROW_HORIZONTAL_PADDING;
  assert.ok(used <= 360);
  assert.ok(maxWidth > filterGroupMaxWidth(360, SCORE_TOGGLE_WIDTH));
});
