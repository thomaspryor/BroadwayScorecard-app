# Testing strategy — Broadway Scorecard iOS app

Written 2026-08-11 after an audit found the test suite was in better shape than
the automation around it. The tests existed; almost nothing ran them.

## The three layers, and what each one is for

**1. Pure-logic unit tests** — `tests/unit/*.test.mjs`, `scripts/**/*.test.mjs`.
Node's built-in test runner against the real `.ts` modules via
`--experimental-strip-types` plus `tests/register-alias.mjs` (which teaches Node
the `@/` path alias). No renderer, no simulator, ~1.5s for the whole suite.
This is where date math, the poster grid, the import matcher, advanced filters,
the ship/OTA gates and the beta-feedback autopilot's decision logic live.

**2. Adversarial RLS tests** — `tests/security/*.test.mjs`. Two REAL fixture
accounts signed in with the anon key, one attacking the other's rows. Covers
`user_review_photos` + the diary-photos storage bucket, and `watchlist`,
`reviews`, `lists`, `list_items`, `profiles`, `push_tokens`.
**This is the only layer that can catch a bad RLS policy.** Every other layer
runs as a single signed-in user, where a client-side `.eq('user_id', me)`
filter makes a wide-open table look perfectly correct. Never use the service
role key here — it bypasses RLS and makes every assertion vacuous.

**3. Maestro E2E** — `.maestro/**/*.yaml`, 27 flows over a Release build on a
real simulator. Tab navigation, show rating save/edit/delete, watchlist,
diary sort/view/delete, stats, and the Mezzanine import. Gotchas (document
picker, regex-vs-substring selectors, `__DEV__` being false in CI) are in
`.maestro/README.md` — read it before writing a flow.

## What runs when

| Trigger | What runs | Where |
|---|---|---|
| Push / PR to main | typecheck, ESLint, font floor, `expo export`, unit tests, RLS tests | `ci.yml` |
| Nightly 05:40 UTC | all 27 Maestro flows on a simulator | `maestro-e2e.yml` |
| Ship (dispatch or 6-hourly) | photo RLS gate, unit tests, font floor, drift gate | `eas-build.yml` |
| Commit | gitleaks secret scan only | `scripts/hooks/pre-commit` |

Nightly macOS E2E is free: this repository is public, and public repos get
unmetered Actions minutes even at the 10x macOS multiplier.

## Commands

```
npm test              # everything (~2s)
npm run test:unit     # logic only, no network
npm run test:security # adversarial RLS (skips locally, needs fixture secrets)
npm run typecheck
npm run lint && npm run lint:design
npx expo export --platform ios
```

## Rules learned the hard way

- **Never enumerate test files in a workflow.** `eas-build.yml` used to list
  each test as its own step. Four committed test files (`themes`,
  `stats-aisle-mates`, `stats-scope-default`, `watchlist-slot`) had therefore
  never run anywhere: adding the file and adding the CI step are two separate
  acts and only the first is obvious. Everything now goes through a glob.
- **A schedule-only job is not a gate.** Tests that lived only in
  `eas-build.yml`'s `gate` job were skipped on `workflow_dispatch`, which is
  how beta-feedback batches actually ship. Gates belong in a job that runs on
  every trigger.
- **A skipping security test must fail closed in CI.** Both RLS suites skip
  when their fixture secrets are absent so local `npm test` works, and
  `process.exit(1)` when `CI=true` and a secret is missing — otherwise renaming
  a GitHub secret silently disarms the gate and it still reads green.
- **`inputs.*` is empty on a `schedule` trigger.** `maestro-e2e.yml` resolves
  `SUITE: ${{ inputs.suite || 'all' }}` once at job level; without that, every
  suite conditional evaluates false on the nightly run and it executes zero
  flows while reporting success.

## What the RLS suite has already caught

**Push tokens never reach the server for signed-in users** (2026-08-12, CI run
31566167644). The adversarial test tried to insert a push token as an ordinary
authenticated user — exactly what `lib/notifications.ts`
`savePushTokenToServer()` does — and Postgres rejected it with `42501 new row
violates row-level security policy for table "push_tokens"`.

It had gone unnoticed because supabase-js **resolves** with an `{ error }`
object rather than throwing, so the surrounding `try/catch` never fired and the
`__DEV__` warning never printed. The token cached locally, the app looked
healthy, and the row simply never arrived. Push is the owner's channel for
new-score alerts, so this was a live delivery gap.

