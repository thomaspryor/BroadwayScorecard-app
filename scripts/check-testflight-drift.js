#!/usr/bin/env node
// TestFlight drift gate: should the scheduled eas-build.yml run kick off a
// production build? Compares main HEAD against the commit of the last FINISHED
// production EAS build, counting only user-visible app paths. Prevents the
// 2026-07-24 build-54 incident class: merged app work sitting undelivered
// because nothing rebuilds TestFlight automatically.
//
// Exit code is always 0 on a clean decision; the decision is written to stdout
// and (in CI) to $GITHUB_OUTPUT as should_build=true|false.
//
// Env:  TESTFLIGHT_GATE_DISABLED=true  kill switch — always outputs false
// Flags (for local testing):
//   --base=<sha>         override the last-build commit
//   --head=<ref>         override HEAD (default: HEAD)
//   --ignore-inflight    skip the in-flight-build check

const { execFileSync } = require('child_process');

// Paths that ship in the app binary/JS bundle. memory/, scripts/, .maestro/,
// .github/, store-listing/, eslint config and markdown never reach the user's
// phone. ios/ is intentionally absent: it's gitignored (expo prebuild output);
// native changes arrive via app.json/plugins/package.json, which ARE listed.
const RELEVANT_PATHS = [
  /^app\//,
  /^components\//,
  /^constants\//,
  /^hooks\//,
  /^lib\//,
  /^plugins\//,
  /^assets\//,
  /^index\.js$/, // Expo Router entry bridge — in the bundle
  /^tsconfig\.json$/, // paths aliases (@/*) resolved by Metro at bundle time
  /^package\.json$/,
  /^package-lock\.json$/,
  /^app\.json$/,
  /^app\.config\.(js|ts)$/,
  /^babel\.config\.js$/,
  /^metro\.config\.js$/,
  /^eas\.json$/,
];

// If the newest FINISHED production build is older than this AND any commit
// (visible or not) landed since, build regardless of path relevance. Backstop
// for two blind spots: a path class this list misses, and a FINISHED build
// whose --auto-submit step failed (this gate can't see submission state —
// build:list JSON has no submissions field — so a red eas-build run would
// otherwise never be retried).
const MAX_BASELINE_AGE_DAYS = 14;

function isUserVisible(file) {
  if (/\.md$/i.test(file)) return false;
  return RELEVANT_PATHS.some((re) => re.test(file));
}

// Pure decision core (tested by check-testflight-drift.test.mjs):
// builds = parsed `eas build:list --json` (any order — sorted here),
// changedFiles = git diff names vs the baseline commit (null = diff failed).
function decide({ builds, changedFiles, ignoreInflight = false, killSwitch = false, nowMs = Date.now() }) {
  if (killSwitch) {
    return { shouldBuild: false, reason: 'TESTFLIGHT_GATE_DISABLED=true — kill switch active' };
  }
  const prod = builds
    .filter((b) => b.buildProfile === 'production')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  if (!ignoreInflight) {
    const inflight = prod.find((b) => ['NEW', 'IN_QUEUE', 'IN_PROGRESS'].includes(b.status));
    if (inflight) {
      return { shouldBuild: false, reason: `production build ${inflight.appBuildVersion ?? '?'} already ${inflight.status} — wait for it` };
    }
  }
  const last = prod.find((b) => b.status === 'FINISHED');
  if (!last) return { shouldBuild: true, reason: 'no FINISHED production build found — baseline missing, building' };
  if (changedFiles === null) {
    return { shouldBuild: true, reason: `cannot diff against last build commit ${last.gitCommitHash} — assuming drift, building` };
  }
  const baseline = `build ${last.appBuildVersion} (${(last.gitCommitHash || '').slice(0, 9)})`;
  const visible = changedFiles.filter(isUserVisible);
  if (visible.length > 0) {
    return { shouldBuild: true, reason: `${baseline} is missing ${visible.length} user-visible change(s), e.g. ${visible.slice(0, 5).join(', ')}` };
  }
  const ageDays = (nowMs - new Date(last.createdAt || nowMs)) / 86400000;
  if (changedFiles.length > 0 && ageDays > MAX_BASELINE_AGE_DAYS) {
    return { shouldBuild: true, reason: `${baseline} is ${Math.floor(ageDays)}d old with ${changedFiles.length} commit-file(s) since — age backstop (missed path class or failed submission)` };
  }
  return { shouldBuild: false, reason: `no user-visible changes since ${baseline}; ${changedFiles.length} non-app file(s) changed` };
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? true] : [a, true];
    })
  );

  // Plain `npx eas-cli` resolves the repo's pinned devDependency (^18.x from
  // package.json) after npm ci — never `--yes latest`, so gate and build agree.
  const rawList = execFileSync(
    'npx',
    ['eas-cli', 'build:list', '--platform', 'ios', '--build-profile', 'production', '--limit', '25', '--non-interactive', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );
  // Nag/update banners go to stderr, but slice to the JSON array defensively.
  const builds = JSON.parse(rawList.slice(rawList.indexOf('[')));

  const head = args.head || 'HEAD';
  let base = args.base;
  if (!base) {
    const last = builds
      .filter((b) => b.buildProfile === 'production' && b.status === 'FINISHED')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    base = last ? last.gitCommitHash : null;
  }

  let changedFiles = null;
  if (base) {
    try {
      changedFiles = execFileSync('git', ['diff', '--name-only', `${base}..${head}`], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);
    } catch {
      changedFiles = null; // unknown sha (force-push / shallow clone) → decide() fails open to building
    }
  }

  const { shouldBuild, reason } = decide({
    builds,
    changedFiles,
    ignoreInflight: !!args['ignore-inflight'],
    killSwitch: process.env.TESTFLIGHT_GATE_DISABLED === 'true',
  });
  console.log(`should_build=${shouldBuild}`);
  console.log(`reason: ${reason}`);
  console.log(`::notice title=TestFlight drift gate::should_build=${shouldBuild} — ${reason}`);
  if (process.env.GITHUB_OUTPUT) {
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `should_build=${shouldBuild}\n`);
  }
}

module.exports = { decide, isUserVisible };
if (require.main === module) main();
