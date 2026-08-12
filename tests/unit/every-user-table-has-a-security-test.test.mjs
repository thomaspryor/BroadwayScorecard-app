// Fails if the app reads or writes a Supabase table that no adversarial
// security test covers.
//
// This is the systematic version of what happened on 2026-08-12. The app wrote
// to seven tables; exactly one of them (`user_review_photos`) had a two-account
// adversarial test. The moment the other six were tested, the first real run
// found a live hole: any user could attach a push notification token to
// somebody else's account and receive their notifications. Nothing else caught
// it — not typechecking, not linting, not 27 end-to-end flows, because every
// one of those runs as a single signed-in user, and a client-side
// `.eq('user_id', me)` filter looks perfectly correct against a wide-open
// table.
//
// So the gap was never "we should have written that one test". It was that
// nothing noticed the gap existed. Adding a table to the app is a one-line
// change; noticing it now needs a security test is not something to leave to
// whoever reviews the diff.
//
// This test cannot verify that the coverage is GOOD — only that it exists. A
// bad test still passes here. Its job is to make the omission loud.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const APP_DIRS = ['app', 'components', 'lib', 'hooks'];
const SECURITY_DIR = join(REPO_ROOT, 'tests', 'security');
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'ios', 'android', '.expo']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

// Tables the app touches that carry no per-user data, so an isolation test
// would have nothing to isolate. Each needs a reason, not just an entry.
const NO_USER_DATA = new Map([
  // A show-catalog stub written when someone picks a live search result that
  // is not yet in the catalog (components/ShowSearchModal.tsx:298,
  // app/import.tsx:460). The row IS the shared catalog entry; `created_by` is
  // provenance, not ownership, and the app never reads the table back. There is
  // no private data here to isolate — one user seeing another's stub is the
  // feature. Revisit if the table ever gains a per-user column that is read.
  ['user_show_stubs', 'shared catalog data; created_by is provenance, not ownership'],
]);

function walk(dir, found = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return found; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, found);
    else if (CODE_EXTS.has(extname(entry))) found.push(full);
  }
  return found;
}

// Two ways the app names a table, and the second one is why the first version
// of this test passed while lying: `lib/supabase-rest.ts` takes the table as a
// plain first argument and builds `/rest/v1/${table}` itself, so
// `supabaseRestInsert('user_show_stubs', ...)` never contains `.from(`.
// `user_show_stubs` and `unmatched_imports` are written exclusively that way
// and had no security coverage at all, which this test was supposed to notice
// (review finding, 2026-08-12).
const TABLE_PATTERNS = [
  /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g,
  /supabaseRest(?:Insert|Upsert|Update|Delete)\(\s*['"]([a-z_][a-z0-9_]*)['"]/g,
];

function tablesReferencedIn(dirs) {
  const tables = new Set();
  for (const dir of dirs) {
    for (const file of walk(join(REPO_ROOT, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const re of TABLE_PATTERNS) {
        for (const m of src.matchAll(re)) tables.add(m[1]);
      }
    }
  }
  return tables;
}

test('every user-data table the app touches has an adversarial security test', () => {
  const appTables = tablesReferencedIn(APP_DIRS);
  assert.ok(
    appTables.size >= 5,
    `expected to find the app's Supabase tables, found ${appTables.size}: ${[...appTables].join(', ')}`,
  );

  // Coverage means the ATTACKER client touched the table, not that the table
  // appears somewhere in the file. Counting any mention let a table qualify on
  // the strength of its own setup or cleanup code — a table could be "covered"
  // by a test that only ever reads its own rows, which asserts nothing about
  // isolation (review finding, 2026-08-12).
  //
  // Throughout tests/security/, `sbB` is the second account attacking the
  // first. Requiring `sbB.from('table')` is what distinguishes an adversarial
  // assertion from fixture bookkeeping.
  let securitySrc = '';
  for (const f of readdirSync(SECURITY_DIR)) {
    if (f.endsWith('.test.mjs')) securitySrc += readFileSync(join(SECURITY_DIR, f), 'utf8');
  }
  const covered = new Set(
    [...securitySrc.matchAll(/sbB\s*\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g)].map(m => m[1]),
  );

  const uncovered = [...appTables]
    .filter(t => !covered.has(t))
    .filter(t => !NO_USER_DATA.has(t))
    .sort();

  assert.deepEqual(
    uncovered, [],
    'the app reads or writes these tables and no test in tests/security/ touches them, so ' +
    'nothing would notice if their row-level security were wrong:\n' +
    uncovered.map(t => `  - ${t}`).join('\n') +
    '\nAdd two-account coverage in tests/security/, or list the table in NO_USER_DATA ' +
    'above with a reason why isolation does not apply to it.',
  );
});
