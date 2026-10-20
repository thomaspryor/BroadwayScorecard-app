// The dev-test account's password was a string literal in lib/auth-context.tsx
// (public in the repo, and bundled whenever the flag was set). It now comes from
// EXPO_PUBLIC_DEV_TEST_PASSWORD, and auto sign-in also refuses the
// "production" update channel (lib/dev-auto-signin.ts explains why the gate
// cannot simply be __DEV__: the E2E Release build has __DEV__ false).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { devAutoSignInBlock } from '../../lib/dev-auto-signin.ts';

const root = new URL('../../', import.meta.url).pathname;

test('E2E Release build (flag + password, no EAS channel) signs in', () => {
  assert.equal(devAutoSignInBlock({ flag: '1', password: 'pw', channel: null }), null);
  assert.equal(devAutoSignInBlock({ flag: '1', password: 'pw', channel: '' }), null);
  assert.equal(devAutoSignInBlock({ flag: '1', password: 'pw', channel: 'development' }), null);
});

test('production channel never auto signs in, even with the flag and password', () => {
  assert.equal(devAutoSignInBlock({ flag: '1', password: 'pw', channel: 'production' }), 'production-channel');
  assert.equal(devAutoSignInBlock({ flag: '1', password: 'pw', channel: ' Production ' }), 'production-channel');
});

test('flag off or password missing', () => {
  assert.equal(devAutoSignInBlock({ flag: undefined, password: 'pw', channel: null }), 'flag-off');
  assert.equal(devAutoSignInBlock({ flag: '0', password: 'pw', channel: null }), 'flag-off');
  assert.equal(devAutoSignInBlock({ flag: 'true', password: 'pw', channel: null }), 'flag-off');
  assert.equal(devAutoSignInBlock({ flag: '1', password: undefined, channel: null }), 'no-password');
  assert.equal(devAutoSignInBlock({ flag: '1', password: '', channel: null }), 'no-password');
});

test('no password string literal anywhere in the app bundle sources', () => {
  const hits = [];
  const walk = dir => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = join(dir, name);
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
        const src = readFileSync(join(root, rel), 'utf8');
        for (const m of src.matchAll(/\bpassword\s*[:=]\s*['"`]/gi)) hits.push(`${rel}@${m.index}`);
      }
    }
  };
  for (const dir of ['app', 'components', 'hooks', 'lib', 'constants']) walk(dir);
  assert.deepEqual(hits, [], 'credentials must come from build-time env, never source');
});

test('Maestro flows type passwords from a variable, never a literal', () => {
  // The same dev-test password was also typed as a literal in .maestro-manual
  // flows. maestro-e2e.yml now rotates it every run; flows take it via -e.
  const hits = [];
  const walk = dir => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = join(dir, name);
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.ya?ml$/.test(name)) {
        const lines = readFileSync(join(root, rel), 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (!/text:\s*["']?Password/i.test(line)) return;
          const next = lines.slice(i + 1).find(l => /-\s*inputText:/.test(l));
          if (next && !/inputText:\s*["']?\$\{/.test(next)) hits.push(`${rel}:${i + 1}`);
        });
      }
    }
  };
  for (const dir of ['.maestro', '.maestro-manual']) walk(dir);
  assert.deepEqual(hits, [], 'type passwords as ${VAR} passed with maestro -e');
});

test('auth-context reads the password from the env var', () => {
  const src = readFileSync(join(root, 'lib/auth-context.tsx'), 'utf8');
  assert.match(src, /process\.env\.EXPO_PUBLIC_DEV_TEST_PASSWORD/);
  assert.match(src, /devAutoSignInBlock\(/);
});

test('ship.js treats the dev password as optional (unset in production)', () => {
  const ship = readFileSync(join(root, 'scripts/ship.js'), 'utf8');
  const optional = ship.slice(ship.indexOf('OPTIONAL_PUBLIC_VARS = new Set(['), ship.indexOf(']);', ship.indexOf('OPTIONAL_PUBLIC_VARS')));
  assert.match(optional, /'EXPO_PUBLIC_DEV_TEST_PASSWORD'/);
});
