#!/usr/bin/env node
/**
 * Visual gate for the overnight beta-feedback autopilot.
 *
 * The four compile gates in overnight.js (tsc, expo lint, design lint, expo
 * export) prove the agent's change builds. They prove nothing about how it
 * looks, and every TestFlight item this pipeline works is a visual complaint.
 * This module is the mechanical enforcement of CLAUDE.md's "never deploy UI
 * changes without visual verification" rule for this pipeline: it maps the
 * files a branch touched to the screens they can appear on, boots a Release
 * simulator build of that branch, captures each screen with Maestro, and
 * decides — as a pure function of what was actually captured, not what the
 * agent claims it looked at — whether the branch is safe to merge.
 *
 * Fail-closed by construction: no captures means no merge. A capture step
 * that cannot run (no simulator, build failure, Maestro missing) produces no
 * captures, so it fails the same way a missing screenshot does.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Core tab screens, deep-linked the same way .maestro-manual/beta-feedback-
// verify.yaml already does. Detail/dynamic screens (show/[slug],
// diary-show/[id], rate/[showId], and the standalone screens below) are not
// deep-linkable to a specific example without guessing — but an edit to one
// of them is still a UI change, so it must not silently fall through as "no
// screen touched". UNVERIFIABLE_APP_FILES below is what stops that: it forces
// decideVisualGate to refuse instead of passing on an empty screen list.
const SCREENS = [
  { label: 'Home', route: '' },
  { label: 'Watched', route: 'watched' },
  { label: 'To Watch', route: 'to-watch' },
  { label: 'Browse', route: 'browse' },
  { label: 'Lists', route: 'lists' },
  { label: 'Settings', route: 'settings' },
];

const SCREEN_FILES = {
  Home: [/^app\/\(tabs\)\/index\.tsx$/],
  Watched: [/^app\/\(tabs\)\/watched\.tsx$/],
  'To Watch': [/^app\/\(tabs\)\/to-watch\.tsx$/],
  Browse: [/^app\/\(tabs\)\/browse\.tsx$/],
  Lists: [/^app\/\(tabs\)\/lists\.tsx$/],
  Settings: [/^app\/settings\.tsx$/],
};

// A shared component, hook, or lib helper can render on any tab — this is
// exactly the class of the real defect this gate exists to catch (an
// audience card mislabelled "All time" on a season-filtered list, commit
// abca5b6, plus five cousins). Map it to every tab rather than guessing which
// one it lands on. The root/tab layouts belong in the same bucket: they wrap
// every one of the SCREENS below (nav chrome, tab bar), so capturing those
// six screens already exercises a layout change — no separate example needed.
const SHARED_PREFIXES = [
  /^components\//, /^hooks\//, /^lib\//, /^constants\//,
  /^app\/_layout\.tsx$/, /^app\/\(tabs\)\/_layout\.tsx$/,
];

// Screen files with no fixed deep-linkable instance (a specific show slug, a
// specific diary entry) or that this gate has not been taught a route for.
// screensForFiles correctly returns [] for these — there is no screen to
// capture — but [] must not read as "nothing to verify". unverifiableFiles
// flags them so decideVisualGate can refuse instead of merging blind.
const UNVERIFIABLE_APP_FILES = [
  /^app\/show\/\[slug\]\.tsx$/,
  /^app\/diary-show\/\[id\]\.tsx$/,
  /^app\/rate\/\[showId\]\.tsx$/,
  /^app\/my-shows\.tsx$/,
  /^app\/import\.tsx$/,
  /^app\/search\.tsx$/,
];

/** Pure: which known screens does this set of changed files touch? */
function screensForFiles(files) {
  const hit = new Set();
  for (const f of files) {
    const direct = Object.entries(SCREEN_FILES).find(([, patterns]) => patterns.some((re) => re.test(f)));
    if (direct) { hit.add(direct[0]); continue; }
    if (SHARED_PREFIXES.some((re) => re.test(f))) {
      SCREENS.forEach((s) => hit.add(s.label));
    }
  }
  return SCREENS.filter((s) => hit.has(s.label));
}

/** Pure: which changed files are UI this gate cannot deep-link to a specific example? */
function unverifiableFiles(files) {
  return files.filter((f) => UNVERIFIABLE_APP_FILES.some((re) => re.test(f)));
}

