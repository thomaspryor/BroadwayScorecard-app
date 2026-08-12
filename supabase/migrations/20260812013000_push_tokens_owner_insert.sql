-- NOT YET APPLIED — awaiting owner approval to change production RLS.
-- Nothing in this repository applies migrations automatically (verified
-- 2026-08-12: no workflow or script runs `supabase db push`), so committing
-- this file changes nothing until someone runs it deliberately.
--
-- PROBLEM
-- A signed-in user cannot save their push notification token. Postgres rejects
-- the insert with:
--
--   42501  new row violates row-level security policy for table "push_tokens"
--
-- Proven 2026-08-12 in CI (run 31566167644) by an ordinary authenticated
-- session using the anon key — the same credentials the app uses — inserting a
-- row whose user_id is its own.
--
-- WHY IT WENT UNNOTICED
-- lib/notifications.ts:170 `savePushTokenToServer()` performs exactly this
-- upsert and never inspects the returned error. supabase-js RESOLVES with an
-- `{ error }` object rather than throwing, so the surrounding try/catch never
-- fires and even the __DEV__ warning never prints. The failure is completely
-- silent: the token is cached locally, the app looks fine, and the row simply
-- never arrives. Push notifications are the owner's channel for telling users
-- about new scores, so this is a real delivery gap for signed-in users.
--
-- THE FIX
-- Let a user write only their OWN token row, and keep the anonymous
-- pre-sign-in registration path working (user_id IS NULL), which the app also
-- relies on — a token is registered before the user has an account.
--
-- Deliberately NOT granting SELECT to authenticated users beyond their own
-- rows: a push token is a device secret, and anyone holding one can send
-- arbitrary notifications to that device. The adversarial test in
-- tests/security/account-data-rls-adversarial.test.mjs asserts account B can
-- read neither account A's tokens by user_id nor by token value, and that
-- assertion must keep passing after this migration.

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_owner_insert" on public.push_tokens;
create policy "push_tokens_owner_insert"
  on public.push_tokens
  for insert
  to authenticated, anon
  with check (
    user_id is null
    or user_id = (select auth.uid())
  );

drop policy if exists "push_tokens_owner_update" on public.push_tokens;
create policy "push_tokens_owner_update"
  on public.push_tokens
  for update
  to authenticated, anon
  -- `onConflict: 'token'` makes the app's upsert an UPDATE whenever the device
  -- re-registers an existing token, including the case where an anonymous row
  -- is being claimed by a user who has just signed in.
  using (user_id is null or user_id = (select auth.uid()))
  with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "push_tokens_owner_select" on public.push_tokens;
create policy "push_tokens_owner_select"
  on public.push_tokens
  for select
  to authenticated
  using (user_id = (select auth.uid()));
