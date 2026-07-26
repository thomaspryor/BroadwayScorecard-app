#!/usr/bin/env node
/**
 * Vendors the shared Show Stats engine from the web repo into lib/stats/.
 *
 * WHY VENDORING (plan-review 2026-07-26): the stats reducers are written ONCE,
 * in the web repo (`src/lib/stats/`), because that's where the node:test runner
 * and CI path-listing live. Copying them into the app rather than
 * re-implementing keeps one source of truth; the checksum manifest written here
 * plus vendor-stats-lib.test.mjs makes silent divergence a CI failure instead
 * of a bug someone finds in TestFlight.
 *
 * WHAT IT WRITES
 *   lib/stats/*.ts                — verbatim copies of the reducers
 *   lib/stats/venue-aliases.json  — verbatim (the reducers import it)
 *   lib/stats/theater-houses.json — DERIVED slim projection of the web repo's
 *                                   data/theater-metadata.json. The full file
 *                                   is 212KB of prose tips/dining/parking; the
 *                                   engine reads only capacity, yearBuilt and
 *                                   formerNames, and the file is not published
 *                                   to the CDN, so it can't be fetched at
 *                                   runtime the way mobile-shows.json is.
 *   lib/stats/VENDOR_MANIFEST.json — sha256 of every vendored file, plus the
 *                                   sha256 of each SOURCE file it came from.
 *
 * USAGE
 *   node scripts/vendor-stats-lib.js                  # re-vendor from ~/Broadwayscore
 *   BROADWAYSCORE_DIR=/path/to/web node scripts/…     # override the source repo
 *   node scripts/vendor-stats-lib.js --check          # exit 1 if anything drifted
 *
 * The --check mode is what a human runs after pulling web-repo changes; CI runs
 * the test file instead (it works without the web repo checked out).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const APP_ROOT = path.resolve(__dirname, '..');
const DEST_DIR = path.join(APP_ROOT, 'lib', 'stats');
const MANIFEST_PATH = path.join(DEST_DIR, 'VENDOR_MANIFEST.json');

/**
 * The Broadwayscore checkout to vendor from.
 *
 * BROADWAYSCORE_DIR is the documented name (it is what a CI job would set once
 * the web repo is checked out alongside this one); BSC_WEB_REPO stays supported
 * because existing local shells and notes use it. Only the ~/Broadwayscore
 * fallback is a guess, and every consumer treats a missing SRC_DIR as "skip",
 * never as "pass".
 */
const WEB_REPO =
  process.env.BROADWAYSCORE_DIR ||
  process.env.BSC_WEB_REPO ||
  path.join(os.homedir(), 'Broadwayscore');
const SRC_DIR = path.join(WEB_REPO, 'src', 'lib', 'stats');
const THEATER_METADATA = path.join(WEB_REPO, 'data', 'theater-metadata.json');

/** Files copied byte-for-byte. Order is the manifest order. */
const VERBATIM = [
  'types.ts',
  'parse.ts',
  'venue-match.ts',
  'venue-aliases.json',
  'season-windows.ts',
  'diary-stats.ts',
  'align-critics.ts',
  'theater-completion.ts',
  'canon-progress.ts',
  'ratings-histogram.ts',
  'index.ts',
];

/** Derived files: dest name → { source, build(sourceText) }. */
const DERIVED = {
  'theater-houses.json': {
    source: THEATER_METADATA,
    build(text) {
      const full = JSON.parse(text);
      const slim = {};
      for (const [name, meta] of Object.entries(full)) {
        if (name.startsWith('_')) continue;
        const entry = {};
        if (typeof meta.capacity === 'number') entry.capacity = meta.capacity;
        if (typeof meta.yearBuilt === 'number') entry.yearBuilt = meta.yearBuilt;
        if (Array.isArray(meta.formerNames) && meta.formerNames.length) {
          entry.formerNames = meta.formerNames;
        }
        slim[name] = entry;
      }
      return JSON.stringify(slim, null, 2) + '\n';
    },
  },
};

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function readSource(file) {
  const p = path.join(SRC_DIR, file);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing source file ${p}. Set BROADWAYSCORE_DIR to the Broadwayscore checkout.`);
  }
  return fs.readFileSync(p, 'utf8');
}

/** Header prepended to vendored .ts so nobody edits the copy by accident. */
function banner(file) {
  return [
    '// ═══════════════════════════════════════════════════════════════════════',
    '// VENDORED — DO NOT EDIT.',
    `// Source: Broadwayscore src/lib/stats/${file}`,
    '// Re-vendor with: node scripts/vendor-stats-lib.js',
    '// Drift is a CI failure (scripts/vendor-stats-lib.test.mjs).',
    '// ═══════════════════════════════════════════════════════════════════════',
    '',
  ].join('\n');
}

