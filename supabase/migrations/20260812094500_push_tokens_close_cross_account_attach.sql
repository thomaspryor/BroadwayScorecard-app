-- NOT APPLIED — needs owner approval. This one DROPS a policy, so unlike
-- 20260812013000 (purely additive) it can change behaviour for real users.
--
-- THE HOLE
-- Any signed-in user can register a push token onto SOMEBODY ELSE'S account.
-- Measured, not inferred (scripts/diagnose-push-token-insert.js, run
-- 31602907198): signed in as fixture account A, inserting a row with
-- `user_id` set to account B SUCCEEDED.
--
-- Consequence: an attacker attaches their own device token to a victim's
-- user_id and receives every push notification that victim is sent.
--
-- WHY
-- The pre-existing policy validates the token's shape but never its owner:
--
--   "Anon can insert push tokens"  INSERT  PERMISSIVE  {anon, authenticated}
--     with check (char_length(token) between 8 and 4096
--                 and platform in ('ios','android','web'))
--
-- Permissive policies OR together, so this one alone admits any row whose
-- token looks well-formed, regardless of user_id. Adding the owner-scoped
-- policy in 20260812013000 could never have closed this — an extra permissive
-- policy only ever widens. The open policy has to go.
--
-- THE FIX
-- Replace it with one policy that keeps the shape validation AND pins the
-- owner. Anonymous pre-sign-in registration (user_id IS NULL) still works,
-- which the app relies on: lib/notifications.ts registers a token before the
-- user has an account.
--
-- ROLLBACK
-- Recreate "Anon can insert push tokens" with the with-check clause quoted
-- above. It is reproduced here verbatim so the rollback needs no archaeology.
--
-- AFTER APPLYING
-- Restore tests/security/push-token-owner-write.test.mjs from branch
-- worktree-verify-push-token-policy. Its cross-account assertion is currently
-- expected to FAIL, which is why it is parked rather than on main.

alter table public.push_tokens enable row level security;

drop policy if exists "Anon can insert push tokens" on public.push_tokens;
drop policy if exists "push_tokens_owner_insert" on public.push_tokens;

create policy "push_tokens_owner_insert"
  on public.push_tokens
  for insert
  to authenticated, anon
  with check (
    -- Shape checks preserved verbatim from the policy this replaces.
    char_length(token) >= 8
    and char_length(token) <= 4096
    and platform = any (array['ios'::text, 'android'::text, 'web'::text])
    -- And the owner pin that was missing.
    and (user_id is null or user_id = (select auth.uid()))
  );
