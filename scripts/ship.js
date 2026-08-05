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
const os = require('os');
const path = require('path');

// Files that can change the native binary. Must stay a SUBSET of
// scripts/check-testflight-drift.js RELEVANT_PATHS — a file that is native
// here but invisible there decides should_build=false and ships nothing.
// Locked by scripts/ship-paths.test.mjs.
//
// COST WARNING, measured 2026-08-03: Expo hashes package.json WHOLESALE, so
// editing the "scripts" block — pure tooling, zero effect on the binary —
// moves the fingerprint and turns the next ship into a $1.85 build. Same trap
// as .gitignore below. Batch package.json housekeeping with work that was
// going to need a native build anyway.
const NATIVE_PATHS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^app\.json$/,
  /^app\.config\.(js|ts)$/,
  /^eas\.json$/,
  /^plugins\//,
  /^patches\//,
  /^assets\/(icon|splash|adaptive)/i,
  // The icons this app actually ships live a directory deeper than the pattern
  // above — app.json points icon at ./assets/images/icon.png and the splash
  // plugin at ./assets/images/splash-icon.png. Without these, replacing the app
  // icon looks JS-only, ships as a free OTA, and the icon never changes on the
  // phone (found 2026-08-05 while writing the overnight autopilot's guard).
  /^assets\/images\/(icon|splash|adaptive|favicon|android-icon)/i,
  // Not obvious and it cost a build to learn: .gitignore decides which files
  // Expo hashes, so editing it moves the fingerprint and forces a $1.85 build
  // out of what looks like a cosmetic change (2026-08-03).
  /^\.gitignore$/,
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
  // Capture-rig / dev-only toggles (2026-08-04): each has an explicit `!== '1'`
  // / `=== '1'` guard or a hardcoded fallback, so an unset value is the correct
  // production behavior, not a degraded one. Discovered blocking a real ship —
  // the source reads predate this allowlist entry.
  'EXPO_PUBLIC_AUTOSCROLL',      // show/[slug].tsx, Onboarding.tsx — auto-paging for simctl captures
  'EXPO_PUBLIC_DATA_BASE',       // lib/api.ts — falls back to the real production CDN URL when unset
  'EXPO_PUBLIC_EXPAND_AWARDS',   // show/[slug].tsx — initial expand state for the awards card, defaults collapsed
  'EXPO_PUBLIC_GRID_COLS',       // hooks/usePosterGrid.ts — column-count override, falls back to the caller's default
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
  // --build-profile filters SERVER-side and the sort is explicit, matching
  // check-testflight-drift.js:100. Without both, a burst of sim-prod/dev builds
  // can push every production build out of the window, lastBuild() returns null
  // and ship.js buys an unnecessary native build (second-opinion, 2026-08-03).
  const out = run('npx', [
    'eas-cli', 'build:list',
    '--platform', 'ios',
    '--build-profile', 'production',
    '--limit', '25',
    '--non-interactive',
    '--json',
  ]);
  const start = out.indexOf('[');
  if (start === -1) throw new Error('build:list produced no JSON');
  const builds = JSON.parse(out.slice(start));
  const newest = builds
    .filter(b => b.buildProfile === 'production' && b.status === 'FINISHED')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
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
    // -z is NOT optional. Plain --porcelain quotes paths containing spaces
    // (`?? "my app.json"`) and renders renames as `R  old -> new`; both then
    // fail every ^-anchored NATIVE_PATHS regex, so a `git mv` into app.json or
    // any native asset with a space in its name silently shipped an OTA
    // (second-opinion, 2026-08-03). With -z, records are NUL-separated, paths
    // are never quoted, and a rename's destination is its own trailing record.
    run('git', ['status', '--porcelain', '-z'])
      .split('\0').filter(Boolean)
      .map(rec => (rec.length > 3 && rec[2] === ' ' ? rec.slice(3) : rec))
      .forEach(f => files.add(f));
  } catch { /* not a git checkout — the commit diff above already decided */ }

  return [...files].filter(f => f.startsWith('(') || NATIVE_PATHS.some(re => re.test(f)));
}

/** Blank out `//` and block comments so prose about code is not read as code. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // the [^:] keeps https:// intact
}

/**
 * Every EXPO_PUBLIC_* the shipped JavaScript actually reads, plus any read
 * written in a form Expo cannot inline.
 *
 * babel-preset-expo substitutes EXPO_PUBLIC_* at bundle time by rewriting the
 * literal member expression `process.env.EXPO_PUBLIC_X`. It does NOT rewrite
 * `process.env['EXPO_PUBLIC_X']` or `const { EXPO_PUBLIC_X } = process.env` —
 * those read an object that does not exist on the device and are `undefined`
 * no matter how the variable is configured on EAS. So they are not "another
 * spelling to also require": they are a defect, reported as `unsupported`.
 * Returns { required, unsupported }.
 */