/**
 * Build the full vendored file set in memory: dest filename → { text, sourceSha }.
 * Pure enough to diff against what's on disk without writing anything.
 */
function buildVendorSet() {
  const out = {};
  for (const file of VERBATIM) {
    const src = readSource(file);
    // JSON can't carry a comment banner; .ts gets one.
    const text = file.endsWith('.json') ? src : banner(file) + src;
    out[file] = { text, sourceSha: sha256(src), source: `src/lib/stats/${file}` };
  }
  for (const [dest, spec] of Object.entries(DERIVED)) {
    if (!fs.existsSync(spec.source)) {
      throw new Error(`Missing derived source ${spec.source}. Set BROADWAYSCORE_DIR.`);
    }
    const src = fs.readFileSync(spec.source, 'utf8');
    out[dest] = {
      text: spec.build(src),
      sourceSha: sha256(src),
      source: path.relative(WEB_REPO, spec.source),
      derived: true,
    };
  }
  return out;
}

function webRepoSha() {
  try {
    return require('child_process')
      .execFileSync('git', ['-C', WEB_REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
      .trim();
  } catch {
    return null;
  }
}

function write(set) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const files = {};
  for (const [dest, { text, sourceSha, source, derived }] of Object.entries(set)) {
    fs.writeFileSync(path.join(DEST_DIR, dest), text);
    files[dest] = { sha256: sha256(text), source, sourceSha256: sourceSha, derived: !!derived };
  }
  const manifest = {
    _comment:
      'Generated by scripts/vendor-stats-lib.js. `sha256` guards the vendored copy and `sourceCommit` records the Broadwayscore HEAD it came from (both checked in CI without the web repo); `sourceSha256` guards the web-repo original (checked only when BROADWAYSCORE_DIR/BSC_WEB_REPO points at a checkout).',
    generatedAt: new Date().toISOString(),
    sourceRepo: 'thomaspryor/Broadwayscore',
    sourceCommit: webRepoSha(),
    files,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function check(set) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const problems = [];
  for (const [dest, { text, sourceSha }] of Object.entries(set)) {
    const rec = manifest.files[dest];
    if (!rec) {
      problems.push(`${dest}: missing from manifest — re-vendor`);
      continue;
    }
    if (rec.sourceSha256 !== sourceSha) {
      problems.push(`${dest}: WEB REPO CHANGED (source sha ${rec.sourceSha256.slice(0, 12)} → ${sourceSha.slice(0, 12)})`);
    }
    const onDisk = fs.readFileSync(path.join(DEST_DIR, dest), 'utf8');
    if (sha256(onDisk) !== rec.sha256) {
      problems.push(`${dest}: VENDORED COPY EDITED LOCALLY — revert it`);
    } else if (onDisk !== text) {
      problems.push(`${dest}: vendored copy is stale vs the web repo — re-vendor`);
    }
  }
  for (const dest of Object.keys(manifest.files)) {
    if (!set[dest]) problems.push(`${dest}: in manifest but no longer produced — remove it`);
  }
  return problems;
}

function main() {
  const isCheck = process.argv.includes('--check');
  const set = buildVendorSet();
  if (isCheck) {
    const problems = check(set);
    if (problems.length) {
      console.error('stats-lib drift:\n  ' + problems.join('\n  '));
      process.exit(1);
    }
    console.log(`stats-lib: OK (${Object.keys(set).length} files in sync with ${WEB_REPO})`);
    return;
  }
  const manifest = write(set);
  console.log(`Vendored ${Object.keys(manifest.files).length} files → lib/stats/`);
  if (!manifest.sourceCommit) {
    // The manifest test asserts sourceCommit is a real sha, so failing here is
    // strictly better than committing a manifest that fails CI later.
    console.error(
      `Could not read git HEAD of ${WEB_REPO} — refusing to write a manifest with no sourceCommit.`,
    );
    process.exit(1);
  }
  console.log(`Source commit: ${manifest.sourceCommit}`);
}

module.exports = {
  buildVendorSet,
  check,
  sha256,
  webRepoSha,
  VERBATIM,
  DERIVED,
  DEST_DIR,
  MANIFEST_PATH,
  SRC_DIR,
  WEB_REPO,
};
if (require.main === module) main();
