#!/usr/bin/env node
/**
 * The beta-feedback ledger: what has been actioned, what is waiting, and who is
 * allowed to have it actioned without asking.
 *
 * WHY THIS EXISTS
 * Feedback had been worked in manual batches since 2026-07-25 with no record of
 * which submission produced which commit. "Which of these did we already do?"
 * could only be answered by comparing timestamps against git log, which is
 * ambiguous the moment a fix lands in the same hour the feedback arrives.
 *
 * WHERE STATE LIVES — deliberately NOT in the repo. The repo is public and each
 * submission carries the tester's email address, device, and screenshots of
 * their account. Everything lives under ~/.claude/broadwayscore-feedback/
 * (override with BSC_FEEDBACK_HOME).
 *
 * THE APPROVAL RULE (owner decision, 2026-08-04)
 * Feedback from the owner is auto-processed. Feedback from anyone else stops at
 * `needs-approval` and is never handed to the overnight run until the owner
 * approves it. OWNER_EMAILS below is the entire basis for that split, so it is
 * matched exactly (lowercased, trimmed) and never by pattern.
 *
 * CLI
 *   node scripts/feedback/ledger.js --list [--status S] [--all]
 *   node scripts/feedback/ledger.js --queue            work the overnight run takes
 *   node scripts/feedback/ledger.js --pending-approval third-party, awaiting owner
 *   node scripts/feedback/ledger.js --approve <id...>  allow a third-party item
 *   node scripts/feedback/ledger.js --reject <id...> [--note "..."]
 *   node scripts/feedback/ledger.js --defer <id...> --note "why"
 *   node scripts/feedback/ledger.js --done <id...> --commit <sha> [--note "..."]
 *   node scripts/feedback/ledger.js --ingest <dir>     merge a pull into the ledger
 *   node scripts/feedback/ledger.js --stats
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const OWNER_EMAILS = ['thomas.pryor@gmail.com'];

const HOME = process.env.BSC_FEEDBACK_HOME
  || path.join(os.homedir(), '.claude', 'broadwayscore-feedback');
const LEDGER = path.join(HOME, 'ledger.json');
const ITEMS = path.join(HOME, 'items');
const IMAGES = path.join(HOME, 'images');

/** Terminal states — an item here is never offered to a run again. */
const CLOSED = new Set(['done', 'rejected', 'wont-fix']);
/** States the overnight run is allowed to pick up. */
const ACTIONABLE = new Set(['queued', 'approved']);

function isOwner(email) {
  return OWNER_EMAILS.includes(String(email || '').trim().toLowerCase());
}

function ensureDirs() {
  // 0700 throughout: this holds tester email addresses and screenshots of their
  // accounts, and the default umask would leave it readable by every process.
  for (const d of [HOME, ITEMS, IMAGES]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
}

function load() {
  ensureDirs();
  if (!fs.existsSync(LEDGER)) {
    return { version: 1, ownerEmails: OWNER_EMAILS, updatedAt: null, items: {} };
  }
  const text = fs.readFileSync(LEDGER, 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    // Never fall back to an empty ledger — that reads as "nothing was ever
    // actioned" and the next run would redo every fix already shipped.
    throw new Error(
      `${LEDGER} is not valid JSON (${e.message}). A backup of the last good `
      + `write is at ${LEDGER}.bak — inspect it, restore it, and rerun. `
      + `Refusing to continue, because an empty ledger would re-implement `
      + `every piece of feedback ever shipped.`,
    );
  }
}

function save(ledger) {
  ensureDirs();
  ledger.updatedAt = new Date().toISOString();
  // Write-then-rename so a crash mid-write cannot leave a truncated ledger.
  // The temp name carries the pid: the agent runs `ledger.js --done` as its own
  // process while the driver is also writing, and a shared temp name lets one
  // writer rename the other's half-written file into place.
  const tmp = `${LEDGER}.${process.pid}.tmp`;
  if (fs.existsSync(LEDGER)) fs.copyFileSync(LEDGER, `${LEDGER}.bak`);
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, LEDGER);
}

/**
 * Merge a pull (a directory holding items.json + images/) into the ledger.
 * Existing entries keep their status — re-pulling must never resurrect work
 * that is already done. Only genuinely new ids get an initial status.
 */
function ingest(dir, { defaultOwnerStatus = 'queued' } = {}) {
  ensureDirs();
  const items = JSON.parse(fs.readFileSync(path.join(dir, 'items.json'), 'utf8'));
  const ledger = load();
  const added = [];
  const seen = [];

  for (const item of items) {
    seen.push(item.id);
    fs.writeFileSync(path.join(ITEMS, `${item.id}.json`), JSON.stringify(item, null, 2));
    for (const f of item.screenshots || []) {
      const src = path.join(dir, 'images', f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(IMAGES, f));
    }
    if (ledger.items[item.id]) {
      // Refresh the descriptive fields (comment text never changes, but a
      // re-pull can fill in screenshots that failed to download last time).
      Object.assign(ledger.items[item.id], {
        createdDate: item.createdDate,
        comment: item.comment,
        screenshots: item.screenshots,
      });
      continue;
    }
    const owner = isOwner(item.email);
    ledger.items[item.id] = {
      id: item.id,
      kind: item.kind,
      createdDate: item.createdDate,
      email: item.email,
      role: owner ? 'owner' : 'tester',
      comment: item.comment,
      screenshots: item.screenshots || [],
      status: owner ? defaultOwnerStatus : 'needs-approval',
      commit: null,
      note: null,
      firstSeenAt: new Date().toISOString(),
      decidedAt: null,
    };
    added.push(ledger.items[item.id]);
  }

  save(ledger);
  return { added, seenCount: seen.length, ledger };
}

