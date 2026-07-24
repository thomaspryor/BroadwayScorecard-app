# Maestro E2E flows

Run via `.github/workflows/maestro-e2e.yml` (`workflow_dispatch`, suites: `all` / `show-rating` / `my-shows` / `tabs`).

## Gotchas

- **`assertVisible`/`assertNotVisible` text selectors require a full regex match, not a substring match.** A selector like `"TEST FIXTURE"` will NOT match a label whose full text is `"TEST FIXTURE — state: empty"` — the check fails even though the text is genuinely on screen. Either assert the exact full text, or add a wildcard: `"TEST FIXTURE.*"`. Discovered the hard way in task #432 (`ci-canary-show-rating-fixture.yaml`), where the bare-substring selector failed on 100% of runs, including healthy ones — confirmed via the CI screen-hierarchy debug dump showing the text present with valid bounds.
- **`.maestro/` root-level files are excluded from the `.maestro/**/*.yaml` glob** the `all` suite uses (`Run Maestro tests` step in `maestro-e2e.yml`) — GitHub Actions' default bash has no `shopt -s globstar`, so `**` requires at least one directory segment between `.maestro/` and the filename. `ci-skip-onboarding.yaml`, `ci-connect-metro.yaml`, and `ci-canary-show-rating-fixture.yaml` all rely on this to run as one-off helper/gate steps instead of being swept into the main suite loop.
- **`__DEV__` is `false`** in this workflow's Release `xcodebuild` build. Any CI-only route (fixtures, dev helpers) gated on `if (!__DEV__)` will silently render nothing in CI — check for `EXPO_PUBLIC_DEV_AUTO_SIGNIN === '1'` as well if the route needs to work here (see `app/test/show-rating-fixture.tsx`).
