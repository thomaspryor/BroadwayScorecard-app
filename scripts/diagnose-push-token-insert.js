#!/usr/bin/env node
// Diagnostic, not a gate. Signs in as fixture account A with the anon key —
// exactly as the app does — and tries several shapes of push_tokens write,
// printing the precise error for each.
//
// Why: the owner-scoped INSERT policy was applied on 2026-08-12 and the write
// it was meant to unblock still returns 42501. The policy is present,
// PERMISSIVE, scoped to {anon, authenticated}, and `authenticated` holds the
// INSERT grant — so the obvious explanations are all ruled out and further
// theorising is guesswork. This isolates which shape actually fails.
//
// The interesting split is plain INSERT versus UPSERT: supabase-js `.upsert()`
// with onConflict issues `INSERT ... ON CONFLICT DO UPDATE`, which brings the
// UPDATE policies and a read of the conflicting row into play. push_tokens has
// no SELECT policy for ordinary users (only service_role), so the conflict path
// may be unable to see the row it would update.
//
// Usage: node scripts/diagnose-push-token-insert.js

const { createClient } = require('@supabase/supabase-js');

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PW = process.env.FIXTURE_PHOTO_A_PASSWORD;
const PW_B = process.env.FIXTURE_PHOTO_B_PASSWORD;

if (!URL || !ANON || !PW) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / FIXTURE_PHOTO_A_PASSWORD.');
  process.exit(1);
}

// Scoped to the run. push_tokens has no DELETE policy, so cleanup cannot
// actually remove anything and every row this script writes is permanent. With
// fixed names, run 2 onwards reported 23505 for everything and told us nothing
// about the policies — the debris masqueraded as a result.
const RUN = process.env.GITHUB_RUN_ID || 'local';
const TOKENS = {
  plain: `ExponentPushToken[diag-${RUN}-plain]`,
  upsert: `ExponentPushToken[diag-${RUN}-upsert]`,
  nullUser: `ExponentPushToken[diag-${RUN}-nulluser]`,
  minimal: `ExponentPushToken[diag-${RUN}-minimal]`,
  crossaccount: `ExponentPushToken[diag-${RUN}-crossaccount]`,
  insertFirst: `ExponentPushToken[diag-${RUN}-insert-first]`,
};

function report(label, { error }) {
  if (!error) {
    console.log(`  ✓ ${label}: SUCCEEDED`);
    return true;
  }
  console.log(`  ✗ ${label}: ${error.code || '?'} — ${error.message}`);
  if (error.details) console.log(`      details: ${error.details}`);
  if (error.hint) console.log(`      hint: ${error.hint}`);
  return false;
}

(async () => {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error: signInErr } = await sb.auth.signInWithPassword({
    email: 'fixture-photo-a@broadwayscorecard.com',
    password: PW,
  });
  if (signInErr) { console.error('Sign-in failed:', signInErr.message); process.exit(1); }
  const uid = data.user.id;
  console.log(`Signed in as ${uid}\n`);

  // Confirms the JWT actually carries the claim the policy reads. If this is
  // not the user id, every `user_id = auth.uid()` policy fails for reasons that
  // have nothing to do with how the policy is written.
  const { data: claimCheck } = await sb.rpc('auth_uid_probe').then(
    r => r, () => ({ data: '(no auth_uid_probe function — skipped)' }),
  );
  console.log(`auth.uid() probe: ${JSON.stringify(claimCheck)}\n`);

  console.log('Writes:');
  const now = new Date().toISOString();

  report('plain INSERT, own user_id',
    await sb.from('push_tokens').insert({ token: TOKENS.plain, platform: 'ios', user_id: uid, updated_at: now }));

  report('plain INSERT, user_id null',
    await sb.from('push_tokens').insert({ token: TOKENS.nullUser, platform: 'ios', user_id: null, updated_at: now }));

  report('plain INSERT, token+platform only',
    await sb.from('push_tokens').insert({ token: TOKENS.minimal, platform: 'ios' }));

  report('UPSERT onConflict=token, own user_id (the OLD app call)',
    await sb.from('push_tokens').upsert(
      { token: TOKENS.upsert, platform: 'ios', user_id: uid, updated_at: now },
      { onConflict: 'token' }));

  // The replacement path in lib/notifications.ts: INSERT, and on 23505 UPDATE.
  // Run twice — the second pass is the re-registration case that every launch
  // after the first one takes, and is exactly where update-then-insert broke.
  for (const pass of [1, 2]) {
    let { error } = await sb.from('push_tokens').insert(
      { token: TOKENS.insertFirst, platform: 'ios', user_id: uid, updated_at: now });
    let leg = 'INSERT';
    if (error && error.code === '23505') {
      leg = 'INSERT hit 23505 -> UPDATE';
      ({ error } = await sb.from('push_tokens').update(
        { platform: 'ios', user_id: uid, updated_at: now }).eq('token', TOKENS.insertFirst));
    }
    report(`insert-first pass ${pass} (${leg})`, { error });
  }

  // The pre-existing `Anon can insert push tokens` policy checks only token
  // length and platform — not user_id. Permissive policies OR together, so it
  // may allow a signed-in user to attach a device to SOMEBODY ELSE'S account,
  // which would mean receiving their notifications. Testing rather than
  // reading the policy and assuming.
  // Account B's id, obtained by signing in as B rather than by adding a secret.
  let OTHER_USER = null;
  if (PW_B) {
    const sbB = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: bData, error: bErr } = await sbB.auth.signInWithPassword({
      email: 'fixture-photo-b@broadwayscorecard.com',
      password: PW_B,
    });
    if (bErr) console.log(`  (could not sign in as B: ${bErr.message})`);
    else OTHER_USER = bData.user.id;
  }
  if (OTHER_USER) {
    console.log('\nCross-account attach (must be REJECTED):');
    report('INSERT a token owned by account B while signed in as A',
      await sb.from('push_tokens').insert(
        { token: TOKENS.crossaccount, platform: 'ios', user_id: OTHER_USER, updated_at: now }));
  } else {
    console.log('\nCross-account attach: SKIPPED (needs FIXTURE_PHOTO_B_PASSWORD)');
  }

  console.log('\nCleanup (delete has no policy, so these are expected to be no-ops):');
  for (const t of Object.values(TOKENS)) {
    const { error } = await sb.from('push_tokens').delete().eq('token', t);
    console.log(`  ${t}: ${error ? error.code + ' ' + error.message : 'no error (may have matched 0 rows)'}`);
  }
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
