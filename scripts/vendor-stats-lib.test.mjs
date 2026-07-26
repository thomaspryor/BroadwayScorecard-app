// Drift gate for the vendored Show Stats engine (lib/stats/).
//
// Two independent failure modes, two independent checks:
//
//   1. TAMPER  — someone edited a vendored file in this repo. Detected by
//      re-hashing every file in lib/stats/ against VENDOR_MANIFEST.json.
//      Runs everywhere, including CI runners that have no web repo checked out.
//
//   2. DRIFT   — the web repo's src/lib/stats/ moved on and this copy is stale.
//      Detected by re-reading the source and comparing sourceSha256. Only
//      possible when a Broadwayscore checkout is present (BSC_WEB_REPO or
//      ~/Broadwayscore), so it SKIPS rather than fails on CI.
//
// Rule 15 (never copy logic into tests): this imports the real check()/
// buildVendorSet() from scripts/vendor-stats-lib.js.
//
// Run: node --test scripts/vendor-stats-lib.test.mjs
// CI:  the gate job in .github/workflows/eas-build.yml.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vendor = require('./vendor-stats-lib.js');
const { sha256, DEST_DIR, MANIFEST_PATH, SRC_DIR, WEB_REPO } = vendor;

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const webRepoPresent = fs.existsSync(SRC_DIR);

describe('vendored stats engine — tamper check (no web repo needed)', () => {
  test('manifest lists every file the engine needs', () => {
    // A missing reducer means an import in lib/stats/index.ts resolves to
    // nothing and the Stats tab white-screens at runtime.
    for (const f of [
      'types.ts', 'parse.ts', 'venue-match.ts', 'venue-aliases.json',
      'season-windows.ts', 'diary-stats.ts', 'align-critics.ts',
      'theater-completion.ts', 'canon-progress.ts', 'ratings-histogram.ts',
      'index.ts', 'theater-houses.json',
    ]) {
      assert.ok(manifest.files[f], `${f} missing from VENDOR_MANIFEST.json`);
    }
  });

  test('every vendored file matches its recorded checksum', () => {
    for (const [file, rec] of Object.entries(manifest.files)) {
      const p = path.join(DEST_DIR, file);
      assert.ok(fs.existsSync(p), `${file} is in the manifest but not on disk`);
      const actual = sha256(fs.readFileSync(p, 'utf8'));
      assert.equal(
        actual, rec.sha256,
        `${file} was edited in this repo. Vendored files are read-only — change ` +
        `src/lib/stats/ in Broadwayscore, then re-run scripts/vendor-stats-lib.js.`,
      );
    }
  });

  test('lib/stats/ contains nothing outside the manifest', () => {
    const onDisk = fs.readdirSync(DEST_DIR).filter((f) => f !== 'VENDOR_MANIFEST.json');
    for (const f of onDisk) {
      assert.ok(
        manifest.files[f],
        `${f} is in lib/stats/ but not vendored. App-only stats code belongs in ` +
        `lib/stats-*.ts, not inside the vendored directory.`,
      );
    }
  });

  test('derived theater-houses.json is a usable denominator', () => {
    const houses = JSON.parse(fs.readFileSync(path.join(DEST_DIR, 'theater-houses.json'), 'utf8'));
    const names = Object.keys(houses);
    // The completion ring reads "N of <this>". A generator that silently
    // emitted 0 or 500 houses would ship a wrong denominator to every user.
    assert.ok(names.length >= 38 && names.length <= 48, `expected ~42 Broadway houses, got ${names.length}`);
    assert.ok(names.every((n) => !n.startsWith('_')), '_meta leaked into the house list');
    const withCapacity = names.filter((n) => typeof houses[n].capacity === 'number');
    assert.ok(withCapacity.length >= names.length - 2, 'too many houses missing capacity');
    assert.ok(houses['Booth Theatre']?.capacity > 0, 'Booth Theatre capacity missing');
    assert.ok(houses['Gershwin Theatre']?.yearBuilt > 1900, 'Gershwin yearBuilt missing');
  });
});

describe('vendored stats engine — drift vs Broadwayscore', { skip: webRepoPresent ? false : `no web repo at ${WEB_REPO}` }, () => {
  test('web repo sources still hash to what was vendored', () => {
    const problems = vendor.check(vendor.buildVendorSet());
    assert.deepEqual(
      problems, [],
      'Run `node scripts/vendor-stats-lib.js` and commit the result.',
    );
  });
});