`push_tokens` also returns zero rows on SELECT even for the row's owner. That
half is correct and deliberate — the app only writes this table, the server
reads it, and a token is a device secret — so the migration below fixes only
the INSERT/UPDATE half. Widening reads to make an owner-visibility check pass
would have been fixing the test by loosening the thing under test. The suite
verifies the fixture row through the service role instead, which is fixture
setup rather than a security claim.

Status: **half fixed, and the second half is not yet understood.**

The silent swallow is fixed. The policy is NOT: migration 20260812013000 was
applied on 2026-08-12 (run 31601639316) and the write it was meant to unblock
still returns 42501.

What the RLS inspector (`scripts/inspect-rls.js`, run 31602235291) rules out:
the new policy IS present, PERMISSIVE, scoped to `{anon, authenticated}`, with
check `(user_id IS NULL) OR (user_id = auth.uid())`; there are no RESTRICTIVE
policies; and `authenticated` holds the INSERT grant. A pre-existing permissive
policy `Anon can insert push tokens` should also have allowed the row on its
own, since permissive policies OR together — which means the original diagnosis
("no policy permits this") was incomplete, not just the fix.

Leading hypothesis, untested: supabase-js `.upsert(..., { onConflict })` issues
`INSERT ... ON CONFLICT DO UPDATE`, which pulls the UPDATE policies and a read
of the conflicting row into the check. `push_tokens` has no SELECT policy for
ordinary users — only `service_role` — so the conflict path may be unable to
see the row it would update. `scripts/diagnose-push-token-insert.js`
(workflow `diagnose-push-token.yml`) tries plain INSERT vs UPSERT side by side
to settle it.

**Resolved.** `tests/security/push-token-registration.test.mjs` is on main and
green. It covers first launch AND relaunch, because a first-launch-only test
would have passed against the broken update-then-insert attempt. The one
assertion still held back is the cross-account attach, which currently fails
for real — see the open security finding above; it goes in with the migration.

The applied migration is being left in place: it is purely additive, and the
account-data suite's BLOCKING assertions all still pass, so it demonstrably
widened nothing. Rolling it back would restore the same broken behaviour.

Superseded status line (kept so the earlier claim is not silently rewritten):
~~fixed and verified~~ The silent swallow is fixed (the error is now
inspected and reported to Sentry), and the policy half was applied to production
on 2026-08-12 with owner approval —
`supabase/migrations/20260812013000_push_tokens_owner_insert.sql`, via
`.github/workflows/apply-migration.yml` run 31601639316.

`tests/security/push-token-owner-write.test.mjs` now pins the policy from both
sides on every push: a signed-in user CAN register their own device (the bug),
and cannot write to another account, read anyone's tokens, or modify a row they
do not own (the thing that must not have been opened while fixing it). Testing
only the first half would pass against `with check (true)`, which is the obvious
wrong fix; testing only the second half is what the suite did while the bug was
live.

The general lesson: **a Supabase write whose return value is ignored is not a
write.** Grep for `.from(...).insert/update/upsert/delete` without an `error`
check before assuming any table is receiving data.

## Open security finding: cross-account push token attach

**Any signed-in user can register a push token onto someone else's account.**
Measured, not inferred (`scripts/diagnose-push-token-insert.js`, run
31602907198): signed in as fixture A, inserting a row with `user_id` set to
fixture B SUCCEEDED. The attacker's device then receives the victim's
notifications.

Cause: the pre-existing `Anon can insert push tokens` policy validates the
token's length and platform but never its owner, and permissive policies OR
together — so it admits any well-formed row regardless of `user_id`. Adding the
owner-scoped policy in 20260812013000 could never have closed this; an extra
permissive policy only widens. The open policy has to be dropped and replaced.

**CLOSED 2026-08-12.**
`supabase/migrations/20260812094500_push_tokens_close_cross_account_attach.sql`
applied with owner approval (run 31623215228) and verified by measurement
immediately afterwards (run 31623332784): the cross-account attach now returns
42501, while own-device, anonymous, first-launch and relaunch registration all
still succeed. Because the migration DROPS policies, the three
must-still-work paths were checked, not just the one that had to start failing.
`tests/security/push-token-registration.test.mjs` now asserts both the attach
and the owner-reassignment cases on every push.

