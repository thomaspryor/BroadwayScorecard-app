// Settings opened https://broadwayscorecard.com/best/best-musicals, a 404 (the
// route is /best/musicals). This collects every website path the app opens
// from Settings and the sign-in sheet.
//
// Offline (every CI run): paths must be well-formed and the known-dead one must
// not come back. Live: `CHECK_WEB_LINKS=1 npm test` fetches each one and fails
// on anything but 200 — run it whenever a link is added or the web routes move.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WEB = 'https://broadwayscorecard.com';
const SOURCES = ['app/settings.tsx', 'components/SignInSheet.tsx'];

function collectPaths() {
  const paths = new Set();
  for (const file of SOURCES) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/open\('(\/[^']*)'\)/g)) paths.add(m[1]);
    for (const m of src.matchAll(/https:\/\/broadwayscorecard\.com(\/[A-Za-z0-9/_-]*)/g)) paths.add(m[1]);
  }
  return [...paths].sort();
}

test('settings links are well-formed and avoid known-dead routes', () => {
  const paths = collectPaths();
  assert.ok(paths.length >= 10, `expected the Settings link list, found ${paths.length}`);
  for (const p of paths) {
    assert.match(p, /^\/[a-z0-9/_-]*$/, `${p} is not a plain site path`);
    assert.notEqual(p, '/best/best-musicals', 'that route 404s; the page is /best/musicals');
  }
});

test('the sign-in sheet links its Terms and Privacy Policy', () => {
  const src = readFileSync(new URL('../../components/SignInSheet.tsx', import.meta.url), 'utf8');
  assert.match(src, /'https:\/\/broadwayscorecard\.com\/terms'/);
  assert.match(src, /'https:\/\/broadwayscorecard\.com\/privacy'/);
  assert.match(src, /openBrowserAsync\(TERMS_URL\)/);
  assert.match(src, /openBrowserAsync\(PRIVACY_URL\)/);
});

test('every linked page returns 200 (live, opt-in)', { skip: process.env.CHECK_WEB_LINKS !== '1' }, async () => {
  const failures = [];
  for (const p of collectPaths()) {
    const res = await fetch(WEB + p, { redirect: 'follow' });
    if (res.status !== 200) failures.push(`${p} -> ${res.status}`);
  }
  assert.deepEqual(failures, []);
});
