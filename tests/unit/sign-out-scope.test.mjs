// BRO-4822: supabase-js signOut() defaults to scope 'global', which revokes
// every session on the account. Signing out of the app then silently signed
// the user out of broadwayscorecard.com on their phone and computer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('every app sign-out is scoped to this device', () => {
  const src = readFileSync(new URL('../../lib/auth-context.tsx', import.meta.url), 'utf8');
  const calls = [...src.matchAll(/auth\.signOut\(([^)]*)\)/g)];
  assert.ok(calls.length >= 2, 'expected the sign-out and delete-account calls');
  for (const [call, args] of calls) assert.match(args, /scope: 'local'/, `${call} must pass { scope: 'local' }`);
});
