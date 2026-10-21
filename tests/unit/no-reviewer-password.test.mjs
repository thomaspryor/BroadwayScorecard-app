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

test('no tracked file states a password next to the reviewer account', () => {
  const leaks = [];
  for (const f of tracked) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      if (!/reviewer@broadwayscorecard\.com/i.test(lines.slice(Math.max(0, i - 3), i + 4).join('\n'))) return;
      const m = /password\W{0,3}[:=]\s*[`'"]?([^\s`'"(]{6,})/i.exec(line);
      // Reading it from the environment is the point, not a leak.
      if (m && !/^(process\.env\b|\$\{)/.test(m[1])) leaks.push(`${f}:${i + 1}: ${m[0]}`);
    });
  }
  assert.deepEqual(leaks, [], 'keep the reviewer password in App Store Connect only');
});

test('the rotated password is gone everywhere', () => {
  const hits = tracked.filter(f => read(f).includes('BwayReview'));
  assert.deepEqual(hits, []);
});