/**
 * Pure: the fail-closed merge decision. `captures` is whatever the capture
 * step actually produced — never trust a count or a claim, only a per-screen
 * ok+path. A screen the diff touched with no matching successful capture
 * means nobody looked at it, so this refuses regardless of how the gates or
 * the agent's own report read. `unverifiable` overrides everything else: it
 * is UI this gate cannot even attempt to capture, so an empty (therefore
 * "passing") screens/captures pair must not be read as verified.
 */
function decideVisualGate(screens, captures, unverifiable = []) {
  if (unverifiable && unverifiable.length) {
    return {
      ok: false,
      reason: `touches screen(s) this gate has no deep-linkable example for, so it cannot verify them: ${unverifiable.join(', ')} — needs a human look`,
    };
  }
  if (!screens || !screens.length) {
    return { ok: true, reason: 'no changed file maps to a known screen — nothing to capture' };
  }
  if (!captures || !captures.length) {
    return { ok: false, reason: 'capture step produced no screenshots — refusing to merge UI changes nobody looked at' };
  }
  const missing = screens.filter((s) => !captures.some((c) => c.label === s.label && c.ok && c.path));
  if (missing.length) {
    return { ok: false, reason: `no verified screenshot for: ${missing.map((s) => s.label).join(', ')}` };
  }
  return { ok: true, reason: `captured ${captures.length} screen(s): ${captures.map((c) => c.label).join(', ')}` };
}

function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findBootedDevice() {
  let out;
  try {
    out = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' });
  } catch {
    return null;
  }
  let data;
  try { data = JSON.parse(out); } catch { return null; }
  for (const devices of Object.values(data.devices || {})) {
    for (const d of devices) if (d.state === 'Booted') return d.udid;
  }
  return null;
}

/** Maestro flow that deep-links to each screen and screenshots it, mirroring .maestro-manual/beta-feedback-verify.yaml. */
function buildFlow(appId, screens, outDir) {
  const lines = [`appId: ${appId}`, '---'];
  lines.push('- launchApp:', '    clearState: false', '- extendedWaitUntil:', '    visible:', '      text: "Broadway Scorecard"', '    timeout: 30000');
  for (const s of screens) {
    lines.push(`- openLink: broadwayscorecard:///${s.route}`);
    lines.push('- tapOn:', '    text: "Open"', '    optional: true');
    lines.push('- waitForAnimationToEnd:', '    timeout: 8000');
    lines.push(`- takeScreenshot: ${path.join(outDir, slug(s.label))}`);
  }
  return lines.join('\n');
}

/**
 * Impure: build a Release sim app from `wtPath` (the way build-sim.sh /
 * CI does), install it, and capture each screen. Clones node_modules and
 * ios/ from `repoRoot` first when present — matches the render-recipe's
 * node_modules trick, and skips a from-scratch prebuild + pod install that
 * would otherwise run on every single overnight tick.
 */
