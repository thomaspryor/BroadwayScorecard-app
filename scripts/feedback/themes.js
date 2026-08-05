#!/usr/bin/env node
/**
 * Cluster the beta-feedback ledger into recurring themes.
 *
 * WHY THIS EXISTS
 * The ledger (./ledger.js) records what happened to each TestFlight
 * submission, one item at a time. Read as a set, several items are the same
 * complaint filed again against a screen the last fix didn't reach --
 * "labels too large" was filed 3 times across builds, "date placement on
 * cards" 7 times, "shelf formatted differently than the list" 4 times. The
 * overnight autopilot (overnight.js) patches the one screen in the screenshot
 * and leaves the siblings, which guarantees the complaint comes back on the
 * next screen it wasn't asked about.
 *
 * The corpus is 71 short, plain-English items with a narrow vocabulary --
 * embeddings would cluster on noise here. A hand-built keyword list is
 * auditable (read THEMES below: every phrase is lifted verbatim from a real
 * submission) and, on this corpus, catches every instance a human eyeballing
 * the ledger did.
 *
 * CLI
 *   node scripts/feedback/themes.js --report          per-theme cluster report
 *   node scripts/feedback/themes.js --theme-for <id>  which theme(s) an id matches
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ledger = require('./ledger');

const REPO = path.resolve(__dirname, '..', '..');

// Each theme is a set of exact phrases (lowercase, substring match) lifted
// from how testers actually phrased the complaint -- not single words, since
// words like "big"/"date" false-positive on unrelated items (a date PICKER
// bug, a rating that should be "larger" by request, etc). codeDirs +
// codePattern point at the component(s) most likely to share the bug, so the
// report -- and the autopilot prompt -- can name a sibling file instead of
// just repeating the complaint back.
const THEMES = [
  {
    key: 'labels-too-large',
    name: 'Labels / overlay text rendered too large',
    keywords: [
      'too large and visually prominent',
      'labels are ugly and also too large',
      'text is way too big',
      'overhang the box',
    ],
    codeDirs: ['components/show-cards'],
    codePattern: /CategoryBadge|StatusBadge|FormatPill|ProductionPill|fontSize/,
  },
  {
    key: 'date-placement',
    name: 'Date position/format on show cards',
    keywords: [
      'dates for upcoming shows should be under the name',
      'the date should be below the show name',
      'move the dates to the right',
      'dates are always on the same line',
      'day and month',
      'dates overlaid on the image',
      'the dates here look really bad',
    ],
    codeDirs: ['components/show-cards', 'components'],
    // \b matters: without it this substring-matches "update"/"candidate".
    codePattern: /\bdates?\b/i,
    // Shallow: this theme is about show-card overlays, not the app's date
    // handling in general (diary/planned-date screens live under user/).
    shallow: true,
  },
  {
    key: 'shelf-list-inconsistency',
    name: 'Upcoming shelf formatted differently than list rows',
    keywords: [
      'same format as the other cards in this list view',
      'left aligned to match the other rows',
      "aren't the same format as on the watched tab",
      'does not turn the upcoming shelf into a list',
    ],
    codeDirs: ['components', 'app'],
    codePattern: /[Ss]helf/,
  },
  {
    key: 'score-box-alignment',
    name: 'Score box sizing/alignment inconsistent across shelves',
    keywords: [
      'not on top of the images the way all the others are',
      'score boxes all out of alignment',
      "doesn't quite match the web mobile version",
      'remove the score boxes on unopened shows',
    ],
    codeDirs: ['components/show-cards'],
    codePattern: /ScoreBadge/,
  },
  {
    key: 'import-gap',
    name: 'Shows on the website missing from Show Score / Mezzanine import',
    keywords: [
      'are on the site',
      'mezzanine import',
      'show score import',
      'already on your list. it should',
    ],
    codeDirs: ['lib'],
    codePattern: /mezzanine|ShowScore|show-score/i,
  },
  {
    key: 'rating-widget-consistency',
    name: 'Star/rating control size and spacing inconsistent',
    keywords: [
      'spacing of the buttons here for the user rating',
      'stars need to be larger',
      'two ratings different sizes and different formats',
    ],
    codeDirs: ['components/user', 'components/show-cards'],
    codePattern: /StarRating|MiniStars|\brating\b/i,
  },
];

/** Curly quotes vs straight -- TestFlight's text field hands back curly. */
function normalize(text) {
  return String(text || '').toLowerCase().replace(/[‘’]/g, "'");
}

function matchThemes(item) {
  const text = normalize(item.comment);
  return THEMES.filter((t) => t.keywords.some((k) => text.includes(normalize(k)))).map((t) => t.key);
}

function walk(dir, { shallow = false } = {}) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!shallow) out.push(...walk(full)); }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * Sibling files that plausibly share this theme's bug -- a lead, not proof.
 * `shallow` keeps a theme scoped to the show-card rendering layer instead of
 * every file in the app that happens to use the word "date" or "rating".
 */
function siblingFiles(theme, baseDir = REPO) {
  if (!theme.codePattern) return [];
  const files = [];
  for (const d of theme.codeDirs || []) {
    for (const f of walk(path.join(baseDir, d), { shallow: !!theme.shallow })) {
      let text;
      try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
      if (theme.codePattern.test(text)) files.push(path.relative(baseDir, f));
    }
  }
  return [...new Set(files)].sort();
}

