#!/usr/bin/env node
/**
 * Pull TestFlight beta feedback onto this machine and merge it into the ledger.
 *
 * The App Store Connect key lives only in GitHub secrets (there is no .p8 on
 * this Mac), so the fetch has to happen in CI. This script drives the whole
 * round-trip: mint a throwaway RSA keypair, dispatch fetch-beta-feedback.yml
 * with the public half, wait for the run, download the encrypted artifact,
 * decrypt it with the private half, and hand the result to the ledger.
 *
 * The keypair is per-invocation and lives in a mode-700 temp dir that is removed
 * on exit — the artifact is encrypted in a public repo's action storage, so a
 * long-lived key sitting on disk would be the weak link.
 *
 *   node scripts/feedback/pull.js [--ref main] [--timeout-min 15] [--keep-temp]
 *
 * Exit codes: 0 pulled, 1 failed.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = 'thomaspryor/BroadwayScorecard-app';
const WORKFLOW = 'fetch-beta-feedback.yml';
const ledger = require('./ledger');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const REF = arg('ref', 'main');
const TIMEOUT_MIN = Number(arg('timeout-min', 15));
const KEEP_TEMP = argv.includes('--keep-temp');

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

const log = (...m) => console.log('[feedback-pull]', ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bsc-feedback-'));
  fs.chmodSync(tmp, 0o700);
  const cleanup = () => { if (!KEEP_TEMP) fs.rmSync(tmp, { recursive: true, force: true }); };

  try {
    const priv = path.join(tmp, 'priv.pem');
    const pub = path.join(tmp, 'pub.pem');
    sh('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', priv], { stdio: ['ignore', 'pipe', 'ignore'] });
    sh('openssl', ['rsa', '-in', priv, '-pubout', '-out', pub], { stdio: ['ignore', 'pipe', 'ignore'] });
    const pubB64 = Buffer.from(fs.readFileSync(pub)).toString('base64');

    // Note the newest existing run BEFORE dispatching. `gh workflow run` prints
    // no run id, and picking "the newest run" without a baseline happily
    // latches onto a previous run and decrypts it with the wrong key.
    const before = latestRunId();
    log(`dispatching ${WORKFLOW} on ${REF}`);
    sh('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', REF, '-f', `pubkey_b64=${pubB64}`]);

    const runId = await waitForNewRun(before);
    log(`run ${runId} started; waiting (max ${TIMEOUT_MIN}m)`);
    const ok = await waitForCompletion(runId);
    if (!ok) throw new Error(`run ${runId} did not succeed — see https://github.com/${REPO}/actions/runs/${runId}`);

    const dl = path.join(tmp, 'dl');
    fs.mkdirSync(dl, { recursive: true });
    sh('gh', ['run', 'download', String(runId), '--repo', REPO, '-n', 'beta-feedback-encrypted', '-D', dl]);

    const symKey = path.join(tmp, 'sym.key');
    const tarGz = path.join(tmp, 'fb.tar.gz');
    const out = path.join(tmp, 'out');
    fs.mkdirSync(out, { recursive: true });
    sh('openssl', ['pkeyutl', '-decrypt', '-inkey', priv, '-in', path.join(dl, 'symkey.enc'), '-out', symKey]);
    sh('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-in', path.join(dl, 'feedback.enc'), '-out', tarGz, '-pass', `file:${symKey}`]);
    sh('tar', ['xzf', tarGz, '-C', out]);

    if (!fs.existsSync(path.join(out, 'items.json'))) {
      throw new Error(
        `artifact has no items.json — the run used an old scripts/fetch-beta-feedback.js. `
        + `Merge the normalised fetcher to ${REF} first.`
      );
    }

    const { added, seenCount } = ledger.ingest(out);
    log(`ingested ${seenCount} item(s); ${added.length} new`);
    for (const i of added) log(`  NEW [${i.status}] ${i.role} ${i.id} — ${(i.comment || '').replace(/\s+/g, ' ').slice(0, 70)}`);
    log('stats:', JSON.stringify(ledger.stats()));
  } finally {
    cleanup();
  }
}

function latestRunId() {
  try {
    const out = sh('gh', ['run', 'list', '--repo', REPO, '--workflow', WORKFLOW, '--limit', '1', '--json', 'databaseId']);
    const rows = JSON.parse(out);
    return rows.length ? rows[0].databaseId : 0;
  } catch { return 0; }
}

/** Dispatch is asynchronous — the run can take a few seconds to appear. */
async function waitForNewRun(before, attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    await sleep(5000);
    const id = latestRunId();
    if (id && id !== before) return id;
  }
  throw new Error('dispatched run never appeared in gh run list');
}

/**
 * Poll at 30s. Every gh call spends the 5000/hr REST budget that the rest of
 * this machine's automation shares, so this stays deliberately slow and gives
 * up rather than looping — a wedged poll loop drained the quota on 2026-05-23.
 */
async function waitForCompletion(runId) {
  const deadline = Date.now() + TIMEOUT_MIN * 60_000;
  while (Date.now() < deadline) {
    await sleep(30_000);
    let info;
    try {
      info = JSON.parse(sh('gh', ['run', 'view', String(runId), '--repo', REPO, '--json', 'status,conclusion']));
    } catch (e) {
      log(`poll failed (${String(e.message).slice(0, 80)}) — backing off 60s`);
      await sleep(60_000);
      continue;
    }
    if (info.status === 'completed') {
      log(`run ${runId}: ${info.conclusion}`);
      return info.conclusion === 'success';
    }
  }
  throw new Error(`run ${runId} still running after ${TIMEOUT_MIN}m`);
}

main().catch((e) => { console.error('[feedback-pull] FAILED:', e.message); process.exit(1); });
