#!/usr/bin/env node
/**
 * Decide how to deliver main to TestFlight: a native EAS build, or a free
 * over-the-air update.
 *
 * Why this exists (owner, 2026-08-03: "this is getting expensive"): EAS builds
 * are ~$1.85 each on the Starter plan, and the last 12 production builds
 * carried only THREE distinct native fingerprints. Builds 66-72 — seven
 * consecutive builds, six of them redundant — were byte-identical natively and
 * differed only in JavaScript. expo-updates has been fully configured the whole
 * time (app.json `updates.url` + `runtimeVersion.policy: "fingerprint"`) and
 * went unused since April.
 *
 * The rule this encodes: a commit needs a NATIVE BUILD only when it changes the
 * native fingerprint (new/updated native dependency, app.json native config,
 * SDK bump, plugin change). Everything else — React components, hooks, lib/,
 * assets referenced from JS — ships over the air to the build already on the
 * device, for free and in seconds.
 *
 * Usage:
 *   node scripts/ship.js --dry-run     decide and print, do nothing
 *   node scripts/ship.js               decide and execute
 *   node scripts/ship.js --force-build always build (use when the owner should
 *                                      get a TestFlight notification to review)
 *
 * Exit codes: 0 on success, 1 on a real failure. Never guesses — if it cannot
 * determine the last build's fingerprint it falls back to building, because a
 * needless build costs $1.85 and a missed native change ships a broken app.
 *
 * SAFETY: the fingerprint reflects the INSTALLED native state, not package.json.
 * Bump a dependency without running `npm ci` and the fingerprint is unchanged,
 * so a naive comparison would ship a JS bundle referencing a native module that
 * is not in the binary — an instant crash on the owner's phone. NATIVE_PATHS
 * below is a second, git-based gate: if any of those files moved since the last
 * build's commit, this builds regardless of what the fingerprint says.
 */

const { execFileSync } = require('child_process');

// Files that can change the native binary. Mirrors the reasoning in
// scripts/check-testflight-drift.js RELEVANT_PATHS, narrowed to native-only.
const NATIVE_PATHS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^app\.json$/,
  /^app\.config\.(js|ts)$/,
  /^eas\.json$/,
  /^plugins\//,
  /^patches\//,
  /^assets\/(icon|splash|adaptive)/i,
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE_BUILD = args.includes('--force-build');

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    encoding: 'utf8',
    cwd: __dirname + '/..',
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
}

/** Native fingerprint of the working tree, as EAS computes it. */
function localFingerprint() {
  const out = run('npx', ['expo-updates', 'fingerprint:generate', '--platform', 'ios']);
  // The CLI prints JSON; be tolerant of a leading upgrade banner.
  const start = out.indexOf('{');
  if (start === -1) throw new Error(`fingerprint:generate produced no JSON:\n${out}`);
  const hash = JSON.parse(out.slice(start)).hash;
  if (!hash) throw new Error('fingerprint:generate returned no hash');
  return hash;
}

/** Fingerprint of the newest FINISHED production build — i.e. what is on
 *  TestFlight and therefore what an OTA update would land on top of. */
function lastBuild() {
  const out = run('npx', [
    'eas-cli', 'build:list',
    '--platform', 'ios',
    '--limit', '20',
    '--non-interactive',
    '--json',
  ]);
  const start = out.indexOf('[');
  if (start === -1) throw new Error('build:list produced no JSON');
  const builds = JSON.parse(out.slice(start));
  const newest = builds.find(
    b => b.buildProfile === 'production' && b.status === 'FINISHED',
  );
  if (!newest) return null;
  return {
    version: newest.appBuildVersion,
    hash: (newest.fingerprint || {}).hash || null,
    sha: (newest.gitCommitHash || '').slice(0, 8),
  };
}

/** Native-relevant files changed since the last build's commit. Empty array
 *  means the git history agrees with the fingerprint that nothing native moved. */
function nativePathsChangedSince(sha) {
  const files = new Set();

  if (!sha) {
    files.add('(unknown base commit)');
  } else {
    try {
      run('git', ['diff', '--name-only', `${sha}..HEAD`])
        .split('\n').filter(Boolean).forEach(f => files.add(f));
    } catch {
      files.add('(could not diff against the last build — commit may be missing locally)');
    }
  }

  // Uncommitted work counts too: `git diff <sha>..HEAD` only sees COMMITS, so a
  // dependency bump sitting in the working tree would otherwise look JS-only
  // and ship an OTA update against a binary that lacks the module.
  try {
    run('git', ['status', '--porcelain'])
      .split('\n').filter(Boolean)
      .map(line => line.slice(3).trim())
      .forEach(f => files.add(f));
  } catch { /* not a git checkout — the commit diff above already decided */ }

  return [...files].filter(f => f.startsWith('(') || NATIVE_PATHS.some(re => re.test(f)));
}

function commitSubject() {
  try {
    return run('git', ['log', '-1', '--pretty=%s']).trim();
  } catch {
    return 'main';
  }
}

function main() {
  const local = localFingerprint();
  const last = lastBuild();

  const nativeChanged = last ? nativePathsChangedSince(last.sha) : [];

  console.log(`local fingerprint : ${local}`);
  console.log(`last prod build   : ${last ? `${last.version} (${last.sha}) ${last.hash}` : 'none found'}`);
  console.log(`native files moved: ${nativeChanged.length ? nativeChanged.join(', ') : 'none'}`);

  let mode;
  let reason;
  if (FORCE_BUILD) {
    mode = 'build';
    reason = '--force-build requested';
  } else if (!last || !last.hash) {
    mode = 'build';
    reason = 'no finished production build with a fingerprint to compare against';
  } else if (last.hash !== local) {
    mode = 'build';
    reason = 'native fingerprint changed — an OTA update could not run on the installed binary';
  } else if (nativeChanged.length > 0) {
    mode = 'build';
    reason =
      `fingerprint matches but native-relevant files changed since ${last.sha} ` +
      `(${nativeChanged.join(', ')}) — most likely dependencies are not installed ` +
      `in this checkout, so the fingerprint is stale. Building to be safe.`;
  } else {
    mode = 'update';
    reason = `native fingerprint unchanged since build ${last.version} — JS-only, ships over the air`;
  }

  console.log(`\nDECISION: ${mode.toUpperCase()} — ${reason}`);
  if (process.env.GITHUB_OUTPUT) {
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
  }

  if (DRY_RUN) {
    console.log('(--dry-run: nothing executed)');
    return;
  }

  if (mode === 'build') {
    console.log('\n$ eas build --platform ios --profile production --non-interactive --auto-submit');
    run('npx', [
      'eas-cli', 'build',
      '--platform', 'ios',
      '--profile', 'production',
      '--non-interactive',
      '--auto-submit',
    ], { stdio: 'inherit' });
  } else {
    const message = commitSubject().slice(0, 100);
    console.log(`\n$ eas update --branch production --message "${message}"`);
    run('npx', [
      'eas-cli', 'update',
      '--branch', 'production',
      '--platform', 'ios',
      '--message', message,
      '--non-interactive',
    ], { stdio: 'inherit' });
    console.log(
      '\nNOTE: an OTA update does NOT produce a TestFlight push notification.\n' +
      'The app picks it up on next launch. Use --force-build when the owner\n' +
      'should be pinged to review something.',
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`ship: ${err.message}`);
  process.exit(1);
}
