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
 *
 * SAFETY 2 — credentials (2026-08-03 incident, the very first OTA this script
 * shipped): a native build runs ON an EAS worker, where EVERY environment
 * variable is injected, including ones stored with visibility "Secret". An
 * `eas update` bundles wherever it runs — a GitHub runner — and EAS refuses to
 * hand Secret values to anything off-worker. `process.env.EXPO_PUBLIC_X || ''`
 * then compiles to an empty string, the Supabase client is never constructed,
 * and the update installs an app that launches fine and cannot sign in. The
 * publish itself succeeds and the CI job goes green, so nothing catches it
 * except the owner. auditUpdateCredentials() below blocks that before
 * publishing; the check on parseLoadedVars() after publishing rolls the update
 * back if it somehow happens anyway.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Directories whose JavaScript is what an OTA update actually replaces. Any
// EXPO_PUBLIC_* read from here has to survive the update path.
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks'];
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// EXPO_PUBLIC_* whose absence degrades something the owner would notice but
// does NOT break the app. Everything else discovered in the source is treated
// as required — a new credential is required by default, which is the only
// direction that stays safe when someone adds one and forgets this list.
const OPTIONAL_PUBLIC_VARS = new Set([
  'EXPO_PUBLIC_DEV_AUTO_SIGNIN', // simulator-only auth bypass
  'EXPO_PUBLIC_STATS_LAYOUT',    // layout experiment flag
  'EXPO_PUBLIC_SENTRY_DSN',      // crash reporting; app runs without it
  'EXPO_PUBLIC_POSTHOG_API_KEY', // analytics; app runs without it
]);

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

/** Every EXPO_PUBLIC_* the shipped JavaScript actually reads. */
function publicVarsUsedInSource(root = path.join(__dirname, '..')) {
  const found = new Set();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // directory absent in this checkout — nothing to require from it
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(full);
      } else if (SOURCE_EXTS.has(path.extname(entry.name))) {
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) {
          found.add(m[1]);
        }
      }
    }
  };
  SOURCE_DIRS.forEach(d => walk(path.join(root, d)));
  return [...found].sort();
}

/**
 * Parse `eas env:list --environment X`. Visibility is only ever stated in the
 * masked-value hint, so that hint IS the signal we need: "secret" means the
 * value exists on EAS and `eas update` will still bundle an empty string.
 */
function parseEnvList(text) {
  const vars = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, name, rest] = m;
    const visibility = /secret env variable/i.test(rest)
      ? 'secret'
      : /sensitive env variable/i.test(rest)
        ? 'sensitive'
        : 'plaintext';
    const prev = vars.get(name);
    // A name can legitimately appear twice on EAS (it happened to
    // EXPO_PUBLIC_POSTHOG_API_KEY). Remember every visibility seen: if ANY
    // copy is secret, which copy wins is not something we get to assume.
    vars.set(name, {
      visibilities: [...(prev ? prev.visibilities : []), visibility],
      count: (prev ? prev.count : 0) + 1,
    });
  }
  return vars;
}

/**
 * Decide whether an `eas update` published from here would carry real
 * credentials. Returns { errors, warnings } rather than throwing so the caller
 * can print everything at once — a half-reported env problem sends you round
 * the loop twice.
 */
function auditUpdateCredentials(required, envVars) {
  const errors = [];
  const warnings = [];

  for (const name of required) {
    const entry = envVars.get(name);
    if (!entry) {
      errors.push(`${name} is not set in the EAS environment — an update would bundle ''`);
      continue;
    }
    if (entry.visibilities.includes('secret')) {
      errors.push(
        `${name} has visibility "Secret" — EAS only injects Secret values on a ` +
        `build worker, so an update would bundle ''. Delete and re-create it ` +
        `with --visibility sensitive.`,
      );
      continue;
    }
    if (entry.count > 1) {
      errors.push(`${name} is defined ${entry.count}× in this environment — which value ships is undefined`);
    }
  }

  for (const [name, entry] of envVars) {
    if (required.includes(name)) continue;
    if (entry.count > 1) {
      warnings.push(`${name} is defined ${entry.count}× in this environment — the copies may disagree`);
    } else if (name.startsWith('EXPO_PUBLIC_') && entry.visibilities.includes('secret')) {
      warnings.push(`${name} is "Secret", so it ships as '' over the air (optional — not blocking)`);
    }
  }

  return { errors, warnings };
}

