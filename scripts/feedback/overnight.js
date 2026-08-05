#!/usr/bin/env node
/**
 * Overnight beta-feedback autopilot.
 *
 * Pulls new TestFlight feedback, hands the owner's own unactioned items to a
 * headless Claude Code run in an isolated worktree, then — only if that run
 * left a clean, gated, committed branch — merges it and ships an OTA update.
 * Writes a morning report to ~/Documents/claude-outputs/.
 *
 * Division of labour is deliberate. The agent implements and commits inside its
 * own worktree and marks the ledger. It never merges, never pushes, never
 * ships. Those three steps are here, in code that always runs the same way,
 * because they are the ones that cost money or reach the owner's phone.
 *
 *   node scripts/feedback/overnight.js [--dry-run] [--max N] [--no-pull]
 *                                      [--no-ship] [--timeout-min N]
 *
 * Kill switches (either stops a run before it does anything):
 *   FEEDBACK_AUTOPILOT_DISABLED=1
 *   ~/.claude/broadwayscore-feedback/DISABLED   (file exists)
 */

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ledger = require('./ledger');

const REPO = path.resolve(__dirname, '..', '..');
const OUTPUTS = path.join(os.homedir(), 'Documents', 'claude-outputs');
const LOGS = path.join(ledger.HOME, 'runs');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};

const DRY_RUN = has('dry-run');
const MAX_ITEMS = Number(arg('max', 6));
const TIMEOUT_MIN = Number(arg('timeout-min', 180));
const SKIP_PULL = has('no-pull');
const SKIP_SHIP = has('no-ship');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_LOG = path.join(LOGS, `${stamp}.log`);

function log(...m) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${m.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(RUN_LOG, `${line}\n`); } catch { /* log dir may not exist yet */ }
}

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

function tryShell(cmd, args, opts = {}) {
  try { return { ok: true, out: sh(cmd, args, opts) }; }
  catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` || e.message }; }
}

// ---------------------------------------------------------------- preflight

function preflight() {
  if (process.env.FEEDBACK_AUTOPILOT_DISABLED === '1') return 'FEEDBACK_AUTOPILOT_DISABLED=1';
  if (fs.existsSync(path.join(ledger.HOME, 'DISABLED'))) return `${ledger.HOME}/DISABLED exists`;

  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch !== 'main') return `checkout is on '${branch}', not main`;

  const dirty = sh('git', ['status', '--porcelain']).trim();
  // Refusing on a dirty tree is not fussiness: the agent branches from this
  // checkout, and uncommitted work here would be silently swept into an
  // overnight commit nobody reviewed.
  if (dirty) return `working tree is dirty:\n${dirty.split('\n').slice(0, 10).join('\n')}`;

  return null;
}

// ------------------------------------------------------------------- seed

function seedPrompt(items, worktree) {
  const list = items.map((i, n) => {
    const shots = (i.screenshots || []).map((f) => path.join(ledger.IMAGES, f));
    return [
      `### Item ${n + 1} — id \`${i.id}\`  (submitted ${i.createdDate})`,
      `Owner wrote: ${JSON.stringify(i.comment)}`,
      shots.length ? `Screenshot(s) — READ THESE IMAGES, they show the exact screen:\n${shots.map((s) => `  ${s}`).join('\n')}` : '  (no screenshot attached)',
    ].join('\n');
  }).join('\n\n');

  return `You are the overnight TestFlight beta-feedback autopilot for the Broadway
Scorecard iOS app. The owner submitted the feedback below from TestFlight and it
has not been actioned yet. Implement it.

You are working in an isolated git worktree at:
  ${worktree}
Everything you do must happen there. Do not touch ${REPO} directly.

## The feedback

${list}

## How to work

1. For EVERY item, Read the attached screenshot first. The comments say "this
   screen" and "these tiles" — the image is the only thing that says which.
   Cross-reference against the code to find the real component before editing.
2. Read CLAUDE.md and memory/ in the worktree. The app mirrors the web project
   at ~/Broadwayscore; when an item says "match the web" or "like mobile web",
   go read the web component and match it rather than inventing a design.
3. Implement each item as a small, self-contained change. Prefer the smallest
   edit that satisfies what was asked.
4. Score badges are sacred — never change their size, position, or shape unless
   the feedback item is explicitly about the score badge.

## Gates — all four must pass before you commit

    npx tsc --noEmit
    npx expo lint
    npm run lint:design
    npx expo export --platform ios

If a gate fails, fix it. If you cannot, revert that item's change and mark the
item deferred (below) rather than committing something broken.

## Recording what you did — this is not optional

The ledger is the only record that a piece of feedback was handled. After
committing, for each item, run from ${REPO}:

    node scripts/feedback/ledger.js --done <id> --commit <sha> --note "<one line>"

If you decided NOT to implement an item — too large, too ambiguous, needs a
product decision, needs a native change, or you could not reproduce it — do NOT
guess. Mark it deferred with the reason:

    node scripts/feedback/ledger.js --defer <id> --note "<why a human is needed>"

Deferring is a good outcome. A wrong fix shipped overnight to the owner's phone
is a much worse one. Be conservative: if an item would mean a large refactor, a
new dependency, a schema change, anything in ios/ or app.json, or a design
judgement the owner has not already made, defer it.

## What you must NOT do

- Do not merge to main. Do not push. Do not run scripts/ship.js or eas.
  The driver does all three after checking your work.
- Do not modify anything under ios/, app.json, app.config.*, plugins/, or
  package.json dependencies. Those force a paid native build; defer instead.
- Do not rewrite unrelated code, reformat files, or "clean up while you're here".

## Finish

Commit your work with a message that names the item ids, e.g.

    fix: 4 TestFlight beta-feedback items (overnight ${stamp.slice(0, 10)})

    - <id>: <what changed>
    ...

Leave the branch committed and stop. Report which ids you completed and which
you deferred.`;
}

