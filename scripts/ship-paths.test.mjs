// The two ship-gating path lists must not drift apart.
// Run: node --test scripts/ship-paths.test.mjs
//
// Two scripts gate delivery and they are chained, not independent:
//
//   check-testflight-drift.js  RELEVANT_PATHS  — on the SCHEDULE trigger,
//     decides whether the build job runs at all (should_build).
//   ship.js                    NATIVE_PATHS    — once it runs, decides native
//     build vs free OTA update.
//
// NATIVE_PATHS is meant to be a subset: everything that changes the native
// binary is, by definition, user-visible drift. If a file is native to ship.js
// but invisible to the drift gate, a commit touching only that file decides
// should_build=false, the build job never runs, and NOTHING SHIPS — while
// ship.js, had it run, would have said "this needs a native build".
//
// That is exactly what happened with patches/ and .gitignore: ship.js learned
// (at the cost of a build) that .gitignore moves the Expo fingerprint, but the
// drift gate was never told (second-opinion, 2026-08-03).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RELEVANT_PATHS } = require('./check-testflight-drift.js');
const { NATIVE_PATHS } = require('./ship.js');

/** Representative paths for every native class ship.js knows about. Concrete
 *  strings, not regex-subset maths — this is what actually lands in a diff. */
const NATIVE_FILES = [
  'package.json',
  'package-lock.json',
  'app.json',
  'app.config.js',
  'app.config.ts',
  'eas.json',
  'plugins/withSomething.js',
  'patches/react-native+0.81.0.patch',
  '.gitignore',
  'assets/icon.png',
  'assets/splash.png',
];

test('every list is a non-empty array of regexes', () => {
  for (const [name, list] of [['RELEVANT_PATHS', RELEVANT_PATHS], ['NATIVE_PATHS', NATIVE_PATHS]]) {
    assert.ok(Array.isArray(list) && list.length > 0, `${name} should be a non-empty array`);
    for (const re of list) assert.ok(re instanceof RegExp, `${name} contains a non-regex`);
  }
});

test('every native file is also user-visible drift (else nothing ships)', () => {
  for (const file of NATIVE_FILES) {
    const isNative = NATIVE_PATHS.some(re => re.test(file));
    if (!isNative) continue; // not claimed as native — nothing to enforce
    assert.ok(
      RELEVANT_PATHS.some(re => re.test(file)),
      `"${file}" is native to ship.js but invisible to the drift gate: a commit ` +
      `touching only it would decide should_build=false and ship NOTHING. ` +
      `Add it to RELEVANT_PATHS in scripts/check-testflight-drift.js.`,
    );
  }
});

test('the files that cost us a build are covered by BOTH lists', () => {
  // .gitignore moved the fingerprint and turned a free OTA into a paid build;
  // patches/ rewrites dependency source without touching package.json.
  for (const file of ['.gitignore', 'patches/react-native+0.81.0.patch']) {
    assert.ok(NATIVE_PATHS.some(re => re.test(file)), `${file} missing from NATIVE_PATHS`);
    assert.ok(RELEVANT_PATHS.some(re => re.test(file)), `${file} missing from RELEVANT_PATHS`);
  }
});

test('pure JavaScript is native to neither', () => {
  // These must stay OTA-eligible — treating them as native would put the
  // ~$1.85 build back on every UI tweak, which is the whole point of ship.js.
  for (const file of [
    'app/(tabs)/index.tsx',
    'components/ShowCard.tsx',
    'lib/show-match.ts',
    'hooks/usePosterGrid.ts',
  ]) {
    assert.ok(!NATIVE_PATHS.some(re => re.test(file)), `${file} should not be native`);
  }
});
