// Locks in the push-token registration fix (2026-08-12).
//
// The bug: lib/notifications.ts registered devices with
// `.upsert(..., { onConflict: 'token' })`, which Postgres rejects with 42501
// for every signed-in user. No device ever registered, and supabase-js resolves
// with an { error } object rather than throwing, so nothing surfaced — users
// simply received no notifications.
//
// Two replacements were needed, because the first one was wrong in the same
// way. Update-then-insert read back the number of rows changed, and push_tokens
// grants ordinary users no SELECT, so that count is zero whether the update
// worked or not — it then inserted on every relaunch and hit 23505. Reading
// back a value RLS suppresses is the same mistake as ignoring an error return.
//
// This test therefore covers BOTH launches. A test of first-launch alone would
// have passed against the broken update-then-insert version.
//
// Run: npm run test:security

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const REQUIRED_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'FIXTURE_PHOTO_A_PASSWORD', 'FIXTURE_PHOTO_B_PASSWORD',
];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length > 0 && process.env.CI) {
  console.error(`FATAL: missing required env var(s) in CI: ${missing.join(', ')} — refusing to silently skip a BLOCKING security gate.`);
  process.exit(1);
}

const ACCOUNT_A = { email: 'fixture-photo-a@broadwayscorecard.com', password: process.env.FIXTURE_PHOTO_A_PASSWORD };
const ACCOUNT_B = { email: 'fixture-photo-b@broadwayscorecard.com', password: process.env.FIXTURE_PHOTO_B_PASSWORD };

// push_tokens has no DELETE policy, so nothing this test writes can ever be
// removed. A fixed token name would collide with the previous run and report
// 23505 for everything — debris masquerading as a result, which is exactly how
// the diagnostic misled us before the names were scoped.
const RUN = process.env.GITHUB_RUN_ID || `local-${process.env.USER || 'dev'}`;
const TOKEN = `ExponentPushToken[registration-test-${RUN}]`;

async function signIn(client, account) {
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return data.user.id;
}

// The exact sequence lib/notifications.ts savePushTokenToServer() runs. Kept
// deliberately in lock-step with it: if that function changes shape, this
// should change with it or it stops testing the real path.
async function registerDevice(client, row) {
  let { error } = await client.from('push_tokens').insert(row);
  if (error && error.code === '23505') {
    ({ error } = await client.from('push_tokens').update(row).eq('token', row.token));
  }
  return error;
}

test('push_tokens: a signed-in user can register their device, on first launch and after', async (t) => {
  if (missing.length > 0) {
    t.skip(`${missing.join(', ')} not set — skipping live RLS test (local dev only; CI fails closed above)`);
    return;
  }

  const sbA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const sbB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let userAId, userBId;

  await t.test('setup: sign in as both fixture accounts', async () => {
    userAId = await signIn(sbA, ACCOUNT_A);
    userBId = await signIn(sbB, ACCOUNT_B);
    assert.notEqual(userAId, userBId, 'fixture accounts must be distinct users');
  });

  await t.test('first launch: the device registers', async () => {
    const error = await registerDevice(sbA, {
      token: TOKEN, platform: 'ios', user_id: userAId, updated_at: new Date().toISOString(),
    });
    assert.equal(
      error, null,
      `a signed-in user must be able to register their device — this failed with 42501 for the ` +
      `life of the feature, and every signed-in user silently got no notifications: ${error?.message}`,
    );
  });

  await t.test('relaunch: registering the same device again still works', async () => {
    // The case that killed the first fix attempt. It inserted every time and
    // hit 23505, because it could not tell "updated nothing" from "updated a
    // row I am not allowed to see".
    const error = await registerDevice(sbA, {
      token: TOKEN, platform: 'ios', user_id: userAId, updated_at: new Date().toISOString(),
    });
    assert.equal(error, null, `re-registering an existing device must succeed: ${error?.message}`);
  });

  await t.test('BLOCKING: tokens are not readable by another account', async () => {
    const { data: byUser } = await sbB.from('push_tokens').select('token').eq('user_id', userAId);
    assert.equal(byUser?.length ?? 0, 0, 'account B must not read account A\'s tokens by user_id');

    const { data: byToken } = await sbB.from('push_tokens').select('token').eq('token', TOKEN);
    assert.equal(byToken?.length ?? 0, 0, 'account B must not read account A\'s token by its value');
  });

  // This assertion was held back until migration 20260812094500 was applied on
  // 2026-08-12. Before it, account B COULD register a device onto account A —
  // measured, run 31602907198 — because the old "Anon can insert push tokens"
  // policy validated the token's shape but never its owner, and permissive
  // policies OR together. Adding an owner-scoped policy could not close that;
  // the open one had to be replaced.
  await t.test('BLOCKING: a user cannot register a device onto another account', async () => {
    const forged = `${TOKEN}-forged-by-b`;
    const { data, error } = await sbB
      .from('push_tokens')
      .insert({ token: forged, platform: 'ios', user_id: userAId, updated_at: new Date().toISOString() })
      .select('token');
    const rows = Array.isArray(data) ? data.length : (data ? 1 : 0);
    assert.ok(
      error != null || rows === 0,
      'account B registering a device under account A\'s user_id must be rejected — otherwise ' +
      'anyone who knows a user id can attach their own phone and receive that user\'s notifications',
    );
  });

  await t.test('BLOCKING: a user cannot reassign an existing row to someone else', async () => {
    // The UPDATE policy uses `using (true)` so a device changing hands can claim
    // its own token (sign out, hand the phone over, someone else signs in).
    // WITH CHECK is what stops that being a way to hand a row to a third party.
    const { data, error } = await sbB
      .from('push_tokens')
      .update({ user_id: userAId, updated_at: new Date().toISOString() })
      .eq('token', TOKEN)
      .select('token');
    const rows = Array.isArray(data) ? data.length : (data ? 1 : 0);
    assert.ok(
      error != null || rows === 0,
      'account B must not be able to set a token\'s owner to account A',
    );
  });
});