/**
 * Which build (TestFlight appBuildVersion) was live when an item was filed --
 * the newest build whose createdAt is at or before the item's createdDate.
 * Pure: `builds` is whatever `eas build:list --json` returned, any order.
 */
function assignBuild(createdDate, builds) {
  if (!createdDate || !builds || !builds.length) return null;
  const t = new Date(createdDate).getTime();
  const sorted = [...builds].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const live = sorted.find((b) => new Date(b.createdAt || 0).getTime() <= t);
  if (live) return live.appBuildVersion || null;
  // Item predates every known build record -- label it against the earliest
  // build we do have rather than silently dropping it from the span.
  const earliest = sorted[sorted.length - 1];
  return earliest ? earliest.appBuildVersion || null : null;
}

/** Per-theme roll-up: name, item ids, first/last seen, builds spanned. */
function clusterThemes(items, builds = []) {
  return THEMES.map((theme) => {
    const matched = items.filter((i) => matchThemes(i).includes(theme.key));
    if (!matched.length) return null;
    const sorted = [...matched].sort((a, b) => new Date(a.createdDate || 0) - new Date(b.createdDate || 0));
    const buildLabels = [...new Set(sorted.map((i) => assignBuild(i.createdDate, builds)).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b));
    return {
      key: theme.key,
      name: theme.name,
      itemIds: sorted.map((i) => i.id),
      count: sorted.length,
      firstSeen: sorted[0].createdDate,
      lastSeen: sorted[sorted.length - 1].createdDate,
      builds: buildLabels,
      // null means "no build data to consult" (renders as "unknown"); 0 would
      // read the same but for a different, misleading reason -- build data
      // existed but no item in the theme resolved to a labeled build.
      buildsSpanned: buildLabels.length ? buildLabels.length : null,
      siblingFiles: siblingFiles(theme),
    };
  }).filter(Boolean);
}

/** What overnight.js hands the agent for one queued item: its theme history. */
function themeContextForItem(item, allItems, builds = []) {
  const keys = matchThemes(item);
  if (!keys.length) return [];
  return clusterThemes(allItems, builds).filter((c) => keys.includes(c.key));
}

// ------------------------------------------------------------- builds fetch

const BUILDS_CACHE = path.join(ledger.HOME, 'builds-cache.json');
const BUILDS_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Real build history is enrichment, not the point of the report -- a run
 * with no network still owes the owner the theme clusters. Cache the eas-cli
 * call (it's a slow network round trip) and fall back to stale-cache-or-empty
 * on failure rather than throwing.
 */
function loadBuilds({ force = false } = {}) {
  if (!force) {
    try {
      const cached = JSON.parse(fs.readFileSync(BUILDS_CACHE, 'utf8'));
      if (Date.now() - new Date(cached.fetchedAt).getTime() < BUILDS_CACHE_MAX_AGE_MS) return cached.builds;
    } catch { /* no cache yet, or unreadable -- fetch below */ }
  }
  try {
    const raw = execFileSync(
      'npx',
      ['eas-cli', 'build:list', '--platform', 'ios', '--limit', '100', '--non-interactive', '--json'],
      // timeout matters: this runs inside seedPrompt(), synchronously, before
      // the overnight run's own TIMEOUT_MIN timer even starts. A hung network
      // call here would otherwise block the whole unattended run all night.
      { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const builds = JSON.parse(raw.slice(raw.indexOf('[')));
    fs.mkdirSync(ledger.HOME, { recursive: true, mode: 0o700 });
    fs.writeFileSync(BUILDS_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), builds }));
    return builds;
  } catch {
    try { return JSON.parse(fs.readFileSync(BUILDS_CACHE, 'utf8')).builds; } catch { return []; }
  }
}

// ------------------------------------------------------------------ report

function formatReport(clusters) {
  if (!clusters.length) return 'No recurring themes matched.';
  const lines = [];
  for (const c of clusters) {
    const span = c.buildsSpanned === null
      ? 'unknown (no build data)'
      : `${c.buildsSpanned} build(s): ${c.builds.join(', ') || 'n/a'}`;
    lines.push(`## ${c.name}`);
    lines.push(`  filed ${c.count}x -- ${c.firstSeen.slice(0, 10)} to ${c.lastSeen.slice(0, 10)}, spans ${span}`);
    lines.push(`  ids: ${c.itemIds.join(', ')}`);
    if (c.siblingFiles.length) lines.push(`  check these siblings too: ${c.siblingFiles.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const items = Object.values(ledger.load().items);

  if (argv.includes('--theme-for')) {
    const id = argv[argv.indexOf('--theme-for') + 1];
    const item = items.find((i) => i.id === id);
    if (!item) { console.error(`unknown feedback id: ${id}`); process.exit(1); }
    const ctx = themeContextForItem(item, items, loadBuilds());
    console.log(ctx.length ? formatReport(ctx) : '(no theme match)');
    return;
  }

  console.log(formatReport(clusterThemes(items, loadBuilds())));
}

module.exports = {
  THEMES, normalize, matchThemes, clusterThemes, themeContextForItem, assignBuild, siblingFiles, formatReport, walk, loadBuilds,
};
if (require.main === module) main();
