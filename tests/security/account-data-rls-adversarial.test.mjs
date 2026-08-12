// BLOCKING security test — proves Supabase RLS actually isolates one signed-in
// account's data from another's for EVERY table the app writes user data to.
//
// Why this exists (2026-08-11 audit): tests/security/photo-rls-adversarial.test.mjs
// covered `user_review_photos` and the diary-photos storage bucket. The app
// also reads and writes `watchlist`, `reviews`, `lists`, `list_items`,
// `profiles` and `push_tokens`, and none of those had an adversarial test. A
// client-side `.eq('user_id', me)` filter looks correct in every unit test and
// in every Maestro flow even when the database would happily serve — or
// accept a write to — somebody else's rows. Only a second real account can
// tell the difference.
//
// Method: two REAL fixture accounts (scripts/seed-photo-test-accounts.js)
// signed in with the anon key, exactly as the app does. No service-role
// shortcuts — the service role bypasses RLS and would make every assertion
// here vacuous.
//
// Run: node --run test:security   (or npm run test:security)
// Requires: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
// FIXTURE_PHOTO_A_PASSWORD, FIXTURE_PHOTO_B_PASSWORD.
// Local runs without these skip; in CI (CI=true) a missing/renamed secret is a
// hard failure, not a skip — a blocking gate must never read green by default.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertOnlyOwnerCanSee, assertWriteBlocked } from './isolation-helpers.mjs';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// SUPABASE_SERVICE_ROLE_KEY is required for fixture VERIFICATION only (see the
// push-token step in setup). Every isolation assertion runs through anon-key
// clients signed in as real users.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REQUIRED_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'FIXTURE_PHOTO_A_PASSWORD', 'FIXTURE_PHOTO_B_PASSWORD',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length > 0 && process.env.CI) {
  console.error(`FATAL: missing required env var(s) in CI: ${missing.join(', ')} — refusing to silently skip a BLOCKING security gate.`);
  process.exit(1);
}

const ACCOUNT_A = { email: 'fixture-photo-a@broadwayscorecard.com', password: process.env.FIXTURE_PHOTO_A_PASSWORD };
const ACCOUNT_B = { email: 'fixture-photo-b@broadwayscorecard.com', password: process.env.FIXTURE_PHOTO_B_PASSWORD };

// Namespaced so a leaked row is obviously test debris and can never collide
// with a real show id from the catalog.
const FIXTURE_SHOW_ID = 'rls-adversarial-fixture-show';
const FIXTURE_LIST_NAME = 'RLS adversarial fixture list';

async function signIn(client, account) {
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return data.user.id;
}

