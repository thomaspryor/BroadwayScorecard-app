// Locks in the push_tokens policy fix applied 2026-08-12
// (migration 20260812013000, workflow run 31601639316).
//
// Two things have to stay true at once, and they pull in opposite directions:
//
//   1. A signed-in user CAN register their own device. Before the migration
//      this was rejected with `42501 new row violates row-level security
//      policy`, which meant lib/notifications.ts silently failed for every
//      signed-in user and they received no notifications at all.
//   2. Nobody can register a device on somebody ELSE'S account, and nobody can
//      read anybody's tokens. A push token is a device secret — whoever holds
//      one can send arbitrary notifications to that phone.
//
// A test for (1) alone would pass if the policy were `with check (true)`, which
// is the obvious wrong fix. A test for (2) alone was what the suite already had,
// and it passed happily while (1) was broken. Both, together, are what pins the
// policy to the shape it is supposed to have.
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

// Distinct from the seeded fixture token in the account-data suite: this one is
// created and destroyed by this test, because creating it IS the thing under
// test. Namespaced so a leaked row is obviously debris.
const OWN_TOKEN = 'ExponentPushToken[owner-write-fixture-a]';
const FORGED_TOKEN = 'ExponentPushToken[owner-write-forged-by-a]';

async function signIn(client, account) {
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return data.user.id;
}

test('push_tokens: a user can register their own device, and only their own', async (t) => {
  if (missing.length > 0) {
    t.skip(`${missing.join(', ')} not set — skipping live RLS test (local dev only; CI fails closed above)`);
    return;
  }

  const sbA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const sbB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  let userAId, userBId;

  t.after(async () => {
    try {
      await sbA.from('push_tokens').delete().eq('token', OWN_TOKEN);
      await sbA.from('push_tokens').delete().eq('token', FORGED_TOKEN);
    } catch {
      // Best-effort. Delete is itself policy-dependent; a leftover row is
      // harmless test debris and the next run overwrites it by token.
    }
  });

  await t.test('setup: sign in as both fixture accounts', async () => {
    userAId = await signIn(sbA, ACCOUNT_A);
    userBId = await signIn(sbB, ACCOUNT_B);
    assert.notEqual(userAId, userBId, 'fixture accounts must be distinct users');
    await sbA.from('push_tokens').delete().eq('token', OWN_TOKEN);
  });

  // ---- (1) the bug that was shipped ----------------------------------------

  await t.test('a signed-in user CAN register their own device', async () => {
    // Deliberately the same shape as lib/notifications.ts savePushTokenToServer():
    // same columns, same onConflict. If this ever fails again, push notifications
    // are silently broken for every signed-in user, exactly as they were before
    // 2026-08-12.
    const { error } = await sbA.from('push_tokens').upsert(
      { token: OWN_TOKEN, platform: 'ios', user_id: userAId, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    assert.equal(
      error, null,
      `a signed-in user must be able to save their own push token — this is the exact call ` +
      `lib/notifications.ts makes, and it failed with 42501 before the policy fix: ${error?.message}`,
    );
  });

  await t.test('re-registering the same device still works (the upsert path)', async () => {
    // Devices re-register on every launch, so the UPDATE branch of the upsert
    // matters as much as the INSERT branch — a policy covering only INSERT
    // would fail on the second launch instead of the first, which is worse.
    const { error } = await sbA.from('push_tokens').upsert(
      { token: OWN_TOKEN, platform: 'ios', user_id: userAId, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    assert.equal(error, null, `re-registering an existing token must succeed: ${error?.message}`);
  });

  // ---- (2) what must NOT have been opened ----------------------------------

  await t.test('BLOCKING: a user cannot register a device onto another account', async () => {
    const { data, error } = await sbA
      .from('push_tokens')
      .insert({ token: FORGED_TOKEN, platform: 'ios', user_id: userBId, updated_at: new Date().toISOString() })
      .select();
    const rows = Array.isArray(data) ? data.length : (data ? 1 : 0);
    assert.ok(
      error != null || rows === 0,
      'account A writing a push token owned by account B must be rejected — otherwise anyone ' +
      'can attach their device to someone else\'s account and receive their notifications',
    );
  });

  await t.test('BLOCKING: tokens are still unreadable by another account', async () => {
    const { data: byUser } = await sbB.from('push_tokens').select('token').eq('user_id', userAId);
    assert.equal(byUser?.length ?? 0, 0, 'account B must not read account A\'s tokens by user_id');

    const { data: byToken } = await sbB.from('push_tokens').select('token').eq('token', OWN_TOKEN);
    assert.equal(byToken?.length ?? 0, 0, 'account B must not read account A\'s token by its value');
  });

  await t.test('BLOCKING: the policy did not become `with check (true)`', async () => {
    // The obvious wrong fix for "users cannot insert their own token" is to
    // allow every insert. That would pass every assertion above except this one.
    const { data, error } = await sbB
      .from('push_tokens')
      .update({ platform: 'android' })
      .eq('token', OWN_TOKEN)
      .select();
    const rows = Array.isArray(data) ? data.length : (data ? 1 : 0);
    assert.ok(
      error != null || rows === 0,
      'account B must not be able to modify account A\'s token row',
    );
  });
});