/** The names `eas update` reports it actually loaded, from its own output. */
function parseLoadedVars(updateOutput) {
  const m = updateOutput.match(/loaded from the "[^"]+" environment on EAS:\s*([^.\n]+)/);
  if (!m) return null; // no such line — CLI output changed; treat as unknown
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

/** The runtime version an update was published against — needed to roll it back. */
function parseRuntimeVersion(updateOutput) {
  const m = updateOutput.match(/^\s*Runtime version\s+(\S+)\s*$/m);
  return m ? m[1] : null;
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
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
  }

  // Only the update path can lose credentials — a build runs on an EAS worker,
  // which gets Secret values too. Checked before --dry-run returns so the local
  // dry run is a real pre-flight, not just a decision preview.
  let required = [];
  if (mode === 'update') {
    required = publicVarsUsedInSource().filter(v => !OPTIONAL_PUBLIC_VARS.has(v));
    const envVars = parseEnvList(
      run('npx', ['eas-cli', 'env:list', '--environment', 'production']),
    );
    const { errors, warnings } = auditUpdateCredentials(required, envVars);

    console.log(`\nrequired EXPO_PUBLIC_*: ${required.join(', ') || '(none)'}`);
    warnings.forEach(w => console.log(`WARNING: ${w}`));
    if (errors.length) {
      throw new Error(
        `refusing to publish an update that cannot carry credentials:\n  - ` +
        errors.join('\n  - ') +
        `\n\nAn update published in this state installs an app that launches and ` +
        `cannot sign in (2026-08-03).`,
      );
    }
    console.log('credentials pre-flight: OK — every required variable is readable off-worker');
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
    console.log(`\n$ eas update --branch production --environment production --message "${message}"`);
    // Captured, not inherited: the CLI names the variables it loaded, and that
    // line is the only proof available that the bundle it just uploaded has
    // credentials in it. Echoed verbatim so the CI log is unchanged.
    const out = run('npx', [
      'eas-cli', 'update',
      '--branch', 'production',
      // Required from SDK 55 on; the CLI hard-errors without it.
      '--environment', 'production',
      '--platform', 'ios',
      '--message', message,
      '--non-interactive',
    ]);
    console.log(out);

    const loaded = parseLoadedVars(out);
    const missing = loaded === null ? [] : required.filter(v => !loaded.includes(v));
    if (loaded === null) {
      console.log(
        'WARNING: eas update did not report which environment variables it loaded — ' +
        'the pre-flight passed, but this publish is unverified.',
      );
    } else if (missing.length) {
      // The bad update is already live. Undo it before failing: every launch
      // between now and a human noticing installs the credential-less bundle.
      const runtime = parseRuntimeVersion(out);
      console.error(`\nPUBLISHED UPDATE IS MISSING: ${missing.join(', ')} — rolling back`);
      if (runtime) {
        run('npx', [
          'eas-cli', 'update:roll-back-to-embedded',
          '--branch', 'production',
          '--platform', 'ios',
          '--runtime-version', runtime,
          '--message', `Automatic rollback: update lacked ${missing.join(', ')}`,
          '--non-interactive',
        ], { stdio: 'inherit' });
      }
      throw new Error(
        `update published without ${missing.join(', ')}` +
        (runtime ? ' — rolled back to the embedded bundle' : ' — ROLL BACK MANUALLY (no runtime version in the output)'),
      );
    } else {
      console.log(`credentials verified in the published bundle: ${required.join(', ')}`);
    }

    console.log(
      '\nNOTE: an OTA update does NOT produce a TestFlight push notification.\n' +
      'The app picks it up on next launch. Use --force-build when the owner\n' +
      'should be pinged to review something.',
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`ship: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { parseEnvList, auditUpdateCredentials, parseLoadedVars, parseRuntimeVersion, publicVarsUsedInSource };