// -------------------------------------------------------------------- run

async function runAgent(items) {
  const wtName = `feedback-overnight-${stamp.slice(0, 10)}`;
  const wtPath = path.join(REPO, '.claude', 'worktrees', wtName);
  const branch = `worktree-${wtName}`;

  if (fs.existsSync(wtPath)) {
    log(`worktree ${wtName} already exists — removing`);
    tryShell('git', ['worktree', 'remove', '--force', wtPath]);
    tryShell('git', ['branch', '-D', branch]);
  }
  sh('git', ['worktree', 'add', '-b', branch, wtPath, 'main']);
  log(`worktree ${wtPath} on ${branch}`);

  const prompt = seedPrompt(items, wtPath);
  fs.writeFileSync(path.join(LOGS, `${stamp}.seed.md`), prompt);

  const agentLog = path.join(LOGS, `${stamp}.agent.log`);
  log(`launching headless agent (timeout ${TIMEOUT_MIN}m); log: ${agentLog}`);

  const code = await new Promise((resolve) => {
    const out = fs.openSync(agentLog, 'a');
    const child = spawn('claude', ['--dangerously-skip-permissions', prompt], {
      cwd: wtPath,
      stdio: ['ignore', out, out],
      env: { ...process.env, FEEDBACK_AUTOPILOT_RUN: stamp },
    });
    const timer = setTimeout(() => {
      log(`agent exceeded ${TIMEOUT_MIN}m — killing`);
      child.kill('SIGKILL');
    }, TIMEOUT_MIN * 60_000);
    child.on('exit', (c) => { clearTimeout(timer); fs.closeSync(out); resolve(c); });
    child.on('error', (e) => { clearTimeout(timer); fs.closeSync(out); log('agent spawn failed:', e.message); resolve(-1); });
  });

  log(`agent exited ${code}`);
  const commits = sh('git', ['log', '--oneline', `main..${branch}`]).trim();
  return { branch, wtPath, commits: commits ? commits.split('\n') : [], agentExit: code };
}

// ------------------------------------------------------------------ gates