function publicVarsUsedInSource(root = path.join(__dirname, '..')) {
  const found = new Set();
  const unsupported = [];
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
        // Comments are stripped first. An `unsupported` hit blocks every OTA
        // until someone edits the source, so a sentence in a docblock
        // explaining what not to write must not be able to wedge shipping.
        const src = stripComments(fs.readFileSync(full, 'utf8'));
        const rel = path.relative(root, full);
        for (const m of src.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) {
          found.add(m[1]);
        }
        for (const m of src.matchAll(/process\.env\[\s*['"`](EXPO_PUBLIC_[A-Z0-9_]+)['"`]\s*\]/g)) {
          unsupported.push(`${rel}: process.env['${m[1]}']`);
        }
        for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*process\.env/g)) {
          for (const n of m[1].matchAll(/(EXPO_PUBLIC_[A-Z0-9_]+)/g)) {
            unsupported.push(`${rel}: destructured ${n[1]}`);
          }
        }
      }
    }
  };
  SOURCE_DIRS.forEach(d => walk(path.join(root, d)));
  return { required: [...found].sort(), unsupported: unsupported.sort() };
}

/**
 * Parse `eas env:list --environment X`. Only used to spot DUPLICATE names,
 * which `eas env:pull` cannot show (it emits one line per name) — the values
 * themselves come from the pull, not from reading this prose.
 *
 * Parsing starts after the "Environment:" header so CLI banners, upgrade
 * notices and yarn warnings above it cannot manufacture an entry.
 *
 * Classification fails CLOSED: a value that is masked but carries no
 * recognised "sensitive" wording is treated as secret. If EAS reworded the
 * hint, the wrong guess must be the one that blocks a ship, not the one that
 * publishes an app that cannot sign in.
 */
