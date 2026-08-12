// Fails if any TRACKED text file contains a NUL byte.
//
// Why (2026-08-12): tests/unit/test-globs-cover-every-test.test.mjs was written
// with literal NUL characters as string sentinels. Node ran it happily — NUL is
// a legal character in a JavaScript string, and the tests passed — but git
// classifies any file containing one as BINARY. A binary file produces no diff
// in `git diff`, no line-level blame, and nothing useful in review, so the file
// silently drops out of code review entirely. tsc, eslint, the bundler and
// gitleaks all passed it.
//
// A sentinel that cannot appear in the input is a reasonable idea; writing it as
// a raw 0x00 byte rather than a JavaScript escape is what breaks tooling. This
// test keeps the idea and forbids the raw form.
//
// It caught its own author twice while being written: the first draft quoted a
// literal NUL in a comment to illustrate the problem, and an editor round-trip
// reintroduced another.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// The file set comes from `git ls-files`, not a directory walk over an
// extension allowlist. The first version of this test walked the tree and only
// looked at a hand-listed set of extensions, so its own header comment ("every
// tracked source file") was a lie: a NUL in .jsx, .mts, .css or .env passed
// unnoticed, as did anything under assets/. A test that overstates its coverage
// is the exact failure this whole suite exists to prevent — found by review,
// 2026-08-12.
//
// git also settles the working-tree-versus-committed question: untracked
// scratch files, ignored build output and other branches' worktrees under
// .claude/ are simply not in the list, so they cannot cause a spurious failure.
const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.pdf',
  '.ttf', '.otf', '.woff', '.woff2', '.mp4', '.mov', '.zip', '.gz',
  '.jar', '.keystore', '.p8', '.p12', '.mobileprovision', '.hbc',
]);

function trackedTextFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 });
  return out
    .toString('utf8')
    .split('\u0000')
    .filter(Boolean)
    .filter(f => !BINARY_EXTS.has(extname(f).toLowerCase()));
}

test('no tracked text file contains a raw NUL byte', () => {
  const files = trackedTextFiles();
  assert.ok(files.length > 50, `expected to enumerate the repo, got ${files.length} files`);

  const offenders = [];
  for (const file of files) {
    let buf;
    try {
      buf = readFileSync(join(REPO_ROOT, file));
    } catch {
      // Deleted-but-staged, or a broken symlink. Not this test's business.
      continue;
    }
    // includes() short-circuits on the first hit; only the rare offender pays
    // for a full count. The previous form built a whole new Buffer of every NUL
    // in the file just to read its length.
    if (buf.includes(0)) {
      let count = 0;
      for (const b of buf) if (b === 0) count++;
      offenders.push(`${file} (${count} NUL byte${count === 1 ? '' : 's'})`);
    }
  }

  assert.deepEqual(
    offenders, [],
    'these tracked files contain raw NUL bytes, so git treats them as binary — no diff, ' +
    'no blame, invisible to code review:\n' + offenders.map(o => `  - ${o}`).join('\n') +
    '\nUse a JavaScript escape rather than a literal NUL character. If a genuinely ' +
    'binary file needs adding, put its extension in BINARY_EXTS above.',
  );
});