The lesson worth keeping: **adding a permissive policy can never restrict
anything.** The first migration was written on the assumption that the write
was blocked and needed permitting. The write was never blocked — it was too
permissive all along, in the opposite direction from the one assumed.

## Resolved: the two 2026-08-12 flow fixes (checked 2026-08-12, dispatch 31646873154)

**Both original diagnoses were correct — each fix closed the exact bug it
named — but each flow still fails one step later, on a different, newly-
exposed issue.** Measured by dispatching the `my-shows` suite on main, not
inferred. The 2026-08-13 05:40 UTC nightly hadn't fired yet when this was
checked, so this dispatch stood in for it.

- `.maestro/my-shows/diary-photo-feed.yaml`: confirmed the `/watched` repoint
  works — `openLink: broadwayscorecard:///watched` and
  `tapOn: id: "diary-list-view-toggle"` both now complete (they used to fail
  immediately). It then fails on `assertVisible: "Only you"`. That pill is
  gated on `app/(tabs)/watched.tsx`'s `viewMode === 'list'` (line ~897), and
  `diary-list-view-toggle`'s `onPress` does call `setViewMode('list')` — but
  `viewMode` also loads a *persisted* preference from AsyncStorage in a
  separate effect (line ~235), which can race the tap and land after it,
  reverting the mode. Plausible trigger: an earlier flow in the same suite run
  left a different mode (`grid`/`stats`) persisted. Not fixed — needs a
  simulator to watch the actual timing, not a guess.
- `.maestro/my-shows/stats-capture.yaml`: confirmed the "return to top before
  searching down" fix works — `scrollUntilVisible` UP to `stats-scope-pill`
  now completes (it used to never even attempt this). The subsequent DOWN
  search for `stats-house-grid` still times out (30s), even from the same top
  position that `stats-tab.yaml` searches DOWN from successfully. Difference:
  this flow scrolls through the whole screen taking 12 screenshots first,
  `stats-tab.yaml` doesn't. Possibly a virtualization/remount side effect of
  that scroll sequence, possibly the UP scroll not actually reaching the same
  position `stats-tab.yaml` starts from. Not fixed — same reasoning as
  `mezzanine-import.yaml` below: a guess without a simulator in front of me is
  a coin flip, and this is a screenshot-capture rig, not a screen a user
  hits.

Still failing, not attempted: `.maestro/import/mezzanine-import.yaml`
(`"Downloads" is visible` assertion). It also failed on 2026-07-25, so it is
long-standing rather than new. It drives a real Safari download through the iOS
document picker and the README documents how fragile that is; guessing at a fix
without a simulator in front of me would be a coin flip.

## Screen coverage map (audited 2026-08-12)

Which screens an E2E flow actually opens, from `grep -rh openLink .maestro`:

| Screen | E2E flows | Notes |
|---|---|---|
| `my-shows` (diary, watchlist, stats) | 10 | the best-covered area by far |
| `(tabs)/watched` | 3 | |
| `(tabs)/browse` + inline search | 3 | reaches the results list only |
| `(tabs)/index` (home) | 1 | smoke test |
| `import` | 2 | one of them long-broken |
| `show/[slug]` | 1 (added 2026-08-12) | `.maestro/show/show-detail.yaml` — search tap-through + render check |
| `rate/[showId]` | 1 (added 2026-08-12) | `.maestro/rate/rate-lifecycle.yaml` — real create/edit/delete, not the fixture |
| `settings` | 1 (added 2026-08-12) | `.maestro/settings/delete-account-guard.yaml` — confirmation copy + Cancel path only |
| `diary-show/[id]` | **0** | |
| `(tabs)/lists` | **0** | |
| `(tabs)/to-watch` | **0** | |

**Closed 2026-08-12** (pending green CI confirmation — see "Active work" below):
`show/[slug]`, `settings`, and `rate/[showId]` each went from zero E2E coverage
to one flow apiece. Full account: `memory/handoff-show-page-e2e.md`.

Second: the 6 existing show-rating flows still test a FIXTURE route, not the
production rating screen — `test/show-rating-fixture.tsx` exercises the rating
UI in isolation with local state, no backend. `rate-lifecycle.yaml` (new,
2026-08-12) is what actually drives `rate/[showId]` against real Supabase.

