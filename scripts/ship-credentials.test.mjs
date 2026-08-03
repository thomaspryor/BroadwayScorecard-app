// scripts/ship.js — the credential guard on the OTA path.
// Run: node --test scripts/ship-credentials.test.mjs
//
// The scar: on 2026-08-03 the first OTA this script ever published bundled
// EXPO_PUBLIC_SUPABASE_URL='' and EXPO_PUBLIC_SUPABASE_ANON_KEY=''. Both were
// stored on EAS with visibility "Secret", and EAS only injects Secret values on
// a build worker — `eas update` runs on a GitHub runner, so it silently got
// nothing. The publish succeeded, CI went green, and the owner's app installed
// an update that launched normally and could not sign in.
//
// Every assertion below is a shape taken from that incident's real output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseEnvList,
  auditUpdateCredentials,
  parseLoadedVars,
  parseRuntimeVersion,
  publicVarsUsedInSource,
} = require('./ship.js');

// Verbatim `eas env:list --environment production` output from the incident.
const ENV_LIST_BEFORE = `
Environment: production
EXPO_ASC_API_KEY=***** (This is a secret env variable that can only be accessed on EAS builder and can't be read in any UI. Learn more.)
EXPO_PUBLIC_POSTHOG_API_KEY=***** (This is a secret env variable that can only be accessed on EAS builder and can't be read in any UI. Learn more.)
EXPO_PUBLIC_POSTHOG_API_KEY=phc_realish_key
EXPO_PUBLIC_SENTRY_DSN=https://abc@o1.ingest.us.sentry.io/2
EXPO_PUBLIC_SUPABASE_ANON_KEY=***** (This is a secret env variable that can only be accessed on EAS builder and can't be read in any UI. Learn more.)
EXPO_PUBLIC_SUPABASE_URL=***** (This is a secret env variable that can only be accessed on EAS builder and can't be read in any UI. Learn more.)
`;

const ENV_LIST_AFTER = `
Environment: production
EXPO_PUBLIC_SENTRY_DSN=https://abc@o1.ingest.us.sentry.io/2
EXPO_PUBLIC_SUPABASE_ANON_KEY=***** (This is a sensitive env variable. To access it, run command with --include-sensitive flag. Learn more.)
EXPO_PUBLIC_SUPABASE_URL=***** (This is a sensitive env variable. To access it, run command with --include-sensitive flag. Learn more.)
`;

const REQUIRED = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

test('a Secret credential blocks the publish', () => {
  const { errors } = auditUpdateCredentials(REQUIRED, parseEnvList(ENV_LIST_BEFORE));
  assert.equal(errors.length, 2, 'both Supabase variables must be reported');
  assert.match(errors.join('\n'), /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(errors.join('\n'), /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(errors.join('\n'), /Secret/);
});

test('the same variables at "sensitive" visibility pass', () => {
  const { errors } = auditUpdateCredentials(REQUIRED, parseEnvList(ENV_LIST_AFTER));
  assert.deepEqual(errors, []);
});

test('a credential missing from EAS entirely blocks the publish', () => {
  const { errors } = auditUpdateCredentials(
    [...REQUIRED, 'EXPO_PUBLIC_NEWLY_ADDED'],
    parseEnvList(ENV_LIST_AFTER),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /EXPO_PUBLIC_NEWLY_ADDED is not set/);
});

test('a duplicated required variable blocks; a duplicated optional one only warns', () => {
  // EXPO_PUBLIC_POSTHOG_API_KEY really is defined twice on this project, with
  // values that differ by one character. Analytics is not worth blocking a
  // ship over, but it must not pass in silence either.
  const { errors, warnings } = auditUpdateCredentials(REQUIRED, parseEnvList(ENV_LIST_BEFORE));
  assert.ok(
    warnings.some(w => /POSTHOG/.test(w) && /2×/.test(w)),
    `expected a duplicate warning for PostHog, got: ${JSON.stringify(warnings)}`,
  );
  assert.ok(!errors.some(e => /POSTHOG/.test(e)), 'an optional variable must not block');

  const dupRequired = auditUpdateCredentials(
    ['EXPO_PUBLIC_POSTHOG_API_KEY'],
    parseEnvList(`EXPO_PUBLIC_POSTHOG_API_KEY=a\nEXPO_PUBLIC_POSTHOG_API_KEY=b\n`),
  );
  assert.equal(dupRequired.errors.length, 1);
  assert.match(dupRequired.errors[0], /2×/);
});

test('parseLoadedVars reads the names eas update says it loaded', () => {
  const out =
    'Environment variables with visibility "Plain text" and "Sensitive" loaded from ' +
    'the "production" environment on EAS: EXPO_PUBLIC_POSTHOG_API_KEY, EXPO_PUBLIC_SENTRY_DSN.\n';
  assert.deepEqual(parseLoadedVars(out), [
    'EXPO_PUBLIC_POSTHOG_API_KEY',
    'EXPO_PUBLIC_SENTRY_DSN',
  ]);
  // That exact line is what proved the bad update shipped without Supabase.
  assert.deepEqual(
    REQUIRED.filter(v => !parseLoadedVars(out).includes(v)),
    REQUIRED,
  );
});

test('parseLoadedVars returns null when the CLI stops printing that line', () => {
  // Unknown must not read as "verified" — main() warns instead of claiming OK.
  assert.equal(parseLoadedVars('✔ Published!\nBranch  production\n'), null);
});

test('parseRuntimeVersion finds the version needed to roll an update back', () => {
  const out = [
    '✔ Published!',
    'Branch           production',
    'Runtime version  07ce5a3f14d7a14b4aba1631b0f6ce040fe08ce3',
    'Platform         ios',
  ].join('\n');
  assert.equal(parseRuntimeVersion(out), '07ce5a3f14d7a14b4aba1631b0f6ce040fe08ce3');
  assert.equal(parseRuntimeVersion('✔ Published!'), null);
});

test('the required list is derived from the app source, not a hand-kept list', () => {
  // A credential added to lib/ and forgotten here would otherwise ship empty.
  const found = publicVarsUsedInSource();
  assert.ok(found.includes('EXPO_PUBLIC_SUPABASE_URL'));
  assert.ok(found.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY'));
  assert.ok(found.includes('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'));
  assert.ok(found.every(v => v.startsWith('EXPO_PUBLIC_')));
});
