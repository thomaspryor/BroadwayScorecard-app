// BLOCKING security test (task #571) — proves the diary-photos RLS actually
// enforces owner-only access, not just "the client always filters by user_id."
// Uses two REAL fixture accounts (scripts/seed-photo-test-accounts.js) signed
// in with the anon key, exactly as the app does — no service-role shortcuts.
//
// Run: node --test tests/security/photo-rls-adversarial.test.mjs
// Requires: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY env vars.
// Skips (not fails) if fixture accounts aren't seeded yet — CI seeds them
// first via seed-photo-test-accounts.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const ACCOUNT_A = {
  email: 'fixture-photo-a@broadwayscorecard.com',
  password: process.env.FIXTURE_PHOTO_A_PASSWORD || 'BwayPhotoFixtureA2026!',
};
const ACCOUNT_B = {
  email: 'fixture-photo-b@broadwayscorecard.com',
  password: process.env.FIXTURE_PHOTO_B_PASSWORD || 'BwayPhotoFixtureB2026!',
};

// A minimal 1x1 JPEG so the test doesn't depend on any asset file.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

let sbA, sbB, userAId, userBId, reviewAId;
let uploadedPathA = null;

async function signIn(client, account) {
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return data.user.id;
}

test('two-account photo RLS adversarial test', async (t) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    t.skip('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set — skipping live RLS test');
    return;
  }

  sbA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  sbB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  await t.test('setup: sign in as both fixture accounts', async () => {
    userAId = await signIn(sbA, ACCOUNT_A);
    userBId = await signIn(sbB, ACCOUNT_B);
    assert.notEqual(userAId, userBId, 'fixture accounts must be distinct users');

    const { data: reviews, error } = await sbA
      .from('reviews')
      .select('id')
      .eq('user_id', userAId)
      .limit(1);
    assert.equal(error, null, 'fetching account A review should not error');
    assert.ok(reviews?.length, 'account A must have a seeded review — run scripts/seed-photo-test-accounts.js first');
    reviewAId = reviews[0].id;
  });

  await t.test('account A can upload + row-insert its own photo', async () => {
    const photoId = 'adversarial-test-photo';
    uploadedPathA = `${userAId}/${reviewAId}/${photoId}.jpg`;
    const bytes = Buffer.from(TINY_JPEG_BASE64, 'base64');

    const { error: uploadErr } = await sbA.storage
      .from('diary-photos')
      .upload(uploadedPathA, bytes, { contentType: 'image/jpeg', upsert: true });
    assert.equal(uploadErr, null, `account A upload to its own path should succeed: ${uploadErr?.message}`);

    const { error: insertErr } = await sbA.from('user_review_photos').upsert({
      id: '00000000-0000-4000-8000-000000000001',
      review_id: reviewAId,
      user_id: userAId,
      storage_path: uploadedPathA,
      width: 1,
      height: 1,
    });
    assert.equal(insertErr, null, `account A metadata insert should succeed: ${insertErr?.message}`);
  });

  await t.test('BLOCKING: account B cannot download account A photo from storage', async () => {
    const { data, error } = await sbB.storage.from('diary-photos').download(uploadedPathA);
    assert.ok(error || !data, 'account B downloading account A\'s photo path must be rejected by storage RLS');
  });

  await t.test('BLOCKING: account B cannot list/select account A photo rows', async () => {
    const { data, error } = await sbB
      .from('user_review_photos')
      .select('*')
      .eq('review_id', reviewAId);
    // RLS makes this an empty result, not a thrown error (PostgREST filters rows, doesn't 403).
    assert.equal(error, null);
    assert.equal(data?.length ?? 0, 0, 'account B must see zero rows for account A\'s review — RLS leak otherwise');
  });

  await t.test('BLOCKING: account B cannot upload into account A\'s storage folder', async () => {
    const forgedPath = `${userAId}/${reviewAId}/forged-by-b.jpg`;
    const bytes = Buffer.from(TINY_JPEG_BASE64, 'base64');
    const { error } = await sbB.storage.from('diary-photos').upload(forgedPath, bytes, { contentType: 'image/jpeg' });
    assert.ok(error, 'account B must be rejected when uploading under account A\'s user-id folder');
  });

  await t.test('BLOCKING: account B cannot insert a metadata row claiming account A\'s photo path', async () => {
    const { error } = await sbB.from('user_review_photos').insert({
      review_id: reviewAId,
      user_id: userBId, // even with B's own user_id, storage_path points into A's folder
      storage_path: uploadedPathA,
      width: 1,
      height: 1,
    });
    assert.ok(error, 'account B inserting a row that points at account A\'s storage path must fail');
  });

  await t.test('cleanup: account A removes its test photo', async () => {
    try {
      await sbA.from('user_review_photos').delete().eq('id', '00000000-0000-4000-8000-000000000001');
      if (uploadedPathA) await sbA.storage.from('diary-photos').remove([uploadedPathA]);
    } catch {
      // Best-effort cleanup — a failure here doesn't invalidate the security assertions above.
    }
  });
});