function setStatus(ids, status, { commit = null, note = null } = {}) {
  const ledger = load();
  const changed = [];
  for (const id of ids) {
    const entry = ledger.items[id];
    if (!entry) { console.error(`unknown feedback id: ${id}`); process.exitCode = 1; continue; }
    entry.status = status;
    entry.decidedAt = new Date().toISOString();
    if (commit) entry.commit = commit;
    if (note) entry.note = note;
    changed.push(entry);
  }
  save(ledger);
  return changed;
}

/** Work the overnight run may take, oldest first so the backlog drains in order. */
function queue(ledger = load()) {
  return Object.values(ledger.items)
    .filter((i) => ACTIONABLE.has(i.status))
    .sort((a, b) => new Date(a.createdDate || 0) - new Date(b.createdDate || 0));
}

function pendingApproval(ledger = load()) {
  return Object.values(ledger.items)
    .filter((i) => i.status === 'needs-approval')
    .sort((a, b) => new Date(a.createdDate || 0) - new Date(b.createdDate || 0));
}

function stats(ledger = load()) {
  const out = {};
  for (const i of Object.values(ledger.items)) out[i.status] = (out[i.status] || 0) + 1;
  return out;
}

function fmt(i, n) {
  const when = (i.createdDate || '').slice(0, 16).replace('T', ' ');
  const text = (i.comment || i.crashLog || '(no comment)').replace(/\s+/g, ' ').slice(0, 88);
  const idx = n === undefined ? '' : `${String(n + 1).padStart(2)} `;
  return `${idx}[${i.status}] ${when}Z ${i.role.padEnd(6)} ${i.id}\n     ${text}`;
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(`--${name}`);
  const val = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  // Every id-taking flag consumes the run of non-flag args after it.
  const idsAfter = (name) => {
    const i = argv.indexOf(`--${name}`);
    if (i < 0) return [];
    const out = [];
    for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j += 1) out.push(argv[j]);
    return out;
  };

  if (flag('ingest')) {
    const dir = val('ingest');
    const { added, seenCount } = ingest(dir);
    console.log(`ingested ${seenCount} item(s); ${added.length} new`);
    added.forEach((i) => console.log(fmt(i)));
    return;
  }

  for (const [name, status] of [['approve', 'approved'], ['reject', 'rejected'], ['defer', 'deferred'], ['done', 'done']]) {
    if (flag(name)) {
      const ids = idsAfter(name);
      if (!ids.length) { console.error(`--${name} needs at least one feedback id`); process.exit(1); }
      if (name === 'done' && !val('commit')) { console.error('--done requires --commit <sha>'); process.exit(1); }
      const changed = setStatus(ids, status, { commit: val('commit'), note: val('note') });
      changed.forEach((i) => console.log(fmt(i)));
      return;
    }
  }

  if (flag('queue')) {
    const q = queue();
    console.log(`${q.length} item(s) the overnight run would take:`);
    q.forEach((i, n) => console.log(fmt(i, n)));
    return;
  }

  if (flag('pending-approval')) {
    const p = pendingApproval();
    console.log(`${p.length} third-party item(s) awaiting your approval:`);
    p.forEach((i, n) => console.log(fmt(i, n)));
    if (p.length) console.log(`\nApprove with:\n  node scripts/feedback/ledger.js --approve ${p.map((i) => i.id).join(' ')}`);
    return;
  }

  if (flag('stats')) { console.log(JSON.stringify(stats(), null, 2)); return; }

  // Default: --list
  const ledger = load();
  const want = val('status');
  let items = Object.values(ledger.items)
    .sort((a, b) => new Date(a.createdDate || 0) - new Date(b.createdDate || 0));
  if (want) items = items.filter((i) => i.status === want);
  else if (!flag('all')) items = items.filter((i) => !CLOSED.has(i.status));
  console.log(`${items.length} item(s)${want ? ` with status=${want}` : flag('all') ? '' : ' (open only; --all for everything)'}:`);
  items.forEach((i, n) => console.log(fmt(i, n)));
}

module.exports = {
  OWNER_EMAILS, HOME, LEDGER, ITEMS, IMAGES,
  CLOSED, ACTIONABLE, isOwner, load, save, ingest, setStatus, queue, pendingApproval, stats,
};
if (require.main === module) main();
