#!/usr/bin/env node
// Creates two fixture accounts (A + B) used ONLY by the two-account photo
// RLS adversarial test (tests/security/photo-rls-adversarial.test.mjs).
// Run once locally/CI with SUPABASE_SERVICE_ROLE_KEY set. Idempotent.

const https = require('https');

const SUPABASE_URL = 'https://tcbkoevwfemkicrwpypb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// No hardcoded fallback passwords — these accounts are real, signed-in-able
// rows on the production project. A committed default in a PUBLIC repo would
// hand out valid production credentials (security review finding, 2026-07-27).
// Set FIXTURE_PHOTO_A_PASSWORD / FIXTURE_PHOTO_B_PASSWORD as GitHub secrets.
if (!process.env.FIXTURE_PHOTO_A_PASSWORD || !process.env.FIXTURE_PHOTO_B_PASSWORD) {
  console.error('Missing FIXTURE_PHOTO_A_PASSWORD / FIXTURE_PHOTO_B_PASSWORD env vars — refusing to seed with a hardcoded password.');
  process.exit(1);
}
const ACCOUNTS = [
  { key: 'A', email: 'fixture-photo-a@broadwayscorecard.com', password: process.env.FIXTURE_PHOTO_A_PASSWORD },
  { key: 'B', email: 'fixture-photo-b@broadwayscorecard.com', password: process.env.FIXTURE_PHOTO_B_PASSWORD },
];
const FIXTURE_SHOW_ID = 'death-of-a-salesman-2026';

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  process.exit(1);
}

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      path,
      method,
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    };
    const r = https.request(options, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        const parsed = chunks ? (() => { try { return JSON.parse(chunks); } catch { return chunks; } })() : null;
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function ensureUser(email, password) {
  const list = await req('GET', `/auth/v1/admin/users?per_page=1000`);
  const users = list.body?.users || [];
  const existing = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
  if (existing) {
    await req('PUT', `/auth/v1/admin/users/${existing.id}`, { password, email_confirm: true });
    return existing.id;
  }
  const res = await req('POST', '/auth/v1/admin/users', {
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Photo RLS Fixture ${email}`, source: 'photo-rls-test-fixture' },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Create failed for ${email}: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  return res.body.id;
}

async function ensureProfile(userId, email) {
  const res = await req('POST', '/rest/v1/profiles', {
    id: userId,
    display_name: `Photo RLS Fixture (${email})`,
    avatar_url: null,
  });
  if (res.status !== 201 && res.status !== 409) {
    console.log(`  (profiles: status ${res.status})`, JSON.stringify(res.body).slice(0, 200));
  }
}

// Seeded with the SERVICE ROLE on purpose. The adversarial test's push-token
// assertions need a row belonging to account A to exist before they can prove
// account B cannot read it — "B sees zero rows" is not evidence of RLS when the
// table is empty. Creating that row is fixture setup, not the thing under test,
// so it does not weaken the assertions (which all run through anon-key clients).
//
// It also cannot be created any other way: an ordinary authenticated user
// inserting its own push token is currently REJECTED by RLS on this table
// (42501), which is a real app bug — lib/notifications.ts does exactly that
// insert and ignores the returned error. See memory/testing.md.
const FIXTURE_PUSH_TOKEN_A = 'ExponentPushToken[rls-adversarial-fixture]';

async function ensurePushToken(userId) {
  const existing = await req('GET', `/rest/v1/push_tokens?token=eq.${encodeURIComponent(FIXTURE_PUSH_TOKEN_A)}&select=token,user_id`);
  const row = Array.isArray(existing.body) ? existing.body[0] : null;
  if (row && row.user_id === userId) return FIXTURE_PUSH_TOKEN_A;

  const res = await req(row ? 'PATCH' : 'POST',
    row ? `/rest/v1/push_tokens?token=eq.${encodeURIComponent(FIXTURE_PUSH_TOKEN_A)}` : '/rest/v1/push_tokens',
    { ...(row ? {} : { token: FIXTURE_PUSH_TOKEN_A }), platform: 'ios', user_id: userId, updated_at: new Date().toISOString() });
  if (res.status !== 200 && res.status !== 201 && res.status !== 204) {
    throw new Error(`Push token seed failed: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  return FIXTURE_PUSH_TOKEN_A;
}

async function ensureReview(userId) {
  const existing = await req('GET', `/rest/v1/reviews?user_id=eq.${userId}&show_id=eq.${FIXTURE_SHOW_ID}&select=id`);
  if (Array.isArray(existing.body) && existing.body.length > 0) return existing.body[0].id;

  const res = await req('POST', '/rest/v1/reviews', {
    user_id: userId,
    show_id: FIXTURE_SHOW_ID,
    rating: 4.5,
    review_text: 'Photo RLS fixture review — not real diary data.',
    date_seen: '2026-04-14',
  });
  if (res.status !== 201) throw new Error(`Review create failed: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  const row = Array.isArray(res.body) ? res.body[0] : res.body;
  return row.id;
}

(async () => {
  const out = {};
  for (const account of ACCOUNTS) {
    console.log(`→ Ensuring fixture account ${account.key} (${account.email})…`);
    const userId = await ensureUser(account.email, account.password);
    await ensureProfile(userId, account.email);
    const reviewId = await ensureReview(userId);
    // Only account A needs a push token — it is the target of B's read attempt.
    if (account.key === 'A') await ensurePushToken(userId);
    // Never include password — CI logs on a public repo are world-readable.
    out[account.key] = { userId, reviewId, email: account.email };
    console.log(`  ✓ user=${userId} review=${reviewId}`);
  }
  console.log('\n' + JSON.stringify(out, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
