#!/usr/bin/env node
/**
 * Web-parity visual diff for the overnight beta-feedback autopilot (task
 * #1077). visual-gate.js proves a screen was captured; it does not prove the
 * capture LOOKS right — nothing before this had access to what "right" means
 * for score-badge sizing, card widths, or shelf styling, because that answer
 * lives in the web app, not in iOS code or in any spec file. Comparing the
 * app capture against a screenshot of the same page on the live web site
 * gives a vision model a concrete reference instead of an open-ended "find
 * problems" prompt — which a 2026-08-05 evaluation against the owner's own
 * labelled TestFlight screenshots showed produces confident false positives
 * (it flagged the carousel edge-peek as a defect when that was a requested
 * feature) and misses on comparative-measurement questions (equal card
 * widths). The same web-parity framing, run against the owner's real
 * oversized/borderless score-badge complaint (item AN27tpL_tcG6Fe6Gone42Mk),
 * surfaced that exact defect unprompted. This module is the mechanical form
 * of that framing: reuse visual-gate's app captures, add a same-route web
 * capture, and ask a vision model ONLY for departures from the web reference.
 *
 * Comparative-measurement invariants (equal card widths, consistent badge
 * size across a shelf) are explicitly OUT of scope here — the same
 * evaluation showed vision is unreliable at that class of question. Those
 * belong in code, asserted against computed layout values, or in Maestro's
 * assertWithAI for simple presence/absence checks.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Only screens with a stable, unambiguous web route belong here. Watched, To
// Watch, Lists, and Settings are personal/app-only views with no equivalent
// public web page — comparing them against nothing would either throw or
// silently no-op, so leaving them out of this map (and out of every function
// below) is the correct "not applicable" signal, not a gap to fill in later.
const SCREEN_WEB_ROUTES = {
  Home: '/',
  Browse: '/shows',
};

/** Pure: the web route to compare a given app screen label against, or undefined if none exists. */
function webRouteForScreen(label) {
  return SCREEN_WEB_ROUTES[label];
}

/** Pure: the web route for a specific show's page, given its slug. */
function webRouteForShow(slug) {
  return `/show/${slug}`;
}

/** Pure: which of visual-gate's captures have both a successful screenshot and a known web route to diff against. */
function comparableCaptures(captures) {
  return (captures || []).filter((c) => c.ok && c.path && webRouteForScreen(c.label));
}

function imageToBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

/**
 * Impure: screenshot a live web page at a phone viewport via Playwright's
 * bundled CLI, the same tool (and command shape) the Broadwayscore web repo's
 * scripts/visual-qa.mjs already uses for its own screenshot capture. `playwright`
 * is pinned as a devDependency HERE (not just relied on via npx) so the
 * resolved package version always matches whatever browser build is already
 * cached in ~/Library/Caches/ms-playwright/ on the machine this runs on —
 * an unpinned `npx playwright` can resolve a newer package that wants a
 * browser build the cache doesn't have, and fail outright.
 * Fails closed: any thrown error or a missing output file comes back as
 * ok:false rather than partially-written state.
 */
function captureWebReference({ route, outPath, baseUrl = 'https://broadwayscorecard.com', viewport = '440,956', timeoutMs = 30_000 }) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.rmSync(outPath, { force: true });
  const url = `${baseUrl}${route}`;
  try {
    execFileSync('npx', ['playwright', 'screenshot', `--viewport-size=${viewport}`, url, outPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}` || e.message;
    return { ok: false, path: null, error: `playwright screenshot failed: ${out.slice(-2000)}` };
  }
  const ok = fs.existsSync(outPath);
  return { ok, path: ok ? outPath : null, error: ok ? null : 'playwright reported success but wrote no file' };
}

// Framed as strictly comparative on purpose (see file header) — the
// open-ended "list problems" prompt is the approach the 2026-08-05
// evaluation showed produces confident false positives on owner-requested
// behavior. Every instruction here exists to keep the model from drifting
// back into that mode.
const PARITY_SYSTEM_PROMPT = `You are comparing an iOS app screenshot against a screenshot of the same page on the mobile web version of the same product. The web version has already shipped and is the reference for what is CORRECT — its sizing, borders, colors, and layout choices are not up for debate.

ONLY report visual properties where the iOS screenshot DEPARTS from the web screenshot: element sizing, borders/strokes, spacing, color treatment, iconography, ordering — anything a user would notice differs if shown the two side by side.

Do NOT invent general critiques, and do NOT flag anything that also appears (or would reasonably appear) on the web reference. If something looks unusual but the web reference does the same thing, it is not a departure.

Ignore: different show titles/scores/dates/images (dynamic content, not layout), different scroll position, and the iOS status bar / home indicator / native chrome (has no web equivalent).

Return ONLY JSON, no prose, no code fences:
{"departures": [{"element": "short name of the element", "web": "what the web reference shows", "ios": "what the iOS screenshot shows instead", "severity": "minor" | "notable"}], "notes": "one sentence, or empty string"}
If you cannot see one of the images, return {"departures": [], "notes": "could not load image: <which one>"}.
If there are no departures, return {"departures": [], "notes": ""}.`;

/** Pure: extract and validate the model's JSON verdict out of its raw text response. Throws on unparseable content — a caller-visible error beats a silently wrong empty result. */
function parseParityResponse(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('empty response content');
  }
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON object found in response: ${content.slice(0, 200)}`);
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`response JSON did not parse: ${e.message} — raw: ${match[0].slice(0, 200)}`);
  }
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';
  // The prompt tells the model to report a load failure as departures:[] plus
  // this phrase in notes (see PARITY_SYSTEM_PROMPT) — the one shape a clean
  // pass and a comparison that never actually happened both produce. Without
  // this check that failure reads as "no departures found", the exact
  // silent-false-pass the visual gate above this module exists to prevent.
  if (/could not load image/i.test(notes)) {
    throw new Error(`model could not load an input image: ${notes}`);
  }
  const departures = Array.isArray(parsed.departures) ? parsed.departures : [];
  return {
    departures,
    notes,
    hasDivergence: departures.length > 0,
  };
}

