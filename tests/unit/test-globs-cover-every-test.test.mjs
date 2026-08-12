// Guards the guard: asserts that every *.test.mjs file in the repository is
// matched by one of the globs in package.json's test scripts.
//
// Why (ship-check, 2026-08-12): replacing eas-build.yml's hand-enumerated list
// of test files with a glob was sold as "a glob cannot rot — a new test runs
// the moment it lands." That is only true for test files that land INSIDE the
// declared globs. `test:unit` covers tests/unit/** and scripts/**;
// `test:security` covers tests/security/**. A test written to
// tests/integration/ or lib/ would be run by nothing at all, and CI would stay
// green — the exact failure the glob was meant to eliminate, moved one level
// up. This test fails the moment such a file appears.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Directories that never contain suite tests. `.claude/worktrees` matters most:
// it holds full checkouts of other in-flight branches, whose test files are not
// this checkout's responsibility and would otherwise dominate the results.
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'ios', 'android', '.expo']);

function findTestFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findTestFiles(full, found);
    else if (entry.endsWith('.test.mjs')) found.push(relative(REPO_ROOT, full).split(sep).join('/'));
  }
  return found;
}

// Turns a package.json glob ('tests/unit/**/*.test.mjs') into a matcher.
// Only the two shapes actually used here are supported — deliberately literal
// rather than pulling in a glob dependency for one assertion.
function globToRegExp(glob) {
  // The sentinels below are only collision-proof if the glob itself contains no
  // NUL. A package.json string CAN encode one as a JSON escape, which
  // JSON.parse turns into a real NUL — so assert rather than assume. Such a
  // glob could never match a real path anyway; failing loudly beats silently
  // mis-converting it. (Review finding, 2026-08-12.)
  assert.ok(
    !glob.includes('\u0000'),
    `glob contains a NUL and would collide with this function's sentinels: ${JSON.stringify(glob)}`,
  );
  // NUL-delimited sentinels: a glob can never contain one, so they cannot
  // collide with the pattern being converted. Written as \u0000 escapes rather
  // than literal NUL characters — a raw NUL makes git treat the whole file as
  // binary, which silently removes it from every diff and code review
  // (tests/unit/no-nul-bytes-in-source.test.mjs now forbids that).
  const DOUBLE = '\u0000DOUBLE\u0000';
  const SINGLE = '\u0000SINGLE\u0000';
  // Tokenise the wildcards BEFORE escaping, so the regex syntax introduced by
  // expanding '**/' is not itself re-processed by the '*' expansion. Expanding
  // in place instead produces '(?:[^/]+/)[^/]*' from '(?:[^/]+/)*' — the
  // trailing quantifier gets eaten, '**' stops matching zero directories, and
  // every top-level file in the tree reads as uncovered.
  const tokenised = glob.replace(/\*\*\//g, DOUBLE).replace(/\*/g, SINGLE);
  const escaped = tokenised.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .split(DOUBLE).join('(?:[^/]+/)*')  // '**/' spans zero or more directories
    .split(SINGLE).join('[^/]*');       // '*' stays within one segment
  return new RegExp(`^${body}$`);
}

// The scripts CI actually invokes — read out of the workflows rather than
// assumed. Checking against every test-ish script in package.json would be too
// permissive: `npm test` globs all of tests/**, but no workflow runs `npm test`,
// so a file covered only by it is still run by nothing on push.
function ciInvokedTestScripts() {
  const workflowDir = join(REPO_ROOT, '.github', 'workflows');
  const scripts = new Set();
  for (const file of readdirSync(workflowDir)) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    const yaml = readFileSync(join(workflowDir, file), 'utf8');
    for (const match of yaml.matchAll(/npm run (test[\w:-]*)/g)) scripts.add(match[1]);
  }
  return [...scripts];
}

test('every *.test.mjs in the repo is covered by a test glob CI actually runs', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

  const ciScripts = ciInvokedTestScripts();
  assert.ok(ciScripts.length > 0, 'no `npm run test*` invocation found in .github/workflows — CI runs no tests at all');

  const globs = [];
  for (const name of ciScripts) {
    const script = pkg.scripts[name];
    assert.ok(script, `.github/workflows invokes \`npm run ${name}\` but package.json has no such script`);
    for (const match of script.matchAll(/'([^']*\.test\.mjs)'/g)) globs.push(match[1]);
  }
  assert.ok(globs.length > 0, `expected quoted *.test.mjs globs in the CI-invoked scripts: ${ciScripts.join(', ')}`);

  const matchers = globs.map(globToRegExp);
  const testFiles = findTestFiles(REPO_ROOT);
  assert.ok(testFiles.length > 10, `expected to discover the test suite, found only ${testFiles.length} files`);

  const orphans = testFiles.filter(f => !matchers.some(m => m.test(f)));
  assert.deepEqual(
    orphans, [],
    `these test files are matched by no glob that CI runs, so nothing runs them on push:\n` +
    orphans.map(f => `  - ${f}`).join('\n') +
    `\nCI-invoked scripts: ${ciScripts.join(', ')}\n` +
    `Their globs: ${globs.join(', ')}\n` +
    `Either move the file under an existing glob, or add a glob to one of those scripts.`,
  );
});
