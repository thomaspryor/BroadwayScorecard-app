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
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// Scratch dirs go under the repo, not os.tmpdir(): sandboxed runners deny
// mkdtemp in /var/folders and the test would error rather than assert.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  parseEnvList,
  parseDotenv,
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

// What `eas env:pull` writes when the environment is healthy.
const RESOLVED_OK = new Map([
  ['EXPO_PUBLIC_SUPABASE_URL', 'https://tcb.supabase.co'],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'ey.anon.jwt'],
]);

test('a Secret credential blocks the publish', () => {
  // Secret variables are absent from the pull — that absence IS the signal.
  const { errors } = auditUpdateCredentials(REQUIRED, parseEnvList(ENV_LIST_BEFORE), new Map());
  assert.equal(errors.length, 2, 'both Supabase variables must be reported');
  assert.match(errors.join('\n'), /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(errors.join('\n'), /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(errors.join('\n'), /Secret/);
});

test('the same variables at "sensitive" visibility pass', () => {
  const { errors } = auditUpdateCredentials(REQUIRED, parseEnvList(ENV_LIST_AFTER), RESOLVED_OK);
  assert.deepEqual(errors, []);
});

test('a credential missing from EAS entirely blocks the publish', () => {
  const { errors } = auditUpdateCredentials(
    [...REQUIRED, 'EXPO_PUBLIC_NEWLY_ADDED'],
    parseEnvList(ENV_LIST_AFTER),
    RESOLVED_OK,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /EXPO_PUBLIC_NEWLY_ADDED resolves to nothing/);
});

test('a duplicated required variable blocks; a duplicated optional one only warns', () => {
  // EXPO_PUBLIC_POSTHOG_API_KEY really is defined twice on this project, with
  // values that differ by one character. Analytics is not worth blocking a
  // ship over, but it must not pass in silence either.
  const { errors, warnings } = auditUpdateCredentials(
    REQUIRED, parseEnvList(ENV_LIST_BEFORE), new Map(),
  );
  assert.ok(
    warnings.some(w => /POSTHOG/.test(w) && /2×/.test(w)),
    `expected a duplicate warning for PostHog, got: ${JSON.stringify(warnings)}`,
  );
  assert.ok(!errors.some(e => /POSTHOG/.test(e)), 'an optional variable must not block');

  const dupRequired = auditUpdateCredentials(
    ['EXPO_PUBLIC_POSTHOG_API_KEY'],
    parseEnvList(`Environment: production\nEXPO_PUBLIC_POSTHOG_API_KEY=a\nEXPO_PUBLIC_POSTHOG_API_KEY=b\n`),
    new Map([['EXPO_PUBLIC_POSTHOG_API_KEY', 'a']]),
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

// ── Hardening after adversarial review (Codex, 2026-08-03) ──────────────────
// Every check below guards a way the first version of this guard could have
// waved a broken update through.

test('the pulled VALUES decide, not the visibility wording', () => {
  // The real defence: `eas env:pull` returns what will actually be compiled
  // in. An empty or absent value fails even when env:list looks healthy.
  const envVars = parseEnvList(ENV_LIST_AFTER);
  const resolved = new Map([
    ['EXPO_PUBLIC_SUPABASE_URL', 'https://tcb.supabase.co'],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', ''],
  ]);
  const { errors } = auditUpdateCredentials(REQUIRED, envVars, resolved);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /EXPO_PUBLIC_SUPABASE_ANON_KEY resolves to ''/);
});

test('a Secret variable is absent from the pull, and that is an error', () => {
  // env:pull silently omits Secret variables — precisely the incident.
  const { errors } = auditUpdateCredentials(
    REQUIRED,
    parseEnvList(ENV_LIST_BEFORE),
    new Map(),
  );
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /resolves to nothing/);
  assert.match(errors.join('\n'), /--visibility sensitive/);
});

test('unrecognised masking wording is treated as Secret, not as plaintext', () => {
  // If EAS rewords the hint, the guess that blocks a ship is the safe one.
  const vars = parseEnvList(
    'Environment: production\nEXPO_PUBLIC_SUPABASE_URL=***** (hidden for some new reason)\n',
  );
  assert.deepEqual(vars.get('EXPO_PUBLIC_SUPABASE_URL').visibilities, ['secret']);
});

test('output above the Environment: header cannot manufacture a variable', () => {
  // yarn/eas print KEY=value-shaped noise; only the listing itself counts.
  const vars = parseEnvList(
    'NODE_OPTIONS=--max-old-space-size=4096\n' +
    'EXPO_PUBLIC_SUPABASE_URL=https://spoofed.example\n' +
    'Environment: production\n' +
    'EXPO_PUBLIC_SENTRY_DSN=https://real@sentry.io/1\n',
  );
  assert.equal(vars.has('EXPO_PUBLIC_SUPABASE_URL'), false);
  assert.equal(vars.has('NODE_OPTIONS'), false);
  assert.equal(vars.has('EXPO_PUBLIC_SENTRY_DSN'), true);
});

test('parseDotenv reads the flat file eas env:pull writes', () => {
  const values = parseDotenv(
    '# comment\nEXPO_PUBLIC_SUPABASE_URL=https://tcb.supabase.co\n' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY="ey.quoted.jwt"\nEMPTY=\n',
  );
  assert.equal(values.get('EXPO_PUBLIC_SUPABASE_URL'), 'https://tcb.supabase.co');
  assert.equal(values.get('EXPO_PUBLIC_SUPABASE_ANON_KEY'), 'ey.quoted.jwt');
  assert.equal(values.get('EMPTY'), '');
});

test('bracket and destructured reads are reported as defects, not required', () => {
  // babel-preset-expo only inlines the literal `process.env.EXPO_PUBLIC_X`
  // member expression. The other two spellings read an object that does not
  // exist on device — they are undefined however EAS is configured, so
  // requiring the variable would hide the real bug.
  const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.ship-scan-'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(
    path.join(dir, 'lib', 'a.ts'),
    `const a = process.env['EXPO_PUBLIC_BRACKET'];\n` +
    `const { EXPO_PUBLIC_DESTRUCTURED } = process.env;\n` +
    `const c = process.env.EXPO_PUBLIC_DOTTED;\n`,
  );
  const scan = publicVarsUsedInSource(dir);
  fs.rmSync(dir, { recursive: true, force: true });

  assert.deepEqual(scan.required, ['EXPO_PUBLIC_DOTTED']);
  assert.equal(scan.unsupported.length, 2);
  assert.match(scan.unsupported.join('\n'), /EXPO_PUBLIC_BRACKET/);
  assert.match(scan.unsupported.join('\n'), /EXPO_PUBLIC_DESTRUCTURED/);
});

test('an unsupported read mentioned in a COMMENT does not block shipping', () => {
  // The throw halts every OTA until source is edited, so prose describing the
  // rule — including this codebase's own docblocks — must not trip it.
  const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.ship-scan-'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(
    path.join(dir, 'lib', 'b.ts'),
    `// Never write process.env['EXPO_PUBLIC_X'] — Expo cannot inline it.\n` +
    `/* nor const { EXPO_PUBLIC_Y } = process.env */\n` +
    `const ok = process.env.EXPO_PUBLIC_REAL;\n`,
  );
  const scan = publicVarsUsedInSource(dir);
  fs.rmSync(dir, { recursive: true, force: true });

  assert.deepEqual(scan.unsupported, []);
  assert.deepEqual(scan.required, ['EXPO_PUBLIC_REAL']);
});

test('a value that legitimately starts with # is not read as empty', () => {
  // Over-eager comment stripping would block a ship on a perfectly good
  // credential — a false alarm is not a safe default, it just stops delivery.
  const values = parseDotenv('EXPO_PUBLIC_A=#abc123\nEXPO_PUBLIC_B= # unset\n');
  assert.equal(values.get('EXPO_PUBLIC_A'), '#abc123');
  assert.equal(values.get('EXPO_PUBLIC_B'), '');
});

test('auditUpdateCredentials refuses to run without the pulled values', () => {
  assert.throws(
    () => auditUpdateCredentials(REQUIRED, parseEnvList(ENV_LIST_AFTER)),
    /requires the resolved values/,
  );
});

test('parseDotenv does not read a quoted-empty or commented value as present', () => {
  // The direction that matters: mis-reading empty as non-empty ships a broken
  // app, so these three shapes must all come back empty.
  const values = parseDotenv(
    'export EXPO_PUBLIC_A=\n' +
    'EXPO_PUBLIC_B="" # placeholder\n' +
    'EXPO_PUBLIC_C= # not set yet\n' +
    'EXPO_PUBLIC_D="https://real.supabase.co" # prod\n',
  );
  assert.equal(values.get('EXPO_PUBLIC_A'), '');
  assert.equal(values.get('EXPO_PUBLIC_B'), '');
  assert.equal(values.get('EXPO_PUBLIC_C'), '');
  assert.equal(values.get('EXPO_PUBLIC_D'), 'https://real.supabase.co');
});

test('the required list is derived from the app source, not a hand-kept list', () => {
  // A credential added to lib/ and forgotten here would otherwise ship empty.
  const { required, unsupported } = publicVarsUsedInSource();
  assert.ok(required.includes('EXPO_PUBLIC_SUPABASE_URL'));
  assert.ok(required.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY'));
  assert.ok(required.includes('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'));
  assert.ok(required.every(v => v.startsWith('EXPO_PUBLIC_')));
  // The app's own source must never contain an un-inlinable read.
  assert.deepEqual(unsupported, []);
});