/** Impure: send the app+web screenshot pair to a vision model and return the parsed verdict. */
async function compareToWebReference({ appPath, webPath, apiKey, model = 'gpt-5.4-mini', timeoutMs = 60_000 }) {
  const messages = [
    { role: 'system', content: PARITY_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'WEB REFERENCE (correct):' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageToBase64(webPath)}` } },
        { type: 'text', text: 'iOS APP SCREENSHOT (check this for departures):' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageToBase64(appPath)}` } },
        { type: 'text', text: 'Return the departures JSON now.' },
      ],
    },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    // gpt-5.4-mini rejects max_tokens (400: unsupported_parameter) — see scripts/visual-qa.mjs.
    body: JSON.stringify({ model, messages, max_completion_tokens: 1024, temperature: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  return parseParityResponse(content);
}

/**
 * Impure orchestrator: for every visual-gate capture with a known web route,
 * grab a same-route web screenshot and diff the two. One bad screen (capture
 * missing, playwright failure, API error) is recorded as an error entry and
 * does not stop the others — this feeds a morning report, not a merge gate,
 * so partial results beat none.
 */
async function runWebParityCheck({ captures, outDir, apiKey, baseUrl, model }) {
  const targets = comparableCaptures(captures);
  const results = [];
  for (const c of targets) {
    const webPath = path.join(outDir, `${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-web.png`);
    const webCapture = captureWebReference({ route: webRouteForScreen(c.label), outPath: webPath, baseUrl });
    if (!webCapture.ok) {
      results.push({ label: c.label, hasDivergence: false, departures: [], notes: '', error: webCapture.error });
      continue;
    }
    try {
      const verdict = await compareToWebReference({ appPath: c.path, webPath: webCapture.path, apiKey, model });
      results.push({ label: c.label, ...verdict, error: null });
    } catch (e) {
      results.push({ label: c.label, hasDivergence: false, departures: [], notes: '', error: e.message });
    }
  }
  return results;
}

/** Pure: format parity results into the report lines the owner reads next to the feedback screenshot. Returns null when there was nothing comparable to check. */
function summarizeParityResults(results) {
  if (!results || !results.length) return null;
  const withFindings = results.filter((r) => r.hasDivergence);
  const withErrors = results.filter((r) => r.error);
  const lines = [];
  for (const r of withFindings) {
    for (const d of r.departures) {
      lines.push(`${r.label} — ${d.element}: web shows "${d.web}", iOS shows "${d.ios}" (${d.severity || 'unrated'})`);
    }
  }
  for (const r of withErrors) {
    lines.push(`${r.label}: comparison could not run — ${r.error}`);
  }
  return {
    hasFindings: withFindings.length > 0,
    hasErrors: withErrors.length > 0,
    lines,
    summary: lines.length ? lines.join('\n') : 'no departures from the web reference found',
  };
}

module.exports = {
  SCREEN_WEB_ROUTES,
  webRouteForScreen,
  webRouteForShow,
  comparableCaptures,
  captureWebReference,
  parseParityResponse,
  compareToWebReference,
  runWebParityCheck,
  summarizeParityResults,
};