function parseEnvList(text) {
  const vars = new Map();
  const lines = text.split('\n');
  const start = lines.findIndex(l => /^Environment:/.test(l.trim()));
  for (const line of start === -1 ? lines : lines.slice(start + 1)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, name, rest] = m;
    const masked = rest.trim().startsWith('*****');
    const visibility = /secret env variable/i.test(rest)
      ? 'secret'
      : /sensitive env variable/i.test(rest)
        ? 'sensitive'
        : masked
          ? 'secret' // masked but unrecognised wording — assume the worst
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
function auditUpdateCredentials(required, envVars, resolved) {
  if (!(resolved instanceof Map)) {
    // Not defensive noise: an earlier version of this function inferred the
    // answer from visibility wording when it had no values, and a caller that
    // silently fell back to that path is exactly how a broken bundle ships.
    throw new Error('auditUpdateCredentials requires the resolved values from eas env:pull');
  }
  const errors = [];
  const warnings = [];

  for (const name of required) {
    // The pulled values are the authority: they are the same set `eas update`
    // resolves, in a machine-readable format, so this checks what will
    // actually be compiled in rather than inferring it from a visibility hint.
    const value = resolved.get(name);
    const entry = envVars.get(name);

    if (value === undefined || value === '') {
      errors.push(
        `${name} resolves to ${value === undefined ? 'nothing' : "''"} for this environment` +
        (entry && entry.visibilities.includes('secret')
          ? ' — it has visibility "Secret", which EAS only injects on a build ' +
            'worker. Delete and re-create it with --visibility sensitive.'
          : ' — an update would bundle an empty string.'),
      );
      continue;
    }

    if (!entry) {
      errors.push(`${name} is not set in the EAS environment — an update would bundle ''`);
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

/**
 * The values `eas update` will actually compile in, read the only way that
 * does not depend on CLI prose: `eas env:pull` writes them as a .env file.
 * Secret-visibility variables are simply absent from it, which is exactly the
 * condition that broke sign-in — so absence and emptiness are both failures.
 *
 * Pulled to a temp path, never the default .env.local: that file is a
 * developer's local config and this script must not overwrite it.
 */
function resolvedEnvValues(environment) {
  const target = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ship-env-')),
    '.env',
  );
  try {
    run('npx', [
      'eas-cli', 'env:pull',
      '--environment', environment,
      '--path', target,
      '--non-interactive',
    ]);
    return parseDotenv(fs.readFileSync(target, 'utf8'));
  } finally {
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
  }
}

/**
 * .env reader for what `eas env:pull` writes. Deliberately hand-rolled: the
 * only `dotenv` in this tree is a transitive dependency of eas-cli, and adding
 * a direct one would change package.json — which moves the native fingerprint
 * and turns the next free OTA into a $1.85 build.
 *
 * The cases that matter are the ones where a sloppy parser reads a value as
 * NON-empty when it is empty, because that is the direction that ships a
 * broken app: an `export ` prefix, a quoted value, and a trailing comment.
 */
function parseDotenv(text) {
  const values = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || line.trim().startsWith('#')) continue;
    const raw = m[2];
    let value = raw.trim();

    const quote = value[0] === '"' || value[0] === "'" ? value[0] : null;
    if (quote) {
      // Everything up to the matching close quote; anything after it (a
      // trailing comment) is not part of the value.
      const end = value.indexOf(quote, 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else if (/^\s/.test(raw) && value.startsWith('#')) {
      // `KEY= # not set yet` — space after the `=` then a comment, so the
      // variable is empty. `KEY=#abc` is a value that happens to start with
      // '#' and must survive: blocking it would be a false alarm that stops
      // shipping entirely.
      value = '';
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values.set(m[1], value);
  }
  return values;
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
    const scan = publicVarsUsedInSource();
    if (scan.unsupported.length) {
      throw new Error(
        `these EXPO_PUBLIC_* reads are never inlined by Expo and are undefined ` +
        `on the device regardless of EAS configuration — rewrite them as ` +
        `process.env.EXPO_PUBLIC_X:\n  - ${scan.unsupported.join('\n  - ')}`,
      );
    }
    required = scan.required.filter(v => !OPTIONAL_PUBLIC_VARS.has(v));
    const envVars = parseEnvList(
      run('npx', ['eas-cli', 'env:list', '--environment', 'production']),
    );
    // A failed pull is fatal, not a reason to fall back to reading prose:
    // being unable to see the values is exactly when guessing is worst.
    const resolved = resolvedEnvValues('production');
    const { errors, warnings } = auditUpdateCredentials(required, envVars, resolved);

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
    console.log('credentials pre-flight: OK — every required variable resolves to a non-empty value');
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
      // Unverifiable is not the same as bad — the pre-flight read the actual
      // values, so the update is very likely fine and rolling it back would
      // undo good work over a CLI wording change. Leave it live, fail the job
      // loudly, and make a human look.
      // Note for whoever hits this: re-running the job republishes rather than
      // retrying, so fix parseLoadedVars() before dispatching again.
      throw new Error(
        'eas update did not report which environment variables it loaded, so ' +
        'this publish could not be verified. The update is LIVE and the ' +
        'pre-flight passed — check it, then update parseLoadedVars() for the ' +
        'new CLI output. Do not simply re-run: that publishes a second update.',
      );
    } else if (missing.length) {
      // The bad update is already live. Undo it before failing: every launch
      // between now and a human noticing installs the credential-less bundle.
      // `local` is the fingerprint this update was published against, so the
      // rollback does not depend on parsing it back out of the CLI output.
      // Safe against clobbering a concurrent ship only because the workflow
      // pins `concurrency: eas-build` with cancel-in-progress false — two
      // publishes to this branch cannot overlap. Keep that group if this ever
      // moves to another trigger.
      const runtime = parseRuntimeVersion(out) || local;
      console.error(`\nPUBLISHED UPDATE IS MISSING: ${missing.join(', ')} — rolling back`);
      let rolledBack = false;
      try {
        run('npx', [
          'eas-cli', 'update:roll-back-to-embedded',
          '--branch', 'production',
          '--platform', 'ios',
          '--runtime-version', runtime,
          '--message', `Automatic rollback: update lacked ${missing.join(', ')}`,
          '--non-interactive',
        ], { stdio: 'inherit' });
        rolledBack = true;
      } catch (rollbackErr) {
        console.error(`rollback FAILED: ${rollbackErr.message}`);
      }
      throw new Error(
        `update published without ${missing.join(', ')}` +
        (rolledBack
          ? ' — rolled back to the embedded bundle'
          : ` — ROLL BACK MANUALLY:\n  npx eas-cli update:roll-back-to-embedded ` +
            `--branch production --platform ios --runtime-version ${runtime}`),
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

module.exports = {
  // Exported so scripts/ship-paths.test.mjs can assert this stays a subset of
  // check-testflight-drift.js RELEVANT_PATHS — a file that is native here but
  // invisible there means NOTHING ships.
  NATIVE_PATHS,
  parseEnvList,
  parseDotenv,
  auditUpdateCredentials,
  parseLoadedVars,
  parseRuntimeVersion,
  publicVarsUsedInSource,
};
