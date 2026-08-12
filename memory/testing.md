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

## Known gaps

- No React component/render tests. Deliberate: Maestro covers the same ground
  against a real build, and RN component tests are high-maintenance for the
  regressions they catch. Revisit if a pure-render bug ever ships.
- Auth flows themselves (Apple/Google sign-in, sign-up, account deletion) are
  not E2E-tested — they need real provider credentials on the simulator. The
  RLS suite covers what happens to the *data* once signed in, which is the part
  that can leak.
- ESLint runs with 38 pre-existing warnings and no `--max-warnings` ceiling.
  Adding one now would fail CI on day one; clean the warnings first, then cap.