Structural reason the gap existed, and why it wasn't a quick fix: `show/[slug].tsx`,
`rate/[showId].tsx` and `settings.tsx` had **zero** `testID` attributes before
2026-08-12 — they were never built to be driven by a test. One `testID` was
added to `components/ShowCard.tsx` (E2E-only, no visual effect) to make the
first search result tappable by a flow; `settings.tsx` needed none (its rows
are plain, unambiguous text). Score badges were not touched.

What IS well covered, so the gap is narrower than the table alone suggests:
- every user-data table has adversarial two-account isolation coverage
- the data layer is unit-tested: date math, poster grid, import matcher,
  advanced filters, stats, watchlist slots, show matching
- `expo export` proves the whole graph resolves on every push, so an import
  error on the show page is still caught, just not a rendering or data bug

## Active work (2026-08-12): show/[slug], settings, rate/[showId]

`memory/handoff-show-page-e2e.md` — the brief for closing the show-page
coverage gap above, now closed (see that file for the final status). Three
new flows: `.maestro/show/show-detail.yaml`, `.maestro/settings/delete-account-guard.yaml`,
`.maestro/rate/rate-lifecycle.yaml`.

**RECHECK-AFTER: 2026-08-13** — the corrected flows (after the fail-proof
exercise below) were dispatched for green confirmation and hadn't resolved
before this session ended. Check `gh run list --workflow=maestro-e2e.yml` for
runs on branch `worktree-show-page-e2e` around 2026-08-12 23:55 UTC, or the
2026-08-13 nightly if the branch was already merged by then.

**Every flow was proven able to fail before being trusted** (the repo's
stated principle — a test that has only ever passed is untested): each
flow's key selector was deliberately pointed at something nonexistent,
dispatched, and confirmed it failed at exactly that step with every real
prior step still passing. That surfaced one genuine bug the plant wasn't
aimed at: `rate-lifecycle.yaml` failed a step *earlier* than intended — its
`extendedWaitUntil` for `"MY RATING & REVIEW"` (15s) timed out on a loaded CI
runner before ever reaching the deliberately-broken star tap. Widened to 20s
in both `rate-lifecycle.yaml` and `show-detail.yaml` (which had the identical
assertion with no explicit wait at all — worse, not better).

An independent codex review (reading the actual component source, not just
the diff) caught two more real bugs before any of this shipped: a
copy-pasted "tap the field label" trick that doesn't actually focus the real
notes `TextInput` (its `accessibilityLabel` doesn't match the label text on
this screen, only on the unrelated fixture screen it was copied from), and an
assertion racing an async Supabase re-fetch on entering edit mode. Both fixed
before the corrected-flow dispatch above.

`rate-lifecycle.yaml` does real Supabase writes against the shared dev-test
CI account (creates a Hamilton rating, then deletes it) — self-cleaning by
design, with a CI-level backstop delete (`maestro-e2e.yml`, scoped to
`review_text`, deliberately not `date_seen` — a UTC-vs-device-local-time
mismatch would make a date filter miss the exact row it exists to catch).
`delete-account-guard.yaml` never completes a real account deletion — it only
confirms the warning dialog appears with the right copy and that Cancel
leaves the account untouched.

## Known gaps

- No React component/render tests. Deliberate: Maestro covers the same ground
  against a real build, and RN component tests are high-maintenance for the
  regressions they catch. Revisit if a pure-render bug ever ships.
- Auth flows themselves (Apple/Google sign-in, sign-up, account deletion) are
  not E2E-tested — they need real provider credentials on the simulator. The
  RLS suite covers what happens to the *data* once signed in, which is the part
  that can leak.
- ESLint sits at 5 warnings with `--max-warnings=5`, so the count can shrink but
  never grow. All five are `react-hooks/exhaustive-deps`; editing a dependency
  array changes runtime behaviour (render loops, stale closures), so they need
  individual analysis rather than a sweep. Lower the cap as they are cleared.
- `tests/unit/every-user-table-has-a-security-test.test.mjs` fails if the app
  starts using a Supabase table that no adversarial test covers. It cannot check
  that the coverage is GOOD — a weak test still satisfies it — only that the
  omission is loud. That omission is what let the push-token hole exist.
