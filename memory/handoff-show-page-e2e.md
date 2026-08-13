# Handoff: end-to-end coverage for the show page (and then rating, settings)

Written 2026-08-12 at the end of the session that built this repo's test
automation. Read `memory/testing.md` first — it has the full strategy, the
screen-coverage map, and the reasoning behind every rule below.

## The task

`app/show/[slug].tsx` — the screen the app exists for, with the scores, the
critic reviews and the ticket links — is opened by **zero** end-to-end flows. A
change that broke how a show displays its score would pass every check in this
repo.

Close that, in this order:

1. **`show/[slug]`** — highest value. Every user sees it; a silent regression
   there hits everyone.
2. **`settings`** — second, because account deletion going wrong is the
   costliest failure mode in the app.
3. **`rate/[showId]`** — the six existing "show-rating" flows drive
   `app/test/show-rating-fixture.tsx`, a fixture route, not the production
   screen. Useful in isolation, but the real screen is never exercised.

Lower priority, no coverage either: `diary-show/[id]`, `(tabs)/lists`,
`(tabs)/to-watch`.

## Why it is not a one-liner

`show/[slug].tsx`, `rate/[showId].tsx` and `settings.tsx` contain **zero**
`testID` attributes (verified by grep, 2026-08-12). They were never built to be
driven by a test, so this means editing product screens first, then writing
flows, then a nightly cycle to verify each one.

Two constraints on those edits, both from `CLAUDE.md`:
- **Score badges are sacred** — never change their size, position or shape. A
  `testID` is invisible and safe; a wrapper `<View>` that shifts layout is not.
- These are JavaScript changes, so they ship **over the air**. Batch them and
  ship once at the end, not per commit.

## How to verify, and the trap in it

**You cannot verify a Maestro flow locally without a ~45 minute simulator
build** (prebuild + pod install + Release xcodebuild). Do not claim a flow works
because you read it.

- The nightly runs the full suite at 05:40 UTC: `.github/workflows/maestro-e2e.yml`
- To check one suite sooner: `gh workflow run maestro-e2e.yml --ref main -f suite=tabs`
  (suites: `all`, `show-rating`, `my-shows`, `tabs`, `import`). It takes ~45-60
  min because of the xcodebuild step.
- Anything you cannot verify before the session ends goes into
  `memory/testing.md` with a `RECHECK-AFTER: YYYY-MM-DD` stamp. There are
  already two such items from 2026-08-12 — check whether the nightly settled
  them before adding more.

**Read `.maestro/README.md` before writing a flow.** It documents traps that
have each cost a real debugging cycle: `assertVisible` needs a FULL regex match
not a substring, `__DEV__` is false in the CI Release build, the document picker
only sees a genuine Safari download, and `.maestro/*.yaml` at the root is
excluded from the `all` glob.

## The principle this session was built on

**A test that has only ever passed is an untested test.** For an isolation or
visibility check the passing state and the broken state look identical — "saw
nothing" is both the success and the symptom of a query or selector pointed at
the wrong thing.

So for every flow you add, prove it can fail before trusting it. The cheapest
version: point the selector at something that does not exist, confirm the flow
fails, then fix it. Every guard in `tests/unit/` was verified this way, and the
one that was not (`every-user-table-has-a-security-test`) turned out to be
passing while two real tables went uncovered.

Live examples of the same class from 2026-08-12, all found by measurement rather
than reading:
- push notifications never registered for signed-in users, silently, for the
  life of the feature — supabase-js resolves with an `{ error }` object rather
  than throwing, so the app's try/catch never fired
- an isolation test that asserted "account B sees zero rows" against a table
  that was simply empty
- a coverage guard whose own comment overstated what it checked

## Ground rules for this repo

- **Main branch only**, no PRs. But work in a worktree (`EnterWorktree`) and
  merge to main at the end — parallel sessions share this checkout.
- Before every commit touching `app/`, `components/`, `lib/`: `npm run typecheck`,
  `npm run lint`, `npm run lint:design`, `npm test`, `npx expo export --platform ios`.
  CI enforces all of these on push (`.github/workflows/ci.yml`).
- `npm run lint` is capped at `--max-warnings=5`. It can shrink, never grow.
- There is **no Notion tooling in this repo** (`scripts/notion-brain.js` and
  `bsc-next.js` do not exist here — they are the web project's).
  `memory/testing.md` is the roadmap. Update it.
- The owner is **non-technical**. Never end a session by handing them a
  technical chore, and explain findings in plain language. See
  `~/.claude/projects/-Users-tompryor-BroadwayScorecard-app/memory/next-steps-must-be-mine.md`.
- Do not ask the owner to approve anything on a diagnosis you have not
  **measured**. That mistake was made on 2026-08-12 and cost a production
  database change that fixed nothing. See `measure-before-asking-approval.md`.

## Closed 2026-08-13

All three screens now have a flow, all confirmed green and merged to main:
`.maestro/show/show-detail.yaml` (run 31660022949), `.maestro/settings/delete-account-guard.yaml`
(run 31652603999), `.maestro/rate/rate-lifecycle.yaml` (run 31669727699). Each
was proven able to fail (deliberate broken selector, dispatched, confirmed
red at the right step) before being trusted. Getting all three green took
~4 hours and about a dozen CI dispatch rounds — full account, including 8
distinct real bugs found along the way, is in `memory/testing.md`'s "Closed
2026-08-12/13" section. Two are worth flagging specifically:

- **Unresolved app bug**: scrolling on `app/show/[slug].tsx` right after
  navigating there can trigger a return to the previous screen — looks like
  Maestro's scroll gesture being read as iOS's swipe-to-go-back on this
  pushed stack screen. Confirmed with two independent CI screenshots, not
  guessed. Both new flows were rewritten to route around it (show-detail.yaml
  stops before the scroll; rate-lifecycle.yaml deep-links past the show page
  entirely) rather than fix it blind. Worth a look with a real simulator —
  and worth checking whether other pushed-stack screens in the app have the
  same issue, not just this one.
- The dev-test CI account has a real, pre-existing 5-star Hamilton rating
  from before this work, unrelated to anything this session did. Any future
  flow touching Hamilton's rating should assume that and not depend on a
  particular starting state.

## Other state as of 2026-08-12

- 198 tests pass, 0 fail. `npm test` runs everything.
- The two Maestro flow fixes from earlier on 2026-08-12 (`diary-photo-feed.yaml`,
  `stats-capture.yaml`) were checked against a live dispatch, not the nightly
  (hadn't fired yet). Both original diagnoses were correct, but each flow
  still fails one step later on a different, newly-exposed issue — not fixed,
  see `memory/testing.md`'s "Resolved: the two 2026-08-12 flow fixes" section
  for what's known.
- `.maestro/import/mezzanine-import.yaml` has failed since 2026-07-25. It drives
  a real Safari download through the iOS document picker. Left alone
  deliberately — do not guess at it without a simulator in front of you.