function captureScreens({ repoRoot, wtPath, screens, outDir, buildTimeoutMs = 25 * 60_000, maestroTimeoutMs = 6 * 60_000 }) {
  if (!screens.length) return { ok: true, captures: [], error: null };

  const udid = findBootedDevice();
  if (!udid) return { ok: false, captures: [], error: 'no booted iOS simulator — cannot capture' };

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(path.join(wtPath, 'node_modules')) && fs.existsSync(path.join(repoRoot, 'node_modules'))) {
    try {
      execFileSync('cp', ['-cR', path.join(repoRoot, 'node_modules'), path.join(wtPath, 'node_modules')]);
      // A cloned .DerivedData/ModuleCache.noindex has the main repo's absolute
      // path baked into its precompiled modules (e.g. expo-modules-jsi's
      // xcframework cache) — clang refuses to reuse it from the worktree's
      // different path ("module cache path ... but the path is currently
      // ...", observed 2026-08-05) and the whole build fails. Deleting it is
      // safe: it is a rebuildable cache, not source.
      execFileSync('find', [path.join(wtPath, 'node_modules'), '-iname', '.DerivedData', '-type', 'd', '-prune', '-exec', 'rm', '-rf', '{}', '+']);
    } catch (e) {
      return { ok: false, captures: [], error: `could not clone node_modules into worktree: ${e.message}` };
    }
  }
  if (!fs.existsSync(path.join(wtPath, 'ios')) && fs.existsSync(path.join(repoRoot, 'ios'))) {
    // Clone project/Pods, but NOT build/ — those derived-data products have the
    // main repo's absolute path baked in, and xcodebuild against a worktree
    // whose build/ was cloned from elsewhere fails compiling the same file
    // twice for two architectures (observed 2026-08-05, 6.8GB of it here).
    // build-sim.sh passes its own -derivedDataPath build, so a clean one is
    // expected and correct, just slower on the first run.
    try {
      fs.mkdirSync(path.join(wtPath, 'ios'), { recursive: true });
      for (const entry of fs.readdirSync(path.join(repoRoot, 'ios'))) {
        if (entry === 'build') continue;
        execFileSync('cp', ['-cR', path.join(repoRoot, 'ios', entry), path.join(wtPath, 'ios', entry)]);
      }
    } catch (e) {
      return { ok: false, captures: [], error: `could not clone ios/ into worktree: ${e.message}` };
    }
  }
  const envLocal = path.join(repoRoot, '.env.local');
  if (fs.existsSync(envLocal)) {
    try { fs.copyFileSync(envLocal, path.join(wtPath, '.env.local')); } catch { /* best effort */ }
  }

  try {
    execFileSync('bash', ['scripts/build-sim.sh', udid], {
      cwd: wtPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: buildTimeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, EXPO_PUBLIC_DEV_AUTO_SIGNIN: '1' },
    });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}` || e.message;
    return { ok: false, captures: [], error: `build-sim.sh failed:\n${out.slice(-4000)}` };
  }

  let appId = 'com.broadwayscorecard.app';
  try {
    const appJson = JSON.parse(fs.readFileSync(path.join(wtPath, 'app.json'), 'utf8'));
    appId = appJson.expo?.ios?.bundleIdentifier || appId;
  } catch { /* fall back to the known bundle id */ }

  const flowPath = path.join(outDir, 'capture.yaml');
  fs.writeFileSync(flowPath, buildFlow(appId, screens, outDir));

  // maestro installs to ~/.maestro/bin, which is NOT on launchd's PATH — the
  // autopilot therefore failed to exec it at all and the capture step produced
  // nothing, indistinguishable in the report from "the screens looked wrong"
  // (2026-08-09). Resolve it by absolute path rather than trusting PATH, and
  // put both it and the JDK's bin on the child's PATH because the maestro
  // launcher shells out to `java`.
  const maestroBin = [
    path.join(os.homedir(), '.maestro', 'bin', 'maestro'),
    '/opt/homebrew/bin/maestro',
    '/usr/local/bin/maestro',
  ].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
  if (!maestroBin) {
    return { ok: false, captures: [], error: 'maestro is not installed (looked in ~/.maestro/bin, /opt/homebrew/bin, /usr/local/bin) — cannot capture screenshots' };
  }
  const javaHome = process.env.JAVA_HOME
    || ['/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
        '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home']
        .find((p) => fs.existsSync(p));
  if (!javaHome) {
    return { ok: false, captures: [], error: 'no JDK found for maestro (needs JAVA_HOME or a brew openjdk) — cannot capture screenshots' };
  }

  try {
    execFileSync(maestroBin, ['test', '--udid', udid, flowPath], {
      cwd: wtPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: maestroTimeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        JAVA_HOME: javaHome,
        PATH: `${path.join(javaHome, 'bin')}:${path.dirname(maestroBin)}:${process.env.PATH || ''}`,
      },
    });
  } catch {
    // Maestro can die partway through a flow and still leave earlier
    // screenshots on disk. Collect what actually exists below rather than
    // treating a partial run as producing nothing — decideVisualGate is
    // what turns "some missing" into "do not merge", not this catch.
  }

  const captures = screens.map((s) => {
    const file = path.join(outDir, `${slug(s.label)}.png`);
    return { label: s.label, path: fs.existsSync(file) ? file : null, ok: fs.existsSync(file) };
  });
  return { ok: captures.every((c) => c.ok), captures, error: null };
}

module.exports = { SCREENS, screensForFiles, unverifiableFiles, decideVisualGate, captureScreens, slug };
