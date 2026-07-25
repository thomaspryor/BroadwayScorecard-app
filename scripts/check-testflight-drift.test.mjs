// Tests the real decide()/isUserVisible from check-testflight-drift.js (rule 15:
// never copy logic into tests). Run: node --test scripts/check-testflight-drift.test.mjs
// CI: first step of the gate job in .github/workflows/eas-build.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decide, isUserVisible } = require('./check-testflight-drift.js');

const NOW = Date.parse('2026-07-25T00:00:00Z');
const fin = (over = {}) => ({
  buildProfile: 'production',
  status: 'FINISHED',
  appBuildVersion: '56',
  gitCommitHash: 'abc123def456',
  createdAt: '2026-07-24T04:00:00Z',
  ...over,
});

test('in-flight production build → wait', () => {
  const r = decide({ builds: [{ buildProfile: 'production', status: 'IN_PROGRESS', appBuildVersion: '57' }, fin()], changedFiles: ['app/x.tsx'], nowMs: NOW });
  assert.equal(r.shouldBuild, false);
  assert.match(r.reason, /IN_PROGRESS/);
});

test('in-flight development build does NOT block', () => {
  const r = decide({ builds: [{ buildProfile: 'development', status: 'IN_PROGRESS' }, fin()], changedFiles: ['app/x.tsx'], nowMs: NOW });
  assert.equal(r.shouldBuild, true);
});

test('no FINISHED production build → build (baseline missing)', () => {
  const r = decide({ builds: [{ buildProfile: 'production', status: 'ERRORED' }], changedFiles: [], nowMs: NOW });
  assert.equal(r.shouldBuild, true);
});

test('user-visible drift → build', () => {
  const r = decide({ builds: [fin()], changedFiles: ['components/BookmarkOverlay.tsx', 'CLAUDE.md'], nowMs: NOW });
  assert.equal(r.shouldBuild, true);
  assert.match(r.reason, /1 user-visible/);
});

test('docs/scripts-only drift → skip', () => {
  const r = decide({ builds: [fin()], changedFiles: ['CLAUDE.md', 'scripts/check-testflight-drift.js', '.github/workflows/eas-build.yml', 'memory/notes.md'], nowMs: NOW });
  assert.equal(r.shouldBuild, false);
});

test('null diff (unknown base sha) → fail open to build', () => {
  const r = decide({ builds: [fin()], changedFiles: null, nowMs: NOW });
  assert.equal(r.shouldBuild, true);
  assert.match(r.reason, /cannot diff/);
});

test('kill switch beats everything', () => {
  const r = decide({ builds: [fin()], changedFiles: ['app/x.tsx'], killSwitch: true, nowMs: NOW });
  assert.equal(r.shouldBuild, false);
  assert.match(r.reason, /kill switch/);
});

test('baseline = NEWEST finished build even when list arrives oldest-first', () => {
  const old = fin({ appBuildVersion: '51', gitCommitHash: 'old000000000', createdAt: '2026-07-20T00:00:00Z' });
  const r = decide({ builds: [old, fin()], changedFiles: [], nowMs: NOW });
  assert.equal(r.shouldBuild, false);
  assert.match(r.reason, /build 56/);
});

test('age backstop: stale baseline + only non-visible commits → build', () => {
  const stale = fin({ createdAt: '2026-07-01T00:00:00Z' });
  const r = decide({ builds: [stale], changedFiles: ['some/unknown-new-dir/thing.swift'], nowMs: NOW });
  assert.equal(r.shouldBuild, true);
  assert.match(r.reason, /age backstop/);
});

test('age backstop does NOT fire with zero commits since baseline', () => {
  const stale = fin({ createdAt: '2026-07-01T00:00:00Z' });
  const r = decide({ builds: [stale], changedFiles: [], nowMs: NOW });
  assert.equal(r.shouldBuild, false);
});

test('isUserVisible: bundle-affecting root files yes, tooling no', () => {
  for (const f of ['index.js', 'tsconfig.json', 'app.json', 'package-lock.json', 'plugins/withKeychain.js']) {
    assert.equal(isUserVisible(f), true, f);
  }
  for (const f of ['eslint.config.js', 'README.md', 'APP_STORE_METADATA.md', '.maestro/tabs/home.yaml', 'scripts/build-sim.sh', 'store-listing/desc.txt']) {
    assert.equal(isUserVisible(f), false, f);
  }
});
