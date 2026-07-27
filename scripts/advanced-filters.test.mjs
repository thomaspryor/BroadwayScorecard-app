// Tests the REAL lib/advanced-filters.ts module (node --experimental-strip-types
// --test scripts/advanced-filters.test.mjs). Type-only imports are stripped, so
// no bundler/alias resolution is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVANCED_FILTER_GROUPS,
  applyAdvancedFilters,
  countActiveSelections,
  toggleSelection,
} from '../lib/advanced-filters.ts';

// Minimal real-shaped shows — predicates only read tags/isRevival/compositeScore.
const show = (id, { tags = [], isRevival = false, compositeScore = null } = {}) =>
  ({ id, tags, isRevival, compositeScore });

const hamilton = show('hamilton', { tags: ['tony-winner', 'rush', 'lottery'], compositeScore: 91 });
const chicago = show('chicago', { tags: ['jukebox'], isRevival: true, compositeScore: 87 });
const flop = show('flop', { tags: ['comedy'], compositeScore: 48 });
const preview = show('preview-show', { tags: ['lottery'], compositeScore: null });
const ALL = [hamilton, chicago, flop, preview];

test('empty selections pass every show through', () => {
  assert.deepEqual(applyAdvancedFilters(ALL, {}), ALL);
  assert.deepEqual(applyAdvancedFilters(ALL, { genre: [] }), ALL);
  assert.equal(countActiveSelections({}), 0);
});

test('OR within a group', () => {
  const result = applyAdvancedFilters(ALL, { genre: ['comedy', 'jukebox'] });
  assert.deepEqual(result.map(s => s.id), ['chicago', 'flop']);
});

test('AND across groups', () => {
  const result = applyAdvancedFilters(ALL, {
    tickets: ['lottery'],
    score_tier: ['critical-gold'],
  });
  assert.deepEqual(result.map(s => s.id), ['hamilton']);
});

test('production group splits on isRevival', () => {
  assert.deepEqual(
    applyAdvancedFilters(ALL, { production: ['revival'] }).map(s => s.id),
    ['chicago'],
  );
  assert.equal(applyAdvancedFilters(ALL, { production: ['original'] }).length, 3);
});

test('null compositeScore never matches a score tier', () => {
  const tiers = ADVANCED_FILTER_GROUPS.find(g => g.key === 'score_tier');
  for (const opt of tiers.options) {
    assert.equal(applyAdvancedFilters([preview], { score_tier: [opt.id] }).length, 0, opt.id);
  }
  assert.deepEqual(
    applyAdvancedFilters(ALL, { score_tier: ['critical-miss'] }).map(s => s.id),
    ['flop'],
  );
});

test('fractional scores round into the tier their badge displays', () => {
  const ragtime = show('ragtime', { compositeScore: 82.94 }); // badge shows 83
  const doubt = show('doubt', { compositeScore: 74.9 });      // badge shows 75
  assert.deepEqual(
    applyAdvancedFilters([ragtime], { score_tier: ['critical-gold'] }).map(s => s.id),
    ['ragtime'],
  );
  assert.deepEqual(
    applyAdvancedFilters([doubt], { score_tier: ['recommended'] }).map(s => s.id),
    ['doubt'],
  );
  // Every fractional score lands in exactly one tier
  const tiers = ADVANCED_FILTER_GROUPS.find(g => g.key === 'score_tier').options;
  for (const sc of [54.4, 54.6, 64.5, 74.49, 82.5, 99.9]) {
    const matches = tiers.filter(t => applyAdvancedFilters([show('x', { compositeScore: sc })], { score_tier: [t.id] }).length);
    assert.equal(matches.length, 1, `score ${sc}`);
  }
});

test('toggleSelection adds, removes, and is pure', () => {
  const s1 = toggleSelection({}, 'genre', 'comedy');
  assert.deepEqual(s1, { genre: ['comedy'] });
  const s2 = toggleSelection(s1, 'genre', 'drama');
  assert.deepEqual(s2.genre, ['comedy', 'drama']);
  const s3 = toggleSelection(s2, 'genre', 'comedy');
  assert.deepEqual(s3.genre, ['drama']);
  assert.deepEqual(s1, { genre: ['comedy'] }); // inputs not mutated
  // Two toggles composed functionally both land (rapid-tap scenario)
  let state = {};
  for (const id of ['lottery', 'rush']) state = toggleSelection(state, 'tickets', id);
  assert.equal(countActiveSelections(state), 2);
});

test('every group option id is unique within its group', () => {
  for (const group of ADVANCED_FILTER_GROUPS) {
    const ids = group.options.map(o => o.id);
    assert.equal(new Set(ids).size, ids.length, group.key);
  }
});