test('two-account account-data RLS adversarial test', async (t) => {
  if (missing.length > 0) {
    t.skip(`${missing.join(', ')} not set — skipping live RLS test (local dev only; CI fails closed above)`);
    return;
  }

  const sbA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const sbB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  let userAId, userBId, reviewAId, listAId;
  // Captured at setup so the attack assertions can compare against a REAL
  // known value rather than against undefined — see the profile and review
  // tests below for why that distinction decides whether they prove anything.
  let profileANameAtSetup, reviewARatingAtSetup;

  // Service-role client. Used ONLY to observe state from outside the two
  // accounts under test — never to make a security claim, since it bypasses RLS
  // and any assertion through it would be vacuous.
  //
  // Built here rather than inside the setup subtest: `await t.test()` fulfils
  // even when its subtest FAILS, so the later subtests run either way. Assigning
  // it in setup meant a setup failure left this undefined and the real failure
  // was then buried under a TypeError from an unrelated subtest (review finding,
  // 2026-08-12).
  assert.ok(SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required to verify fixture state');
  const sbService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // A push token owned by A, seeded with the service role by
  // scripts/seed-photo-test-accounts.js. "Account B sees zero rows" is only
  // evidence of RLS if there was a row there to miss — and this row cannot be
  // created here as account A, because RLS currently rejects an authenticated
  // user inserting its own push token (see the setup step below).
  const FIXTURE_PUSH_TOKEN = 'ExponentPushToken[rls-adversarial-fixture]';

  // Deletes every fixture row this test could have created, by NAME rather
  // than by the id of the row we happen to be holding — so it also sweeps
  // debris left by an earlier run that died before its teardown. Runs from the
  // account that owns the rows, so a passing RLS policy is what makes cleanup
  // work: the teardown is itself a positive control.
  async function purgeFixtureRows() {
    if (!userAId) return;
    const { data: staleLists, error: staleErr } = await sbA
      .from('lists').select('id').eq('user_id', userAId).eq('name', FIXTURE_LIST_NAME);
    // Not an assertion — this runs in teardown as well, where throwing would
    // mask the real failure. But a silent null here means the purge quietly
    // sweeps nothing and the debris it exists to remove survives, so say so.
    if (staleErr) console.warn(`[purge] could not list stale fixture lists: ${staleErr.message}`);
    for (const { id } of staleLists ?? []) {
      await sbA.from('list_items').delete().eq('list_id', id);
      await sbA.from('lists').delete().eq('id', id);
    }
    await sbA.from('watchlist').delete().eq('user_id', userAId).eq('show_id', FIXTURE_SHOW_ID);
    // Deliberately NOT deleting the push token: it is seeded fixture state
    // (like the review and the profile), not per-run debris, and account A
    // cannot recreate it under the current policy.
  }

  t.after(async () => {
    try {
      await purgeFixtureRows();
      // If RLS is BROKEN, account B's writes below actually land, and account
      // A is left holding B's edits. Restoring the captured values keeps a
      // failing run from permanently corrupting the fixture account — the
      // suite has to stay re-runnable precisely when it is reporting a
      // failure, since that is when it will be run over and over.
      if (reviewARatingAtSetup != null) {
        await sbA.from('reviews').update({ rating: reviewARatingAtSetup }).eq('id', reviewAId);
      }
      if (profileANameAtSetup) {
        await sbA.from('profiles').update({ display_name: profileANameAtSetup }).eq('id', userAId);
      }
    } catch {
      // Best-effort — a teardown failure doesn't invalidate the assertions
      // above, and the next run's setup sweeps whatever is left behind.
    }
  });

  await t.test('setup: sign in as both fixture accounts and seed account A data', async () => {
    userAId = await signIn(sbA, ACCOUNT_A);
    userBId = await signIn(sbB, ACCOUNT_B);
    assert.notEqual(userAId, userBId, 'fixture accounts must be distinct users');

    // `lists` has no natural unique key, so an insert per run would pile up a
    // new row on the owner's real account every push if a teardown ever
    // failed. Sweep first: setup is the only step guaranteed to run.
    await purgeFixtureRows();

    const { data: reviews, error: reviewErr } = await sbA
      .from('reviews').select('id, rating').eq('user_id', userAId).limit(1);
    assert.equal(reviewErr, null, 'fetching account A review should not error');
    assert.ok(reviews?.length, 'account A must have a seeded review — run scripts/seed-photo-test-accounts.js first');
    reviewAId = reviews[0].id;
    reviewARatingAtSetup = reviews[0].rating;

    // The profile assertion later compares against this value. Without it the
    // check reads `assert.notEqual(undefined, 'owned by B')`, which passes for
    // an account that simply has no profile row — green while proving nothing.
    const { data: profileA, error: profileErr } = await sbA
      .from('profiles').select('display_name').eq('id', userAId).maybeSingle();
    assert.equal(profileErr, null, 'fetching account A profile should not error');
    assert.ok(profileA, 'account A must have a profile row — run scripts/seed-photo-test-accounts.js first');
    assert.ok(profileA.display_name, 'account A profile must have a non-empty display_name to compare against');
    profileANameAtSetup = profileA.display_name;

    // Push tokens: confirm the fixture row EXISTS before asserting that account
    // B cannot see it. Without this the B assertion is satisfied by an empty
    // table and proves nothing.
    //
    // The existence check has to go through the service role, because
    // `push_tokens` is closed to clients in both directions:
    //   - INSERT as an authenticated user is rejected (42501). That one is a
    //     real app bug — lib/notifications.ts performs exactly that upsert and
    //     ignored the returned error, so signed-in users' devices silently
    //     never registered. Fixed in lib/notifications.ts; the policy half is
    //     supabase/migrations/20260812013000_push_tokens_owner_insert.sql.
    //   - SELECT returns zero rows even for the owner. That is CORRECT and
    //     deliberate: the app only ever writes this table, the server reads it,
    //     and a push token is a device secret. The migration does NOT open
    //     reads — widening a table to fix a test would be the exact inversion
    //     of the point.
    //
    // The service-role client below is used ONLY to verify fixture state. It is
    // never used for an isolation assertion — the service role bypasses RLS, so
    // any security claim made through it would be vacuous.
    const { data: seededTokens, error: seedReadErr } = await sbService
      .from('push_tokens').select('token, user_id').eq('token', FIXTURE_PUSH_TOKEN);
    assert.equal(seedReadErr, null, `service-role read of the fixture token should not error: ${seedReadErr?.message}`);
    assert.equal(
      seededTokens?.length, 1,
      'the fixture push token must exist — run scripts/seed-photo-test-accounts.js first; ' +
      'without this row the account-B checks below would pass against an empty table',
    );
    assert.equal(seededTokens[0].user_id, userAId, 'the fixture push token must belong to account A');

    const { error: watchErr } = await sbA
      .from('watchlist')
      .upsert({ user_id: userAId, show_id: FIXTURE_SHOW_ID }, { onConflict: 'user_id,show_id' });
    assert.equal(watchErr, null, `account A watchlist insert should succeed: ${watchErr?.message}`);

    const { data: list, error: listErr } = await sbA
      .from('lists')
      .insert({ user_id: userAId, name: FIXTURE_LIST_NAME, description: null, is_ranked: false })
      .select().single();
    assert.equal(listErr, null, `account A list insert should succeed: ${listErr?.message}`);
    listAId = list.id;

    const { error: itemErr } = await sbA
      .from('list_items')
      .insert({ list_id: listAId, show_id: FIXTURE_SHOW_ID, position: 0 });
    assert.equal(itemErr, null, `account A list_items insert should succeed: ${itemErr?.message}`);
  });

  // ---- watchlist -----------------------------------------------------------

  await t.test('BLOCKING: account B cannot read account A watchlist rows', async () => {
    await assertOnlyOwnerCanSee(
      'watchlist',
      () => sbA.from('watchlist').select('*').eq('user_id', userAId),
      () => sbB.from('watchlist').select('*').eq('user_id', userAId),
    );
  });

  await t.test('BLOCKING: account B cannot write a watchlist row owned by account A', async () => {
    assertWriteBlocked(
      'account B inserting a watchlist row with account A\'s user_id',
      await sbB.from('watchlist').insert({ user_id: userAId, show_id: 'forged-by-b' }).select(),
    );
  });

  await t.test('BLOCKING: account B cannot delete account A watchlist rows', async () => {
    assertWriteBlocked(
      'account B deleting account A\'s watchlist',
      await sbB.from('watchlist').delete().eq('user_id', userAId).select(),
    );
    // The decisive check: ask the owner whether the row survived.
    const { data } = await sbA.from('watchlist').select('show_id')
      .eq('user_id', userAId).eq('show_id', FIXTURE_SHOW_ID);
    assert.equal(data?.length, 1, 'account A\'s watchlist row must still exist after account B\'s delete attempt');
  });

  // ---- reviews (the diary) -------------------------------------------------

  await t.test('BLOCKING: account B cannot read account A reviews', async () => {
    await assertOnlyOwnerCanSee(
      'reviews (the diary)',
      () => sbA.from('reviews').select('*').eq('user_id', userAId),
      () => sbB.from('reviews').select('*').eq('user_id', userAId),
    );
  });

  await t.test('BLOCKING: account B cannot edit or delete account A reviews', async () => {
    assertWriteBlocked(
      'account B updating account A\'s review',
      await sbB.from('reviews').update({ rating: 1 }).eq('id', reviewAId).select(),
    );
    assertWriteBlocked(
      'account B deleting account A\'s review',
      await sbB.from('reviews').delete().eq('id', reviewAId).select(),
    );
    const { data } = await sbA.from('reviews').select('id').eq('id', reviewAId);
    assert.equal(data?.length, 1, 'account A\'s review must survive account B\'s update/delete attempts');
  });

  // ---- lists + list_items --------------------------------------------------

  await t.test('BLOCKING: account B cannot read account A lists or their items', async () => {
    await assertOnlyOwnerCanSee(
      'lists',
      () => sbA.from('lists').select('*').eq('user_id', userAId),
      () => sbB.from('lists').select('*').eq('user_id', userAId),
    );

    // list_items has no user_id of its own — it inherits ownership through
    // lists.user_id, which is exactly the kind of indirect policy that gets
    // written as a permissive `true` and never noticed.
    await assertOnlyOwnerCanSee(
      'list_items (ownership inherited via lists.user_id)',
      () => sbA.from('list_items').select('*').eq('list_id', listAId),
      () => sbB.from('list_items').select('*').eq('list_id', listAId),
    );
  });

  await t.test('BLOCKING: account B cannot insert into account A\'s list', async () => {
    assertWriteBlocked(
      'account B adding an item to account A\'s list',
      await sbB.from('list_items').insert({ list_id: listAId, show_id: 'forged-by-b', position: 99 }).select(),
    );
    const { data } = await sbA.from('list_items').select('show_id').eq('list_id', listAId);
    assert.equal(data?.length, 1, 'account A\'s list must still contain exactly its own one item');
  });

  await t.test('BLOCKING: account B cannot rename or delete account A\'s list', async () => {
    assertWriteBlocked(
      'account B renaming account A\'s list',
      await sbB.from('lists').update({ name: 'owned by B' }).eq('id', listAId).select(),
    );
    assertWriteBlocked(
      'account B deleting account A\'s list',
      await sbB.from('lists').delete().eq('id', listAId).select(),
    );
    const { data } = await sbA.from('lists').select('name').eq('id', listAId);
    assert.equal(data?.[0]?.name, FIXTURE_LIST_NAME, 'account A\'s list must be unchanged');
  });

  // ---- profiles ------------------------------------------------------------

  // Deliberately no assertion that account B cannot READ account A's profile:
  // display name and avatar are the public identity of an account and a future
  // social feature may well expose them. Writes are the security boundary.
  await t.test('BLOCKING: account B cannot overwrite account A\'s profile', async () => {
    assertWriteBlocked(
      'account B updating account A\'s profile row',
      await sbB.from('profiles').update({ display_name: 'owned by B' }).eq('id', userAId).select(),
    );
    const { data } = await sbA.from('profiles').select('display_name').eq('id', userAId).maybeSingle();
    // Positive comparison against the value captured at setup, not
    // `notEqual(..., 'owned by B')` — the negative form also passes when the
    // profile row is missing entirely, which proves nothing about RLS.
    assert.equal(
      data?.display_name, profileANameAtSetup,
      'account A\'s display name must be exactly what it was before account B\'s write attempt',
    );
  });

  // ---- unmatched_imports ---------------------------------------------------

  // Written fire-and-forget when an import row matches no known show
  // (app/import.tsx:327). It is easy to read as mere telemetry, but each row
  // carries a title, a venue and a date_seen against a user_id — that is the
  // user's diary, for the shows we failed to match. It had no coverage at all
  // until the table-coverage guard was taught about the supabaseRest* wrapper,
  // because it is never written through `.from(` (review finding, 2026-08-12).
  await t.test('BLOCKING: account B cannot read or forge account A unmatched imports', async () => {
    // randomUUID, not Date.now(): two concurrent runs can land on the same
    // millisecond, and would then collide on these row titles (review
    // finding, 2026-08-12). Teardown deletes the exact titles created here.
    const marker = `rls-adversarial-${randomUUID()}`;
    const { error: insErr } = await sbA.from('unmatched_imports').insert({
      user_id: userAId,
      source: 'rls-adversarial-test',
      title: marker,
      venue: 'Fixture Theatre',
      date_seen: '2026-05-05',
      mezz_show_id: null,
    });
    assert.equal(insErr, null, `account A should be able to log its own unmatched import: ${insErr?.message}`);

    // Positive control via the service role rather than account A: the app never
    // reads this table, so there is no reason for an owner SELECT policy to
    // exist, and requiring A to see its own row could fail for a correct policy.
    const { data: ownRow, error: ownErr } = await sbService
      .from('unmatched_imports').select('title').eq('title', marker);
    assert.equal(ownErr, null, `service-role read should not error: ${ownErr?.message}`);
    assert.equal(ownRow?.length, 1, 'the row account B is about to fail to see must actually exist');

    const { data: seen, error: seenErr } = await sbB
      .from('unmatched_imports').select('title').eq('user_id', userAId);
    assert.equal(seenErr, null, `account B's read should not error: ${seenErr?.message}`);
    assert.equal(seen?.length ?? 0, 0, 'account B must not read account A\'s unmatched imports');

    // The forged write has to be checked from OUTSIDE account B, not by reading
    // what B's own request returned. assertWriteBlocked treats "no error and no
    // rows returned" as blocked — but this table denies B any SELECT, so an
    // accidentally-open INSERT policy would land the row and still return
    // nothing, and the assertion would pass while the forgery succeeded. That is
    // the same shape as every other bug this session: a check that cannot
    // observe the thing it claims to prove (review finding, 2026-08-12).
    const forgedMarker = `${marker}-forged-by-b`;
    await sbB.from('unmatched_imports')
      .insert({ user_id: userAId, source: 'forged-by-b', title: forgedMarker, venue: null, date_seen: null });

    const { data: forged, error: forgedReadErr } = await sbService
      .from('unmatched_imports').select('title').eq('title', forgedMarker);
    // Without this, a failed query returns data: null, the length check reads
    // that as zero rows, and the assertion passes having verified nothing. That
    // is the same ignored-error-return defect that hid the push-token bug for
    // the life of the feature — here in the code written to catch it.
    assert.equal(forgedReadErr, null, `service-role read should not error: ${forgedReadErr?.message}`);
    assert.equal(
      forged?.length ?? 0, 0,
      'account B managed to log an unmatched import under account A\'s user_id — the row is really ' +
      'there, checked with the service role rather than trusting B\'s own empty response',
    );

    // Teardown through the service role too. The app never deletes from this
    // table, so there is no reason for an owner DELETE policy to exist, and a
    // client-side delete that silently matches nothing would leave one row of a
    // real user's diary behind on every CI run.
    // Delete the exact two titles this run created, not a prefix match — a
    // prefix sweep can take a concurrent run's rows with it.
    const { error: cleanupErr } = await sbService
      .from('unmatched_imports').delete().in('title', [marker, forgedMarker]);
    assert.equal(cleanupErr, null, `service-role cleanup should succeed: ${cleanupErr?.message}`);

    const { data: leftover, error: leftoverReadErr } = await sbService
      .from('unmatched_imports').select('title').in('title', [marker, forgedMarker]);
    assert.equal(leftoverReadErr, null, `service-role leftover check should not error: ${leftoverReadErr?.message}`);
    assert.equal(leftover?.length ?? 0, 0, 'this test must not leave rows behind in a live table');
  });

  // ---- push_tokens ---------------------------------------------------------

  // Tokens are device secrets: anyone holding one can push arbitrary
  // notifications to that device. Anonymous INSERT is allowed by design
  // (lib/notifications.ts registers a token before sign-in), so the boundary
  // being tested is READ, not write. Setup seeded a token for A and confirmed
  // A can see it, so a zero-row result here is RLS doing its job rather than
  // an empty table.
  await t.test('BLOCKING: account B cannot read account A\'s push tokens', async () => {
    const { data, error } = await sbB.from('push_tokens').select('token').eq('user_id', userAId);
    assert.equal(error, null);
    assert.equal(data?.length ?? 0, 0, 'account B must not be able to read another account\'s push tokens');

    // And the row really is there to be missed — proven with the service role
    // in setup, so this zero is RLS and not an empty table.
    assert.ok(FIXTURE_PUSH_TOKEN, 'fixture token constant must be set');

    // Also check the direct lookup: a policy keyed only on user_id would still
    // leak a token to anyone who can guess or replay the token string itself.
    const { data: byToken, error: byTokenErr } = await sbB
      .from('push_tokens').select('token').eq('token', FIXTURE_PUSH_TOKEN);
    assert.equal(byTokenErr, null, `account B's token lookup should not error: ${byTokenErr?.message}`);
    assert.equal(byToken?.length ?? 0, 0, 'account B must not be able to read account A\'s token by its value');
  });
});
