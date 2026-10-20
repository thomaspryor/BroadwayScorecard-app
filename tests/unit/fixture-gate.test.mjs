// app/test/* fixture routes stay out of the App Store build.
// Run: node --experimental-strip-types --import ./tests/register-alias.mjs --test tests/unit/fixture-gate.test.mjs
//
// expo-router ships every file under app/, so broadwayscorecard:///test/...
// opened fake-data screens in production. Each fixture must call
// fixtureRoutesAllowed with the literal process.env.EXPO_PUBLIC_DEV_AUTO_SIGNIN
// (Expo only inlines EXPO_PUBLIC_ vars written out in full) and redirect home.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixtureRoutesAllowed } from '../../lib/fixture-gate.ts';

const TEST_DIR = fileURLToPath(new URL('../../app/test/', import.meta.url));

test('development builds allow fixtures', () => {
  assert.equal(fixtureRoutesAllowed(true, undefined), true);
});

test('CI E2E Release build (flag = 1) allows fixtures', () => {
  assert.equal(fixtureRoutesAllowed(false, '1'), true);
});

test('App Store build blocks fixtures', () => {
  assert.equal(fixtureRoutesAllowed(false, undefined), false);
  assert.equal(fixtureRoutesAllowed(false, '0'), false);
  assert.equal(fixtureRoutesAllowed(false, 'true'), false);
});

test('every app/test route is gated and redirects home', () => {
  const files = readdirSync(TEST_DIR).filter((f) => f.endsWith('.tsx'));
  assert.ok(files.length > 0);
  const bad = [];
  for (const f of files) {
    const src = readFileSync(TEST_DIR + f, 'utf8');
    const gated = /fixtureRoutesAllowed\(\s*__DEV__\s*,\s*process\.env\.EXPO_PUBLIC_DEV_AUTO_SIGNIN\s*\)/.test(src);
    const redirects = /<Redirect\s+href="\/"\s*\/>/.test(src);
    if (!gated || !redirects) bad.push(`app/test/${f}${gated ? '' : ' (no gate)'}${redirects ? '' : ' (no redirect)'}`);
  }
  assert.deepEqual(bad, []);
});
