#!/usr/bin/env node
// Fetch TestFlight beta feedback (screenshot + crash submissions) from the
// App Store Connect API and save normalised JSON + screenshot images to
// ./feedback-out/. Runs in CI (fetch-beta-feedback.yml) where the ASC key
// secrets live; the workflow encrypts the output before uploading (public repo
// — never upload feedback plaintext).
//
// Env: ASC_KEY_PATH (.p8 file), ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID
//
// Output:
//   feedback-out/items.json        normalised [{id, kind, createdDate, email,
//                                   comment, deviceModel, osVersion,
//                                   screenshots:[file,...]}]
//   feedback-out/feedback-raw.json raw API pages (kept for debugging)
//   feedback-out/images/<id>-<n>.<ext>
//
// Two things here are load-bearing and were both wrong before 2026-08-04:
//
// 1. Only the app-scoped collection paths work. The top-level
//    /v1/betaFeedback*Submissions?filter[app]= endpoints answer 403
//    FORBIDDEN_ERROR "does not allow GET_COLLECTION" — so crash submissions
//    were silently never fetched.
// 2. Screenshots must be named by their submission id. They used to be written
//    as img-001.jpg in flat discovery order, which threw away the only link
//    between an image and the comment describing it. Everything downstream
//    (scripts/feedback/*) needs that link to show an agent the right screen.

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const OUT = path.resolve('feedback-out');
const API = 'https://api.appstoreconnect.apple.com';

function mintToken() {
  const key = fs.readFileSync(process.env.ASC_KEY_PATH, 'utf8');
  return jwt.sign({}, key, {
    algorithm: 'ES256',
    issuer: process.env.ASC_ISSUER_ID,
    audience: 'appstoreconnect-v1',
    expiresIn: '19m',
    keyid: process.env.ASC_KEY_ID,
  });
}

async function getJSON(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();
  if (!res.ok) return { __error: res.status, __body: body.slice(0, 2000), __url: url };
  try { return JSON.parse(body); } catch { return { __error: 'unparseable', __body: body.slice(0, 2000), __url: url }; }
}

async function getAllPages(url, token, cap = 20) {
  const pages = [];
  let next = url;
  while (next && pages.length < cap) {
    const page = await getJSON(next, token);
    pages.push(page);
    next = page.links && page.links.next;
    if (page.__error) break;
  }
  return pages;
}

/** ASC serves screenshots from pre-signed URLs that expire (~7 days). Pull the
 *  bytes now — by the time an overnight run reads them the URL may be dead. */
async function downloadShots(item, token) {
  const shots = (item.attributes && item.attributes.screenshots) || [];
  const files = [];
  for (let n = 0; n < shots.length; n += 1) {
    const url = shots[n] && shots[n].url;
    if (!url) continue;
    try {
      let res = await fetch(url);
      if (!res.ok) res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { console.log(`  shot ${item.id}-${n}: HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = (res.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
      const name = `${item.id}-${n}.${ext}`;
      fs.writeFileSync(path.join(OUT, 'images', name), buf);
      files.push(name);
    } catch (e) {
      console.log(`  shot ${item.id}-${n}: ${e.message}`);
    }
  }
  return files;
}

/** DIAGNOSTIC ONLY (task #1055): dump the raw crashLog relationship response
 *  so the real shape can be inspected before the parser is written — the
 *  endpoint shape was deliberately not guessed. Remove once normalise()
 *  extracts a real field from it. */
async function fetchCrashLogRaw(item, token) {
  const related = item.relationships
    && item.relationships.crashLog
    && item.relationships.crashLog.links
    && item.relationships.crashLog.links.related;
  const url = related || `${API}/v1/betaFeedbackCrashSubmissions/${item.id}/crashLog`;
  const body = await getJSON(url, token);
  return { id: item.id, url, relationshipPresent: Boolean(related), body };
}

function normalise(item, kind, files) {
  const a = item.attributes || {};
  return {
    id: item.id,
    kind,
    createdDate: a.createdDate || null,
    email: a.email || null,
    comment: a.comment || null,
    deviceModel: a.deviceModel || null,
    osVersion: a.osVersion || null,
    bundleId: a.buildBundleId || null,
    locale: a.locale || null,
    // Crash submissions carry a log instead of a comment.
    crashLog: a.crashLog || null,
    screenshots: files,
  };
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'images'), { recursive: true });
  const token = mintToken();
  const appId = process.env.ASC_APP_ID;
  if (!appId) throw new Error('ASC_APP_ID is required');

  // App-scoped paths only — see header note 1.
  const targets = {
    screenshotSubmissions: {
      url: `${API}/v1/apps/${appId}/betaFeedbackScreenshotSubmissions?limit=50`,
      kind: 'screenshot',
    },
    crashSubmissions: {
      url: `${API}/v1/apps/${appId}/betaFeedbackCrashSubmissions?limit=50`,
      kind: 'crash',
    },
  };

  const raw = {};
  const items = [];
  const crashLogDebug = [];
  for (const [name, { url, kind }] of Object.entries(targets)) {
    const pages = await getAllPages(url, token);
    raw[name] = pages;
    const first = pages[0] || {};
    if (first.__error) {
      console.log(`${name}: ERROR ${first.__error} — ${(first.__body || '').slice(0, 200)}`);
      continue;
    }
    const data = pages.flatMap((p) => p.data || []);
    console.log(`${name}: ${data.length} items`);
    for (const it of data) {
      const files = await downloadShots(it, token);
      if (kind === 'crash') {
        const dbg = await fetchCrashLogRaw(it, token);
        crashLogDebug.push(dbg);
        console.log(`  crashLog ${it.id}: relationshipPresent=${dbg.relationshipPresent} url=${dbg.url}`);
      }
      items.push(normalise(it, kind, files));
    }
  }

  items.sort((a, b) => new Date(a.createdDate || 0) - new Date(b.createdDate || 0));
  fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(items, null, 2));
  fs.writeFileSync(path.join(OUT, 'feedback-raw.json'), JSON.stringify(raw, null, 2));
  if (crashLogDebug.length) {
    fs.writeFileSync(path.join(OUT, 'crashlog-debug.json'), JSON.stringify(crashLogDebug, null, 2));
  }
  const shotCount = items.reduce((n, i) => n + i.screenshots.length, 0);
  console.log(`done; ${items.length} items, ${shotCount} screenshots -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
