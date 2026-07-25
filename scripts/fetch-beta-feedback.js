#!/usr/bin/env node
// Fetch TestFlight beta feedback (screenshot + crash submissions) from the
// App Store Connect API and save raw JSON + screenshot images to ./feedback-out/.
// Runs in CI (fetch-beta-feedback.yml) where the ASC key secrets live; the
// workflow encrypts the output before uploading (public repo — never upload
// feedback plaintext).
//
// Env: ASC_KEY_PATH (.p8 file), ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID

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

// Recursively collect https URLs that look like downloadable images.
function collectImageUrls(node, acc) {
  if (!node) return acc;
  if (typeof node === 'string') {
    if (/^https:\/\/[^\s"]+/.test(node) && !node.includes('api.appstoreconnect.apple.com')) acc.add(node);
  } else if (Array.isArray(node)) {
    node.forEach((n) => collectImageUrls(n, acc));
  } else if (typeof node === 'object') {
    Object.values(node).forEach((n) => collectImageUrls(n, acc));
  }
  return acc;
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'images'), { recursive: true });
  const token = mintToken();
  const appId = process.env.ASC_APP_ID;

  const targets = {
    screenshotSubmissions: `${API}/v1/betaFeedbackScreenshotSubmissions?filter[app]=${appId}&limit=50`,
    screenshotSubmissionsViaApp: `${API}/v1/apps/${appId}/betaFeedbackScreenshotSubmissions?limit=50`,
    crashSubmissions: `${API}/v1/betaFeedbackCrashSubmissions?filter[app]=${appId}&limit=50`,
  };

  const results = {};
  for (const [name, url] of Object.entries(targets)) {
    results[name] = await getAllPages(url, token);
    const first = results[name][0] || {};
    console.log(`${name}: ${first.__error ? `ERROR ${first.__error}` : `${(first.data || []).length}+ items`}`);
  }

  fs.writeFileSync(path.join(OUT, 'feedback-raw.json'), JSON.stringify(results, null, 2));

  // Download screenshot images (ASC serves pre-signed URLs; fall back to auth).
  const urls = [...collectImageUrls(results, new Set())];
  console.log(`image-ish URLs found: ${urls.length}`);
  let i = 0;
  for (const u of urls) {
    i += 1;
    try {
      let res = await fetch(u);
      if (!res.ok) res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { console.log(`skip ${i}: HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = (res.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
      fs.writeFileSync(path.join(OUT, 'images', `img-${String(i).padStart(3, '0')}.${ext}`), buf);
    } catch (e) {
      console.log(`skip ${i}: ${e.message}`);
    }
  }
  console.log('done; wrote', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