function runGates(cwd) {
  const gates = [
    ['typecheck', 'npx', ['tsc', '--noEmit']],
    ['lint', 'npx', ['expo', 'lint']],
    ['design-lint', 'npm', ['run', 'lint:design']],
    ['export', 'npx', ['expo', 'export', '--platform', 'ios']],
  ];
  const results = [];
  for (const [name, cmd, args] of gates) {
    const r = tryShell(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    log(`gate ${name}: ${r.ok ? 'PASS' : 'FAIL'}`);
    if (!r.ok) log(r.out.split('\n').slice(-25).join('\n'));
    results.push({ name, ok: r.ok, out: r.ok ? '' : r.out.split('\n').slice(-40).join('\n') });
  }
  return results;
}

// ------------------------------------------------------------------- ship

function mergeAndShip(branch) {
  log(`merging ${branch} into main`);
  sh('git', ['checkout', 'main']);
  tryShell('git', ['fetch', 'origin', 'main']);
  const ff = tryShell('git', ['merge', '--ff-only', 'origin/main']);
  if (!ff.ok) log('note: could not fast-forward to origin/main — merging anyway');
  const merge = tryShell('git', ['merge', '--no-ff', branch, '-m', `Merge ${branch} (overnight beta-feedback autopilot)`]);
  if (!merge.ok) {
    tryShell('git', ['merge', '--abort']);
    return { merged: false, pushed: false, shipped: false, reason: `merge conflict:\n${merge.out.slice(0, 800)}` };
  }

  const push = tryShell('git', ['push', 'origin', 'main']);
  if (!push.ok) {
    // Retry once against a moved remote rather than leaving an unpushed merge.
    tryShell('git', ['fetch', 'origin', 'main']);
    const rebase = tryShell('git', ['rebase', 'origin/main']);
    const retry = rebase.ok ? tryShell('git', ['push', 'origin', 'main']) : { ok: false, out: rebase.out };
    if (!retry.ok) return { merged: true, pushed: false, shipped: false, reason: `push failed:\n${retry.out.slice(0, 800)}` };
  }
  log('pushed to origin/main');

  if (SKIP_SHIP) return { merged: true, pushed: true, shipped: false, reason: '--no-ship' };

  // Decide before shipping. An overnight run must never buy a $1.85 native
  // build — the owner decides when to spend that, and a native change should
  // not have got past the agent's rules in the first place.
  const dry = tryShell('node', ['scripts/ship.js', '--dry-run']);
  const decision = (dry.out.match(/DECISION: (BUILD|UPDATE)[^\n]*/) || [])[0] || 'DECISION: (unreadable)';
  log(decision);
  if (!dry.ok) return { merged: true, pushed: true, shipped: false, reason: `ship --dry-run failed:\n${dry.out.slice(-800)}` };
  if (/DECISION: BUILD/.test(dry.out)) {
    return { merged: true, pushed: true, shipped: false, reason: `native build required — ${decision}. Overnight runs never buy a build; ship it yourself with: gh workflow run eas-build.yml --ref main` };
  }

  const ship = tryShell('node', ['scripts/ship.js']);
  if (!ship.ok) return { merged: true, pushed: true, shipped: false, reason: `ship failed:\n${ship.out.slice(-800)}` };
  log('OTA update published');
  return { merged: true, pushed: true, shipped: true, reason: 'OTA update published' };
}

// ----------------------------------------------------------------- report

function writeReport(sections) {
  fs.mkdirSync(OUTPUTS, { recursive: true });
  const file = path.join(OUTPUTS, `beta-feedback-overnight-${stamp.slice(0, 10)}.md`);
  fs.writeFileSync(file, sections);
  log(`report: ${file}`);
  return file;
}

function reportBody({ taken, result, gates, ship, pending, deferred, done }) {
  const L = [];
  L.push(`# Overnight beta feedback — ${stamp.slice(0, 10)}`);
  L.push('');
  L.push(`Ran at ${new Date().toString()}`);
  L.push('');

  L.push('## Shipped');
  if (ship && ship.shipped) L.push(`Yes. ${done.length} item(s) fixed and published as an OTA update. Your app picks it up on the second launch.`);
  else L.push(`No. ${ship ? ship.reason : 'run did not reach the ship step'}`);
  L.push('');

  if (done.length) {
    L.push('## Fixed');
    done.forEach((i) => L.push(`- ${(i.comment || '').replace(/\s+/g, ' ')}\n  (${i.id}, commit ${i.commit || '?'}${i.note ? ` — ${i.note}` : ''})`));
    L.push('');
  }

  if (deferred.length) {
    L.push('## Left for you');
    deferred.forEach((i) => L.push(`- ${(i.comment || '').replace(/\s+/g, ' ')}\n  Why: ${i.note || 'no reason recorded'}\n  (${i.id})`));
    L.push('');
  }

  if (pending.length) {
    L.push('## Waiting on your approval (feedback from other testers)');
    pending.forEach((i) => L.push(`- ${i.email}: ${(i.comment || '').replace(/\s+/g, ' ')}\n  (${i.id})`));
    L.push('');
    L.push('Approve with:');
    L.push('```');
    L.push(`cd ${REPO} && node scripts/feedback/ledger.js --approve ${pending.map((i) => i.id).join(' ')}`);
    L.push('```');
    L.push('');
  }

  if (gates && gates.some((g) => !g.ok)) {
    L.push('## Gate failures');
    gates.filter((g) => !g.ok).forEach((g) => L.push(`### ${g.name}\n\`\`\`\n${g.out}\n\`\`\``));
    L.push('');
  }

  L.push('## Run detail');
  L.push(`- items handed to the agent: ${taken.length}`);
  L.push(`- agent exit code: ${result ? result.agentExit : 'n/a'}`);
  L.push(`- commits: ${result && result.commits.length ? result.commits.join(', ') : 'none'}`);
  L.push(`- ledger: ${JSON.stringify(ledger.stats())}`);
  L.push(`- log: ${RUN_LOG}`);
  return L.join('\n');
}

// ------------------------------------------------------------------- main

async function main() {
  fs.mkdirSync(LOGS, { recursive: true });
  log(`=== overnight run ${stamp} ${DRY_RUN ? '(DRY RUN)' : ''} ===`);

  const blocked = preflight();
  if (blocked) {
    // A dry run writes nothing, so the checks that exist to protect a human's
    // in-flight work are worth reporting but not worth blocking on.
    if (!DRY_RUN) { log(`ABORT: ${blocked}`); process.exit(2); }
    log(`(would ABORT on a real run: ${blocked})`);
  }

  if (!SKIP_PULL) {
    const pull = tryShell('node', ['scripts/feedback/pull.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
    log(pull.out.trim().split('\n').slice(-15).join('\n'));
    if (!pull.ok) log('WARNING: pull failed — working from the ledger as it stands');
  }

  const queue = ledger.queue();
  const pending = ledger.pendingApproval();
  log(`queue: ${queue.length} actionable, ${pending.length} awaiting approval`);

  const taken = queue.slice(0, MAX_ITEMS);
  if (!taken.length) {
    log('nothing to do');
    writeReport(reportBody({ taken: [], result: null, gates: null, ship: null, pending, deferred: [], done: [] }));
    return;
  }
  log(`taking ${taken.length}: ${taken.map((i) => i.id).join(' ')}`);

  if (DRY_RUN) {
    log('--dry-run: would hand these to the agent:');
    taken.forEach((i, n) => log(`  ${n + 1}. ${i.id} — ${(i.comment || '').replace(/\s+/g, ' ').slice(0, 80)}`));
    log(`seed prompt would be ${seedPrompt(taken, '<worktree>').length} chars`);
    return;
  }

  ledger.setStatus(taken.map((i) => i.id), 'in-progress');
  const result = await runAgent(taken);

  const after = ledger.load();
  const done = taken.map((i) => after.items[i.id]).filter((i) => i.status === 'done');
  const deferred = taken.map((i) => after.items[i.id]).filter((i) => i.status === 'deferred');
  // Anything the agent left mid-flight goes back on the queue rather than
  // sitting as in-progress forever, which would silently drop it.
  const stranded = taken.map((i) => after.items[i.id]).filter((i) => i.status === 'in-progress');
  if (stranded.length) {
    log(`${stranded.length} item(s) left in-progress — returning to the queue`);
    ledger.setStatus(stranded.map((i) => i.id), 'queued', { note: `agent did not record an outcome in run ${stamp}` });
  }

  let gates = null;
  let ship = null;
  if (!result.commits.length) {
    log('agent produced no commits — nothing to merge');
  } else {
    gates = runGates(result.wtPath);
    if (gates.every((g) => g.ok)) {
      ship = mergeAndShip(result.branch);
    } else {
      log('gates failed — not merging');
      ship = { merged: false, pushed: false, shipped: false, reason: `gates failed: ${gates.filter((g) => !g.ok).map((g) => g.name).join(', ')}. Branch ${result.branch} left in place for you.` };
    }
  }

  writeReport(reportBody({ taken, result, gates, ship, pending: ledger.pendingApproval(), deferred, done }));
  log('=== done ===');
}

main().catch((e) => { log('FAILED:', e.stack || e.message); process.exit(1); });
