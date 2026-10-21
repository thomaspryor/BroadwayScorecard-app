// The App Review account's password was written into this public repo
// (scripts/seed-reviewer-account.js default, store-listing notes), so anyone
// could sign in as Apple's reviewer. It was rotated on 2026-10-21 (BRO-5852)
// and now lives only in App Store Connect > App Review Information.
// This fails if a password for that account is written back into a tracked file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(f => f && /\.(m?[jt]sx?|md|json|ya?ml|txt|sh)$/.test(f) && f !== 'tests/unit/no-reviewer-password.test.mjs');

const read = f => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };

test('the seed script has no default reviewer password', () => {
  const src = read('scripts/seed-reviewer-account.js');
  assert.match(src, /const REVIEWER_PASSWORD = process\.env\.REVIEWER_PASSWORD;/);
  assert.doesNotMatch(src, /REVIEWER_PASSWORD\s*(\|\||\?\?)\s*['"`]/, 'no fallback literal');
});

test('no tracked file states a password (any account)', () => {
  // Widened from the reviewer account alone: a second test or demo account
  // written into this public repo would be the same leak.
  const leaks = [];
  for (const f of tracked) {
    read(f).split('\n').forEach((line, i) => {
      const m = /password\W{0,3}[:=]\s*([`'"]?)([^\s`'"(,;<]{6,})\1/i.exec(line); // <placeholder> is not a value
      if (!m) return;
      const value = m[2];
      // Environment reads, constants and variables are the point, not a leak.
      if (/^(process\.env\b|\$\{|[A-Z][A-Z0-9_]+$|[a-z][A-Za-z0-9_.]*$)/.test(value) && !m[1]) return;
      if (m[1] === '' && /\.(m?[jt]sx?)$/.test(f)) return; // unquoted in code = an identifier or type
      leaks.push(`${f}:${i + 1}: ${m[0]}`);
    });
  }
  assert.deepEqual(leaks, [], 'keep passwords in App Store Connect or GitHub secrets, never in the repo');
});

test('the rotated password is gone everywhere', () => {
  const hits = tracked.filter(f => read(f).includes('BwayReview'));
  assert.deepEqual(hits, []);
});
