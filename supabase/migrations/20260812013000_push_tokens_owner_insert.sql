-- APPLIED 2026-08-12 to production (project tcbkoevwfemkicrwpypb) via
-- .github/workflows/apply-migration.yml, run 31601639316, after owner approval.
-- Verified afterwards by tests/security/push-token-owner-write.test.mjs, which
-- asserts both halves: a user CAN register their own device, and cannot touch
-- or read anyone else's. Nothing applies migrations automatically, so this file
-- is a record, not an instruction.
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

-- NO select policy, deliberately. The table is currently unreadable by clients
-- in both directions, and only the INSERT half is a bug: the app writes push
-- tokens and the server reads them, so a client never needs SELECT. Opening
-- reads to make an owner-visibility check pass would widen a table holding
-- device secrets in order to satisfy a test — the inversion of the point. The
-- adversarial test verifies the fixture row through the service role instead.
