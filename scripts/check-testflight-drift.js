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
// Flags (for local testing):
//   --base=<sha>         override the last-build commit
//   --head=<ref>         override HEAD (default: HEAD)
//   --ignore-inflight    skip the in-flight-build check

const { execFileSync } = require('child_process');

// Paths that ship in the app binary/JS bundle. memory/, scripts/, .maestro/,
// .github/, store-listing/, dist/ and markdown never reach the user's phone.
const RELEVANT_PATHS = [
  /^app\//,
  /^components\//,
  /^constants\//,
  /^hooks\//,
  /^lib\//,
  /^plugins\//,
  /^assets\//,
  /^ios\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^app\.json$/,
  /^eas\.json$/,
];

function isUserVisible(file) {
  if (/\.md$/i.test(file)) return false;
  return RELEVANT_PATHS.some((re) => re.test(file));
}

// Pure decision core (required-testable via require()):
// builds = parsed `eas build:list --json`, changedFiles = git diff names.
function decide({ builds, changedFiles, ignoreInflight = false }) {
  const prod = builds.filter((b) => b.buildProfile === 'production');
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
  const visible = changedFiles.filter(isUserVisible);
  if (visible.length === 0) {
    return { shouldBuild: false, reason: `no user-visible changes since build ${last.appBuildVersion} (${(last.gitCommitHash || '').slice(0, 9)}); ${changedFiles.length} non-app file(s) changed` };
  }
  return {
    shouldBuild: true,
    reason: `build ${last.appBuildVersion} (${(last.gitCommitHash || '').slice(0, 9)}) is missing ${visible.length} user-visible change(s), e.g. ${visible.slice(0, 5).join(', ')}`,
  };
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? true] : [a, true];
    })
  );

  const listJson = execFileSync(
    'npx',
    ['--yes', 'eas-cli', 'build:list', '--platform', 'ios', '--limit', '25', '--non-interactive', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const builds = JSON.parse(listJson);

  const head = args.head || 'HEAD';
  let base = args.base;
  if (!base) {
    const last = builds.filter((b) => b.buildProfile === 'production').find((b) => b.status === 'FINISHED');
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

  const { shouldBuild, reason } = decide({ builds, changedFiles, ignoreInflight: !!args['ignore-inflight'] });
  console.log(`should_build=${shouldBuild}`);
  console.log(`reason: ${reason}`);
  if (process.env.GITHUB_OUTPUT) {
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `should_build=${shouldBuild}\n`);
  }
}

module.exports = { decide, isUserVisible };
if (require.main === module) main();
