// The overnight run is unattended. These cover the two guards that stop it
// spending money or shipping something the owner never asked for.
//
// Run: node --test scripts/feedback/overnight.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { forbiddenIn } = require('./overnight.js');
const { NATIVE_PATHS } = require('../ship.js');

// Every path class that forces a paid native build. The seed prompt asks the
// agent to avoid these; forbiddenIn is what actually enforces it.
const MUST_BLOCK = [
  'ios/Podfile',
  'ios/BroadwayScorecard/Info.plist',
  'app.json',
  'app.config.js',
  'app.config.ts',
  'plugins/withCustomThing.js',
  'package.json',
  'package-lock.json',
  'patches/react-native+0.81.0.patch',
  'eas.json',
  '.gitignore',
];

// Ordinary JS the agent is meant to be editing.
const MUST_ALLOW = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/watched.tsx',
  'components/ShowCard.tsx',
  'components/FeaturedCarousel.tsx',
  'lib/score-utils.ts',
  'hooks/useWatchlist.ts',
  'constants/Colors.ts',
  'assets/images/show-placeholder.png',
];

// The app icon and splash are native even though they sit under assets/. Both
// spellings must be blocked: ship.js's own assets/(icon|splash|adaptive)
// pattern, and the assets/images/ paths app.json actually points at.
const MUST_BLOCK_ASSETS = [
  'assets/icon.png',
  'assets/splash.png',
  'assets/adaptive-icon.png',
  'assets/images/icon.png',
  'assets/images/splash-icon.png',
  'assets/images/favicon.png',
  'assets/images/android-icon-foreground.png',
];

test('every native path class is blocked before merge', () => {
  for (const f of MUST_BLOCK) {
    assert.deepEqual(forbiddenIn([f]), [f], `${f} must never be merged by an unattended run`);
  }
});

test('ordinary app JavaScript is allowed through', () => {
  assert.deepEqual(forbiddenIn(MUST_ALLOW), []);
});

test('app icon and splash assets are blocked', () => {
  for (const f of MUST_BLOCK_ASSETS) {
    assert.deepEqual(forbiddenIn([f]), [f], `${f} changes the binary — an OTA cannot deliver it`);
  }
});

test('the icon paths this app actually uses are native to ship.js too', () => {
  // Otherwise ship.js calls an icon change JS-only, ships a free OTA, and the
  // icon silently never updates on the phone.
  for (const f of ['assets/images/icon.png', 'assets/images/splash-icon.png']) {
    assert.ok(NATIVE_PATHS.some((re) => re.test(f)), `ship.js must treat ${f} as native`);
  }
});

test('a mixed branch is blocked, and names exactly what is wrong', () => {
  const files = ['components/ShowCard.tsx', 'app.json', 'lib/score-utils.ts', 'ios/Podfile'];
  assert.deepEqual(forbiddenIn(files), ['app.json', 'ios/Podfile']);
});

// If ship.js learns that a new path moves the native fingerprint but this list
// is not told, the agent could edit it, the branch would merge, and ship.js
// would then decide BUILD — which the driver refuses, stranding the work.
test('the block list covers everything ship.js calls native', () => {
  const SAMPLES = {
    'app.json': true,
    'app.config.js': true,
    'package.json': true,
    'package-lock.json': true,
    'patches/x.patch': true,
    '.gitignore': true,
    'eas.json': true,
  };
  for (const [file, isNative] of Object.entries(SAMPLES)) {
    const shipSaysNative = NATIVE_PATHS.some((re) => re.test(file));
    if (!shipSaysNative) continue;
    assert.equal(
      forbiddenIn([file]).length > 0, isNative,
      `ship.js treats ${file} as native, so the overnight guard must block it`,
    );
  }
});

test('the automation cannot rewrite its own rules', () => {
  // An agent editing the ledger or the driver could quietly widen what it is
  // allowed to do on the next run.
  for (const f of ['scripts/feedback/ledger.js', 'scripts/feedback/overnight.js', '.github/workflows/eas-build.yml']) {
    assert.deepEqual(forbiddenIn([f]), [f]);
  }
});
