#!/usr/bin/env node
// Deletes push_tokens rows created by diagnostics and security tests.
//
// Why this needs to exist: push_tokens has no DELETE policy, deliberately — the
// app never deletes tokens, so ordinary users have no business doing so. That
// also means the diagnostic and test rows are permanent from the client's side,
// and they accumulated: four diagnostic runs on 2026-08-12 left roughly a dozen
// rows in the production table, plus one per CI run of the registration test
// forever after. Test debris in a live table is not acceptable just because it
// is inert — it distorts any future count and buries the real rows.
//
// Uses the SERVICE ROLE, which bypasses RLS. That is correct here: this is
// janitorial work on rows the tests created, not something an app user does.
// It only ever matches the namespaced test prefixes below, never a real token —
// a real Expo token could not contain these strings.
//
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-push-token-debris.js [--dry-run]

const https = require('https');

const SUPABASE_URL = 'https://tcbkoevwfemkicrwpypb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

// Every prefix a test or diagnostic has ever written. Keep in sync with
// scripts/diagnose-push-token-insert.js and tests/security/*.
const TEST_PREFIXES = [
  'ExponentPushToken[diag-',
  'ExponentPushToken[registration-test-',
  'ExponentPushToken[owner-write-',
];
// Seeded fixture state, NOT debris — scripts/seed-photo-test-accounts.js owns
// this row and the account-data suite asserts against it. Never delete it.
const KEEP = 'ExponentPushToken[rls-adversarial-fixture]';

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  process.exit(1);
}

function req(method, path) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: new URL(SUPABASE_URL).hostname,
        path,
        method,
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      },
      res => {
        let chunks = '';
        res.on('data', c => (chunks += c));
        res.on('end', () => {
          const body = chunks ? (() => { try { return JSON.parse(chunks); } catch { return chunks; } })() : null;
          resolve({ status: res.statusCode, body });
        });
      },
    );
    r.on('error', reject);
    r.end();
  });
}

(async () => {
  let removed = 0;
  for (const prefix of TEST_PREFIXES) {
    const like = encodeURIComponent(`${prefix}*`);
    const found = await req('GET', `/rest/v1/push_tokens?token=like.${like}&select=token`);
    if (found.status !== 200) {
      console.error(`Lookup failed for ${prefix}: ${found.status} ${JSON.stringify(found.body).slice(0, 200)}`);
      process.exit(1);
    }
    const rows = (found.body || []).filter(r => r.token !== KEEP);
    if (rows.length === 0) {
      console.log(`  ${prefix}* — nothing to remove`);
      continue;
    }
    console.log(`  ${prefix}* — ${rows.length} row(s)${DRY_RUN ? ' (dry run)' : ''}`);
    if (DRY_RUN) { removed += rows.length; continue; }

    const del = await req('DELETE', `/rest/v1/push_tokens?token=like.${like}`);
    if (del.status !== 200 && del.status !== 204) {
      console.error(`Delete failed for ${prefix}: ${del.status} ${JSON.stringify(del.body).slice(0, 200)}`);
      process.exit(1);
    }
    removed += rows.length;
  }
  console.log(`${DRY_RUN ? 'Would remove' : 'Removed'} ${removed} test row(s).`);

  const kept = await req('GET', `/rest/v1/push_tokens?token=eq.${encodeURIComponent(KEEP)}&select=token`);
  const stillThere = Array.isArray(kept.body) && kept.body.length === 1;
  console.log(`Seeded fixture row present: ${stillThere ? 'yes' : 'NO — expected it to survive'}`);
  if (!stillThere) process.exit(1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
