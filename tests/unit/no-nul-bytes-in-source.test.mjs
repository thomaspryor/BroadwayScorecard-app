// Fails if any tracked source file contains a NUL byte.
//
// Why (2026-08-12): tests/unit/test-globs-cover-every-test.test.mjs was written
// with literal NUL characters as string sentinels. Node ran it happily — NUL is
// a legal character in a JavaScript string, and the tests passed — but git
// classifies any file containing one as BINARY. A binary file produces no diff
// in `git diff`, no line-level blame, and nothing useful in a pull request, so
// the file silently drops out of code review entirely. Neither tsc, eslint, the
// bundler nor gitleaks noticed.
//
// A sentinel that cannot appear in the input is a reasonable idea; writing it as
// a raw 0x00 byte instead of a JavaScript escape is what breaks tooling. This test
// keeps the idea and forbids the raw form.
//
// It caught its own author immediately: the first draft of this file quoted a
// literal NUL in this very comment to illustrate the problem, and failed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'ios', 'android', '.expo', 'assets']);
const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.sql', '.md', '.sh']);

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, found);
    else if (TEXT_EXTS.has(extname(entry))) found.push(full);
  }
  return found;
}

test('no source file contains a raw NUL byte', () => {
  const offenders = [];
  for (const file of walk(REPO_ROOT)) {
    const buf = readFileSync(file);
    const count = buf.filter(b => b === 0).length;
    if (count > 0) {
      offenders.push(`${relative(REPO_ROOT, file).split(sep).join('/')} (${count} NUL byte${count === 1 ? '' : 's'})`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'these files contain raw NUL bytes, so git treats them as binary — no diff, no blame, ' +
    'invisible to code review:\n' + offenders.map(o => `  - ${o}`).join('\n') +
    '\nUse an escape such as \\u0000 rather than a literal NUL character.',
  );
});
