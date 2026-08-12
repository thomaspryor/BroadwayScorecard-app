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
-- Recreate the two dropped policies, both reproduced verbatim so the rollback
-- needs no archaeology:
--   "Anon can insert push tokens"  INSERT  {anon, authenticated}
--     with check (char_length(token) >= 8 and char_length(token) <= 4096
--                 and platform = any (array['ios','android','web']))
--   "Users can update their own tokens"  UPDATE  PUBLIC
--     using ((auth.uid() = user_id) or (user_id is null))   -- no with-check
--
-- AFTER APPLYING
-- Restore tests/security/push-token-owner-write.test.mjs from branch
-- worktree-verify-push-token-policy. Its cross-account assertion is currently
-- expected to FAIL, which is why it is parked rather than on main.

-- DEVICE REASSIGNMENT (added after the second adversarial review)
-- The UPDATE policy must let whoever currently holds a device claim its token,
-- or a real and ordinary case breaks: sign out, hand the phone over, someone
-- else signs in. The token is unchanged, the owner is not. Under a
-- `using (user_id = auth.uid())` policy that update silently matches zero rows
-- and the new user never receives a notification — the same silent failure
-- this whole exercise started with.
--
-- So UPDATE uses `using (true)`: naming a row requires knowing the exact token
-- string, which is a device secret held only by the device. WITH CHECK still
-- pins the resulting owner to the caller, so a token can only ever be claimed
-- TO yourself, never assigned to somebody else. Worst case for a leaked token
-- is that the leaker redirects that device's notifications to their own
-- account — a nuisance against a device they do not hold, not a way to read
-- anyone's traffic.

alter table public.push_tokens enable row level security;

drop policy if exists "Anon can insert push tokens" on public.push_tokens;
drop policy if exists "push_tokens_owner_insert" on public.push_tokens;
drop policy if exists "push_tokens_owner_update" on public.push_tokens;
drop policy if exists "Users can update their own tokens" on public.push_tokens;

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

create policy "push_tokens_claim_update"
  on public.push_tokens
  for update
  to authenticated, anon
  using (true)
  with check (user_id is null or user_id = (select auth.uid()));
