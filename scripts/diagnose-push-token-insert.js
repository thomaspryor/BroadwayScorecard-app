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

const TOKENS = {
  plain: 'ExponentPushToken[diag-plain]',
  upsert: 'ExponentPushToken[diag-upsert]',
  nullUser: 'ExponentPushToken[diag-nulluser]',
  minimal: 'ExponentPushToken[diag-minimal]',
  crossaccount: 'ExponentPushToken[diag-crossaccount]',
  updateThenInsert: 'ExponentPushToken[diag-update-then-insert]',
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

  // The replacement path in lib/notifications.ts: UPDATE first, INSERT if it
  // matched nothing. Run twice — the second pass exercises the update branch,
  // which is what every launch after the first one hits.
  for (const pass of [1, 2]) {
    const { data: updated, error: updErr } = await sb.from('push_tokens')
      .update({ token: TOKENS.updateThenInsert, platform: 'ios', user_id: uid, updated_at: now })
      .eq('token', TOKENS.updateThenInsert).select('token');
    if (updErr) { report(`update-then-insert pass ${pass} (UPDATE leg)`, { error: updErr }); continue; }
    if ((updated?.length ?? 0) === 0) {
      report(`update-then-insert pass ${pass} (INSERT leg, no row matched)`,
        await sb.from('push_tokens').insert(
          { token: TOKENS.updateThenInsert, platform: 'ios', user_id: uid, updated_at: now }));
    } else {
      report(`update-then-insert pass ${pass} (UPDATE leg matched ${updated.length} row)`, { error: null });
    }
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
        { token: 'ExponentPushToken[diag-crossaccount]', platform: 'ios', user_id: OTHER_USER, updated_at: now }));
  } else {
    console.log('\nCross-account attach: SKIPPED (needs FIXTURE_PHOTO_B_PASSWORD)');
  }

  console.log('\nCleanup (delete has no policy, so these are expected to be no-ops):');
  for (const t of Object.values(TOKENS)) {
    const { error } = await sb.from('push_tokens').delete().eq('token', t);
    console.log(`  ${t}: ${error ? error.code + ' ' + error.message : 'no error (may have matched 0 rows)'}`);
  }
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
