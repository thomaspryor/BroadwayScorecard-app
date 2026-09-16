// BRO-2819: the overnight beta-feedback job redid the same work every night
// because nothing checked whether the previous night's branch was still
// unmerged. Covers the guard that stops a fresh run from starting while the
// most recent feedback-overnight-* branch has not landed on origin/main.
//
// Run: node --test tests/unit/overnight-skip-when-prior-unmerged.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Isolated from the real ~/.claude/broadwayscore-feedback/ -- must be set
// before overnight.js (and the ledger.js/themes.js it requires) load, since
// ledger.HOME is computed once at require time.
process.env.BSC_FEEDBACK_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'overnight-unlanded-test-home-'));

const require = createRequire(import.meta.url);
const {
  OVERNIGHT_BRANCH_PREFIX, mostRecentOvernightBranch, priorNightUnlandedBranch,
} = require('../../scripts/feedback/overnight.js');

test('mostRecentOvernightBranch picks the latest by timestamp, not insertion order', () => {
  const branches = [
    `${OVERNIGHT_BRANCH_PREFIX}2026-08-09T06-15-01`,
    `${OVERNIGHT_BRANCH_PREFIX}2026-09-04T06-15-04`,
    `${OVERNIGHT_BRANCH_PREFIX}2026-08-31T06-15-03`,
  ];
  assert.equal(mostRecentOvernightBranch(branches), `${OVERNIGHT_BRANCH_PREFIX}2026-09-04T06-15-04`);
});

test('mostRecentOvernightBranch returns null when there are no overnight branches', () => {
  assert.equal(mostRecentOvernightBranch([]), null);
});

// This is the core of BRO-2819: the job must not begin fresh work when the
// previous night's branch head is not an ancestor of the default branch.
test('priorNightUnlandedBranch blocks when the most recent branch has not landed', () => {
  const branches = [
    `${OVERNIGHT_BRANCH_PREFIX}2026-08-31T06-15-03`,
    `${OVERNIGHT_BRANCH_PREFIX}2026-09-04T06-15-04`,
  ];
  const isAncestor = () => false; // git merge-base --is-ancestor said no
  assert.equal(priorNightUnlandedBranch(branches, isAncestor), `${OVERNIGHT_BRANCH_PREFIX}2026-09-04T06-15-04`);
});

test('priorNightUnlandedBranch allows a fresh run once the most recent branch has landed', () => {
  const branches = [
    `${OVERNIGHT_BRANCH_PREFIX}2026-08-31T06-15-03`,
    `${OVERNIGHT_BRANCH_PREFIX}2026-09-04T06-15-04`,
  ];
  const isAncestor = () => true; // git merge-base --is-ancestor said yes
  assert.equal(priorNightUnlandedBranch(branches, isAncestor), null);
});

test('priorNightUnlandedBranch allows a fresh run when there is no prior branch at all', () => {
  assert.equal(priorNightUnlandedBranch([], () => { throw new Error('must not be called'); }), null);
});

// Regression for the exact bug: `git log main..branch` prints nothing both
// when the branch landed and when it is genuinely empty, so a caller that
// mistakenly wired that up instead of merge-base --is-ancestor would treat an
// empty-but-unmerged branch as "nothing to land" and proceed. isAncestor here
// stands in for merge-base and must be consulted, not bypassed.
test('priorNightUnlandedBranch only checks the single most recent branch, not every unmerged one', () => {
  const branches = [
    `${OVERNIGHT_BRANCH_PREFIX}2026-08-09T06-15-01`, // older, also unlanded, must be ignored
    `${OVERNIGHT_BRANCH_PREFIX}2026-09-04T06-15-04`, // most recent, landed
  ];
  let calls = 0;
  const isAncestor = (branch) => {
    calls += 1;
    return branch === `${OVERNIGHT_BRANCH_PREFIX}2026-09-04T06-15-04`;
  };
  assert.equal(priorNightUnlandedBranch(branches, isAncestor), null);
  assert.equal(calls, 1, 'only the most recent branch should be checked');
});
