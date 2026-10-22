// Fails when app code builds a "today"/picked-date string from toISOString().
// Run: node --experimental-strip-types --test tests/unit/no-utc-date-strings.test.mjs
//
// toISOString() is UTC. In New York, from about 8pm a local date turned into
// `d.toISOString().split('T')[0]` is already tomorrow. That bug shipped twice:
// lib/show-import.ts compared Mezzanine dates against a UTC "today" (an unrated
// show booked for tomorrow imported as seen), and components/user/ReviewPanel
// saved a picked date one day late. Use toLocalYMD() (lib/date-utils) or
// localToday() (lib/stats-scope) for calendar days.
//
// Files below do deliberate UTC calendar math (Date.UTC in, ISO out), which
// is correct and stays allowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// scripts/ too: send-notifications.ts picked the rate-show night by UTC date.
const DIRS = ['app', 'components', 'lib', 'hooks', 'scripts'];

const ALLOWED = new Map([
  ['lib/date-utils.ts', 'toLocalYMD itself: shifts by the timezone offset first'],
  ['lib/stats/season-windows.ts', 'Date.UTC calendar math'],
  ['lib/welcome-onboarding.ts', 'Date.UTC calendar math'],
  ['lib/theatr-import.ts', 'adds days to a T00:00:00Z date'],
]);

const PATTERN = /toISOString\(\)\s*\.\s*(split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]|slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\))/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test('no UTC date strings used as local calendar days', () => {
  const hits = [];
  for (const d of DIRS) {
    for (const file of walk(join(ROOT, d), [])) {
      const rel = relative(ROOT, file).split('\\').join('/');
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (PATTERN.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(hits, [], `Use toLocalYMD()/localToday() instead:\n${hits.join('\n')}`);
});

test('the pattern catches the shapes that shipped', () => {
  assert.ok(PATTERN.test("const today = new Date().toISOString().split('T')[0];"));
  assert.ok(PATTERN.test('d.toISOString().slice(0, 10)'));
  assert.ok(!PATTERN.test('toLocalYMD(new Date())'));
});
