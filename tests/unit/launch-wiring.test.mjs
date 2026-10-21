// Launch wiring in app/_layout.tsx that has no runtime test harness here, so
// it is pinned by source checks. Each one broke (or was nearly broken) before:
//  - Updates.reloadAsync() right after launch reloaded the app under the user.
//  - initSentry() ran in the first effect, after Sentry.wrap() and the first
//    render, so startup crashes went unreported.
//  - expo-router hid the splash while the root layout still returned null.
//  - the push permission prompt must wait for onboarding to finish.
//  - render crashes caught by ErrorBoundary never reached Sentry, and the
//    Sentry user carried the account email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const read = rel => readFileSync(join(root, rel), 'utf8');
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const layout = stripComments(read('app/_layout.tsx'));

test('no OTA reload mid-session', () => {
  assert.doesNotMatch(layout, /reloadAsync\s*\(/);
});

test('Sentry starts at module scope, before the layout is wrapped', () => {
  const init = layout.search(/^initSentry\(\);/m);
  assert.ok(init > 0, 'initSentry() must be a top-level statement');
  assert.ok(init < layout.indexOf('function RootLayout'), 'initSentry() must run before RootLayout is defined');
  assert.ok(init < layout.indexOf('wrapWithSentry(RootLayout)'));
  assert.doesNotMatch(layout.slice(layout.indexOf('function RootLayout')), /initSentry\(/);
});

test('splash is held at module scope and hidden by the layout, with a backstop', () => {
  assert.match(layout, /^SplashScreen\.preventAutoHideAsync\(\)/m);
  assert.ok((layout.match(/SplashScreen\.hide\(\)/g) || []).length >= 2, 'ready hide + backstop timer');
});

test('launch never shows the notification prompt; it only re-links a granted token after onboarding', () => {
  // BRO-5852 (owner decision 2026-10-21): the iOS dialog comes after a first
  // rating or watchlist add, through maybeAskForNotifications(), or from the
  // Settings row the person taps. Nothing else may call
  // registerForPushNotifications().
  const callers = [];
  const walk = dir => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = join(dir, name);
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(name) && rel !== join('lib', 'notifications.ts')) {
        if (/registerForPushNotifications\s*\(|requestPermissionsAsync\s*\(\s*\)/.test(stripComments(read(rel)))) callers.push(rel);
      }
    }
  };
  for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
  assert.deepEqual(callers, [join('app', 'settings.tsx')]);
  const call = layout.indexOf('syncPushTokenIfPermitted()');
  const gate = layout.lastIndexOf('if (showOnboarding !== false) return;', call);
  assert.ok(gate > 0 && call - gate < 200, 'the re-link sits right behind the onboarding gate');
});

test('Sentry gets render crashes and the user id only', () => {
  const boundary = stripComments(read('components/ErrorBoundary.tsx'));
  assert.match(boundary, /componentDidCatch[\s\S]*captureRenderError\(error/);
  const sentry = stripComments(read('lib/sentry.ts'));
  const setUser = sentry.match(/setUser\(\{([^}]*)\}\)/);
  assert.ok(setUser, 'setSentryUser must call Sentry.setUser');
  assert.doesNotMatch(setUser[1], /email/);
});
