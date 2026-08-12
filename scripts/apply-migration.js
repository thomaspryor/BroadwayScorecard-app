#!/usr/bin/env node
// Applies ONE migration file from supabase/migrations/ to the production
// database, via the Supabase Management API SQL endpoint.
//
// This exists because nothing else in this repo can apply a migration: there is
// no Supabase CLI in CI and SUPABASE_ACCESS_TOKEN is a GitHub secret, not
// something a local session holds. Migrations were therefore written and then
// applied by hand, out of band, with no record of which ones had actually run.
//
// Deliberately narrow, because "run arbitrary SQL against production" is a
// dangerous button to leave lying around in a PUBLIC repo:
//   - reads only from supabase/migrations/, by exact basename, with no path
//     separators allowed (no ../ escapes, no absolute paths);
//   - prints the full SQL before running it, so the run log is the audit trail;
//   - requires --confirm, so a mistyped invocation does nothing;
//   - refuses anything that isn't a .sql file that exists.
// It does NOT track which migrations have run. One file, one deliberate press.
//
// Usage: node scripts/apply-migration.js <basename.sql> --confirm

const https = require('https');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'tcbkoevwfemkicrwpypb';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

const [, , rawName, ...flags] = process.argv;

if (!ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN env var (personal access token, Management API).');
  process.exit(1);
}
if (!rawName) {
  console.error('Usage: node scripts/apply-migration.js <basename.sql> --confirm');
  process.exit(1);
}
if (rawName !== path.basename(rawName) || rawName.includes('/') || rawName.includes('\\')) {
  console.error(`Refusing "${rawName}": pass a bare filename inside supabase/migrations/, not a path.`);
  process.exit(1);
}
if (!rawName.endsWith('.sql')) {
  console.error(`Refusing "${rawName}": not a .sql file.`);
  process.exit(1);
}

const file = path.join(MIGRATIONS_DIR, rawName);
if (!fs.existsSync(file)) {
  console.error(`Migration not found: supabase/migrations/${rawName}`);
  console.error('Available:\n' + fs.readdirSync(MIGRATIONS_DIR).map(f => `  ${f}`).join('\n'));
  process.exit(1);
}

const sql = fs.readFileSync(file, 'utf8');

console.log(`=== supabase/migrations/${rawName} ===`);
console.log(sql);
console.log('=== end of migration ===\n');

if (!flags.includes('--confirm')) {
  console.log('DRY RUN — nothing was executed. Re-run with --confirm to apply.');
  process.exit(0);
}

const payload = JSON.stringify({ query: sql });
const req = https.request(
  {
    hostname: 'api.supabase.com',
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  },
  res => {
    let chunks = '';
    res.on('data', c => (chunks += c));
    res.on('end', () => {
      const body = chunks ? (() => { try { return JSON.parse(chunks); } catch { return chunks; } })() : null;
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        console.error(`FAILED: Management API returned ${res.statusCode}`);
        console.error(JSON.stringify(body, null, 2).slice(0, 2000));
        process.exit(1);
      }
      console.log(`APPLIED: supabase/migrations/${rawName}`);
      console.log('Response:', JSON.stringify(body).slice(0, 500));
    });
  },
);
req.on('error', e => { console.error('Request failed:', e.message); process.exit(1); });
req.write(payload);
req.end();
