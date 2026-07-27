#!/usr/bin/env node
// BLOCKING gate (task #571): confirms the diary-photos bucket is Private in
// the dashboard sense (public: false), via the Supabase Management API —
// the automated equivalent of an operator eyeballing Storage settings.
// Requires SUPABASE_ACCESS_TOKEN (personal access token, management API).

const https = require('https');

const PROJECT_REF = 'tcbkoevwfemkicrwpypb';
const BUCKET_ID = 'diary-photos';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN env var.');
  process.exit(1);
}

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(
      { hostname: 'api.supabase.com', path, headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      res => {
        let chunks = '';
        res.on('data', c => chunks += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
          catch (e) { reject(e); }
        });
      },
    ).on('error', reject);
  });
}

(async () => {
  const res = await get(`/v1/projects/${PROJECT_REF}/storage/buckets`);
  if (res.status !== 200) {
    console.error(`Management API returned ${res.status}:`, JSON.stringify(res.body).slice(0, 300));
    process.exit(1);
  }

  const bucket = (res.body || []).find(b => b.id === BUCKET_ID);
  if (!bucket) {
    console.error(`FAIL: bucket "${BUCKET_ID}" does not exist — migration not applied?`);
    process.exit(1);
  }
  if (bucket.public !== false) {
    console.error(`FAIL: bucket "${BUCKET_ID}" is public=${bucket.public} — must be Private (public: false).`);
    process.exit(1);
  }

  console.log(`✅ Bucket "${BUCKET_ID}" confirmed Private (public: false).`);
})().catch(e => { console.error(e); process.exit(1); });
